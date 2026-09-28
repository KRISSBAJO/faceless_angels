import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { config } from './config';

async function bootstrap() {
  if (config.production && !process.env.WEB_URL?.trim()) {
    // Emails carry links to the site, so they would point at localhost.
    throw new Error('WEB_URL must be set in production, e.g. https://facelessangels.org');
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Only the website reaches the API, and it passes on the visitor's
  // address. Trusting one hop lets rate limits count visitors, not the site.
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(Number(process.env.PORT ?? 4010), '0.0.0.0');
}

void bootstrap();
