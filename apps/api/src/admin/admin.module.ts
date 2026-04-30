import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MenuDraftService } from './menu-draft.service';
import { ShopService } from '../shop/shop.service';

@Module({
  imports: [PrismaModule],
  controllers: [AdminController],
  providers: [MenuDraftService, ShopService],
})
export class AdminModule {}
