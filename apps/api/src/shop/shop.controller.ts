import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ShopService } from './shop.service';

@UseGuards(AuthGuard('jwt'))
@Controller()
export class ShopController {
  constructor(private readonly shop: ShopService) {}

  @Get('shop/items')
  listItems() {
    return this.shop.listItems();
  }

  @Post('shop/purchase')
  purchase(@Req() req: any, @Body() body: { itemId?: string }) {
    return this.shop.purchase(req.user.userId, body?.itemId ?? '');
  }

  @Get('me/purchases')
  myPurchases(
    @Req() req: any,
    @Query('take') take?: string,
    @Query('cursor') cursor?: string,
  ) {
    const n = Math.min(Math.max(parseInt(take ?? '20', 10) || 20, 1), 50);
    return this.shop.listMyPurchases(req.user.userId, n, cursor);
  }
}
