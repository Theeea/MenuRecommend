import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Controller()
export class IngredientController {
  constructor(private prisma: PrismaService) {}

  @Get("ingredients")
  list() {
    return this.prisma.ingredient.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  }
}
