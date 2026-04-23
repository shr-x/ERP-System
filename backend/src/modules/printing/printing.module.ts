import { Module } from '@nestjs/common';
import { PrintingController } from './printing.controller';
import { ShareController } from './share.controller';
import { PrintingService } from './printing.service';

@Module({
  controllers: [PrintingController, ShareController],
  providers: [PrintingService]
})
export class PrintingModule {}
