import { Module } from "@nestjs/common";
import { MeController } from "./me.controller";
import { BlockedMenusController } from "./blocked-menus.controller";
import { BlockedMenusService } from "./blocked-menus.service";
import { RecommendQuotaController } from "./recommend-quota.controller";
import { RecommendQuotaService } from "./recommend-quota.service";
import { MePointsController } from "./me.points.controller";
import { PointsService } from "../points/points.service";
@Module({
  controllers: [MeController, BlockedMenusController, RecommendQuotaController, MePointsController],
  providers: [BlockedMenusService, RecommendQuotaService, PointsService],
})
export class MeModule {}
