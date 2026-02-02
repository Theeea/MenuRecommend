import { Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RecommendQuotaService } from "./recommend-quota.service";

@UseGuards(AuthGuard("jwt"))
@Controller("me/recommend-quota")
export class RecommendQuotaController {
  constructor(private service: RecommendQuotaService) {}

  @Get()
  get(@Req() req: any) {
    return this.service.get(req.user.userId);
  }

  @Post("watch-ad")
  watchAd(@Req() req: any) {
    return this.service.watchAd(req.user.userId);
  }
}
