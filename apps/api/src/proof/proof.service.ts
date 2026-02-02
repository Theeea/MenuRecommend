import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ProofService {
  constructor(private prisma: PrismaService) {}

  // 업로드 보상(임시): +10
  async create(userId: string, sessionId: string, imageUrl: string, challengeCode?: string) {
    const session = await this.prisma.recommendSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, status: true, challengeCode: true },
    });

    if (!session) throw new NotFoundException("Session not found");
    if (session.userId !== userId) throw new ForbiddenException("Not your session");
    if (session.status !== ("ACCEPTED" as any)) throw new BadRequestException("Session must be ACCEPTED");

    // anti-cheat: 세션에 challengeCode가 있으면 반드시 맞춰야 함
    if (session.challengeCode) {
      if (!challengeCode) throw new BadRequestException("challengeCode required");
      if (challengeCode !== session.challengeCode) throw new BadRequestException("challengeCode mismatch");
    }

    return this.prisma.$transaction(async (tx) => {
      // 세션당 1개 Proof(유니크). 이미 있으면 친절한 메시지.
      const exists = await tx.proof.findUnique({ where: { sessionId } });
      if (exists) {
        return { ok: true, proof: exists, earned: 0, balance: (await tx.user.findUnique({ where: { id: userId }, select: { pointBalance: true } }))?.pointBalance ?? 0 };
      }

      const proof = await tx.proof.create({
        data: {
          sessionId,
          imageUrl,
          aiResult: "PENDING" as any,
          aiScore: 0,
        },
        select: { id: true, sessionId: true, aiResult: true, createdAt: true },
      });

      // 업로드 즉시 +10 지급(장부)
      const userAfter = await tx.user.update({
        where: { id: userId },
        data: { pointBalance: { increment: 10 } },
        select: { pointBalance: true },
      });

      // dedupeKey로 중복지급 방지(세션 기준)
      const dedupeKey = `PROOF_SUBMIT:${sessionId}`;
      try {
        await tx.pointLedger.create({
          data: {
            userId,
            kind: "EARN" as any,
            source: "PROOF" as any,
            sourceId: proof.id,
            points: 10,
            balanceAfter: userAfter.pointBalance,
            note: "인증 업로드 보상(임시)",
            dedupeKey,
          },
        });
      } catch (e: any) {
        // 이미 있으면 무시
      }

      return { ok: true, proof, earned: 10, balance: userAfter.pointBalance };
    });
  }

  // 운영자 수동 리뷰: PASS면 +40 추가 지급
  async reviewByAdminKey(
    adminKey: string | undefined,
    proofId: string,
    body: { result: "PASS" | "FAIL"; score?: number; model?: string; meta?: any },
  ) {
    const key = process.env.ADMIN_REVIEW_KEY ?? "dev-admin";
    if (!adminKey || adminKey !== key) throw new ForbiddenException("Invalid admin key");

    const result = body?.result;
    if (result !== "PASS" && result !== "FAIL") throw new BadRequestException("result must be PASS|FAIL");

    const proof = await this.prisma.proof.findUnique({
      where: { id: proofId },
      include: { session: { select: { id: true, userId: true } } },
    });
    if (!proof) throw new NotFoundException("Proof not found");

    // 이미 리뷰되었으면 그대로 반환
    if (proof.aiResult !== ("PENDING" as any)) {
      return { ok: true, alreadyReviewed: true, aiResult: proof.aiResult, aiScore: proof.aiScore };
    }

    return this.prisma.$transaction(async (tx) => {
      const aiResult = result === "PASS" ? ("PASS" as any) : ("FAIL" as any);

      const updated = await tx.proof.update({
        where: { id: proofId },
        data: {
          aiResult,
          aiScore: typeof body.score === "number" ? body.score : proof.aiScore,
          aiModel: body.model ?? null,
          aiMeta: body.meta ?? null,
          reviewedAt: new Date(),
        },
        select: { id: true, sessionId: true, aiResult: true, aiScore: true, reviewedAt: true },
      });

      // 세션 완료 타임스탬프
      await tx.recommendSession.update({
        where: { id: proof.sessionId },
        data: { doneAt: new Date() },
      });

      let earned = 0;
      let balance: number | null = null;

      if (aiResult === ("PASS" as any)) {
        // PASS 보너스 +40
        const userAfter = await tx.user.update({
          where: { id: proof.session.userId },
          data: { pointBalance: { increment: 40 } },
          select: { pointBalance: true },
        });

        const dedupeKey = `PROOF_PASS_BONUS:${proofId}`;
        try {
          await tx.pointLedger.create({
            data: {
              userId: proof.session.userId,
              kind: "EARN" as any,
              source: "PROOF" as any,
              sourceId: proofId,
              points: 40,
              balanceAfter: userAfter.pointBalance,
              note: "AI 통과 보상(추가)",
              dedupeKey,
            },
          });
          earned = 40;
          balance = userAfter.pointBalance;
        } catch (e: any) {
          // 중복이면 무시
          earned = 0;
          balance = userAfter.pointBalance;
        }
      }

      return { ok: true, proof: updated, earned, balance };
    });
  }
}
