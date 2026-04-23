import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { WinstonModule } from 'nest-winston';
import winston from 'winston';
import { AppModule } from './modules/app/app.module';
import { BigIntInterceptor } from './modules/common/bigint.interceptor';
import { env } from './modules/env/env';

async function bootstrap() {
  const logger = WinstonModule.createLogger({
    level: env.LOG_LEVEL ?? 'info',
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(winston.format.timestamp(), winston.format.json())
      })
    ]
  });

  const app = await NestFactory.create(AppModule, { cors: true, logger });
  app.useGlobalInterceptors(new BigIntInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Sutra ERP + Stitching Admin API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(env.PORT, '0.0.0.0');
}

bootstrap();
