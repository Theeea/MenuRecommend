import { BadRequestException, Body, Controller, Get, Put, Req, UseGuards } from "@nestjs/common";
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
}
