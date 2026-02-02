import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PointsService } from "./points.service";

@Module({
  imports: [PrismaModule],
  providers: [PointsService],
  exports: [PointsService],
})
export class PointsModule {}
