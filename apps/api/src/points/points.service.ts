import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PointKind, PointSource, Prisma } from "../../generated/prisma/client";

type Tx = Prisma.TransactionClient;

@Injectable()
export class PointsService {
  constructor(private prisma: PrismaService) {}

  /**
   * 장부 1건 추가 + User.pointBalance 갱신 (트랜잭션)
   * - points: + 적립 / - 차감
   * - dedupeKey: 유니크로 중복 지급 방지 (ex: PROOF:xxxx:EARN)
   */
  async addLedger(
    tx: Tx,
    params: {
      userId: string;
      kind: PointKind;
      source: PointSource;
      sourceId?: string | null;
      points: number;
      note?: string | null;
      dedupeKey?: string | null;
      reviewedByAdminId?: string | null;
    },
  ) {
    const user = await tx.user.findUnique({
      where: { id: params.userId },
      select: { pointBalance: true },
    });

    const current = user?.pointBalance ?? 0;
    const next = current + params.points;

    await tx.user.update({
      where: { id: params.userId },
      data: { pointBalance: next },
    });

    const ledger = await tx.pointLedger.create({
      data: {
        userId: params.userId,
        kind: params.kind,
        source: params.source,
        sourceId: params.sourceId ?? null,
        points: params.points,
        balanceAfter: next,
        note: params.note ?? null,
        dedupeKey: params.dedupeKey ?? null,
        reviewedByAdminId: params.reviewedByAdminId ?? null,
      },
    });

    return { ledger, balance: next };
  }

  async getMyBalance(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { pointBalance: true },
    });
    return { ok: true, balance: user?.pointBalance ?? 0 };
  }

  async getMyLedger(userId: string, take = 20, cursor?: string) {
    const rows = await this.prisma.pointLedger.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        kind: true,
        source: true,
        sourceId: true,
        points: true,
        balanceAfter: true,
        note: true,
        createdAt: true,
      },
    });

    return {
      ok: true,
      items: rows,
      nextCursor: rows.length ? rows[rows.length - 1].id : null,
    };
  }

  /** Proof 1건당 1회만 적립(중복 방지 dedupeKey) */
  async earnForProof(userId: string, proofId: string, amount = 10) {
    const dedupeKey = `PROOF:${proofId}:EARN`;

    return this.prisma.$transaction(async (tx) => {
      return this.addLedger(tx, {
        userId,
        kind: PointKind.EARN,
        source: PointSource.PROOF,
        sourceId: proofId,
        points: amount,
        note: "인증 업로드 보상(임시)",
        dedupeKey,
      });
    });
  }
}
