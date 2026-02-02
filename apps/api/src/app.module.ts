import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { MeModule } from "./me/me.module";
import { RecommendModule } from "./recommend/recommend.module";
import { IngredientModule } from "./ingredient/ingredient.module";
import { ProofModule } from "./proof/proof.module";
import { UploadsModule } from "./uploads/uploads.module";

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
  ],
})
export class AppModule {}
