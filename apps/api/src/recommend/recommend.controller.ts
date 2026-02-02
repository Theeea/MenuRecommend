import { Body, Controller, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Cuisine, DishType } from "../../generated/prisma/client";
import { RecommendService } from "./recommend.service";
import { Headers as ReqHeaders } from "@nestjs/common";

@UseGuards(AuthGuard("jwt"))
@Controller()
export class RecommendController {
  constructor(private service: RecommendService) {}

  @Post("recommend")
  recommend(
    @Req() req: any,
    @Body() body: { cuisine?: Cuisine; dishType?: DishType; avoidRecentHours?: number },
  ) {
    return this.service.recommend(req.user.userId, body);
  }

  @Post("recommend/:sessionId/accept")
  accept(@Req() req: any, @Param("sessionId") sessionId: string) {
    return this.service.accept(req.user.userId, sessionId);
  }

  @Post(":id/review")
  async review(
    @Param("id") proofId: string,
    @Body() body: { result: "PASS" | "FAIL"; score?: number; meta?: any; model?: string },
    @ReqHeaders("x-admin-key") adminKey?: string,
  ) {
    return this.service.reviewByAdminKey(adminKey, proofId, body);
  }
}
