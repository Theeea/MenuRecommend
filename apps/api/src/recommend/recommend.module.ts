import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { RecommendController } from "./recommend.controller";
import { RecommendService } from "./recommend.service";
import { PointsModule } from "../points/points.module";

@Module({
  imports: [PrismaModule, PointsModule],
  controllers: [RecommendController],
  providers: [RecommendService],
})
export class RecommendModule {}
