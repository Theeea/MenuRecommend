import "dotenv/config";

// ✅ 중요: 폴더가 아니라 client 파일로 import 해야 함
import { PrismaClient, Cuisine, DishType } from "../generated/prisma/client";

import fs from "fs";
import path from "path";

import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is missing. Check apps/api/.env");
}

// PrismaPg는 버전에 따라 (connectionString 객체) 또는 (pg Pool) 형태를 받는 케이스가 있어
// 여기서는 공식/커뮤니티에서 널리 쓰는 connectionString 방식으로 시작하고,
// 혹시 타입/런타임 에러나면 아래 주석된 Pool 방식으로 바꾸면 됨.
const adapter = new PrismaPg({ connectionString });

// (대안) Pool 방식이 필요한 버전이면 위 2줄 대신 아래로 교체
// import { Pool } from "pg";
// const pool = new Pool({ connectionString });
// const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

type MenuSeed = {
  name: string;
  cuisine: Cuisine;
  dishType?: DishType | null;
};

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
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

    // ✅ 너가 선택한 @@unique([name, cuisine], name:"uniq_menu_name_cuisine") 기준
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

async function main() {
  const baseDir = path.join(__dirname, "seed-data");
  const menusPath = path.join(baseDir, "menus.json");
  const ingredientsPath = path.join(baseDir, "ingredients.json");

  if (!fs.existsSync(menusPath)) throw new Error(`menus.json not found: ${menusPath}`);
  if (!fs.existsSync(ingredientsPath)) throw new Error(`ingredients.json not found: ${ingredientsPath}`);

  const menus = readJson<MenuSeed[]>(menusPath);
  const ingredientNames = readJson<string[]>(ingredientsPath);

  console.log(`🌱 Seeding... menus=${menus.length}, ingredients=${ingredientNames.length}`);

  await seedIngredients(ingredientNames);
  await seedMenus(menus);

  console.log("✅ Seed done.", {
    menus: await prisma.menu.count(),
    ingredients: await prisma.ingredient.count(),
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
