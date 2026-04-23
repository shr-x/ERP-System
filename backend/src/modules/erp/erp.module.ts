import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { SalesModule } from '../sales/sales.module';
import { ErpController } from './erp.controller';
import { ErpService } from './erp.service';

@Module({
  imports: [SalesModule, AccountingModule],
  controllers: [ErpController],
  providers: [ErpService],
  exports: [ErpService]
})
export class ErpModule {}
