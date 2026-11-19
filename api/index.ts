import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import express from 'express';
import helmet from 'helmet';
import { IncomingMessage, ServerResponse } from 'http';

const expressApp = express();
// DEF-09 (Práctica 11): este es el entry point que corre en Vercel y no aplicaba
// helmet (sólo src/main.ts lo hacía): faltaban nosniff, X-Frame-Options, etc.
expressApp.disable('x-powered-by');
expressApp.use(helmet());
let initialized = false;

async function bootstrap() {
  if (initialized) return expressApp;

  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
    logger: ['error', 'warn'],
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:4200',
    credentials: true,
  });

  await app.init();
  initialized = true;
  return expressApp;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await bootstrap();
  app(req, res);
}
