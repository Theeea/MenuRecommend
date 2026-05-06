/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createHmac } from 'crypto';

jest.mock('../../generated/prisma/client', () => ({
  PrismaClient: class {},
  ProofResult: {
    PENDING: 'PENDING',
    HOLD: 'HOLD',
    PASS: 'PASS',
    FAIL: 'FAIL',
  },
  Prisma: {},
}));

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    responses: { create: jest.fn() },
  })),
}));

import { ProofResult } from '../../generated/prisma/client';
import { ProofService } from './proof.service';

type PrismaMock = ReturnType<typeof createPrismaMock>;

function createPrismaMock() {
  const tx = {
    proof: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    pointLedger: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    recommendSession: {
      update: jest.fn(),
    },
  };

  const prisma = {
    recommendSession: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    proof: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((cb: (txArg: typeof tx) => unknown) => cb(tx)),
  };

  return { prisma, tx };
}

function baseSession(overrides: Record<string, any> = {}) {
  return {
    id: 'session-1',
    userId: 'user-1',
    menuId: 'menu-1',
    status: 'ACCEPTED',
    challengeCode: 'ABC123',
    createdAt: new Date('2026-04-29T00:00:00.000Z'),
    acceptedAt: new Date('2026-04-29T00:01:00.000Z'),
    doneAt: null,
    menu: { name: '김치찌개' },
    ...overrides,
  };
}

function basePendingProof(overrides: Record<string, any> = {}) {
  return {
    id: 'proof-1',
    sessionId: 'session-1',
    imageUrl: '/uploads/proof/proof-1.jpg',
    aiResult: ProofResult.PENDING,
    aiScore: 0,
    aiModel: null,
    aiMeta: {
      rawUrl: '/uploads/raw/raw-1.jpg',
      attempts: 0,
      challengeCode: 'ABC123',
    },
    createdAt: new Date('2026-04-29T01:00:00.000Z'),
    reviewedAt: null,
    reviewedByAdminId: null,
    session: {
      ...baseSession(),
      menu: {
        id: 'menu-1',
        name: '김치찌개',
        cuisine: 'KOREAN',
        dishType: 'STEW',
        ingredients: [
          { ingredient: { name: '김치' } },
          { ingredient: { name: '돼지고기' } },
        ],
      },
    },
    ...overrides,
  };
}

function makeService(mock: PrismaMock) {
  return new ProofService(mock.prisma as any);
}

function setProofPolicyEnv(values: Record<string, string | undefined>) {
  const previous = {
    PROOF_BLOCK_WHILE_PENDING: process.env.PROOF_BLOCK_WHILE_PENDING,
    PROOF_COOLDOWN_HOURS: process.env.PROOF_COOLDOWN_HOURS,
    PROOF_DAILY_LIMIT: process.env.PROOF_DAILY_LIMIT,
  };

  for (const [key, value] of Object.entries(values)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }

  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

describe('ProofService.createQueued', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('queues a new proof with rawUrl in aiMeta and marks the session PROOF_SUBMITTED', async () => {
    const restoreEnv = setProofPolicyEnv({
      PROOF_BLOCK_WHILE_PENDING: '1',
      PROOF_COOLDOWN_HOURS: '0',
      PROOF_DAILY_LIMIT: '0',
    });
    const mock = createPrismaMock();
    const service = makeService(mock);
    const createdAt = new Date('2026-04-29T01:00:00.000Z');

    mock.prisma.recommendSession.findUnique.mockResolvedValue(baseSession());
    mock.tx.proof.findUnique.mockResolvedValue(null);
    mock.tx.proof.findFirst.mockResolvedValue(null);
    mock.tx.proof.count.mockResolvedValue(0);
    mock.tx.proof.create.mockResolvedValue({
      id: 'proof-1',
      sessionId: 'session-1',
      aiResult: ProofResult.PENDING,
      imageUrl: '/uploads/proof/proof-1.jpg',
      createdAt,
    });
    mock.tx.recommendSession.update.mockResolvedValue({});

    try {
      const result = await service.createQueued(
        'user-1',
        'session-1',
        '/uploads/proof/proof-1.jpg',
        '/uploads/raw/raw-1.jpg',
        'ABC123',
      );

      expect(result).toEqual({
        ok: true,
        queued: true,
        proof: {
          id: 'proof-1',
          sessionId: 'session-1',
          aiResult: ProofResult.PENDING,
          imageUrl: '/uploads/proof/proof-1.jpg',
          createdAt,
        },
      });
      expect(mock.tx.proof.create).toHaveBeenCalledWith({
        data: {
          sessionId: 'session-1',
          imageUrl: '/uploads/proof/proof-1.jpg',
          aiScore: 0,
          aiResult: 'PENDING',
          aiModel: null,
          aiMeta: expect.objectContaining({
            rawUrl: '/uploads/raw/raw-1.jpg',
            challengeCode: 'ABC123',
            processingAt: null,
            processedAt: null,
            attempts: 0,
          }),
        },
        select: {
          id: true,
          sessionId: true,
          aiResult: true,
          imageUrl: true,
          createdAt: true,
        },
      });
      expect(mock.tx.recommendSession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { status: 'PROOF_SUBMITTED' },
      });
    } finally {
      restoreEnv();
    }
  });

  it('returns an existing proof idempotently for the same sessionId', async () => {
    const restoreEnv = setProofPolicyEnv({
      PROOF_BLOCK_WHILE_PENDING: '1',
      PROOF_COOLDOWN_HOURS: '3',
      PROOF_DAILY_LIMIT: '3',
    });
    const mock = createPrismaMock();
    const service = makeService(mock);
    const existing = {
      id: 'proof-existing',
      sessionId: 'session-1',
      aiResult: ProofResult.PENDING,
      imageUrl: '/uploads/proof/existing.jpg',
      createdAt: new Date('2026-04-29T01:00:00.000Z'),
    };

    mock.prisma.recommendSession.findUnique.mockResolvedValue(
      baseSession({ status: 'PROOF_SUBMITTED' }),
    );
    mock.tx.proof.findUnique.mockResolvedValue(existing);

    try {
      await expect(
        service.createQueued(
          'user-1',
          'session-1',
          '/uploads/proof/new.jpg',
          '/uploads/raw/new.jpg',
          'ABC123',
        ),
      ).resolves.toEqual({ ok: true, queued: false, proof: existing });

      expect(mock.tx.proof.findFirst).not.toHaveBeenCalled();
      expect(mock.tx.proof.create).not.toHaveBeenCalled();
      expect(mock.tx.recommendSession.update).not.toHaveBeenCalled();
    } finally {
      restoreEnv();
    }
  });

  it.each([ProofResult.PENDING, ProofResult.HOLD])(
    'blocks a new upload while another proof is %s',
    async (activeResult) => {
      const restoreEnv = setProofPolicyEnv({
        PROOF_BLOCK_WHILE_PENDING: '1',
        PROOF_COOLDOWN_HOURS: '0',
        PROOF_DAILY_LIMIT: '0',
      });
      const mock = createPrismaMock();
      const service = makeService(mock);

      mock.prisma.recommendSession.findUnique.mockResolvedValue(baseSession());
      mock.tx.proof.findUnique.mockResolvedValue(null);
      mock.tx.proof.findFirst.mockResolvedValue({
        id: 'active-proof',
        sessionId: 'active-session',
        aiResult: activeResult,
        createdAt: new Date('2026-04-29T01:00:00.000Z'),
      });

      try {
        await expect(
          service.createQueued(
            'user-1',
            'session-1',
            '/uploads/proof/proof-1.jpg',
            '/uploads/raw/raw-1.jpg',
            'ABC123',
          ),
        ).rejects.toMatchObject({
          status: 429,
          response: expect.objectContaining({ code: 'PROOF_PENDING' }),
        });
        expect(mock.tx.proof.create).not.toHaveBeenCalled();
      } finally {
        restoreEnv();
      }
    },
  );

  it('rejects proof creation during cooldown', async () => {
    const restoreEnv = setProofPolicyEnv({
      PROOF_BLOCK_WHILE_PENDING: '1',
      PROOF_COOLDOWN_HOURS: '3',
      PROOF_DAILY_LIMIT: '0',
    });
    const mock = createPrismaMock();
    const service = makeService(mock);
    const nowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-04-29T03:00:00.000Z').getTime());

    mock.prisma.recommendSession.findUnique.mockResolvedValue(baseSession());
    mock.tx.proof.findUnique.mockResolvedValue(null);
    mock.tx.proof.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      createdAt: new Date('2026-04-29T01:30:00.000Z'),
    });

    try {
      await expect(
        service.createQueued(
          'user-1',
          'session-1',
          '/uploads/proof/proof-1.jpg',
          '/uploads/raw/raw-1.jpg',
          'ABC123',
        ),
      ).rejects.toMatchObject({
        status: 429,
        response: expect.objectContaining({ code: 'PROOF_COOLDOWN' }),
      });
      expect(mock.tx.proof.create).not.toHaveBeenCalled();
    } finally {
      nowSpy.mockRestore();
      restoreEnv();
    }
  });

  it('rejects proof creation when the KST daily limit is reached', async () => {
    const restoreEnv = setProofPolicyEnv({
      PROOF_BLOCK_WHILE_PENDING: '1',
      PROOF_COOLDOWN_HOURS: '0',
      PROOF_DAILY_LIMIT: '3',
    });
    const mock = createPrismaMock();
    const service = makeService(mock);

    mock.prisma.recommendSession.findUnique.mockResolvedValue(baseSession());
    mock.tx.proof.findUnique.mockResolvedValue(null);
    mock.tx.proof.findFirst.mockResolvedValue(null);
    mock.tx.proof.count.mockResolvedValue(3);

    try {
      await expect(
        service.createQueued(
          'user-1',
          'session-1',
          '/uploads/proof/proof-1.jpg',
          '/uploads/raw/raw-1.jpg',
          'ABC123',
        ),
      ).rejects.toMatchObject({
        status: 429,
        response: expect.objectContaining({ code: 'PROOF_DAILY_LIMIT' }),
      });
      expect(mock.tx.proof.create).not.toHaveBeenCalled();
    } finally {
      restoreEnv();
    }
  });

  it('rejects a mismatched challengeCode before opening a transaction', async () => {
    const mock = createPrismaMock();
    const service = makeService(mock);

    mock.prisma.recommendSession.findUnique.mockResolvedValue(baseSession());

    await expect(
      service.createQueued(
        'user-1',
        'session-1',
        '/uploads/proof/proof-1.jpg',
        '/uploads/raw/raw-1.jpg',
        'WRONG',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mock.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects missing, foreign, and not-accepted sessions', async () => {
    const missing = createPrismaMock();
    missing.prisma.recommendSession.findUnique.mockResolvedValue(null);
    await expect(
      makeService(missing).createQueued(
        'user-1',
        'session-1',
        '/uploads/proof/proof-1.jpg',
        '/uploads/raw/raw-1.jpg',
        'ABC123',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    const foreign = createPrismaMock();
    foreign.prisma.recommendSession.findUnique.mockResolvedValue(
      baseSession({ userId: 'user-2' }),
    );
    await expect(
      makeService(foreign).createQueued(
        'user-1',
        'session-1',
        '/uploads/proof/proof-1.jpg',
        '/uploads/raw/raw-1.jpg',
        'ABC123',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const notAccepted = createPrismaMock();
    notAccepted.prisma.recommendSession.findUnique.mockResolvedValue(
      baseSession({ status: 'RECOMMENDED' }),
    );
    await expect(
      makeService(notAccepted).createQueued(
        'user-1',
        'session-1',
        '/uploads/proof/proof-1.jpg',
        '/uploads/raw/raw-1.jpg',
        'ABC123',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ProofService.reviewByAdminKey', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.ADMIN_REVIEW_KEY;
    delete process.env.PROOF_PASS_BONUS;
  });

  it('awards points once and marks the session DONE when admin approves a proof', async () => {
    process.env.ADMIN_REVIEW_KEY = 'admin-secret';
    process.env.PROOF_PASS_BONUS = '40';

    const mock = createPrismaMock();
    const service = makeService(mock);
    const proof = {
      id: 'proof-1',
      sessionId: 'session-1',
      imageUrl: '/uploads/proof/proof-1.jpg',
      aiResult: ProofResult.HOLD,
      aiScore: 0,
      aiModel: null,
      aiMeta: { rawUrl: '/uploads/raw/raw-1.jpg', attempts: 1 },
      createdAt: new Date('2026-04-29T01:00:00.000Z'),
      reviewedAt: null,
      reviewedByAdminId: null,
      session: baseSession(),
    };
    const updatedProof = {
      ...proof,
      aiResult: ProofResult.PASS,
      aiScore: 92,
      aiModel: 'admin',
      session: baseSession(),
    };

    mock.prisma.proof.findUnique.mockResolvedValue(proof);
    mock.tx.proof.update.mockResolvedValue(updatedProof);
    mock.tx.pointLedger.findUnique.mockResolvedValue(null);
    mock.tx.user.findUnique.mockResolvedValue({
      id: 'user-1',
      pointBalance: 120,
    });
    mock.tx.user.update.mockResolvedValue({ pointBalance: 160 });
    mock.tx.pointLedger.create.mockResolvedValue({ id: 'ledger-1' });
    mock.tx.recommendSession.update.mockResolvedValue({});

    const result = (await service.reviewByAdminKey('admin-secret', 'proof-1', {
      result: 'PASS',
      score: 92,
      model: 'admin',
      meta: { reason: 'manual pass' },
    })) as { ok: boolean; proof: unknown; bonus: unknown };

    expect(result.ok).toBe(true);
    expect(result.proof).toBe(updatedProof);
    expect(result.bonus).toEqual({
      ok: true,
      earned: 40,
      balanceAfter: 160,
    });
    expect(mock.tx.proof.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'proof-1' },
        data: expect.objectContaining({
          aiResult: 'PASS',
          aiScore: 92,
          aiModel: 'admin',
          reviewedAt: expect.any(Date),
          aiMeta: expect.objectContaining({
            rawUrl: '/uploads/raw/raw-1.jpg',
            adminMeta: { reason: 'manual pass' },
            reviewedBy: 'admin',
            processingAt: null,
            processedAt: expect.any(String),
          }),
        }),
        include: { session: true },
      }),
    );
    expect(mock.tx.pointLedger.findUnique).toHaveBeenCalledWith({
      where: { dedupeKey: 'PROOF:PASS:proof-1' },
      select: { id: true, balanceAfter: true, points: true },
    });
    expect(mock.tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { pointBalance: 160 },
      select: { pointBalance: true },
    });
    expect(mock.tx.pointLedger.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        kind: 'EARN',
        source: 'PROOF',
        sourceId: 'proof-1',
        proofId: 'proof-1',
        points: 40,
        balanceAfter: 160,
        note: 'proof pass bonus',
        dedupeKey: 'PROOF:PASS:proof-1',
      },
      select: { id: true },
    });
    expect(mock.tx.recommendSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { status: 'DONE', doneAt: expect.any(Date) },
    });
    expect(mock.tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorType: 'ADMIN',
        actorId: null,
        action: 'PROOF_REVIEWED',
        targetType: 'Proof',
        targetId: 'proof-1',
        userId: 'user-1',
        metadata: expect.objectContaining({
          result: 'PASS',
          score: 92,
          pointDelta: 40,
          balanceAfter: 160,
          sessionId: 'session-1',
          model: 'admin',
        }),
      },
    });
  });

  it('does not award points again when the proof reward dedupeKey already exists', async () => {
    process.env.ADMIN_REVIEW_KEY = 'admin-secret';
    process.env.PROOF_PASS_BONUS = '40';

    const mock = createPrismaMock();
    const service = makeService(mock);
    const proof = {
      id: 'proof-1',
      sessionId: 'session-1',
      imageUrl: '/uploads/proof/proof-1.jpg',
      aiResult: ProofResult.HOLD,
      aiScore: 0,
      aiModel: null,
      aiMeta: { rawUrl: '/uploads/raw/raw-1.jpg' },
      createdAt: new Date('2026-04-29T01:00:00.000Z'),
      reviewedAt: null,
      reviewedByAdminId: null,
      session: baseSession(),
    };
    const updatedProof = {
      ...proof,
      aiResult: ProofResult.PASS,
      session: baseSession(),
    };

    mock.prisma.proof.findUnique.mockResolvedValue(proof);
    mock.tx.proof.update.mockResolvedValue(updatedProof);
    mock.tx.pointLedger.findUnique.mockResolvedValue({
      id: 'ledger-existing',
      balanceAfter: 160,
      points: 40,
    });
    mock.tx.recommendSession.update.mockResolvedValue({});

    const result = (await service.reviewByAdminKey('admin-secret', 'proof-1', {
      result: 'PASS',
    })) as { ok: boolean; bonus: unknown };

    expect(result.ok).toBe(true);
    expect(result.bonus).toEqual({
      ok: true,
      earned: 0,
      balanceAfter: 160,
      deduped: true,
    });
    expect(mock.tx.user.findUnique).not.toHaveBeenCalled();
    expect(mock.tx.user.update).not.toHaveBeenCalled();
    expect(mock.tx.pointLedger.create).not.toHaveBeenCalled();
    expect(mock.tx.recommendSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { status: 'DONE', doneAt: expect.any(Date) },
    });
    expect(mock.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorType: 'ADMIN',
        action: 'PROOF_REVIEWED',
        targetType: 'Proof',
        targetId: 'proof-1',
        userId: 'user-1',
        metadata: expect.objectContaining({
          result: 'PASS',
          pointDelta: 0,
          balanceAfter: 160,
          sessionId: 'session-1',
        }),
      }),
    });
  });

  it('returns alreadyFinal without opening a transaction for a final proof', async () => {
    process.env.ADMIN_REVIEW_KEY = 'admin-secret';

    const mock = createPrismaMock();
    const service = makeService(mock);
    const proof = {
      id: 'proof-1',
      sessionId: 'session-1',
      aiResult: ProofResult.PASS,
      session: baseSession({ status: 'DONE' }),
    };

    mock.prisma.proof.findUnique.mockResolvedValue(proof);

    await expect(
      service.reviewByAdminKey('admin-secret', 'proof-1', { result: 'PASS' }),
    ).resolves.toEqual({ ok: true, alreadyFinal: true, proof });
    expect(mock.prisma.$transaction).not.toHaveBeenCalled();
    expect(mock.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('marks the session DONE without awarding points when admin rejects a proof', async () => {
    process.env.ADMIN_REVIEW_KEY = 'admin-secret';

    const mock = createPrismaMock();
    const service = makeService(mock);
    const proof = {
      id: 'proof-1',
      sessionId: 'session-1',
      imageUrl: '/uploads/proof/proof-1.jpg',
      aiResult: ProofResult.HOLD,
      aiScore: 0,
      aiModel: null,
      aiMeta: { rawUrl: '/uploads/raw/raw-1.jpg' },
      createdAt: new Date('2026-04-29T01:00:00.000Z'),
      reviewedAt: null,
      reviewedByAdminId: null,
      session: baseSession(),
    };
    const updatedProof = {
      ...proof,
      aiResult: ProofResult.FAIL,
      session: baseSession(),
    };

    mock.prisma.proof.findUnique.mockResolvedValue(proof);
    mock.tx.proof.update.mockResolvedValue(updatedProof);
    mock.tx.recommendSession.update.mockResolvedValue({});

    const result = await service.reviewByAdminKey('admin-secret', 'proof-1', {
      result: 'FAIL',
      score: 15,
      model: 'admin',
    });

    expect(result).toEqual({ ok: true, proof: updatedProof });
    expect(mock.tx.pointLedger.findUnique).not.toHaveBeenCalled();
    expect(mock.tx.pointLedger.create).not.toHaveBeenCalled();
    expect(mock.tx.user.update).not.toHaveBeenCalled();
    expect(mock.tx.recommendSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { status: 'DONE', doneAt: expect.any(Date) },
    });
    expect(mock.tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorType: 'ADMIN',
        actorId: null,
        action: 'PROOF_REVIEWED',
        targetType: 'Proof',
        targetId: 'proof-1',
        userId: 'user-1',
        metadata: expect.objectContaining({
          result: 'FAIL',
          score: 15,
          pointDelta: 0,
          balanceAfter: null,
          sessionId: 'session-1',
          model: 'admin',
        }),
      },
    });
  });
});

describe('ProofService.correctReviewByAdminKey', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.ADMIN_REVIEW_KEY;
    delete process.env.PROOF_PASS_BONUS;
  });

  it('corrects PASS to FAIL and creates a negative admin adjustment ledger', async () => {
    process.env.ADMIN_REVIEW_KEY = 'admin-secret';
    process.env.PROOF_PASS_BONUS = '40';

    const mock = createPrismaMock();
    const service = makeService(mock);
    const proof = {
      id: 'proof-1',
      sessionId: 'session-1',
      imageUrl: '/uploads/proof/proof-1.jpg',
      aiResult: ProofResult.PASS,
      aiScore: 95,
      aiModel: 'admin',
      aiMeta: { rawUrl: '/uploads/raw/raw-1.jpg' },
      createdAt: new Date('2026-04-29T01:00:00.000Z'),
      reviewedAt: new Date('2026-04-29T01:10:00.000Z'),
      reviewedByAdminId: null,
      session: baseSession({
        status: 'DONE',
        doneAt: new Date('2026-04-29T01:10:00.000Z'),
      }),
    };
    const updatedProof = {
      ...proof,
      aiResult: ProofResult.FAIL,
    };

    mock.prisma.proof.findUnique.mockResolvedValue(proof);
    mock.tx.pointLedger.findUnique
      .mockResolvedValueOnce({
        id: 'pass-ledger',
        points: 40,
        balanceAfter: 160,
      })
      .mockResolvedValueOnce(null);
    mock.tx.user.findUnique.mockResolvedValue({
      id: 'user-1',
      pointBalance: 160,
    });
    mock.tx.user.update.mockResolvedValue({ pointBalance: 120 });
    mock.tx.pointLedger.create.mockResolvedValue({ id: 'correction-ledger' });
    mock.tx.proof.update.mockResolvedValue(updatedProof);
    mock.tx.recommendSession.update.mockResolvedValue({});

    const result = (await service.correctReviewByAdminKey(
      'admin-secret',
      'proof-1',
      { result: 'FAIL', reason: '검색 이미지로 확인됨' },
    )) as any;

    expect(result.ok).toBe(true);
    expect(result.pointAdjustment).toEqual({
      ok: true,
      points: -40,
      balanceAfter: 120,
    });
    expect(mock.tx.pointLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        kind: 'ADJUST',
        source: 'ADMIN',
        sourceId: 'proof-1',
        proofId: 'proof-1',
        points: -40,
        balanceAfter: 120,
        dedupeKey: 'PROOF:CORRECTION:proof-1:1:PASS_TO_FAIL',
      }),
      select: { id: true },
    });
    expect(mock.tx.proof.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'proof-1' },
        data: expect.objectContaining({
          aiResult: 'FAIL',
          aiMeta: expect.objectContaining({
            corrections: [
              expect.objectContaining({
                from: 'PASS',
                to: 'FAIL',
                reason: '검색 이미지로 확인됨',
              }),
            ],
            correctionReason: '검색 이미지로 확인됨',
          }),
        }),
      }),
    );
    expect(mock.tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorType: 'ADMIN',
        actorId: null,
        action: 'PROOF_REVIEW_CORRECTED',
        targetType: 'Proof',
        targetId: 'proof-1',
        userId: 'user-1',
        metadata: expect.objectContaining({
          from: 'PASS',
          to: 'FAIL',
          reason: '검색 이미지로 확인됨',
          sequence: 1,
          pointDelta: -40,
          balanceAfter: 120,
          sessionId: 'session-1',
        }),
      },
    });
  });

  it('corrects FAIL to PASS and creates a positive admin adjustment ledger', async () => {
    process.env.ADMIN_REVIEW_KEY = 'admin-secret';
    process.env.PROOF_PASS_BONUS = '40';

    const mock = createPrismaMock();
    const service = makeService(mock);
    const proof = {
      id: 'proof-1',
      sessionId: 'session-1',
      imageUrl: '/uploads/proof/proof-1.jpg',
      aiResult: ProofResult.FAIL,
      aiScore: 88,
      aiModel: 'admin',
      aiMeta: {
        rawUrl: '/uploads/raw/raw-1.jpg',
        corrections: [{ from: 'PASS', to: 'FAIL', reason: '이전 정정' }],
      },
      createdAt: new Date('2026-04-29T01:00:00.000Z'),
      reviewedAt: new Date('2026-04-29T01:10:00.000Z'),
      reviewedByAdminId: null,
      session: baseSession({
        status: 'DONE',
        doneAt: new Date('2026-04-29T01:10:00.000Z'),
      }),
    };
    const updatedProof = {
      ...proof,
      aiResult: ProofResult.PASS,
    };

    mock.prisma.proof.findUnique.mockResolvedValue(proof);
    mock.tx.pointLedger.findUnique
      .mockResolvedValueOnce({
        id: 'pass-ledger',
        points: 40,
        balanceAfter: 160,
      })
      .mockResolvedValueOnce(null);
    mock.tx.user.findUnique.mockResolvedValue({
      id: 'user-1',
      pointBalance: 120,
    });
    mock.tx.user.update.mockResolvedValue({ pointBalance: 160 });
    mock.tx.pointLedger.create.mockResolvedValue({ id: 'correction-ledger' });
    mock.tx.proof.update.mockResolvedValue(updatedProof);
    mock.tx.recommendSession.update.mockResolvedValue({});

    const result = (await service.correctReviewByAdminKey(
      'admin-secret',
      'proof-1',
      { result: 'PASS', reason: '실제 촬영 사진으로 확인됨' },
    )) as any;

    expect(result.ok).toBe(true);
    expect(result.pointAdjustment).toEqual({
      ok: true,
      points: 40,
      balanceAfter: 160,
    });
    expect(mock.tx.pointLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'ADJUST',
        source: 'ADMIN',
        points: 40,
        balanceAfter: 160,
        dedupeKey: 'PROOF:CORRECTION:proof-1:2:FAIL_TO_PASS',
      }),
      select: { id: true },
    });
    expect(mock.tx.proof.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aiResult: 'PASS',
          aiMeta: expect.objectContaining({
            corrections: [
              { from: 'PASS', to: 'FAIL', reason: '이전 정정' },
              expect.objectContaining({
                from: 'FAIL',
                to: 'PASS',
                reason: '실제 촬영 사진으로 확인됨',
              }),
            ],
          }),
        }),
      }),
    );
    expect(mock.tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorType: 'ADMIN',
        actorId: null,
        action: 'PROOF_REVIEW_CORRECTED',
        targetType: 'Proof',
        targetId: 'proof-1',
        userId: 'user-1',
        metadata: expect.objectContaining({
          from: 'FAIL',
          to: 'PASS',
          reason: '실제 촬영 사진으로 확인됨',
          sequence: 2,
          pointDelta: 40,
          balanceAfter: 160,
          sessionId: 'session-1',
        }),
      },
    });
  });

  it('requires a reason and only corrects final PASS/FAIL proofs', async () => {
    process.env.ADMIN_REVIEW_KEY = 'admin-secret';

    const mock = createPrismaMock();
    const service = makeService(mock);

    await expect(
      service.correctReviewByAdminKey('admin-secret', 'proof-1', {
        result: 'FAIL',
        reason: '',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    mock.prisma.proof.findUnique.mockResolvedValue({
      id: 'proof-1',
      aiResult: ProofResult.HOLD,
      session: baseSession(),
    });

    await expect(
      service.correctReviewByAdminKey('admin-secret', 'proof-1', {
        result: 'PASS',
        reason: '정정',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mock.prisma.$transaction).not.toHaveBeenCalled();
    expect(mock.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('returns unchanged without adding an audit log when correction result is the current final state', async () => {
    process.env.ADMIN_REVIEW_KEY = 'admin-secret';

    const mock = createPrismaMock();
    const service = makeService(mock);
    const proof = {
      id: 'proof-1',
      sessionId: 'session-1',
      aiResult: ProofResult.PASS,
      session: baseSession({ status: 'DONE' }),
    };

    mock.prisma.proof.findUnique.mockResolvedValue(proof);

    await expect(
      service.correctReviewByAdminKey('admin-secret', 'proof-1', {
        result: 'PASS',
        reason: '이미 승인 상태 확인',
      }),
    ).resolves.toEqual({ ok: true, unchanged: true, proof });
    expect(mock.prisma.$transaction).not.toHaveBeenCalled();
    expect(mock.tx.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('ProofService.processPendingBatch', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.OPENAI_VISION_MODEL;
    delete process.env.PROOF_PASS_BONUS;
  });

  it('passes a matching proof, awards points once, and marks the session DONE', async () => {
    process.env.OPENAI_VISION_MODEL = 'test-vision';
    process.env.PROOF_PASS_BONUS = '40';

    const mock = createPrismaMock();
    const service = makeService(mock);
    const proof = basePendingProof();
    const updatedProof = {
      ...proof,
      aiResult: ProofResult.PASS,
      aiScore: 90,
    };

    mock.prisma.proof.findMany.mockResolvedValue([proof]);
    mock.prisma.proof.update
      .mockResolvedValueOnce({ ...proof })
      .mockResolvedValueOnce(updatedProof);
    mock.tx.pointLedger.findUnique.mockResolvedValue(null);
    mock.tx.user.findUnique.mockResolvedValue({
      id: 'user-1',
      pointBalance: 10,
    });
    mock.tx.user.update.mockResolvedValue({ pointBalance: 50 });
    mock.tx.pointLedger.create.mockResolvedValue({ id: 'ledger-1' });
    mock.tx.recommendSession.update.mockResolvedValue({});

    const qrSpy = jest
      .spyOn(service as any, 'tryVerifyQrFromProofImage')
      .mockResolvedValue({
        ok: true,
        qr: { sessionId: 'session-1', code: 'ABC123' },
      });
    const aiSpy = jest
      .spyOn(service as any, 'judgeFoodWithOpenAI')
      .mockResolvedValue({
        match: true,
        confidence: 0.95,
        detected: ['김치찌개'],
        reason: 'matches expected menu',
        realPhotoLikely: true,
        screenOrPrintSuspicion: false,
        stockOrWebImageSuspicion: false,
        fraudSignals: [],
      });

    const result = await service.processPendingBatch(5);

    expect(result).toEqual({
      ok: true,
      processed: 1,
      results: [
        {
          id: 'proof-1',
          result: 'PASS',
          score: 95,
          bonus: { ok: true, earned: 40, balanceAfter: 50 },
        },
      ],
    });
    expect(qrSpy).toHaveBeenCalledWith(
      '/uploads/proof/proof-1.jpg',
      'session-1',
      'ABC123',
    );
    expect(aiSpy).toHaveBeenCalledWith({
      rawUrl: '/uploads/raw/raw-1.jpg',
      expected: {
        menuName: '김치찌개',
        cuisine: 'KOREAN',
        dishType: 'STEW',
        ingredients: ['김치', '돼지고기'],
      },
    });
    expect(mock.prisma.proof.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'proof-1' },
      data: expect.objectContaining({
        aiResult: 'PASS',
        aiScore: 95,
        aiModel: 'test-vision',
        reviewedAt: expect.any(Date),
        aiMeta: expect.objectContaining({
          qr: { sessionId: 'session-1', code: 'ABC123' },
          openai: expect.objectContaining({ match: true, confidence: 0.95 }),
          attempts: 1,
          processingAt: null,
          processedAt: expect.any(String),
        }),
      }),
    });
    expect(mock.tx.pointLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        kind: 'EARN',
        source: 'PROOF',
        sourceId: 'proof-1',
        proofId: 'proof-1',
        points: 40,
        balanceAfter: 50,
        dedupeKey: 'PROOF:PASS:proof-1',
      }),
      select: { id: true },
    });
    expect(mock.tx.recommendSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { status: 'DONE', doneAt: expect.any(Date) },
    });
  });

  it('uses the proof reward dedupeKey when a worker PASS is processed again', async () => {
    const mock = createPrismaMock();
    const service = makeService(mock);
    const proof = basePendingProof();
    const updatedProof = {
      ...proof,
      aiResult: ProofResult.PASS,
      aiScore: 88,
    };

    mock.prisma.proof.findMany.mockResolvedValue([proof]);
    mock.prisma.proof.update
      .mockResolvedValueOnce({ ...proof })
      .mockResolvedValueOnce(updatedProof);
    mock.tx.pointLedger.findUnique.mockResolvedValue({
      id: 'ledger-existing',
      balanceAfter: 50,
      points: 40,
    });
    mock.tx.recommendSession.update.mockResolvedValue({});

    jest
      .spyOn(service as any, 'tryVerifyQrFromProofImage')
      .mockResolvedValue(null);
    jest.spyOn(service as any, 'judgeFoodWithOpenAI').mockResolvedValue({
      match: true,
      confidence: 0.94,
      detected: ['김치찌개'],
      reason: 'matches expected menu',
      realPhotoLikely: true,
      screenOrPrintSuspicion: false,
      stockOrWebImageSuspicion: false,
      fraudSignals: [],
    });

    const result = await service.processPendingBatch(5);

    expect(result.results).toEqual([
      {
        id: 'proof-1',
        result: 'PASS',
        score: 94,
        bonus: {
          ok: true,
          earned: 0,
          balanceAfter: 50,
          deduped: true,
        },
      },
    ]);
    expect(mock.tx.user.findUnique).not.toHaveBeenCalled();
    expect(mock.tx.user.update).not.toHaveBeenCalled();
    expect(mock.tx.pointLedger.create).not.toHaveBeenCalled();
  });

  it('fails a confident mismatch without awarding points and marks the session DONE', async () => {
    const mock = createPrismaMock();
    const service = makeService(mock);
    const proof = basePendingProof();
    const updatedProof = {
      ...proof,
      aiResult: ProofResult.FAIL,
      aiScore: 95,
    };

    mock.prisma.proof.findMany.mockResolvedValue([proof]);
    mock.prisma.proof.update
      .mockResolvedValueOnce({ ...proof })
      .mockResolvedValueOnce(updatedProof);
    mock.prisma.recommendSession.update.mockResolvedValue({});

    jest
      .spyOn(service as any, 'tryVerifyQrFromProofImage')
      .mockResolvedValue(null);
    jest.spyOn(service as any, 'judgeFoodWithOpenAI').mockResolvedValue({
      match: false,
      confidence: 0.95,
      detected: ['피자'],
      reason: 'different food',
    });

    const result = await service.processPendingBatch(5);

    expect(result.results).toEqual([
      { id: 'proof-1', result: 'FAIL', score: 95 },
    ]);
    expect(mock.prisma.recommendSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { status: 'DONE', doneAt: expect.any(Date) },
    });
    expect(mock.tx.pointLedger.create).not.toHaveBeenCalled();
    expect(mock.tx.user.update).not.toHaveBeenCalled();
  });

  it('holds an uncertain AI decision without marking the session DONE', async () => {
    const mock = createPrismaMock();
    const service = makeService(mock);
    const proof = basePendingProof();
    const updatedProof = {
      ...proof,
      aiResult: ProofResult.HOLD,
      aiScore: 62,
    };

    mock.prisma.proof.findMany.mockResolvedValue([proof]);
    mock.prisma.proof.update
      .mockResolvedValueOnce({ ...proof })
      .mockResolvedValueOnce(updatedProof);

    jest
      .spyOn(service as any, 'tryVerifyQrFromProofImage')
      .mockResolvedValue(null);
    jest.spyOn(service as any, 'judgeFoodWithOpenAI').mockResolvedValue({
      match: true,
      confidence: 0.62,
      detected: ['찌개'],
      reason: 'not confident enough',
    });

    const result = await service.processPendingBatch(5);

    expect(result.results).toEqual([
      { id: 'proof-1', result: 'HOLD', score: 62 },
    ]);
    expect(mock.prisma.recommendSession.update).not.toHaveBeenCalled();
    expect(mock.tx.recommendSession.update).not.toHaveBeenCalled();
    expect(mock.tx.pointLedger.create).not.toHaveBeenCalled();
  });

  it.each([
    [
      'low confidence match',
      {
        match: true,
        confidence: 0.85,
        detected: ['김치찌개'],
        reason: 'menu matches, but confidence is below pass threshold',
        realPhotoLikely: true,
        screenOrPrintSuspicion: false,
        stockOrWebImageSuspicion: false,
        fraudSignals: [],
      },
      85,
    ],
    [
      'not likely a real user-taken photo',
      {
        match: true,
        confidence: 0.97,
        detected: ['김치찌개'],
        reason: 'looks like a staged or non-user photo',
        realPhotoLikely: false,
        screenOrPrintSuspicion: false,
        stockOrWebImageSuspicion: false,
        fraudSignals: ['not-real-photo'],
      },
      97,
    ],
    [
      'screen or printed image suspicion',
      {
        match: true,
        confidence: 0.96,
        detected: ['김치찌개'],
        reason: 'visible screen or printed-photo artifacts',
        realPhotoLikely: true,
        screenOrPrintSuspicion: true,
        stockOrWebImageSuspicion: false,
        fraudSignals: ['screen-artifact'],
      },
      96,
    ],
    [
      'stock or web image suspicion',
      {
        match: true,
        confidence: 0.98,
        detected: ['김치찌개'],
        reason: 'looks like a web or stock image',
        realPhotoLikely: true,
        screenOrPrintSuspicion: false,
        stockOrWebImageSuspicion: true,
        fraudSignals: ['stock-like-composition'],
      },
      98,
    ],
  ])(
    'holds a matching proof when AI decision has %s',
    async (_label, aiDecision, expectedScore) => {
      const mock = createPrismaMock();
      const service = makeService(mock);
      const proof = basePendingProof();
      const updatedProof = {
        ...proof,
        aiResult: ProofResult.HOLD,
        aiScore: expectedScore,
      };

      mock.prisma.proof.findMany.mockResolvedValue([proof]);
      mock.prisma.proof.update
        .mockResolvedValueOnce({ ...proof })
        .mockResolvedValueOnce(updatedProof);

      jest
        .spyOn(service as any, 'tryVerifyQrFromProofImage')
        .mockResolvedValue(null);
      jest
        .spyOn(service as any, 'judgeFoodWithOpenAI')
        .mockResolvedValue(aiDecision);

      const result = await service.processPendingBatch(5);

      expect(result.results).toEqual([
        { id: 'proof-1', result: 'HOLD', score: expectedScore },
      ]);
      expect(mock.prisma.proof.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'proof-1' },
        data: expect.objectContaining({
          aiResult: 'HOLD',
          aiScore: expectedScore,
          reviewedAt: null,
          aiMeta: expect.objectContaining({
            openai: expect.objectContaining(aiDecision),
          }),
        }),
      });
      expect(mock.prisma.recommendSession.update).not.toHaveBeenCalled();
      expect(mock.tx.recommendSession.update).not.toHaveBeenCalled();
      expect(mock.tx.pointLedger.create).not.toHaveBeenCalled();
      expect(mock.tx.user.update).not.toHaveBeenCalled();
    },
  );

  it('moves a proof without rawUrl to HOLD for manual review', async () => {
    const mock = createPrismaMock();
    const service = makeService(mock);
    const proof = basePendingProof({ aiMeta: { attempts: 1 } });

    mock.prisma.proof.findMany.mockResolvedValue([proof]);
    mock.prisma.proof.update.mockResolvedValue({ ...proof });

    const result = await service.processPendingBatch(5);

    expect(result.results).toEqual([
      { id: 'proof-1', error: 'rawUrl missing in aiMeta', held: true },
    ]);
    expect(mock.prisma.proof.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'proof-1' },
      data: {
        aiResult: 'HOLD',
        aiModel: 'gpt-4.1-mini',
        aiMeta: expect.objectContaining({
          openaiError:
            'rawUrl missing in aiMeta (legacy proof). Need manual review.',
          attempts: 2,
          processingAt: null,
          processedAt: expect.any(String),
        }),
      },
    });
  });

  it('moves an invalid QR proof to HOLD for manual review', async () => {
    const mock = createPrismaMock();
    const service = makeService(mock);
    const proof = basePendingProof({
      aiMeta: { rawUrl: '/uploads/raw/raw-1.jpg', attempts: 1 },
    });

    mock.prisma.proof.findMany.mockResolvedValue([proof]);
    mock.prisma.proof.update.mockResolvedValue({ ...proof });

    jest.spyOn(service as any, 'tryVerifyQrFromProofImage').mockResolvedValue({
      ok: false,
      error: 'QR challengeCode mismatch',
      qr: { sessionId: 'session-1', code: 'WRONG' },
    });

    const result = await service.processPendingBatch(5);

    expect(result.results).toEqual([
      { id: 'proof-1', error: 'QR challengeCode mismatch', held: true },
    ]);
    expect(mock.prisma.proof.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'proof-1' },
      data: {
        aiResult: 'HOLD',
        aiModel: 'gpt-4.1-mini',
        aiMeta: expect.objectContaining({
          qr: { sessionId: 'session-1', code: 'WRONG' },
          qrError: 'QR challengeCode mismatch',
          attempts: 2,
          processingAt: null,
          processedAt: expect.any(String),
        }),
      },
    });
  });
});

describe('ProofService QR payload compatibility', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.PROOF_QR_SECRET;
  });

  function signedPayload(args: {
    secret: string;
    sessionId: string;
    code: string;
    ts: number;
  }) {
    const base = `MR1|sid=${args.sessionId}|code=${args.code}|ts=${args.ts}`;
    const sig = createHmac('sha256', args.secret).update(base).digest('hex');
    return `${base}|sig=${sig}`;
  }

  it('parses and verifies the QR payload format generated by UploadsService', () => {
    process.env.PROOF_QR_SECRET = 'qr-secret';

    const mock = createPrismaMock();
    const service = makeService(mock);
    const payload = signedPayload({
      secret: 'qr-secret',
      sessionId: 'session-1',
      code: 'ABC123',
      ts: 1777410000000,
    });

    const parsed = (service as any).parseQrPayload(payload);

    expect(parsed).toEqual({
      payload,
      version: 'MR1',
      sessionId: 'session-1',
      code: 'ABC123',
      ts: 1777410000000,
      sig: expect.any(String),
    });
    expect((service as any).verifyQr(parsed)).toBe(true);
  });

  it('rejects the previous pipe-only QR payload format', () => {
    const mock = createPrismaMock();
    const service = makeService(mock);

    expect(
      (service as any).parseQrPayload('MR1|session-1|ABC123|1777410000000|sig'),
    ).toBeNull();
  });

  it('rejects a payload signed with a different challengeCode', () => {
    process.env.PROOF_QR_SECRET = 'qr-secret';

    const mock = createPrismaMock();
    const service = makeService(mock);
    const payload = signedPayload({
      secret: 'qr-secret',
      sessionId: 'session-1',
      code: 'ABC123',
      ts: 1777410000000,
    });
    const tampered = payload.replace('code=ABC123', 'code=WRONG');
    const parsed = (service as any).parseQrPayload(tampered);

    expect(parsed).toEqual(expect.objectContaining({ code: 'WRONG' }));
    expect((service as any).verifyQr(parsed)).toBe(false);
  });

  it('marks QR challengeCode mismatch as HOLD in the worker path', async () => {
    const mock = createPrismaMock();
    const service = makeService(mock);
    const proof = basePendingProof({
      aiMeta: { rawUrl: '/uploads/raw/raw-1.jpg', attempts: 0 },
    });
    const parsedQr = {
      payload: 'MR1|sid=session-1|code=WRONG|ts=1777410000000|sig=abc',
      version: 'MR1',
      sessionId: 'session-1',
      code: 'WRONG',
      ts: 1777410000000,
      sig: 'abc',
    };

    mock.prisma.proof.findMany.mockResolvedValue([proof]);
    mock.prisma.proof.update.mockResolvedValue({ ...proof });
    jest.spyOn(service as any, 'tryVerifyQrFromProofImage').mockResolvedValue({
      ok: false,
      error: 'QR challengeCode mismatch',
      qr: parsedQr,
    });

    const result = await service.processPendingBatch(5);

    expect(result.results).toEqual([
      { id: 'proof-1', error: 'QR challengeCode mismatch', held: true },
    ]);
    expect(mock.prisma.proof.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'proof-1' },
      data: {
        aiResult: 'HOLD',
        aiModel: 'gpt-4.1-mini',
        aiMeta: expect.objectContaining({
          qr: parsedQr,
          qrError: 'QR challengeCode mismatch',
          attempts: 1,
          processingAt: null,
          processedAt: expect.any(String),
        }),
      },
    });
  });
});
