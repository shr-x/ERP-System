import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { CouponsModule } from '../coupons/coupons.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [AccountingModule, CouponsModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService]
})
export class SalesModule {}
