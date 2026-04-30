import {
  Body,
  Controller,
  Get,
  Param,
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

  @Post('me/purchases/:id/cancel')
  cancelMyPurchase(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.shop.cancelPurchaseByUser(
      req.user.userId,
      id,
      body?.reason ?? '',
    );
  }

  @Post('me/purchases/:id/used')
  setUsed(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { used?: boolean },
  ) {
    return this.shop.setPurchaseUsedByUser(
      req.user.userId,
      id,
      body?.used === true,
    );
  }
}
