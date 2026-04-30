/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
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
          fulfillmentMeta: true,
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

        await this.writeAuditLog(tx, {
          actorType: 'USER',
          actorId: userId,
          action: 'SHOP_PURCHASE_REQUESTED',
          targetType: 'UserPurchase',
          targetId: purchase.id,
          userId,
          metadata: {
            shopItemId: item.id,
            itemName: item.name,
            points: item.pricePoints,
            balanceAfter: user?.pointBalance ?? 0,
            stockManaged: item.stock != null,
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

  async markPurchaseSentByAdmin(
    purchaseId: string,
    body?: { memo?: string; code?: string },
  ) {
    const normalizedId = String(purchaseId ?? '').trim();
    if (!normalizedId) throw new BadRequestException('purchaseId is required');

    const memo = String(body?.memo ?? '').trim();
    const code = String(body?.code ?? '').trim();

    try {
      return await this.prisma.$transaction(async (tx: any) => {
        const purchase = await tx.userPurchase.findUnique({
          where: { id: normalizedId },
        });
        if (!purchase) throw new NotFoundException('purchase not found');
        if (purchase.status !== 'REQUESTED') {
          throw new ConflictException({
            code: 'SHOP_PURCHASE_NOT_SENDABLE',
            message:
              '발송 대기 상태의 구매 요청만 발송 완료 처리할 수 있습니다.',
          });
        }

        const updated = await tx.userPurchase.updateMany({
          where: { id: normalizedId, status: 'REQUESTED' },
          data: {
            status: 'SENT',
            fulfilledAt: new Date(),
            fulfillmentMeta: {
              ...(purchase.fulfillmentMeta &&
              typeof purchase.fulfillmentMeta === 'object'
                ? purchase.fulfillmentMeta
                : {}),
              memo: memo || null,
              code: code || null,
              sentBy: 'admin',
              sentAt: new Date().toISOString(),
            },
          },
        });

        if (updated.count !== 1) {
          throw new ConflictException({
            code: 'SHOP_PURCHASE_STATUS_CHANGED',
            message: '구매 요청 상태가 이미 변경되었습니다.',
          });
        }

        const item = await tx.userPurchase.findUnique({
          where: { id: normalizedId },
          include: { shopItem: true, user: true },
        });
        await this.writeAuditLog(tx, {
          actorType: 'ADMIN',
          actorId: null,
          action: 'SHOP_PURCHASE_SENT',
          targetType: 'UserPurchase',
          targetId: normalizedId,
          userId: item?.userId ?? purchase.userId,
          metadata: {
            shopItemId: item?.shopItemId ?? purchase.shopItemId,
            itemName: item?.shopItem?.name ?? null,
            codePresent: !!code,
            memo: memo || null,
          },
        });
        return { ok: true, item };
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

  async cancelPurchaseByUser(
    userId: string,
    purchaseId: string,
    reason: string,
  ) {
    return this.cancelPurchase(purchaseId, reason, 'user', userId);
  }

  async setPurchaseUsedByUser(
    userId: string,
    purchaseId: string,
    used: boolean,
  ) {
    const normalizedId = String(purchaseId ?? '').trim();
    if (!normalizedId) throw new BadRequestException('purchaseId is required');

    try {
      return await this.prisma.$transaction(async (tx: any) => {
        const purchase = await tx.userPurchase.findUnique({
          where: { id: normalizedId },
        });
        if (!purchase || purchase.userId !== userId) {
          throw new NotFoundException('purchase not found');
        }
        if (purchase.status !== 'SENT') {
          throw new ConflictException({
            code: 'SHOP_PURCHASE_NOT_SENT',
            message: '발송 완료된 구매만 사용 처리할 수 있습니다.',
          });
        }

        const updated = await tx.userPurchase.update({
          where: { id: normalizedId },
          data: {
            fulfillmentMeta: {
              ...(purchase.fulfillmentMeta &&
              typeof purchase.fulfillmentMeta === 'object'
                ? purchase.fulfillmentMeta
                : {}),
              usedByUser: used,
              usedByUserAt: used ? new Date().toISOString() : null,
            },
          },
          include: { shopItem: true },
        });

        await this.writeAuditLog(tx, {
          actorType: 'USER',
          actorId: userId,
          action: 'SHOP_PURCHASE_USED_TOGGLED',
          targetType: 'UserPurchase',
          targetId: normalizedId,
          userId,
          metadata: {
            usedByUser: used,
            previousUsedByUser:
              purchase.fulfillmentMeta &&
              typeof purchase.fulfillmentMeta === 'object'
                ? purchase.fulfillmentMeta.usedByUser === true
                : false,
          },
        });

        return { ok: true, purchase: updated };
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

  async cancelPurchaseByAdmin(purchaseId: string, reason: string) {
    return this.cancelPurchase(purchaseId, reason, 'admin');
  }

  private async cancelPurchase(
    purchaseId: string,
    reason: string,
    actor: 'admin' | 'user',
    userId?: string,
  ) {
    const normalizedId = String(purchaseId ?? '').trim();
    if (!normalizedId) throw new BadRequestException('purchaseId is required');

    const cancelReason = String(reason ?? '').trim();
    if (!cancelReason) throw new BadRequestException('reason is required');

    try {
      return await this.prisma.$transaction(async (tx: any) => {
        const purchase = await tx.userPurchase.findUnique({
          where: { id: normalizedId },
          include: { shopItem: true },
        });

        if (!purchase) throw new NotFoundException('purchase not found');
        if (userId && purchase.userId !== userId) {
          throw new NotFoundException('purchase not found');
        }
        if (purchase.status !== 'REQUESTED') {
          throw new ConflictException({
            code: 'SHOP_PURCHASE_NOT_CANCELABLE',
            message: '발송 대기 상태의 구매 요청만 취소할 수 있습니다.',
          });
        }

        const statusUpdate = await tx.userPurchase.updateMany({
          where: { id: normalizedId, status: 'REQUESTED' },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            fulfillmentMeta: {
              ...(purchase.fulfillmentMeta &&
              typeof purchase.fulfillmentMeta === 'object'
                ? purchase.fulfillmentMeta
                : {}),
              cancelReason,
              cancelledBy: actor,
              cancelledAt: new Date().toISOString(),
            },
          },
        });
        if (statusUpdate.count !== 1) {
          throw new ConflictException({
            code: 'SHOP_PURCHASE_STATUS_CHANGED',
            message: '구매 요청 상태가 이미 변경되었습니다.',
          });
        }

        const refundPoints = Math.max(0, Number(purchase.points) || 0);
        const user = await tx.user.update({
          where: { id: purchase.userId },
          data: { pointBalance: { increment: refundPoints } },
          select: { pointBalance: true },
        });

        if (purchase.shopItem?.stock != null) {
          await tx.shopItem.update({
            where: { id: purchase.shopItemId },
            data: { stock: { increment: 1 } },
          });
        }

        const cancelled = await tx.userPurchase.findUnique({
          where: { id: normalizedId },
        });

        await tx.pointLedger.create({
          data: {
            userId: purchase.userId,
            kind: 'ADJUST',
            source: 'ADMIN',
            sourceId: purchase.id,
            points: refundPoints,
            balanceAfter: user.pointBalance,
            note: `구매 취소 환불: ${purchase.shopItem?.name ?? '상품'} (${cancelReason})`,
            dedupeKey: `SHOP:CANCEL:${purchase.id}`,
          },
        });

        await this.writeAuditLog(tx, {
          actorType: actor === 'admin' ? 'ADMIN' : 'USER',
          actorId: actor === 'user' ? purchase.userId : null,
          action: 'SHOP_PURCHASE_CANCELLED',
          targetType: 'UserPurchase',
          targetId: purchase.id,
          userId: purchase.userId,
          metadata: {
            cancelledBy: actor,
            reason: cancelReason,
            refunded: refundPoints,
            balanceAfter: user.pointBalance,
            shopItemId: purchase.shopItemId,
            itemName: purchase.shopItem?.name ?? null,
            stockRestored: purchase.shopItem?.stock != null,
          },
        });

        return {
          ok: true,
          purchase: cancelled,
          refunded: refundPoints,
          balance: user.pointBalance,
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

  private async writeAuditLog(
    tx: any,
    data: {
      actorType: 'USER' | 'ADMIN' | 'SYSTEM';
      actorId?: string | null;
      action: string;
      targetType: string;
      targetId?: string | null;
      userId?: string | null;
      metadata?: Record<string, any> | null;
    },
  ) {
    await tx.auditLog.create({
      data: {
        actorType: data.actorType,
        actorId: data.actorId ?? null,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId ?? null,
        userId: data.userId ?? null,
        metadata: data.metadata ?? null,
      },
    });
  }
}
