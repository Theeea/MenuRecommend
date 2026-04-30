import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function isMissingShopTableError(e: any) {
  const msg = String(e?.message ?? '');
  return (
    e?.code === 'P2021' || /ShopItem|UserPurchase|does not exist/i.test(msg)
  );
}

@Injectable()
export class ShopService {
  constructor(private readonly prisma: PrismaService) {}

  async listItems() {
    try {
      const items = await (this.prisma as any).shopItem.findMany({
        where: { status: 'ACTIVE' },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          pricePoints: true,
          imageUrl: true,
          stock: true,
        },
      });

      return { ok: true, items };
    } catch (e: any) {
      if (isMissingShopTableError(e)) {
        return { ok: true, items: [], migrationRequired: true };
      }
      throw e;
    }
  }

  async listMyPurchases(userId: string, take = 20, cursor?: string) {
    let rows: any[];
    try {
      rows = await (this.prisma as any).userPurchase.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: {
          id: true,
          points: true,
          status: true,
          itemSnapshot: true,
          fulfilledAt: true,
          cancelledAt: true,
          createdAt: true,
          shopItem: {
            select: {
              id: true,
              name: true,
              description: true,
              category: true,
              imageUrl: true,
            },
          },
        },
      });
    } catch (e: any) {
      if (isMissingShopTableError(e)) {
        return {
          ok: true,
          items: [],
          nextCursor: null,
          migrationRequired: true,
        };
      }
      throw e;
    }

    return {
      ok: true,
      items: rows,
      nextCursor: rows.length ? rows[rows.length - 1].id : null,
    };
  }

  async purchase(userId: string, itemId: string) {
    const normalizedItemId = String(itemId ?? '').trim();
    if (!normalizedItemId) throw new BadRequestException('itemId is required');

    try {
      return await this.prisma.$transaction(async (tx: any) => {
        const item = await tx.shopItem.findUnique({
          where: { id: normalizedItemId },
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            pricePoints: true,
            imageUrl: true,
            status: true,
            stock: true,
          },
        });

        if (!item || item.status !== 'ACTIVE') {
          throw new NotFoundException('shop item not found');
        }
        if (
          !Number.isFinite(Number(item.pricePoints)) ||
          item.pricePoints <= 0
        ) {
          throw new BadRequestException('invalid shop item price');
        }
        if (item.stock != null && item.stock <= 0) {
          throw new ConflictException({
            code: 'SHOP_OUT_OF_STOCK',
            message: '상품 재고가 없습니다.',
          });
        }

        const balanceUpdate = await tx.user.updateMany({
          where: { id: userId, pointBalance: { gte: item.pricePoints } },
          data: { pointBalance: { decrement: item.pricePoints } },
        });

        if (balanceUpdate.count !== 1) {
          const user = await tx.user.findUnique({
            where: { id: userId },
            select: { pointBalance: true },
          });
          throw new ConflictException({
            code: 'SHOP_INSUFFICIENT_POINTS',
            message: '포인트가 부족합니다.',
            balance: user?.pointBalance ?? 0,
            required: item.pricePoints,
          });
        }

        if (item.stock != null) {
          const stockUpdate = await tx.shopItem.updateMany({
            where: { id: item.id, stock: { gt: 0 } },
            data: { stock: { decrement: 1 } },
          });
          if (stockUpdate.count !== 1) {
            await tx.user.update({
              where: { id: userId },
              data: { pointBalance: { increment: item.pricePoints } },
            });
            throw new ConflictException({
              code: 'SHOP_OUT_OF_STOCK',
              message: '상품 재고가 없습니다.',
            });
          }
        }

        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { pointBalance: true },
        });

        const purchase = await tx.userPurchase.create({
          data: {
            userId,
            shopItemId: item.id,
            points: item.pricePoints,
            status: 'REQUESTED',
            itemSnapshot: {
              id: item.id,
              name: item.name,
              description: item.description,
              category: item.category,
              imageUrl: item.imageUrl,
              pricePoints: item.pricePoints,
            },
          },
          select: {
            id: true,
            points: true,
            status: true,
            createdAt: true,
            itemSnapshot: true,
            shopItem: {
              select: {
                id: true,
                name: true,
                description: true,
                category: true,
                imageUrl: true,
              },
            },
          },
        });

        await tx.pointLedger.create({
          data: {
            userId,
            kind: 'SPEND',
            source: 'REDEEM',
            sourceId: purchase.id,
            points: -item.pricePoints,
            balanceAfter: user?.pointBalance ?? 0,
            note: `포인트 사용: ${item.name}`,
          },
        });

        return {
          ok: true,
          purchase,
          balance: user?.pointBalance ?? 0,
        };
      });
    } catch (e: any) {
      if (isMissingShopTableError(e)) {
        throw new ServiceUnavailableException({
          code: 'SHOP_MIGRATION_REQUIRED',
          message: '포인트 사용 DB migration이 필요합니다.',
        });
      }
      throw e;
    }
  }
}
