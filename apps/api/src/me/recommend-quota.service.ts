import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { getKstDateString } from "../common/kst";

@Injectable()
export class RecommendQuotaService {
  constructor(private prisma: PrismaService) {}

  private FREE_LIMIT = 5;
  private AD_BONUS = 5;

  private async ensureRow(userId: string, kstDate: string) {
    return this.prisma.dailyRecommendQuota.upsert({
      where: { userId_kstDate: { userId, kstDate } },
      create: { userId, kstDate, remaining: this.FREE_LIMIT, adGranted: 0 },
      update: {},
    });
  }

  async get(userId: string) {
    const kstDate = getKstDateString();
    const row = await this.ensureRow(userId, kstDate);

    return {
      ok: true,
      kstDate,
      remaining: row.remaining,
      freeLimit: this.FREE_LIMIT,
      adBonus: this.AD_BONUS,
      adGranted: row.adGranted === 1,
    };
  }

  /**
   * 광고(예정) 시청 후 호출:
   * - 오늘 remaining=0 이고 adGranted=0 일 때만 +5 지급
   */
  async watchAd(userId: string) {
    const kstDate = getKstDateString();
    await this.ensureRow(userId, kstDate);

    const current = await this.prisma.dailyRecommendQuota.findUnique({
      where: { userId_kstDate: { userId, kstDate } },
      select: { remaining: true, adGranted: true },
    });

    if (!current) throw new BadRequestException("quota row missing");

    if (current.remaining > 0) {
      // 무료가 남아있는데 광고로 더 받는 건 막음(정책)
      throw new BadRequestException("아직 오늘 무료 추천이 남아있어요.");
    }
    if (current.adGranted >= 1) {
      throw new BadRequestException("오늘은 이미 광고 보상(추가 5회)을 받았어요.");
    }

    // 조건부 업데이트(안전)
    const updated = await this.prisma.dailyRecommendQuota.updateMany({
      where: { userId, kstDate, remaining: 0, adGranted: 0 },
      data: { remaining: { increment: this.AD_BONUS }, adGranted: 1 },
    });

    if (updated.count === 0) {
      throw new BadRequestException("광고 보상 지급 조건이 맞지 않아요.");
    }

    return this.get(userId);
  }
}
