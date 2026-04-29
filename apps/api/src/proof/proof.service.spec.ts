/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

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
    },
    proof: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
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
          reviewedByAdminId: 'admin',
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
  });
});
