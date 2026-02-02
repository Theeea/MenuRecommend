import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class BlockedMenusService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string) {
    const items = await this.prisma.userMenuBlock.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { menu: { select: { id: true, name: true, cuisine: true, dishType: true } } },
    });
    return { ok: true, items };
  }

  async add(userId: string, menuId: string) {
    if (!menuId) throw new BadRequestException("menuId required");
    await this.prisma.userMenuBlock.upsert({
      where: { userId_menuId: { userId, menuId } },
      create: { userId, menuId },
      update: {},
    });
    return { ok: true };
  }

  async remove(userId: string, menuId: string) {
    await this.prisma.userMenuBlock.delete({
      where: { userId_menuId: { userId, menuId } },
    }).catch(() => null);
    return { ok: true };
  }

  async clear(userId: string) {
    const r = await this.prisma.userMenuBlock.deleteMany({ where: { userId } });
    return { ok: true, count: r.count };
  }
}
