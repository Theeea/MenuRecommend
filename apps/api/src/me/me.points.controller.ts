import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PointsService } from "../points/points.service";

@UseGuards(AuthGuard("jwt"))
@Controller("me")
export class MePointsController {
  constructor(private points: PointsService) {}

  @Get("points")
  async pointsBalance(@Req() req: any) {
    return this.points.getMyBalance(req.user.userId);
  }

  @Get("points/ledger")
  async pointsLedger(
    @Req() req: any,
    @Query("take") take?: string,
    @Query("cursor") cursor?: string,
  ) {
    const n = Math.min(Math.max(parseInt(take ?? "20", 10) || 20, 1), 50);
    return this.points.getMyLedger(req.user.userId, n, cursor);
  }
}
