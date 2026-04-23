import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MediaController } from './media.controller';

@Module({
  imports: [PrismaModule],
  controllers: [MediaController]
})
export class MediaModule {}

