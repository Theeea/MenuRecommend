import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import OpenAI from 'openai';
import {
  Cuisine,
  DishType,
  IngredientRole,
  Prisma,
  Removable,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type DraftIngredient = {
  name: string;
  role: IngredientRole;
  removable: Removable;
  weight: number;
};

type AiMenuDraft = {
  name: string;
  cuisine: Cuisine;
  dishType: DishType;
  ingredients: DraftIngredient[];
  description: string;
  tags: string[];
};

const CUISINES = new Set(Object.values(Cuisine));
const DISH_TYPES = new Set(Object.values(DishType));
const INGREDIENT_ROLES = new Set(Object.values(IngredientRole));
const REMOVABLES = new Set(Object.values(Removable));

function normalizeMenuName(name: string) {
  return String(name ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()[\]{}'"`.,/\\|:;!?~\-_*·ㆍ・]/g, '')
    .trim();
}

function normalizeIngredientName(name: string) {
  return String(name ?? '')
    .normalize('NFKC')
    .trim();
}

function parseCuisine(value?: string): Cuisine | undefined {
  const v = String(value ?? '')
    .trim()
    .toUpperCase();
  return CUISINES.has(v as Cuisine) ? (v as Cuisine) : undefined;
}

function parseDishType(value?: string): DishType {
  const v = String(value ?? '')
    .trim()
    .toUpperCase();
  return DISH_TYPES.has(v as DishType) ? (v as DishType) : DishType.OTHER;
}

function parseIngredientRole(value?: string): IngredientRole {
  const v = String(value ?? '')
    .trim()
    .toUpperCase();
  return INGREDIENT_ROLES.has(v as IngredientRole)
    ? (v as IngredientRole)
    : IngredientRole.SUB;
}

function parseRemovable(value?: string): Removable {
  const v = String(value ?? '')
    .trim()
    .toUpperCase();
  return REMOVABLES.has(v as Removable) ? (v as Removable) : Removable.UNKNOWN;
}

function clampCount(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 10;
  return Math.max(1, Math.min(30, Math.floor(n)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringFrom(value: unknown) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

@Injectable()
export class MenuDraftService {
  private readonly openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
  });

  constructor(private readonly prisma: PrismaService) {}

  async list(
    adminKey: string | undefined,
    query: { status?: string; cuisine?: string; take?: unknown },
  ) {
    this.assertAdminKey(adminKey);

    const status = String(query.status ?? 'PENDING')
      .trim()
      .toUpperCase();
    const cuisine = parseCuisine(query.cuisine);
    const take = Math.max(1, Math.min(100, Number(query.take ?? 50) || 50));

    const where: Prisma.MenuDraftWhereInput = {};
    if (status && status !== 'ALL') where.status = status;
    if (cuisine) where.cuisine = cuisine;

    const items = await this.prisma.menuDraft.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
    });

    return { ok: true, items };
  }

  async generate(
    adminKey: string | undefined,
    body: { cuisine?: string; count?: unknown; memo?: string },
  ) {
    this.assertAdminKey(adminKey);
    if (!process.env.OPENAI_API_KEY) {
      throw new BadRequestException('OPENAI_API_KEY is required');
    }

    const cuisine = parseCuisine(body.cuisine);
    const count = clampCount(body.count);

    const existing = await this.getExistingMenuKeys(cuisine);
    const existingNames = [...existing.namesByCuisine.entries()]
      .flatMap(([c, names]) => [...names].map((name) => `${c}:${name}`))
      .slice(0, 500);

    const candidates = await this.generateWithAi({
      cuisine,
      count,
      existingNames,
      memo: body.memo,
    });

    const saved: Awaited<ReturnType<PrismaService['menuDraft']['create']>>[] =
      [];
    const skipped: Array<{ name: string; cuisine?: Cuisine; reason: string }> =
      [];
    const seenInResponse = new Set<string>();

    for (const candidate of candidates) {
      const normalized = normalizeMenuName(candidate.name);
      const key = `${candidate.cuisine}:${normalized}`;

      if (!normalized || seenInResponse.has(key)) {
        skipped.push({
          name: candidate.name,
          reason: 'DUPLICATE_IN_AI_RESPONSE',
        });
        continue;
      }
      seenInResponse.add(key);

      if (existing.keys.has(key)) {
        skipped.push({
          name: candidate.name,
          cuisine: candidate.cuisine,
          reason: 'DUPLICATE_EXISTING_DB_OR_DRAFT',
        });
        continue;
      }

      const draft = await this.prisma.menuDraft.create({
        data: {
          name: candidate.name,
          normalizedName: normalized,
          cuisine: candidate.cuisine,
          dishType: candidate.dishType,
          ingredients: candidate.ingredients as Prisma.InputJsonValue,
          description: candidate.description,
          tags: candidate.tags as Prisma.InputJsonValue,
          source: 'AI',
          status: 'PENDING',
          aiMeta: {
            model: this.model(),
            rule: 'existing Menu and MenuDraft names are excluded by normalized name + cuisine',
            requestedCuisine: cuisine ?? null,
          },
        },
      });
      existing.keys.add(key);
      saved.push(draft);
    }

    return { ok: true, savedCount: saved.length, skipped, items: saved };
  }

  async approve(adminKey: string | undefined, id: string) {
    this.assertAdminKey(adminKey);

    const draft = await this.prisma.menuDraft.findUnique({ where: { id } });
    if (!draft) throw new NotFoundException('MenuDraft not found');
    if (draft.status === 'APPROVED') {
      return { ok: true, alreadyApproved: true, draft };
    }
    if (draft.status !== 'PENDING') {
      throw new BadRequestException(
        `Only PENDING draft can be approved (current=${draft.status})`,
      );
    }

    const normalized = normalizeMenuName(draft.name);
    const duplicate = await this.findDuplicateMenu(draft.cuisine, normalized);
    if (duplicate) {
      throw new BadRequestException({
        code: 'MENU_DUPLICATE',
        message: '이미 같은 cuisine에 유사한 메뉴명이 있습니다.',
        duplicate,
      });
    }

    const ingredients = this.sanitizeIngredients(draft.ingredients);

    const result = await this.prisma.$transaction(async (tx) => {
      const menu = await tx.menu.create({
        data: {
          name: draft.name,
          cuisine: draft.cuisine,
          dishType: draft.dishType,
        },
      });

      for (const item of ingredients) {
        const ingredient = await tx.ingredient.upsert({
          where: { name: item.name },
          update: {},
          create: { name: item.name },
        });

        await tx.menuIngredient.upsert({
          where: {
            menuId_ingredientId: {
              menuId: menu.id,
              ingredientId: ingredient.id,
            },
          },
          update: {
            role: item.role,
            removable: item.removable,
            weight: item.weight,
          },
          create: {
            menuId: menu.id,
            ingredientId: ingredient.id,
            role: item.role,
            removable: item.removable,
            weight: item.weight,
          },
        });
      }

      const updatedDraft = await tx.menuDraft.update({
        where: { id: draft.id },
        data: {
          status: 'APPROVED',
          reviewedAt: new Date(),
          reviewedBy: 'admin',
          menuId: menu.id,
        },
      });

      return { menu, draft: updatedDraft };
    });

    return { ok: true, ...result };
  }

  async reject(
    adminKey: string | undefined,
    id: string,
    body?: { reason?: string },
  ) {
    this.assertAdminKey(adminKey);

    const draft = await this.prisma.menuDraft.findUnique({ where: { id } });
    if (!draft) throw new NotFoundException('MenuDraft not found');
    if (draft.status === 'APPROVED') {
      throw new BadRequestException('APPROVED draft cannot be rejected');
    }

    const updated = await this.prisma.menuDraft.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedAt: new Date(),
        reviewedBy: 'admin',
        aiMeta: {
          ...(isRecord(draft.aiMeta) ? draft.aiMeta : {}),
          rejectReason: String(body?.reason ?? '').trim() || null,
        },
      },
    });

    return { ok: true, draft: updated };
  }

  private async getExistingMenuKeys(cuisine?: Cuisine) {
    const [menus, drafts] = await Promise.all([
      this.prisma.menu.findMany({
        where: cuisine ? { cuisine } : undefined,
        select: { name: true, cuisine: true },
      }),
      this.prisma.menuDraft.findMany({
        where: {
          ...(cuisine ? { cuisine } : {}),
          status: { in: ['PENDING', 'APPROVED'] },
        },
        select: { name: true, normalizedName: true, cuisine: true },
      }),
    ]);

    const keys = new Set<string>();
    const namesByCuisine = new Map<Cuisine, Set<string>>();

    for (const x of menus) {
      const normalized = normalizeMenuName(x.name);
      const key = `${x.cuisine}:${normalized}`;
      keys.add(key);

      const names = namesByCuisine.get(x.cuisine) ?? new Set<string>();
      names.add(x.name);
      namesByCuisine.set(x.cuisine, names);
    }

    for (const x of drafts) {
      const key = `${x.cuisine}:${x.normalizedName}`;
      keys.add(key);

      const names = namesByCuisine.get(x.cuisine) ?? new Set<string>();
      names.add(x.name);
      namesByCuisine.set(x.cuisine, names);
    }

    return { keys, namesByCuisine };
  }

  private async findDuplicateMenu(cuisine: Cuisine, normalized: string) {
    const menus = await this.prisma.menu.findMany({
      where: { cuisine },
      select: { id: true, name: true, cuisine: true },
    });
    return menus.find((x) => normalizeMenuName(x.name) === normalized) ?? null;
  }

  private async generateWithAi(args: {
    cuisine?: Cuisine;
    count: number;
    existingNames: string[];
    memo?: string;
  }): Promise<AiMenuDraft[]> {
    const model = this.model();
    const cuisineGuide = args.cuisine
      ? `반드시 cuisine=${args.cuisine} 범위에서만 생성`
      : '여러 cuisine을 균형 있게 섞어서 생성';

    const prompt = `
메뉴 추천 앱의 운영 DB에 넣기 전 검수용 메뉴 초안을 생성해줘.

중요 규칙:
- 아래 기존 메뉴 목록과 중복되거나 거의 같은 메뉴는 절대 생성하지 않는다.
- 같은 메뉴의 표기만 다른 후보도 제외한다. 예: 김치 볶음밥/김치볶음밥.
- 실제 추천 가능한 대중적인 음식만 생성한다.
- 싫어하는 식재료 필터링에 쓸 수 있도록 핵심 MAIN 재료를 반드시 포함한다.
- 재료 role은 MAIN/SUB/OPTIONAL 중 하나만 사용한다.
- removable은 YES/NO/UNKNOWN 중 하나만 사용한다.
- cuisine은 ${[...CUISINES].join(', ')} 중 하나만 사용한다.
- dishType은 ${[...DISH_TYPES].join(', ')} 중 하나만 사용한다.
- ${cuisineGuide}
- 생성 개수 목표: ${args.count}개

기존 메뉴 목록:
${args.existingNames.length ? args.existingNames.join('\n') : '(비어 있음)'}

추가 메모:
${String(args.memo ?? '').trim() || '(없음)'}
    `.trim();

    const res = await this.openai.responses.create({
      model,
      input: [
        { role: 'user', content: [{ type: 'input_text', text: prompt }] },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'menu_draft_generation',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              items: {
                type: 'array',
                minItems: 1,
                maxItems: args.count,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string' },
                    cuisine: { type: 'string', enum: [...CUISINES] },
                    dishType: { type: 'string', enum: [...DISH_TYPES] },
                    ingredients: {
                      type: 'array',
                      minItems: 2,
                      maxItems: 12,
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          name: { type: 'string' },
                          role: { type: 'string', enum: [...INGREDIENT_ROLES] },
                          removable: { type: 'string', enum: [...REMOVABLES] },
                          weight: { type: 'integer', minimum: 1, maximum: 5 },
                        },
                        required: ['name', 'role', 'removable', 'weight'],
                      },
                    },
                    description: { type: 'string' },
                    tags: {
                      type: 'array',
                      maxItems: 8,
                      items: { type: 'string' },
                    },
                  },
                  required: [
                    'name',
                    'cuisine',
                    'dishType',
                    'ingredients',
                    'description',
                    'tags',
                  ],
                },
              },
            },
            required: ['items'],
          },
        },
      },
    });

    const parsed = JSON.parse(res.output_text) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.items)) {
      throw new BadRequestException('AI returned invalid menu draft payload');
    }
    return (parsed.items ?? []).map((x) =>
      this.sanitizeAiDraft(x, args.cuisine),
    );
  }

  private sanitizeAiDraft(
    input: unknown,
    requestedCuisine?: Cuisine,
  ): AiMenuDraft {
    if (!isRecord(input)) {
      throw new BadRequestException('AI returned invalid menu draft item');
    }

    const cuisine = parseCuisine(stringFrom(input.cuisine));
    if (!cuisine) throw new BadRequestException('AI returned invalid cuisine');
    if (requestedCuisine && cuisine !== requestedCuisine) {
      throw new BadRequestException(
        'AI returned cuisine outside requested filter',
      );
    }

    return {
      name: stringFrom(input.name).trim(),
      cuisine,
      dishType: parseDishType(stringFrom(input.dishType)),
      ingredients: this.sanitizeIngredients(input.ingredients),
      description: stringFrom(input.description).trim(),
      tags: Array.isArray(input.tags) ? input.tags.map(String).slice(0, 8) : [],
    };
  }

  private sanitizeIngredients(value: unknown): DraftIngredient[] {
    const items = Array.isArray(value) ? value : [];
    const seen = new Set<string>();
    const result: DraftIngredient[] = [];

    for (const raw of items) {
      if (!isRecord(raw)) continue;

      const name = normalizeIngredientName(stringFrom(raw.name));
      if (!name || seen.has(name)) continue;
      seen.add(name);

      const weight = Math.max(1, Math.min(5, Number(raw.weight ?? 1) || 1));
      result.push({
        name,
        role: parseIngredientRole(stringFrom(raw.role)),
        removable: parseRemovable(stringFrom(raw.removable)),
        weight,
      });
    }

    if (result.length === 0) {
      throw new BadRequestException('At least one ingredient is required');
    }

    return result;
  }

  private model() {
    return (
      process.env.OPENAI_MENU_MODEL ||
      process.env.OPENAI_VISION_MODEL ||
      'gpt-4.1-mini'
    );
  }

  private assertAdminKey(headerKey?: string) {
    const key = process.env.ADMIN_REVIEW_KEY ?? 'dev-admin';
    if (!headerKey || headerKey !== key) {
      throw new UnauthorizedException('Invalid admin key');
    }
  }
}
