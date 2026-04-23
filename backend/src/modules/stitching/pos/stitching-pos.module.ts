import { Module } from '@nestjs/common';
import { ErpModule } from '../../erp/erp.module';
import { StitchingPosController } from './stitching-pos.controller';
import { StitchingPosService } from './stitching-pos.service';

@Module({
  imports: [ErpModule],
  controllers: [StitchingPosController],
  providers: [StitchingPosService]
})
export class StitchingPosModule {}

