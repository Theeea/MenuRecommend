import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PrismaService } from "../prisma/prisma.service";

@UseGuards(AuthGuard("jwt"))
@Controller()
export class MeController {
  constructor(private prisma: PrismaService) {}

  @Get("me")
  async me(@Req() req: any) {
    const userId = req.user.userId;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        dislikedIngredients: {
          select: { ingredient: { select: { id: true, name: true } } },
        },
      },
    });

    return {
      ...user,
      dislikedIngredients: (user?.dislikedIngredients ?? []).map((x) => x.ingredient),
    };
  }

  @Put("me/disliked-ingredients")
  async setDisliked(
    @Req() req: any,
    @Body() body: { ingredientNames?: string[]; ingredientIds?: string[] },
  ) {
    const userId = req.user.userId;

    const names = Array.isArray(body.ingredientNames)
      ? body.ingredientNames.map((s) => String(s).trim()).filter(Boolean)
      : [];

    const ids = Array.isArray(body.ingredientIds)
      ? body.ingredientIds.map((s) => String(s).trim()).filter(Boolean)
      : [];

    await this.prisma.userDislikedIngredient.deleteMany({ where: { userId } });

    // names 우선
    if (names.length > 0) {
      const ingredients = await this.prisma.ingredient.findMany({
        where: { name: { in: names } },
        select: { id: true, name: true },
      });

      const found = new Set(ingredients.map((i) => i.name));
      const notFound = names.filter((n) => !found.has(n));
      if (notFound.length > 0) {
        throw new BadRequestException({ message: "Ingredient not found", notFound });
      }

      await this.prisma.userDislikedIngredient.createMany({
        data: ingredients.map((i) => ({ userId, ingredientId: i.id })),
        skipDuplicates: true,
      });

      return { ok: true, count: ingredients.length, mode: "names" };
    }

    // ids도 지원(레거시)
    if (ids.length > 0) {
      try {
        await this.prisma.userDislikedIngredient.createMany({
          data: ids.map((ingredientId) => ({ userId, ingredientId })),
          skipDuplicates: true,
        });
      } catch {
        throw new BadRequestException("Invalid ingredientIds");
      }
      return { ok: true, count: ids.length, mode: "ids" };
    }

    return { ok: true, count: 0 };
  }

  /**
   * ✅ 세션별 Proof 상태 조회
   * GET /me/proof-status/:sessionId
   */
  @Get("me/proof-status/:sessionId")
  async proofStatus(@Req() req: any, @Param("sessionId") sessionId: string) {
    const userId = req.user.userId;
    const sid = String(sessionId ?? "").trim();
    if (!sid) throw new BadRequestException("sessionId is required");

    const session = await this.prisma.recommendSession.findUnique({
      where: { id: sid },
      select: {
        id: true,
        userId: true,
        status: true,
        doneAt: true,
        menu: { select: { id: true, name: true } },
      },
    });

    if (!session) throw new NotFoundException("Session not found");
    if (session.userId !== userId) throw new ForbiddenException("Not your session");

    const proof = await this.prisma.proof.findUnique({
      where: { sessionId: sid },
      select: {
        id: true,
        sessionId: true,
        imageUrl: true,
        aiResult: true,
        aiScore: true,
        aiModel: true,
        aiMeta: true,
        createdAt: true,
        reviewedAt: true,
      },
    });

    return {
      ok: true,
      session: {
        id: session.id,
        status: session.status,
        doneAt: session.doneAt,
        menu: session.menu,
      },
      proof,
    };
  }

  /**
   * ✅ 유저용 Proof 목록
   * GET /me/proofs?take=20&cursor=<proofId>&status=PENDING|HOLD|PASS|FAIL
   *
   * rawUrl은 Proof.aiMeta.rawUrl에서 꺼내서 내려줌(워터마크 없는 이미지)
   */
  @Get("me/proofs")
  async myProofs(
    @Req() req: any,
    @Query() query: { take?: string; cursor?: string; status?: string },
  ) {
    const userId = req.user.userId;

    const takeRaw = Number(query.take ?? 20);
    const take = Number.isFinite(takeRaw) ? Math.min(Math.max(Math.trunc(takeRaw), 1), 50) : 20;

    const cursor = query.cursor ? String(query.cursor).trim() : "";
    const status = query.status ? String(query.status).trim().toUpperCase() : "";

    const where: any = { session: { userId } };
    if (status && ["PENDING", "HOLD", "PASS", "FAIL"].includes(status)) {
      where.aiResult = status;
    }

    const list = await this.prisma.proof.findMany({
      where,
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        sessionId: true,
        imageUrl: true, // 워터마크 이미지
        aiResult: true,
        aiScore: true,
        aiModel: true,
        aiMeta: true, // 여기서 rawUrl 추출
        createdAt: true,
        reviewedAt: true,
        session: {
          select: { menu: { select: { id: true, name: true } } },
        },
        pointLedgers: { select: { points: true } },
      },
    });

    const hasNext = list.length > take;

    const items = list.slice(0, take).map((it) => {
      const meta = (it.aiMeta as any) ?? {};
      const rawUrl: string | null = typeof meta.rawUrl === "string" ? meta.rawUrl : null;

      const processingAt = meta.processingAt ?? null;
      const processedAt = meta.processedAt ?? null;
      const corrections = Array.isArray(meta.corrections)
        ? meta.corrections.map((x: any) => ({
            at: typeof x?.at === "string" ? x.at : null,
            from: typeof x?.from === "string" ? x.from : null,
            to: typeof x?.to === "string" ? x.to : null,
            reason: typeof x?.reason === "string" ? x.reason : null,
          }))
        : [];

      let holdReason: "QUOTA" | "FILE" | "QR" | "REVIEW" | null = null;
      if (String(it.aiResult) === "HOLD") {
        const err = String(meta.openaiError ?? "");
        if (meta.qrError) holdReason = "QR";
        else if (/\b429\b|quota|rate limit/i.test(err)) holdReason = "QUOTA";
        else if (err.includes("file not found")) holdReason = "FILE";
        else holdReason = "REVIEW";
      }

      const earnedPoints = (it.pointLedgers ?? []).reduce(
        (sum, x) => sum + (Number(x.points) || 0),
        0,
      );

      return {
        id: it.id,
        sessionId: it.sessionId,
        rawUrl, // ✅ 유저용(워터마크 없음)
        imageUrl: it.imageUrl, // 워터마크
        aiResult: it.aiResult,
        aiScore: it.aiScore,
        aiModel: it.aiModel,
        createdAt: it.createdAt,
        reviewedAt: it.reviewedAt,
        menu: it.session?.menu ?? null,
        isProcessing: Boolean(processingAt && !processedAt),
        earnedPoints,
        holdReason,
        hasCorrections: corrections.length > 0,
        correctionCount: corrections.length,
        latestCorrection: corrections.length ? corrections[corrections.length - 1] : null,
      };
    });

    return {
      ok: true,
      items,
      nextCursor: hasNext ? list[take]?.id ?? null : null,
    };
  }
}
