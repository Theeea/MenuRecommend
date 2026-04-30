import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { MeModule } from "./me/me.module";
import { RecommendModule } from "./recommend/recommend.module";
import { IngredientModule } from "./ingredient/ingredient.module";
import { ProofModule } from "./proof/proof.module";
import { UploadsModule } from "./uploads/uploads.module";
import { AdminModule } from "./admin/admin.module";
import { ShopModule } from "./shop/shop.module";

function resolveUploadsRoot() {
  // 실행 cwd가 apps/api일 수도, repo root일 수도 있어서 둘 다 대응
  const candidates = [
    join(process.cwd(), "uploads"),
    join(process.cwd(), "apps", "api", "uploads"),
  ];

  const found = candidates.find((p) => existsSync(p));
  const root = found ?? candidates[0];

  // 없으면 만들어둠 (dev 환경에서 최초 실행 안정화)
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  if (!existsSync(join(root, "raw"))) mkdirSync(join(root, "raw"), { recursive: true });
  if (!existsSync(join(root, "proof"))) mkdirSync(join(root, "proof"), { recursive: true });

  return root;
}

const uploadsRoot = resolveUploadsRoot();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    MeModule,
    RecommendModule,
    IngredientModule,
    ProofModule,
    UploadsModule,
    AdminModule,
    ShopModule,
  ],
})
export class AppModule {}
