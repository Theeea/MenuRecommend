import { BadRequestException, Body, Controller, Headers as ReqHeaders, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ProofService } from "./proof.service";

@Controller("proofs")
export class ProofController {
  constructor(private service: ProofService) {}

  @UseGuards(AuthGuard("jwt"))
  @Post()
  create(
    @Req() req: any,
    @Body() body: { sessionId: string; imageUrl: string; challengeCode?: string }
  ) {
    if (!body?.sessionId || !body?.imageUrl) {
      throw new BadRequestException("sessionId and imageUrl required");
    }
    return this.service.create(req.user.userId, body.sessionId, body.imageUrl, body.challengeCode);
  }

  @Post(":id/review")
  review(
    @Param("id") proofId: string,
    @Body() body: { result: "PASS" | "FAIL"; score?: number; model?: string; meta?: any },
    @ReqHeaders("x-admin-key") adminKey?: string
  ) {
    return this.service.reviewByAdminKey(adminKey, proofId, body);
  }
}
