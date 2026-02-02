import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ProofController } from "./proof.controller";
import { ProofService } from "./proof.service";
import { PointsModule } from "../points/points.module";

@Module({
  imports: [PrismaModule, PointsModule],
  controllers: [ProofController],
  providers: [ProofService],
})
export class ProofModule {}
