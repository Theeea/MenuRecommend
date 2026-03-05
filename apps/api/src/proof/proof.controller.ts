import {
  BadRequestException,
  Body,
  Controller,
  Headers as ReqHeaders,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CreateProofDto } from './create-proof.dto';
import { ProofService } from './proof.service';

@Controller('proofs')
export class ProofController {
  constructor(private readonly service: ProofService) {}

  /**
   * ✅ 업로드(워터마크 합성) 이후 "검증 큐"에 등록
   * - imageUrl: /uploads/proof/xxx.jpg (워터마크 결과)
   * - rawUrl:   /uploads/raw/xxx.jpg   (원본/정규화본)
   */
  @UseGuards(AuthGuard('jwt'))
  @Post()
  createQueued(@Req() req: any, @Body() body: CreateProofDto) {
    if (!body?.sessionId) throw new BadRequestException('sessionId is required');
    if (!body?.imageUrl) throw new BadRequestException('imageUrl is required');
    if (!body?.rawUrl) throw new BadRequestException('rawUrl is required');
    if (!body?.challengeCode) throw new BadRequestException('challengeCode is required');

    return this.service.createQueued(
      req.user.userId,
      body.sessionId,
      body.imageUrl,
      body.rawUrl,
      body.challengeCode,
    );
  }

  /**
   * ✅ 관리자 수동 PASS/FAIL (admin 페이지에서 호출)
   * 헤더: x-admin-key
   */
  @Post(':id/review')
  review(
    @Param('id') proofId: string,
    @Body()
    body: {
      result: 'PASS' | 'FAIL';
      score?: number;
      model?: string;
      meta?: any;
    },
    @ReqHeaders('x-admin-key') adminKey?: string,
  ) {
    return this.service.reviewByAdminKey(adminKey, proofId, body);
  }
}
