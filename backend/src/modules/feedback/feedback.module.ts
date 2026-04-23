import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
const { FeedbackController } = require('./feedback.controller');

@Module({
  imports: [PrismaModule],
  controllers: [FeedbackController]
})
export class FeedbackModule {}
