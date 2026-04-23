import { Module } from '@nestjs/common';
import { StitchingProductsController } from './stitching-products.controller';
import { StitchingProductsService } from './stitching-products.service';

@Module({
  controllers: [StitchingProductsController],
  providers: [StitchingProductsService],
  exports: [StitchingProductsService]
})
export class StitchingProductsModule {}
