import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, ProofResult, RecommendStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { createHmac, timingSafeEqual } from 'crypto';
import OpenAI from 'openai';

type AiDecision = {
  match: boolean;
  confidence: number; // 0~1
  detected: string[];
  reason: string;
};

type QrParsed = {
  payload: string;
  version: string; // MR1
  sessionId: string;
  code: string;
  ts: number;
  sig: string;
};

function getStartOfKstDayUtc(now = new Date()) {
  const kstOffsetMs = 9 * 60 * 60 * 1000;
  const kst = new Date(now.getTime() + kstOffsetMs);
  kst.setHours(0, 0, 0, 0);
  return new Date(kst.getTime() - kstOffsetMs);
}

function envInt(name: string, fallback: number) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function assertAdminKey(headerKey?: string) {
  const key = process.env.ADMIN_REVIEW_KEY ?? 'dev-admin';
  if (!headerKey || headerKey !== key) {
    throw new UnauthorizedException('Invalid admin key');
  }
}

@Injectable()
export class ProofService {
  private openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    // ✅ 429에서 오래 대기/재시도 때문에 타임아웃 나는 경우 많아서 최소화
    maxRetries: 0,
  } as any);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * ✅ 업로드 완료 후 "AI/수동 리뷰 대기"로 큐잉
   * - 빠르게 응답(=OpenAI 안 기다림)
   *
   * 정책(서버 강제):
   * - (선택) PENDING이 있으면 신규 업로드 차단
   * - 3시간 쿨타임
   * - 일일 3회(KST)
   */
  async createQueued(
    userId: string,
    sessionId: string,
    imageUrl: string,
    rawUrl: string,
    challengeCode?: string,
  ) {
    const sid = (sessionId ?? '').trim();
    if (!sid) throw new BadRequestException('sessionId is required');

    const img = (imageUrl ?? '').trim();
    const raw = (rawUrl ?? '').trim();
    if (!img) throw new BadRequestException('imageUrl is required');
    if (!raw) throw new BadRequestException('rawUrl is required');

    const session = await this.prisma.recommendSession.findUnique({
      where: { id: sid },
      include: { menu: { select: { name: true } } },
    });

    if (!session) throw new NotFoundException('Session not found');
    if (session.userId !== userId) throw new ForbiddenException('Not your session');

    // ACCEPTED(추천 수락) 이후에만 인증 가능(이미 제출된 세션은 재호출 idempotent 허용)
    if (
      session.status !== ('ACCEPTED' as any) &&
      session.status !== ('PROOF_SUBMITTED' as any)
    ) {
      throw new BadRequestException(
        `Session status must be ACCEPTED/PROOF_SUBMITTED (current=${session.status})`,
      );
    }

    // challengeCode 검증(세션에 있으면 반드시 일치)
    if (!session.challengeCode) {
      throw new BadRequestException('challengeCode missing on session');
    }
    if (!challengeCode) {
      throw new BadRequestException('challengeCode is required');
    }
    if (session.challengeCode !== challengeCode) {
      throw new BadRequestException('challengeCode mismatch');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      // sessionId는 Proof에서 unique라서 중복 생성 방지
      const exists = await tx.proof.findUnique({
        where: { sessionId: sid },
        select: {
          id: true,
          sessionId: true,
          aiResult: true,
          imageUrl: true,
          createdAt: true,
        },
      });

      if (exists) {
        // 이미 큐잉된 상태면 그대로 반환(idempotent)
        return { proof: exists, queued: false };
      }

      // ✅ 업로드/큐잉 정책: 하루 제한 + 쿨타임 + (선택) PENDING 중복 방지
      const dailyLimit = envInt('PROOF_DAILY_LIMIT', 3);
      const cooldownHours = envInt('PROOF_COOLDOWN_HOURS', 3);
      const cooldownMs = Math.max(0, cooldownHours) * 60 * 60 * 1000;
      const blockWhilePending = (process.env.PROOF_BLOCK_WHILE_PENDING ?? '1') !== '0';

      // (1) PENDING이 있으면 신규 업로드 차단
      if (blockWhilePending) {
        const pending = await tx.proof.findFirst({
          where: { aiResult: ProofResult.PENDING, session: { userId } },
          select: { id: true, sessionId: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        });
        if (pending) {
          throw new HttpException(
            {
              code: 'PROOF_PENDING',
              message: '현재 인증이 검토중입니다. 결과가 나올 때까지 기다려 주세요.',
              pending,
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }

      // (2) 쿨타임(기본 3시간)
      if (cooldownMs > 0) {
        const last = await tx.proof.findFirst({
          where: { session: { userId } },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });
        if (last) {
          const diff = Date.now() - new Date(last.createdAt).getTime();
          if (diff >= 0 && diff < cooldownMs) {
            const retryAfterSeconds = Math.ceil((cooldownMs - diff) / 1000);
            throw new HttpException(
              {
                code: 'PROOF_COOLDOWN',
                message: `인증은 ${cooldownHours}시간 쿨타임이 있어요. 잠시 후 다시 시도해 주세요.`,
                retryAfterSeconds,
                nextAllowedAt: new Date(Date.now() + retryAfterSeconds * 1000).toISOString(),
              },
              HttpStatus.TOO_MANY_REQUESTS,
            );
          }
        }
      }

      // (3) 일일 제한(KST 기준, 기본 3회)
      if (dailyLimit > 0) {
        const start = getStartOfKstDayUtc();
        const todayCount = await tx.proof.count({
          where: { createdAt: { gte: start }, session: { userId } },
        });
        if (todayCount >= dailyLimit) {
          throw new HttpException(
            {
              code: 'PROOF_DAILY_LIMIT',
              message: `오늘 인증 가능 횟수(${dailyLimit}회)를 모두 사용했어요.`,
              kstDayStartUtc: start.toISOString(),
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }

      const proof = await tx.proof.create({
        data: {
          sessionId: sid,
          imageUrl: img,
          aiScore: 0,
          aiResult: 'PENDING' as any,
          aiModel: null,
          aiMeta: {
            rawUrl: raw,
            challengeCode,
            queuedAt: new Date().toISOString(),
            processingAt: null,
          },
        },
        select: {
          id: true,
          sessionId: true,
          aiResult: true,
          imageUrl: true,
          createdAt: true,
        },
      });

      // 세션 상태는 제출로 변경
      await tx.recommendSession.update({
        where: { id: sid },
        data: { status: 'PROOF_SUBMITTED' as any },
      });

      return { proof, queued: true };
    });

    return created;
  }

  /**
   * ✅ 관리자 수동 PASS/FAIL
   */
  async reviewByAdminKey(
    adminKey: string | undefined,
    id: string,
    body: { result: 'PASS' | 'FAIL'; score?: number; model?: string; meta?: any },
  ) {
    assertAdminKey(adminKey);

    const result = body?.result;
    if (result !== 'PASS' && result !== 'FAIL') {
      throw new BadRequestException('result must be PASS|FAIL');
    }

    const score =
      body?.score != null && Number.isFinite(Number(body.score))
        ? Math.max(0, Math.min(100, Number(body.score)))
        : undefined;

    const p = await this.prisma.proof.findUnique({
      where: { id },
      include: { session: true },
    });

    if (!p) throw new NotFoundException('Proof not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      const meta = (p.aiMeta as any) ?? {};
      const nextMeta = {
        ...meta,
        ...(body?.meta ? { adminMeta: body.meta } : {}),
        processingAt: null,
        processedAt: new Date().toISOString(),
      };

      const updatedProof = await tx.proof.update({
        where: { id },
        data: {
          aiResult: result as any,
          ...(score != null ? { aiScore: score } : {}),
          aiModel: body?.model ?? p.aiModel ?? null,
          aiMeta: nextMeta,
          reviewedAt: new Date(),
        },
        select: { id: true, aiResult: true, aiScore: true },
      });

      // 세션 DONE 처리(성공/실패 모두 "리뷰 완료" 의미)
      await tx.recommendSession.update({
        where: { id: p.sessionId },
        data: { status: 'DONE' as any, doneAt: new Date() },
      });

      // PASS면 보너스(중복 방지)
      let bonus: any = null;
      if (result === 'PASS') {
        bonus = await this.givePassBonus(p.session.userId, p.id, tx);
      }

      return { p: updatedProof, bonus };
    });

    return { ok: true, id, result, score: updated.p.aiScore, bonus: updated.bonus };
  }

  /**
   * ✅ 크론에서 PENDING만 가져와서 처리
   */
  async processPendingBatch(limit = 5) {
    const targets = await this.prisma.proof.findMany({
      where: { aiResult: 'PENDING' as any },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        session: {
          include: {
            menu: {
              select: {
                id: true,
                name: true,
                cuisine: true,
                dishType: true,
                ingredients: { include: { ingredient: { select: { name: true } } } },
              },
            },
          },
        },
      },
    });

    const results: any[] = [];

    for (const proof of targets) {
      try {
        const meta = (proof.aiMeta as any) ?? {};

        // 진행중 표시(어드민에서 'AI 진행중' 배지로 사용)
        meta.processingAt = new Date().toISOString();
        meta.processingBy = 'proof:ai';
        await this.prisma.proof.update({
          where: { id: proof.id },
          data: { aiMeta: { ...meta } },
        });

        const rawUrl = meta.rawUrl as string | undefined;

        if (!rawUrl) {
          await this.prisma.proof.update({
            where: { id: proof.id },
            data: {
              aiResult: 'HOLD' as any,
              aiModel: process.env.OPENAI_VISION_MODEL ?? 'gpt-4.1-mini',
              aiMeta: {
                ...meta,
                openaiError:
                  'rawUrl missing in aiMeta (legacy proof). Need manual review.',
                lastErrorAt: new Date().toISOString(),
                processingAt: null,
                processedAt: new Date().toISOString(),
              },
            },
          });

          results.push({ id: proof.id, error: 'rawUrl missing in aiMeta', held: true });
          continue;
        }

        // 1) QR decode + HMAC 검증(가능하면)
        const qrCheck = await this.tryVerifyQrFromProofImage(
          proof.imageUrl,
          proof.sessionId,
          proof.session.challengeCode ?? null,
        );

        // qrCheck가 명확히 invalid면 HOLD로(오탐 방지)
        if (qrCheck && qrCheck.ok === false) {
          await this.prisma.proof.update({
            where: { id: proof.id },
            data: {
              aiResult: 'HOLD' as any,
              aiModel: process.env.OPENAI_VISION_MODEL ?? 'gpt-4.1-mini',
              aiMeta: {
                ...meta,
                qr: qrCheck.qr ?? null,
                qrError: qrCheck.error,
                lastErrorAt: new Date().toISOString(),
                processingAt: null,
                processedAt: new Date().toISOString(),
              },
            },
          });

          results.push({ id: proof.id, error: qrCheck.error, held: true });
          continue;
        }

        // 2) OpenAI 판정
        const ai = await this.judgeFoodWithOpenAI({
          rawUrl,
          expected: {
            menuName: proof.session.menu.name,
            cuisine: String(proof.session.menu.cuisine),
            dishType: proof.session.menu.dishType
              ? String(proof.session.menu.dishType)
              : null,
            ingredients: this.pickMainIngredients(proof.session.menu.ingredients),
          },
        });

        const { result, score } = this.toProofResult(ai);

        // 3) 업데이트
        const updated = await this.prisma.proof.update({
          where: { id: proof.id },
          data: {
            aiResult: result as any,
            aiScore: score,
            aiModel: process.env.OPENAI_VISION_MODEL ?? 'gpt-4.1-mini',
            aiMeta: {
              ...meta,
              ...(qrCheck?.qr ? { qr: qrCheck.qr } : {}),
              openai: ai,
              attempts: Number(meta.attempts ?? 0) + 1,
              processingAt: null,
              processedAt: new Date().toISOString(),
            },
            reviewedAt: result === 'PASS' || result === 'FAIL' ? new Date() : null,
          },
        });

        // 4) PASS면 보너스 + 세션 DONE
        if (result === 'PASS') {
          const bonus = await this.prisma.$transaction(async (tx) => {
            const b = await this.givePassBonus(proof.session.userId, updated.id, tx);
            await tx.recommendSession.update({
              where: { id: proof.sessionId },
              data: { status: 'DONE' as any, doneAt: new Date() },
            });
            return b;
          });

          results.push({ id: proof.id, result, score, bonus });
        } else if (result === 'FAIL') {
          await this.prisma.recommendSession.update({
            where: { id: proof.sessionId },
            data: { status: 'DONE' as any, doneAt: new Date() },
          });
          results.push({ id: proof.id, result, score });
        } else {
          results.push({ id: proof.id, result, score });
        }
      } catch (e: any) {
        const meta = (proof.aiMeta as any) ?? {};
        const msg = String(e?.message ?? e);

        const isQuota = msg.includes('exceeded your current quota');
        const isMissingFile = msg.includes('file not found:');

        await this.prisma.proof.update({
          where: { id: proof.id },
          data: {
            aiResult: 'HOLD' as any,
            aiModel: process.env.OPENAI_VISION_MODEL ?? 'gpt-4.1-mini',
            aiMeta: {
              ...meta,
              openaiError: msg,
              quota: isQuota ? true : undefined,
              missingFile: isMissingFile ? true : undefined,
              lastErrorAt: new Date().toISOString(),
              processingAt: null,
              processedAt: new Date().toISOString(),
            },
          },
        });

        results.push({ id: proof.id, error: msg, held: true });
      }
    }

    return { ok: true, processed: results.length, results };
  }

  private async judgeFoodWithOpenAI(args: {
    rawUrl: string;
    expected: { menuName: string; cuisine: string; dishType: string | null; ingredients: string[] };
  }) {
    const model = process.env.OPENAI_VISION_MODEL ?? 'gpt-4.1-mini';

    const localPath = this.uploadsUrlToLocalPath(args.rawUrl);
    if (!existsSync(localPath)) {
      throw new Error(`file not found: ${localPath}`);
    }

    const buf = readFileSync(localPath);

    // 너무 큰 파일은 축소
    const jpg = await sharp(buf).rotate().resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    const dataUrl = `data:image/jpeg;base64,${jpg.toString('base64')}`;

    const ing = args.expected.ingredients.length
      ? `대표 재료: ${args.expected.ingredients.join(', ')}`
      : '대표 재료: (정보 없음)';

    const prompt = `
너는 음식 인증 심사 AI야.
사용자가 업로드한 "실제 음식 사진"이 아래 '기대 메뉴'와 일치하는지 판정해줘.

[기대 메뉴]
- 메뉴명: ${args.expected.menuName}
- 카테고리: ${args.expected.cuisine}${args.expected.dishType ? ` / ${args.expected.dishType}` : ''}
- ${ing}

판정 규칙:
- 업로드 이미지가 다른 화면(모바일/PC)에서 띄운 사진(재촬영/스크린샷)처럼 보이면 match=false
- 음식이 명확히 보이지 않으면 match=false
- 유사 메뉴는 신중히: 확신 낮으면 match=false 또는 confidence 낮게
- 사이드/반찬/그릇 차이는 감안
- 결과는 반드시 JSON 스키마에 맞춰 반환
    `.trim();

    const res = await this.openai.responses.create({
      model,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: dataUrl, detail: 'low' },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'food_verification',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              match: { type: 'boolean' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              detected: { type: 'array', items: { type: 'string' } },
              reason: { type: 'string' },
            },
            required: ['match', 'confidence', 'detected', 'reason'],
          },
        },
      },
    });

    const parsed = JSON.parse(res.output_text) as AiDecision;

    parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0)));
    parsed.detected = Array.isArray(parsed.detected) ? parsed.detected.map(String) : [];
    parsed.reason = String(parsed.reason ?? '');
    parsed.match = Boolean(parsed.match);

    return parsed;
  }

  private toProofResult(ai: AiDecision): { result: ProofResult | 'HOLD'; score: number } {
    const conf = Math.max(0, Math.min(1, Number(ai?.confidence ?? 0)));
    const score = Math.round(conf * 100);

    if (ai.match && conf >= 0.75) return { result: 'PASS' as any, score };
    if (!ai.match && conf >= 0.8) return { result: 'FAIL' as any, score };
    return { result: 'HOLD' as any, score };
  }

  private async tryVerifyQrFromProofImage(
    proofImageUrl: string,
    expectedSessionId: string,
    expectedChallengeCode: string | null,
  ): Promise<{ ok: true; qr: any } | { ok: false; error: string; qr?: any } | null> {
    if (!expectedChallengeCode) return null;

    try {
      const localPath = this.uploadsUrlToLocalPath(proofImageUrl);
      if (!existsSync(localPath)) {
        return { ok: false, error: `proof image file not found: ${localPath}` };
      }

      const buf = readFileSync(localPath);
      const { data, info } = await sharp(buf)
        .rotate()
        .resize({ width: 1024, withoutEnlargement: true })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const code = jsQR(new Uint8ClampedArray(data), info.width, info.height);

      if (!code?.data) {
        return { ok: false, error: 'QR decode failed' };
      }

      const parsed = this.parseQrPayload(code.data);

      if (!parsed) {
        return { ok: false, error: 'QR payload invalid format', qr: { payload: code.data } };
      }

      if (parsed.sessionId !== expectedSessionId) {
        return { ok: false, error: 'QR sessionId mismatch', qr: parsed };
      }

      if (parsed.code !== expectedChallengeCode) {
        return { ok: false, error: 'QR challengeCode mismatch', qr: parsed };
      }

      const secret = process.env.PROOF_QR_SECRET ?? 'dev-proof-qr-secret';
      const expectedSig = this.signQr(secret, parsed.sessionId, parsed.code, parsed.ts);

      const a = Buffer.from(expectedSig, 'utf8');
      const b = Buffer.from(parsed.sig, 'utf8');
      const sigOk = a.length === b.length && timingSafeEqual(a, b);

      if (!sigOk) {
        return { ok: false, error: 'QR HMAC signature mismatch', qr: parsed };
      }

      return { ok: true, qr: parsed };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  }

  private parseQrPayload(payload: string): QrParsed | null {
    const s = String(payload ?? '').trim();
    const parts = s.split('|');
    if (parts.length !== 5) return null;
    const [v, sid, code, tsStr, sig] = parts;
    if (!v || !sid || !code || !tsStr || !sig) return null;
    if (v !== 'MR1') return null;

    const ts = Number(tsStr);
    if (!Number.isFinite(ts) || ts <= 0) return null;

    return { payload: s, version: v, sessionId: sid, code, ts, sig };
  }

  private signQr(secret: string, sessionId: string, code: string, ts: number) {
    return createHmac('sha256', secret)
      .update(`${sessionId}|${code}|${ts}`)
      .digest('hex')
      .slice(0, 16);
  }

  private uploadsUrlToLocalPath(u: string) {
    const s = String(u ?? '').trim();
    if (!s) throw new Error('empty url');

    let pathname = s;
    if (s.startsWith('http://') || s.startsWith('https://')) {
      pathname = new URL(s).pathname;
    }

    const rel = pathname.replace(/^\//, '');
    const full = resolve(join(process.cwd(), rel));

    const uploadsRoot = resolve(join(process.cwd(), 'uploads'));
    if (!full.startsWith(uploadsRoot)) {
      throw new Error(`invalid uploads path: ${full}`);
    }

    return full;
  }

  private pickMainIngredients(menuIngredients: any[]): string[] {
    if (!Array.isArray(menuIngredients)) return [];
    const names = menuIngredients
      .map((x) => x?.ingredient?.name)
      .filter(Boolean)
      .map(String);

    return [...new Set(names)].slice(0, 6);
  }

  private async givePassBonus(
    userId: string,
    proofId: string,
    tx: Prisma.TransactionClient,
  ) {
    const bonus = Number(process.env.PROOF_PASS_BONUS ?? 40);
    if (!Number.isFinite(bonus) || bonus <= 0) return { ok: true, earned: 0 };

    const dedupeKey = `PROOF:PASS:${proofId}`;

    const existing = await tx.pointLedger.findUnique({
      where: { dedupeKey },
      select: { id: true, balanceAfter: true, points: true },
    });

    if (existing) {
      return { ok: true, earned: 0, balanceAfter: existing.balanceAfter, deduped: true };
    }

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, pointBalance: true },
    });
    if (!user) throw new Error('user not found');

    const next = (user.pointBalance ?? 0) + bonus;

    const updated = await tx.user.update({
      where: { id: userId },
      data: { pointBalance: next },
      select: { pointBalance: true },
    });

    await tx.pointLedger.create({
      data: {
        userId,
        kind: 'EARN' as any,
        source: 'PROOF' as any,
        sourceId: proofId,
        proofId,
        points: bonus,
        balanceAfter: updated.pointBalance,
        note: 'proof pass bonus',
        dedupeKey,
      },
      select: { id: true },
    });

    return { ok: true, earned: bonus, balanceAfter: updated.pointBalance };
  }
}
