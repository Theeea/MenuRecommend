import "dotenv/config";

// ✅ generated client import
import {
  PrismaClient,
  Cuisine,
  DishType,
  IngredientRole,
  Removable,
} from "../generated/prisma/client";

import fs from "fs";
import path from "path";

import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is missing. Check apps/api/.env");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

type MenuSeed = {
  name: string;
  cuisine: Cuisine;
  dishType?: DishType | null;
};

type MenuIngredientSeedFile = Array<{
  menu: { name: string; cuisine: Cuisine };
  items: Array<{
    ingredient: string;
    role: string; // JSON에서는 문자열로 들어오므로 string으로 받고 변환
    removable?: string; // 없으면 UNKNOWN 처리
    weight?: number;
  }>;
}>;

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

/**
 * Prisma enum object(예: IngredientRole, Removable)에 대해
 * JSON 문자열을 안전하게 enum 값으로 변환
 */
function toEnumValue<T extends Record<string, string>>(
  enumObj: T,
  raw: unknown,
  enumName: string,
  fallback?: T[keyof T],
): T[keyof T] {
  const v = String(raw ?? "").trim().toUpperCase();
  if (!v) {
    if (fallback) return fallback;
    throw new Error(`Missing enum value for ${enumName}`);
  }

  // enum 값이 "MAIN" 같은 형태로 들어오는 경우
  const values = new Set(Object.values(enumObj));
  if (values.has(v as any)) return v as any;

  // 혹시 키로 들어오는 경우(enumObj["MAIN"] => "MAIN")
  if ((enumObj as any)[v]) return (enumObj as any)[v];

  if (fallback) return fallback;
  throw new Error(`Invalid enum value for ${enumName}: ${v}`);
}

async function seedIngredients(ingredientNames: string[]) {
  for (const raw of ingredientNames) {
    const name = String(raw ?? "").trim();
    if (!name) continue;

    await prisma.ingredient.upsert({
      where: { name },
      create: { name },
      update: {},
    });
  }
}

async function seedMenus(menus: MenuSeed[]) {
  for (const m of menus) {
    const name = String(m.name ?? "").trim();
    if (!name) continue;

    const dishType =
      m.dishType === undefined || m.dishType === null || String(m.dishType).trim() === ""
        ? null
        : m.dishType;

    // ✅ @@unique([name, cuisine]) → 기본 compound unique key: name_cuisine
    await prisma.menu.upsert({
      where: {
        name_cuisine: { name, cuisine: m.cuisine },
      },
      create: {
        name,
        cuisine: m.cuisine,
        dishType,
      },
      update: {
        dishType,
      },
    });
  }
}

/**
 * 메뉴-재료 매핑 시드
 * - menu-ingredients.json을 읽어서 MenuIngredient upsert
 * - JSON 문자열을 IngredientRole/Removable enum으로 변환
 */
async function seedMenuIngredients(rows: MenuIngredientSeedFile) {
  // 🔥 성능/안정: 미리 id map 만들기(쿼리 N번 방지)
  const [allMenus, allIngredients] = await Promise.all([
    prisma.menu.findMany({ select: { id: true, name: true, cuisine: true } }),
    prisma.ingredient.findMany({ select: { id: true, name: true } }),
  ]);

  const menuMap = new Map<string, string>();
  for (const m of allMenus) {
    menuMap.set(`${m.cuisine}::${m.name}`, m.id);
  }

  const ingMap = new Map<string, string>();
  for (const i of allIngredients) {
    ingMap.set(i.name, i.id);
  }

  let upserted = 0;

  for (const row of rows) {
    const menuName = String(row.menu?.name ?? "").trim();
    const cuisine = row.menu?.cuisine;

    if (!menuName || !cuisine) {
      console.warn("⚠️ invalid menu row:", row?.menu);
      continue;
    }

    const menuId = menuMap.get(`${cuisine}::${menuName}`);
    if (!menuId) {
      console.warn(`⚠️ menu not found: ${cuisine}/${menuName}`);
      continue;
    }

    for (const item of row.items ?? []) {
      const ingName = String(item?.ingredient ?? "").trim();
      if (!ingName) continue;

      const ingredientId = ingMap.get(ingName);
      if (!ingredientId) {
        console.warn(`⚠️ ingredient not found: ${ingName}`);
        continue;
      }

      const role = toEnumValue(IngredientRole as any, item.role, "IngredientRole");
      const removable = toEnumValue(
        Removable as any,
        item.removable ?? "UNKNOWN",
        "Removable",
        Removable.UNKNOWN as any,
      );

      const weight = Number.isFinite(item.weight) ? Number(item.weight) : 1;

      // ✅ MenuIngredient에 @@unique([menuId, ingredientId]) 가 있어야 아래 where가 동작
      await prisma.menuIngredient.upsert({
        where: {
          menuId_ingredientId: {
            menuId,
            ingredientId,
          },
        },
        create: {
          menuId,
          ingredientId,
          role,
          removable,
          weight,
        },
        update: {
          role,
          removable,
          weight,
        },
      });

      upserted++;
    }
  }

  return { upserted };
}

async function main() {
  const baseDir = path.join(__dirname, "seed-data");
  const menusPath = path.join(baseDir, "menus.json");
  const ingredientsPath = path.join(baseDir, "ingredients.json");
  const menuIngredientsPath = path.join(baseDir, "menu-ingredients.json");

  if (!fs.existsSync(menusPath)) throw new Error(`menus.json not found: ${menusPath}`);
  if (!fs.existsSync(ingredientsPath)) throw new Error(`ingredients.json not found: ${ingredientsPath}`);

  const menus = readJson<MenuSeed[]>(menusPath);
  const ingredientNames = readJson<string[]>(ingredientsPath);

  console.log(`🌱 Seeding... menus=${menus.length}, ingredients=${ingredientNames.length}`);

  await seedIngredients(ingredientNames);
  await seedMenus(menus);

  // ✅ 매핑 파일이 있으면 적용(없으면 스킵)
  if (fs.existsSync(menuIngredientsPath)) {
    const rows = readJson<MenuIngredientSeedFile>(menuIngredientsPath);
    const r = await seedMenuIngredients(rows);
    console.log(`✅ menu-ingredients seeded: ${r.upserted}`);
  } else {
    console.log(`ℹ️ menu-ingredients.json not found, skip mapping seed: ${menuIngredientsPath}`);
  }

  console.log("✅ Seed done.", {
    menus: await prisma.menu.count(),
    ingredients: await prisma.ingredient.count(),
    menuIngredients: await prisma.menuIngredient.count().catch(() => -1),
  });
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
