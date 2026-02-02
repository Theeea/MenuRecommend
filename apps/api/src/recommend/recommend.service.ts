import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { PointsService } from "../points/points.service";
import {
  Cuisine,
  DishType,
  IngredientRole,
  RecommendStatus,
  ProofResult,
  PointKind,
  PointSource,
} from "../../generated/prisma/client";
import { getKstDateString, getStartOfKstDayUtc } from '../common/kst';

@Injectable()
export class RecommendService {
  constructor(
    private prisma: PrismaService,
    private points: PointsService,
  ) {}

  private FREE_LIMIT = 5;

  private makeChallengeCode(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  async recommend(
    userId: string,
    filter: { cuisine?: Cuisine; dishType?: DishType },
  ) {
    const startOfTodayKst = getStartOfKstDayUtc();
    const since6h = new Date(Date.now() - 6 * 60 * 60 * 1000);

    // 유저가 싫어하는 재료
    const disliked = await this.prisma.userDislikedIngredient.findMany({
      where: { userId },
      select: { ingredientId: true },
    });
    const dislikedIds = disliked.map((d) => d.ingredientId);

    /**
     * 항상 유지할 조건 (절대 추천하면 안 됨)
     * - 차단 메뉴 제외
     * - 싫어하는 재료가 MAIN이면 제외
     */
    const baseAnd: any[] = [
      { NOT: { blocks: { some: { userId } } } },
      ...(dislikedIds.length
        ? [
          {
            NOT: {
              ingredients: {
                some: {
                  role: IngredientRole.MAIN,
                  ingredientId: { in: dislikedIds },
                },
              },
            },
          },
        ]
        : []),
    ];

    /**
     * 후보가 0개일 때 UX가 멈추는 걸 방지하기 위한 fallback 단계
     * 1) STRICT: 오늘(KST) 중복 + 최근6시간 중복 모두 방지
     * 2) ALLOW_REPEAT_TODAY: 오늘 중복은 허용(단, 최근6시간은 유지)
     * 3) ALLOW_REPEAT_ANYTIME: 6시간도 풀고 반복 허용(최후 수단)
     */
    const passes: Array<{ name: string; and: any[] }> = [
      {
        name: 'STRICT',
        and: [
          { NOT: { sessions: { some: { userId, createdAt: { gte: startOfTodayKst } } } } },
          { NOT: { sessions: { some: { userId, createdAt: { gte: since6h } } } } },
          ...baseAnd,
        ],
      },
      {
        name: 'ALLOW_REPEAT_TODAY',
        and: [
          { NOT: { sessions: { some: { userId, createdAt: { gte: since6h } } } } },
          ...baseAnd,
        ],
      },
      {
        name: 'ALLOW_REPEAT_ANYTIME',
        and: [...baseAnd],
      },
    ];

    let menus: any[] = [];
    let usedPass = passes[0].name;

    for (const p of passes) {
      menus = await this.prisma.menu.findMany({
        where: {
          ...(filter.cuisine ? { cuisine: filter.cuisine } : {}),
          ...(filter.dishType ? { dishType: filter.dishType } : {}),
          AND: p.and,
        },
        include: {
          ingredients: {
            include: { ingredient: { select: { id: true, name: true } } },
          },
        },
        take: 80,
      });

      if (menus.length > 0) {
        usedPass = p.name;
        break;
      }
    }

    if (menus.length === 0) {
      return {
        ok: false,
        reason: 'NO_CANDIDATE',
        message:
          '추천 가능한 메뉴가 없습니다. (차단/싫어요가 너무 많거나 메뉴 풀이 부족)',
      };
    }

    // ✅ 추천 확정 전에 quota row 보장 (차감은 성공 추천 시에만)
    const kstDate = getKstDateString();
    await this.prisma.dailyRecommendQuota.upsert({
      where: { userId_kstDate: { userId, kstDate } },
      create: { userId, kstDate, remaining: this.FREE_LIMIT, adGranted: 0 },
      update: {},
    });

    // 트랜잭션으로 “차감 + 세션생성” 묶기
    const picked = menus[Math.floor(Math.random() * menus.length)];
    const challengeCode = this.makeChallengeCode();

    const result = await this.prisma.$transaction(async (tx) => {
      const dec = await tx.dailyRecommendQuota.updateMany({
        where: { userId, kstDate, remaining: { gt: 0 } },
        data: { remaining: { decrement: 1 } },
      });

      if (dec.count === 0) {
        throw new HttpException(
          {
            code: 'RECOMMEND_DAILY_LIMIT',
            message:
              '오늘 추천 횟수를 모두 사용했어요. 광고를 보면 5회 더 가능해요.',
            canWatchAd: true,
            kstDate,
          },
          HttpStatus.TOO_MANY_REQUESTS, // 429
        );
      }

      const session = await tx.recommendSession.create({
        data: {
          userId,
          menuId: picked.id,
          status: RecommendStatus.RECOMMENDED,
          challengeCode,
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          challengeCode: true,
        },
      });

      return session;
    });

    // MAIN은 제외했으니, MAIN이 아닌데 포함되는 싫어요 재료는 "경고"로만 내리기
    const warnings = dislikedIds.length
      ? picked.ingredients
        .filter(
          (mi) =>
            dislikedIds.includes(mi.ingredientId) &&
            mi.role !== IngredientRole.MAIN,
        )
        .map((mi) => ({
          ingredientName: mi.ingredient.name,
          role: mi.role,
          removable: mi.removable,
        }))
      : [];

    return {
      ok: true,
      mode: usedPass, // 디버그/UX 튜닝용 (프론트에서 안 써도 됨)
      session: result,
      menu: {
        id: picked.id,
        name: picked.name,
        cuisine: picked.cuisine,
        dishType: picked.dishType,
      },
      warnings,
    };
  }

  async accept(userId: string, sessionId: string) {
    const s = await this.prisma.recommendSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, status: true },
    });
    if (!s) throw new NotFoundException('Session not found');
    if (s.userId !== userId) throw new ForbiddenException('Not your session');
    if (s.status !== RecommendStatus.RECOMMENDED)
      throw new BadRequestException('Not RECOMMENDED status');

    return this.prisma.recommendSession.update({
      where: { id: sessionId },
      data: { status: RecommendStatus.ACCEPTED, acceptedAt: new Date() },
      select: { id: true, status: true, acceptedAt: true, challengeCode: true },
    });
  }

  async reviewByAdminKey(
    adminKey: string | undefined,
    proofId: string,
    body: { result: "PASS" | "FAIL"; score?: number; meta?: any; model?: string },
  ) {
    const key = process.env.ADMIN_REVIEW_KEY ?? "dev-admin";
    if (!adminKey || adminKey !== key) throw new ForbiddenException("Invalid admin key");

    const result = body?.result;
    if (result !== "PASS" && result !== "FAIL") throw new BadRequestException("result must be PASS|FAIL");

    const proof = await this.prisma.proof.findUnique({
      where: { id: proofId },
      include: { session: true },
    });

    if (!proof) throw new NotFoundException("Proof not found");

    // 이미 리뷰 완료면 그대로 반환(중복 지급 방지)
    if (proof.aiResult !== ProofResult.PENDING) {
      return { ok: true, alreadyReviewed: true, aiResult: proof.aiResult, aiScore: proof.aiScore };
    }

    const aiResult = result === "PASS" ? ProofResult.PASS : ProofResult.FAIL;
    const score = typeof body.score === "number" ? body.score : proof.aiScore;

    const txRes = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.proof.update({
        where: { id: proofId },
        data: {
          aiResult,
          aiScore: score,
          reviewedAt: new Date(),
          aiModel: body.model ?? null,
          aiMeta: body.meta ?? null,
        },
        select: { id: true, sessionId: true, aiResult: true, aiScore: true },
      });

      // 세션 완료 처리(너 enum에 DONE이 없을 수도 있으니, 안전하게 doneAt만 찍고 status는 유지)
      await tx.recommendSession.update({
        where: { id: proof.sessionId },
        data: {
          doneAt: new Date(),
          // status: RecommendStatus.DONE, // ✅ DONE이 enum에 있으면 이 줄을 켜도 됨
        },
      });

      let earned = 0;
      let balance: number | null = null;

      if (aiResult === ProofResult.PASS) {
        // ✅ PASS 추가 보상 +40 (PENDING 제출 +10은 이미 지급됨)
        const dedupeKey = `PROOF:${proofId}:PASS_BONUS`;
        try {
          const r = await this.points.addLedger(tx, {
            userId: proof.session.userId,
            kind: PointKind.EARN,
            source: PointSource.PROOF,
            sourceId: proofId,
            points: 40,
            note: "AI 통과 보상(추가)",
            dedupeKey,
          });
          earned = 40;
          balance = r.balance;
        } catch {
          // 중복 지급 방지: 유니크 충돌이면 무시
        }
      }

      return { ok: true, proof: updated, earned, balance };
    });

    return txRes;
  }
}
