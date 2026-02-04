import { Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentUserId } from "../common/security/current-user-id.decorator";
import { BlockedMenusService } from "./blocked-menus.service";

function parseTake(v?: string, fallback = 30) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const t = Math.trunc(n);
  return Math.min(Math.max(t, 1), 100);
}

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
    const n = parseTake(take, 30);
    const c = cursor?.trim() ? cursor.trim() : null;
    return await this.service.list(userId, { take: n, cursor: c });
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
