import { Module } from '@nestjs/common';
import { StitchingCustomersController } from './stitching-customers.controller';
import { StitchingCustomersService } from './stitching-customers.service';

@Module({
  controllers: [StitchingCustomersController],
  providers: [StitchingCustomersService],
  exports: [StitchingCustomersService]
})
export class StitchingCustomersModule {}
