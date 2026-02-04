import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class BlockedMenusService {
  constructor(private readonly prisma: PrismaService) {}

  async add(userId: string, menuId: string) {
    const mid = String(menuId ?? "").trim();
    if (!mid) throw new BadRequestException("menuId is required");

    const menu = await this.prisma.menu.findUnique({
      where: { id: mid },
      select: { id: true },
    });
    if (!menu) throw new NotFoundException("Menu not found");

    const row = await this.prisma.userMenuBlock.upsert({
      where: { userId_menuId: { userId, menuId: mid } },
      update: {}, // 이미 있으면 그대로
      create: { userId, menuId: mid },
      include: {
        menu: { select: { id: true, name: true, cuisine: true, dishType: true } },
      },
    });

    return { ok: true, data: row };
  }

  async remove(userId: string, menuId: string) {
    const mid = String(menuId ?? "").trim();
    if (!mid) throw new BadRequestException("menuId is required");

    await this.prisma.userMenuBlock.deleteMany({
      where: { userId, menuId: mid },
    });
    return { ok: true };
  }

  async reset(userId: string) {
    const r = await this.prisma.userMenuBlock.deleteMany({
      where: { userId },
    });
    return { ok: true, deleted: r.count };
  }

  async list(userId: string, opts: { take: number; cursor: string | null }) {
    const rows = await this.prisma.userMenuBlock.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: opts.take,
      ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
      include: {
        menu: { select: { id: true, name: true, cuisine: true, dishType: true } },
      },
    });

    return { ok: true, data: rows, nextCursor: rows.at(-1)?.id ?? null };
  }
}
