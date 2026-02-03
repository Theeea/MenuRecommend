import { BadRequestException, Body, Controller, Post, Req, UseGuards, Headers, Param } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ProofService } from "./proof.service";

@Controller("proofs")
export class ProofController {
  constructor(private service: ProofService) {}

  // ✅ 즉시 저장 + PENDING 반환
  @UseGuards(AuthGuard("jwt"))
  @Post()
  async create(
    @Req() req: any,
    @Body() body: { sessionId: string; imageUrl: string; rawUrl: string; challengeCode?: string }
  ) {
    if (!body?.sessionId || !body?.imageUrl || !body?.rawUrl) {
      throw new BadRequestException("sessionId, imageUrl, rawUrl required");
    }
    return this.service.createQueued(req.user.userId, body.sessionId, body.imageUrl, body.rawUrl, body.challengeCode);
  }

  // ✅ 운영자 수동 리뷰(기존 유지)
  @Post(":id/review")
  async review(
    @Param("id") proofId: string,
    @Body() body: { result: "PASS" | "FAIL"; score?: number; model?: string; meta?: any },
    @Headers("x-admin-key") adminKey?: string
  ) {
    return this.service.reviewByAdminKey(adminKey, proofId, body);
  }
}
