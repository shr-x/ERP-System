import { Module } from '@nestjs/common';
import { ErpModule } from '../../erp/erp.module';
import { StitchingOrdersController } from './stitching-orders.controller';
import { StitchingOrdersService } from './stitching-orders.service';

@Module({
  imports: [ErpModule],
  controllers: [StitchingOrdersController],
  providers: [StitchingOrdersService]
})
export class StitchingOrdersModule {}
