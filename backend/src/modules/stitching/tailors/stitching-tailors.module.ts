import { Module } from '@nestjs/common';
import { StitchingTailorsController } from './stitching-tailors.controller';
import { StitchingTailorsService } from './stitching-tailors.service';

@Module({
  controllers: [StitchingTailorsController],
  providers: [StitchingTailorsService],
  exports: [StitchingTailorsService]
})
export class StitchingTailorsModule {}
