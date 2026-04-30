/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

jest.mock('../../generated/prisma/client', () => ({
  PrismaClient: class {},
}));

import { ShopService } from './shop.service';

type PrismaMock = ReturnType<typeof createPrismaMock>;

function createPrismaMock() {
  const tx = {
    shopItem: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    userPurchase: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    pointLedger: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const prisma = {
    $transaction: jest.fn((cb: (txArg: typeof tx) => unknown) => cb(tx)),
    shopItem: {
      findMany: jest.fn(),
    },
    userPurchase: {
      findMany: jest.fn(),
    },
  };

  return { prisma, tx };
}

function makeService(mock: PrismaMock) {
  return new ShopService(mock.prisma as unknown as PrismaService);
}

function baseShopItem(overrides: Record<string, any> = {}) {
  return {
    id: 'item-1',
    name: '커피 교환권',
    description: '아메리카노',
    category: 'gifticon',
    pricePoints: 100,
    imageUrl: '/uploads/shop/coffee.jpg',
    status: 'ACTIVE',
    stock: 3,
    ...overrides,
  };
}

function basePurchase(overrides: Record<string, any> = {}) {
  return {
    id: 'purchase-1',
    userId: 'user-1',
    shopItemId: 'item-1',
    points: 100,
    status: 'REQUESTED',
    itemSnapshot: {
      id: 'item-1',
      name: '커피 교환권',
      pricePoints: 100,
    },
    fulfillmentMeta: null,
    shopItem: {
      id: 'item-1',
      name: '커피 교환권',
      stock: 3,
    },
    ...overrides,
  };
}

describe('ShopService.purchase', () => {
  it('creates a purchase, decrements stock, and writes a spend ledger in one transaction', async () => {
    const mock = createPrismaMock();
    const service = makeService(mock);
    const item = baseShopItem();
    const purchase = basePurchase({
      status: 'REQUESTED',
      createdAt: new Date('2026-04-30T00:00:00.000Z'),
    });

    mock.tx.shopItem.findUnique.mockResolvedValue(item);
    mock.tx.user.updateMany.mockResolvedValue({ count: 1 });
    mock.tx.shopItem.updateMany.mockResolvedValue({ count: 1 });
    mock.tx.user.findUnique.mockResolvedValue({ pointBalance: 400 });
    mock.tx.userPurchase.create.mockResolvedValue(purchase);
    mock.tx.pointLedger.create.mockResolvedValue({});

    await expect(service.purchase('user-1', 'item-1')).resolves.toEqual({
      ok: true,
      purchase,
      balance: 400,
    });

    expect(mock.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mock.tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', pointBalance: { gte: 100 } },
      data: { pointBalance: { decrement: 100 } },
    });
    expect(mock.tx.shopItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'item-1', stock: { gt: 0 } },
      data: { stock: { decrement: 1 } },
    });
    expect(mock.tx.userPurchase.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        shopItemId: 'item-1',
        points: 100,
        status: 'REQUESTED',
        itemSnapshot: {
          id: 'item-1',
          name: '커피 교환권',
          description: '아메리카노',
          category: 'gifticon',
          imageUrl: '/uploads/shop/coffee.jpg',
          pricePoints: 100,
        },
      },
      select: expect.any(Object),
    });
    expect(mock.tx.pointLedger.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        kind: 'SPEND',
        source: 'REDEEM',
        sourceId: 'purchase-1',
        points: -100,
        balanceAfter: 400,
        note: '포인트 사용: 커피 교환권',
      },
    });
    expect(mock.tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorType: 'USER',
        actorId: 'user-1',
        action: 'SHOP_PURCHASE_REQUESTED',
        targetType: 'UserPurchase',
        targetId: 'purchase-1',
        userId: 'user-1',
        metadata: expect.objectContaining({
          shopItemId: 'item-1',
          itemName: '커피 교환권',
          points: 100,
          balanceAfter: 400,
        }),
      },
    });
  });

  it('rejects when user balance is insufficient and does not create a purchase', async () => {
    const mock = createPrismaMock();
    const service = makeService(mock);

    mock.tx.shopItem.findUnique.mockResolvedValue(baseShopItem());
    mock.tx.user.updateMany.mockResolvedValue({ count: 0 });
    mock.tx.user.findUnique.mockResolvedValue({ pointBalance: 30 });

    await expect(service.purchase('user-1', 'item-1')).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(mock.tx.userPurchase.create).not.toHaveBeenCalled();
    expect(mock.tx.pointLedger.create).not.toHaveBeenCalled();
    expect(mock.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects when stock is already empty before charging points', async () => {
    const mock = createPrismaMock();
    const service = makeService(mock);

    mock.tx.shopItem.findUnique.mockResolvedValue(baseShopItem({ stock: 0 }));

    await expect(service.purchase('user-1', 'item-1')).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(mock.tx.user.updateMany).not.toHaveBeenCalled();
    expect(mock.tx.userPurchase.create).not.toHaveBeenCalled();
    expect(mock.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('refunds the user inside the transaction if stock becomes unavailable after charge', async () => {
    const mock = createPrismaMock();
    const service = makeService(mock);

    mock.tx.shopItem.findUnique.mockResolvedValue(baseShopItem({ stock: 1 }));
    mock.tx.user.updateMany.mockResolvedValue({ count: 1 });
    mock.tx.shopItem.updateMany.mockResolvedValue({ count: 0 });
    mock.tx.user.update.mockResolvedValue({ pointBalance: 500 });

    await expect(service.purchase('user-1', 'item-1')).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(mock.tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { pointBalance: { increment: 100 } },
    });
    expect(mock.tx.userPurchase.create).not.toHaveBeenCalled();
    expect(mock.tx.pointLedger.create).not.toHaveBeenCalled();
    expect(mock.tx.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('ShopService.markPurchaseSentByAdmin', () => {
  it('marks a requested purchase as sent with voucher metadata', async () => {
    const mock = createPrismaMock();
    const service = makeService(mock);
    const sent = basePurchase({
      status: 'SENT',
      fulfillmentMeta: { code: 'ABC-1234', memo: '매장 제시' },
    });

    mock.tx.userPurchase.findUnique
      .mockResolvedValueOnce(basePurchase())
      .mockResolvedValueOnce(sent);
    mock.tx.userPurchase.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.markPurchaseSentByAdmin('purchase-1', {
        code: 'ABC-1234',
        memo: '매장 제시',
      }),
    ).resolves.toEqual({ ok: true, item: sent });

    expect(mock.tx.userPurchase.updateMany).toHaveBeenCalledWith({
      where: { id: 'purchase-1', status: 'REQUESTED' },
      data: {
        status: 'SENT',
        fulfilledAt: expect.any(Date),
        fulfillmentMeta: expect.objectContaining({
          code: 'ABC-1234',
          memo: '매장 제시',
          sentBy: 'admin',
          sentAt: expect.any(String),
        }),
      },
    });
    expect(mock.tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorType: 'ADMIN',
        actorId: null,
        action: 'SHOP_PURCHASE_SENT',
        targetType: 'UserPurchase',
        targetId: 'purchase-1',
        userId: 'user-1',
        metadata: expect.objectContaining({
          shopItemId: 'item-1',
          itemName: '커피 교환권',
          codePresent: true,
          memo: '매장 제시',
        }),
      },
    });
  });

  it('does not send a purchase that was already cancelled or sent', async () => {
    const mock = createPrismaMock();
    const service = makeService(mock);

    mock.tx.userPurchase.findUnique.mockResolvedValue(
      basePurchase({ status: 'CANCELLED' }),
    );

    await expect(
      service.markPurchaseSentByAdmin('purchase-1', { code: 'ABC-1234' }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(mock.tx.userPurchase.updateMany).not.toHaveBeenCalled();
    expect(mock.tx.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('ShopService.cancelPurchase', () => {
  it('lets the owner cancel a requested purchase and refunds points', async () => {
    const mock = createPrismaMock();
    const service = makeService(mock);
    const purchase = basePurchase();
    const cancelled = basePurchase({
      status: 'CANCELLED',
      cancelledAt: new Date('2026-04-30T01:00:00.000Z'),
      fulfillmentMeta: {
        cancelReason: '다른 상품으로 변경',
        cancelledBy: 'user',
      },
    });

    mock.tx.userPurchase.findUnique
      .mockResolvedValueOnce(purchase)
      .mockResolvedValueOnce(cancelled);
    mock.tx.userPurchase.updateMany.mockResolvedValue({ count: 1 });
    mock.tx.user.update.mockResolvedValue({ pointBalance: 500 });
    mock.tx.shopItem.update.mockResolvedValue({});
    mock.tx.pointLedger.create.mockResolvedValue({});

    await expect(
      service.cancelPurchaseByUser(
        'user-1',
        'purchase-1',
        '다른 상품으로 변경',
      ),
    ).resolves.toEqual({
      ok: true,
      purchase: cancelled,
      refunded: 100,
      balance: 500,
    });

    expect(mock.tx.userPurchase.updateMany).toHaveBeenCalledWith({
      where: { id: 'purchase-1', status: 'REQUESTED' },
      data: {
        status: 'CANCELLED',
        cancelledAt: expect.any(Date),
        fulfillmentMeta: expect.objectContaining({
          cancelReason: '다른 상품으로 변경',
          cancelledBy: 'user',
          cancelledAt: expect.any(String),
        }),
      },
    });
    expect(mock.tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { pointBalance: { increment: 100 } },
      select: { pointBalance: true },
    });
    expect(mock.tx.shopItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { stock: { increment: 1 } },
    });
    expect(mock.tx.pointLedger.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        kind: 'ADJUST',
        source: 'ADMIN',
        sourceId: 'purchase-1',
        points: 100,
        balanceAfter: 500,
        note: '구매 취소 환불: 커피 교환권 (다른 상품으로 변경)',
        dedupeKey: 'SHOP:CANCEL:purchase-1',
      },
    });
    expect(mock.tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorType: 'USER',
        actorId: 'user-1',
        action: 'SHOP_PURCHASE_CANCELLED',
        targetType: 'UserPurchase',
        targetId: 'purchase-1',
        userId: 'user-1',
        metadata: expect.objectContaining({
          cancelledBy: 'user',
          reason: '다른 상품으로 변경',
          refunded: 100,
          balanceAfter: 500,
          shopItemId: 'item-1',
        }),
      },
    });
  });

  it('rejects user cancellation after admin has sent the voucher', async () => {
    const mock = createPrismaMock();
    const service = makeService(mock);

    mock.tx.userPurchase.findUnique.mockResolvedValue(
      basePurchase({ status: 'SENT' }),
    );

    await expect(
      service.cancelPurchaseByUser('user-1', 'purchase-1', '취소 요청'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(mock.tx.userPurchase.updateMany).not.toHaveBeenCalled();
    expect(mock.tx.user.update).not.toHaveBeenCalled();
    expect(mock.tx.pointLedger.create).not.toHaveBeenCalled();
    expect(mock.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('requires a cancellation reason', async () => {
    const mock = createPrismaMock();
    const service = makeService(mock);

    await expect(
      service.cancelPurchaseByUser('user-1', 'purchase-1', '   '),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mock.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('ShopService.setPurchaseUsedByUser', () => {
  it('lets the owner mark a sent voucher as used or unused without changing purchase status', async () => {
    const mock = createPrismaMock();
    const service = makeService(mock);
    const purchase = basePurchase({
      status: 'SENT',
      fulfillmentMeta: { code: 'ABC-1234', memo: '매장 제시' },
    });
    const updated = {
      ...purchase,
      fulfillmentMeta: {
        code: 'ABC-1234',
        memo: '매장 제시',
        usedByUser: true,
      },
    };

    mock.tx.userPurchase.findUnique.mockResolvedValue(purchase);
    mock.tx.userPurchase.update.mockResolvedValue(updated);

    await expect(
      service.setPurchaseUsedByUser('user-1', 'purchase-1', true),
    ).resolves.toEqual({ ok: true, purchase: updated });

    expect(mock.tx.userPurchase.update).toHaveBeenCalledWith({
      where: { id: 'purchase-1' },
      data: {
        fulfillmentMeta: expect.objectContaining({
          code: 'ABC-1234',
          memo: '매장 제시',
          usedByUser: true,
          usedByUserAt: expect.any(String),
        }),
      },
      include: { shopItem: true },
    });
    expect(mock.tx.pointLedger.create).not.toHaveBeenCalled();
    expect(mock.tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorType: 'USER',
        actorId: 'user-1',
        action: 'SHOP_PURCHASE_USED_TOGGLED',
        targetType: 'UserPurchase',
        targetId: 'purchase-1',
        userId: 'user-1',
        metadata: expect.objectContaining({
          usedByUser: true,
          previousUsedByUser: false,
        }),
      },
    });
  });

  it('rejects used toggle for another user purchase', async () => {
    const mock = createPrismaMock();
    const service = makeService(mock);

    mock.tx.userPurchase.findUnique.mockResolvedValue(
      basePurchase({ userId: 'other-user', status: 'SENT' }),
    );

    await expect(
      service.setPurchaseUsedByUser('user-1', 'purchase-1', true),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(mock.tx.userPurchase.update).not.toHaveBeenCalled();
    expect(mock.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects used toggle before the voucher is sent', async () => {
    const mock = createPrismaMock();
    const service = makeService(mock);

    mock.tx.userPurchase.findUnique.mockResolvedValue(basePurchase());

    await expect(
      service.setPurchaseUsedByUser('user-1', 'purchase-1', true),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(mock.tx.userPurchase.update).not.toHaveBeenCalled();
    expect(mock.tx.auditLog.create).not.toHaveBeenCalled();
  });
});
