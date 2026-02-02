import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { BlockedMenusService } from "./blocked-menus.service";

@UseGuards(AuthGuard("jwt"))
@Controller("me/blocked-menus")
export class BlockedMenusController {
  constructor(private service: BlockedMenusService) {}

  @Get()
  list(@Req() req: any) {
    return this.service.list(req.user.userId);
  }

  @Post()
  add(@Req() req: any, @Body() body: { menuId: string }) {
    return this.service.add(req.user.userId, body.menuId);
  }

  @Delete(":menuId")
  remove(@Req() req: any, @Param("menuId") menuId: string) {
    return this.service.remove(req.user.userId, menuId);
  }

  @Delete()
  clear(@Req() req: any) {
    return this.service.clear(req.user.userId);
  }
}
