import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

@Module({
  imports: [AccountingModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService]
})
export class PurchasesModule {}

