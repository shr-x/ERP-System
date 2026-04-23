import { Module } from '@nestjs/common';
import { StitchingCustomersModule } from './customers/stitching-customers.module';
import { StitchingOrdersModule } from './orders/stitching-orders.module';
import { StitchingPosModule } from './pos/stitching-pos.module';
import { StitchingProductsModule } from './products/stitching-products.module';
import { StitchingTailorsModule } from './tailors/stitching-tailors.module';

@Module({
  imports: [StitchingProductsModule, StitchingCustomersModule, StitchingTailorsModule, StitchingOrdersModule, StitchingPosModule]
})
export class StitchingModule {}
