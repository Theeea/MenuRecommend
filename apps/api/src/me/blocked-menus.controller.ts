import { Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentUserId } from "../common/security/current-user-id.decorator";
import { BlockedMenusService } from "./blocked-menus.service";

@Controller("me/blocked-menus")
@UseGuards(AuthGuard("jwt"))
export class BlockedMenusController {
  constructor(private readonly service: BlockedMenusService) {}

  // 내 싫어요(차단) 목록 조회
  @Get()
  async list(
    @CurrentUserId() userId: string,
    @Query("take") take?: string,
    @Query("cursor") cursor?: string
  ) {
    const n = Math.min(Math.max(parseInt(take || "30", 10), 1), 100);
    return await this.service.list(userId, { take: n, cursor: cursor || null });
  }

  // 싫어요(차단) 추가
  @Post(":menuId")
  async add(@CurrentUserId() userId: string, @Param("menuId") menuId: string) {
    return await this.service.add(userId, menuId);
  }

  // 싫어요(차단) 해제(단일 삭제)
  @Delete(":menuId")
  async remove(@CurrentUserId() userId: string, @Param("menuId") menuId: string) {
    return await this.service.remove(userId, menuId);
  }

  // 싫어요(차단) 전체 초기화
  @Delete()
  async reset(@CurrentUserId() userId: string) {
    return await this.service.reset(userId);
  }
}
