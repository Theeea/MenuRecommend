import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
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

@Injectable()
export class ProofService {
  private openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    // ✅ 429에서 오래 대기/재시도 때문에 타임아웃 나는 경우가 많아서 retry 최소화
    maxRetries: 0,
  } as any);

  constructor(private prisma: PrismaService) {}

  /**
   * ✅ 빠른 경로:
   * - 쿨타임/일일제한 체크
   * - QR decode + HMAC 검증 (proof 이미지)
   * - Proof row 생성 + 제출 보상(+10) + 세션 상태 업데이트
   * - OpenAI 호출은 하지 않고 PENDING으로 끝
   */
  async createQueued(
    userId: string,
    sessionId: string,
    imageUrl: string,
    rawUrl: string,
    challengeCode?: string,
  ) {
    const session = await this.prisma.recommendSession.findUnique({
      where: { id: sessionId },
      include: {
        menu: {
          select: {
            id: true,
            name: true,
            cuisine: true,
            dishType: true,
            ingredients: {
              include: { ingredient: { select: { name: true } } },
            },
          },
        },
      },
    });

    if (!session) throw new NotFoundException('Session not found');
    if (session.userId !== userId)
      throw new ForbiddenException('Not your session');
    if (session.status !== ('ACCEPTED' as any))
      throw new BadRequestException('Session must be ACCEPTED');

    // (호환용) 기존 코드 유지
    if (session.challengeCode) {
      if (!challengeCode)
        throw new BadRequestException('challengeCode required');
      if (challengeCode !== session.challengeCode)
        throw new BadRequestException('challengeCode mismatch');
    }

    // ✅ 쿨타임/일일 3회
    await this.assertQuotaAndCooldown(userId);

    // ✅ QR/HMAC 검증(워터마크된 proof 이미지로)
    const qr = await this.verifyQrFromProofImage(imageUrl);

    if (qr.sessionId !== sessionId)
      throw new BadRequestException('QR sessionId mismatch');
    if ((session.challengeCode ?? '') !== qr.code)
      throw new BadRequestException('QR challengeCode mismatch');

    // ✅ Proof 생성(중복 방지) + 업로드 보상(+10)만 지급
    const created = await this.prisma.$transaction(async (tx) => {
      const exists = await tx.proof.findUnique({ where: { sessionId } });
      if (exists) {
        const balance =
          (
            await tx.user.findUnique({
              where: { id: userId },
              select: { pointBalance: true },
            })
          )?.pointBalance ?? 0;
        return {
          already: true as const,
          proofId: exists.id,
          earned: 0,
          balance,
        };
      }

      const proof = await tx.proof.create({
        data: {
          sessionId,
          imageUrl,
          aiResult: 'PENDING' as any,
          aiScore: 0,
          aiModel: null,
          aiMeta: {
            rawUrl,
            qr: { payload: qr.payload, ts: qr.ts, sig: qr.sig },
            attempts: 0,
          },
        },
        select: { id: true },
      });

      await tx.recommendSession.update({
        where: { id: sessionId },
        data: { status: 'PROOF_SUBMITTED' as any },
      });

      // ✅ 제출 보상 +10
      const userAfter = await tx.user.update({
        where: { id: userId },
        data: { pointBalance: { increment: 10 } },
        select: { pointBalance: true },
      });

      const dedupeKey = `PROOF_SUBMIT:${sessionId}`;
      try {
        await tx.pointLedger.create({
          data: {
            userId,
            kind: 'EARN' as any,
            source: 'PROOF' as any,
            sourceId: proof.id,
            points: 10,
            balanceAfter: userAfter.pointBalance,
            note: '인증 업로드 보상',
            dedupeKey,
          },
        });
      } catch {}

      return {
        already: false as const,
        proofId: proof.id,
        earned: 10,
        balance: userAfter.pointBalance,
      };
    });

    const proof = await this.prisma.proof.findUnique({
      where: { id: created.proofId },
    });

    return {
      ok: true,
      proof,
      earned: created.earned,
      balance: created.balance,
      aiResult: proof?.aiResult ?? 'PENDING',
      message: 'AI 판정은 백그라운드에서 처리됩니다.',
    };
  }

  /**
   * ✅ 워커(크론)에서 호출:
   * PENDING인 proof들을 가져와 OpenAI 판정 후 PASS/HOLD/FAIL 업데이트.
   * PASS면 +40 지급 + 세션 DONE.
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
                ingredients: {
                  include: { ingredient: { select: { name: true } } },
                },
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
        const rawUrl = meta.rawUrl;

        // rawUrl 없으면 AI 판독 불가 → HOLD로 전환하고 다음으로
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
              },
            },
          });

          results.push({
            id: proof.id,
            error: 'rawUrl missing in aiMeta',
            held: true,
          });
          continue;
        }

        const ai = await this.judgeFoodWithOpenAI({
          rawUrl,
          expected: {
            menuName: proof.session.menu.name,
            cuisine: String(proof.session.menu.cuisine),
            dishType: proof.session.menu.dishType
              ? String(proof.session.menu.dishType)
              : null,
            ingredients: this.pickMainIngredients(
              proof.session.menu.ingredients,
            ),
          },
        });

        const { result, score } = this.toProofResult(ai);

        // ✅ 업데이트
        const updated = await this.prisma.proof.update({
          where: { id: proof.id },
          data: {
            aiResult: result as any,
            aiScore: score,
            aiModel: process.env.OPENAI_VISION_MODEL ?? 'gpt-4.1-mini',
            aiMeta: {
              ...meta,
              openai: ai,
              attempts: Number(meta.attempts ?? 0) + 1,
            },
            reviewedAt:
              result === 'PASS' || result === 'FAIL' ? new Date() : null,
          },
        });

        // ✅ PASS면 보너스 +40 + 세션 DONE
        if (result === 'PASS') {
          await this.prisma.$transaction(async (tx) => {
            const bonus = await this.givePassBonus(
              proof.session.userId,
              updated.id,
              tx,
            );

            await tx.recommendSession.update({
              where: { id: proof.sessionId },
              data: { status: 'DONE' as any, doneAt: new Date() },
            });

            results.push({ id: proof.id, result, score, bonus });
          });
        } else {
          results.push({ id: proof.id, result, score });
        }
      } catch (e: any) {
        const meta = (proof.aiMeta as any) ?? {};
        const msg = String(e?.message ?? e);

        // ✅ “쿼터 없음(429 exceeded your current quota)”면 HOLD로 고정(계속 재시도해봤자 의미없음)
        const isQuota = msg.includes('exceeded your current quota');
        await this.prisma.proof.update({
          where: { id: proof.id },
          data: {
            aiResult: (isQuota ? 'HOLD' : 'PENDING') as any,
            aiModel: process.env.OPENAI_VISION_MODEL ?? 'gpt-4.1-mini',
            aiMeta: {
              ...meta,
              openaiError: msg,
              attempts: Number(meta.attempts ?? 0) + 1,
              lastErrorAt: new Date().toISOString(),
            },
          },
        });

        results.push({ id: proof.id, error: msg, held: isQuota });
      }
    }

    return { ok: true, processed: results.length, results };
  }

  // ===== 운영자 수동 리뷰(재업로드 대신) =====
  async reviewByAdminKey(
    adminKey: string | undefined,
    proofId: string,
    body: {
      result: 'PASS' | 'FAIL';
      score?: number;
      model?: string;
      meta?: any;
    },
  ) {
    const key = process.env.ADMIN_REVIEW_KEY ?? 'dev-admin';
    if (!adminKey || adminKey !== key)
      throw new ForbiddenException('Invalid admin key');

    const result = body?.result;
    if (result !== 'PASS' && result !== 'FAIL')
      throw new BadRequestException('result must be PASS|FAIL');

    const proof = await this.prisma.proof.findUnique({
      where: { id: proofId },
      include: { session: { select: { id: true, userId: true } } },
    });
    if (!proof) throw new NotFoundException('Proof not found');

    if (proof.aiResult === ('PASS' as any)) {
      return {
        ok: true,
        alreadyReviewed: true,
        aiResult: proof.aiResult,
        aiScore: proof.aiScore,
      };
    }

    return this.prisma.$transaction(async (tx) => {
      const aiResult = result === 'PASS' ? ('PASS' as any) : ('FAIL' as any);

      const updated = await tx.proof.update({
        where: { id: proofId },
        data: {
          aiResult,
          aiScore: typeof body.score === 'number' ? body.score : proof.aiScore,
          aiModel: body.model ?? proof.aiModel ?? null,
          aiMeta: body.meta ?? proof.aiMeta ?? null,
          reviewedAt: new Date(),
        },
      });

      let bonus = { earned: 0, balance: null as any };
      if (aiResult === ('PASS' as any)) {
        bonus = await this.givePassBonus(proof.session.userId, proofId, tx);
        await tx.recommendSession.update({
          where: { id: updated.sessionId },
          data: { status: 'DONE' as any, doneAt: new Date() },
        });
      }

      return { ok: true, proof: updated, bonus };
    });
  }

  // ====== 내부: 쿨타임/쿼터 ======
  private async assertQuotaAndCooldown(userId: string) {
    const now = new Date();
    const { startUtc, endUtc } = this.kstDayRangeUtc(now);

    const todayCount = await this.prisma.proof.count({
      where: {
        createdAt: { gte: startUtc, lt: endUtc },
        session: { userId },
      },
    });
    if (todayCount >= 3) {
      throw new BadRequestException(
        '오늘 인증 가능 횟수(3회)를 모두 사용했어.',
      );
    }

    const last = await this.prisma.proof.findFirst({
      where: { session: { userId } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (last) {
      const diffMs = Date.now() - last.createdAt.getTime();
      const needMs = 3 * 60 * 60 * 1000;
      if (diffMs < needMs) {
        const remain = needMs - diffMs;
        const min = Math.ceil(remain / (60 * 1000));
        throw new BadRequestException(
          `쿨타임이 남아있어. 약 ${min}분 후 다시 시도해줘.`,
        );
      }
    }
  }

  private kstDayRangeUtc(now: Date) {
    const KST = 9 * 60 * 60 * 1000;
    const kstMs = now.getTime() + KST;
    const kst = new Date(kstMs);

    const startKstUtcMs =
      Date.UTC(
        kst.getUTCFullYear(),
        kst.getUTCMonth(),
        kst.getUTCDate(),
        0,
        0,
        0,
      ) - KST;
    const endKstUtcMs = startKstUtcMs + 24 * 60 * 60 * 1000;

    return { startUtc: new Date(startKstUtcMs), endUtc: new Date(endKstUtcMs) };
  }

  // ====== 내부: uploads url -> local path ======
  private uploadsUrlToLocalPath(url: string) {
    const clean = String(url).split('?')[0];

    let pathOnly = clean;
    if (/^https?:\/\//i.test(clean)) {
      pathOnly = new URL(clean).pathname;
    }

    const m = pathOnly.match(/^\/uploads\/(raw|proof)\/(.+)$/);
    if (!m) throw new BadRequestException('Invalid uploads url');

    const type = m[1];
    const filename = m[2];

    if (
      filename.includes('..') ||
      filename.includes('\\') ||
      filename.startsWith('/')
    ) {
      throw new BadRequestException('Invalid filename');
    }

    const p = join(process.cwd(), 'uploads', type, filename);
    if (!existsSync(p)) throw new NotFoundException('File not found on server');
    return p;
  }

  // ====== 내부: QR 검증 ======
  private signQr(secret: string, sessionId: string, code: string, ts: number) {
    return createHmac('sha256', secret)
      .update(`${sessionId}|${code}|${ts}`)
      .digest('hex')
      .slice(0, 16);
  }

  private safeEqualHex(a: string, b: string) {
    const ab = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  }

  private async verifyQrFromProofImage(imageUrl: string) {
    const proofPath = this.uploadsUrlToLocalPath(imageUrl);
    const buf = readFileSync(proofPath);

    const { data, info } = await sharp(buf)
      .rotate()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = new Uint8ClampedArray(
      data.buffer,
      data.byteOffset,
      data.byteLength,
    );
    const qr = jsQR(pixels, info.width, info.height);

    if (!qr?.data) throw new BadRequestException('QR decode failed');

    const payload = String(qr.data);
    const parts = payload.split('|');
    if (parts.length !== 5 || parts[0] !== 'MR1')
      throw new BadRequestException('Invalid QR payload');

    const sessionId = parts[1];
    const code = parts[2];
    const ts = Number(parts[3]);
    const sig = parts[4];

    const ttlMs = 30 * 60 * 1000;
    if (Math.abs(Date.now() - ts) > ttlMs)
      throw new BadRequestException('QR timestamp expired');

    const secret = process.env.PROOF_QR_SECRET ?? 'dev-proof-qr-secret';
    const expected = this.signQr(secret, sessionId, code, ts);

    if (!this.safeEqualHex(expected, sig))
      throw new BadRequestException('QR signature invalid');

    return { payload, sessionId, code, ts, sig };
  }

  // ====== 내부: OpenAI 판정 ======
  private pickMainIngredients(items: any[]) {
    const mapped = items
      .map((x) => ({
        role: String(x.role ?? ''),
        name: String(x.ingredient?.name ?? ''),
        weight: Number(x.weight ?? 0),
      }))
      .filter((x) => x.name);

    return mapped
      .sort(
        (a, b) =>
          (b.role === 'MAIN' ? 10 : 0) +
          b.weight -
          ((a.role === 'MAIN' ? 10 : 0) + a.weight),
      )
      .slice(0, 8)
      .map((x) => x.name);
  }

  private async judgeFoodWithOpenAI(args: {
    rawUrl: string;
    expected: {
      menuName: string;
      cuisine: string;
      dishType: string | null;
      ingredients: string[];
    };
  }): Promise<AiDecision> {
    const model = process.env.OPENAI_VISION_MODEL ?? 'gpt-4.1-mini';

    const rawPath = this.uploadsUrlToLocalPath(args.rawUrl);
    const jpg = await sharp(readFileSync(rawPath))
      .rotate()
      .resize({ width: 768, withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();

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
      - 사용자가 업로드한 이미지가 다른 화면 (모바일 혹은 PC) 에서 띄운 사진인 경우 바로 match=false
      - 사진에 음식이 명확히 보이지 않으면 match=false
      - 유사 메뉴(예: 비빔밥 vs 돌솥비빔밥, 라면 vs 짬뽕라면 등)는 신중히: 확신 낮으면 match=false 또는 confidence 낮게
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

    parsed.confidence = Math.max(
      0,
      Math.min(1, Number(parsed.confidence ?? 0)),
    );
    parsed.detected = Array.isArray(parsed.detected)
      ? parsed.detected.map(String)
      : [];
    parsed.reason = String(parsed.reason ?? '');
    parsed.match = Boolean(parsed.match);

    return parsed;
  }

  private toProofResult(ai: AiDecision) {
    const c = ai.confidence;
    if (ai.match && c >= 0.75) return { result: 'PASS' as const, score: c };
    if (c >= 0.45) return { result: 'HOLD' as const, score: c }; // 애매하면 운영자 검토로
    return { result: 'FAIL' as const, score: c };
  }

  private async givePassBonus(userId: string, proofId: string, tx?: any) {
    const prisma = tx ?? this.prisma;

    const userAfter = await prisma.user.update({
      where: { id: userId },
      data: { pointBalance: { increment: 40 } },
      select: { pointBalance: true },
    });

    const dedupeKey = `PROOF_PASS_BONUS:${proofId}`;
    try {
      await prisma.pointLedger.create({
        data: {
          userId,
          kind: 'EARN' as any,
          source: 'PROOF' as any,
          sourceId: proofId,
          points: 40,
          balanceAfter: userAfter.pointBalance,
          note: '인증 통과 보상(추가)',
          dedupeKey,
        },
      });
      return { earned: 40, balance: userAfter.pointBalance };
    } catch {
      return { earned: 0, balance: userAfter.pointBalance };
    }
  }
}
