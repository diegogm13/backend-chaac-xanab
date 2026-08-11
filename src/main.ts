import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cabeceras de seguridad HTTP (HSTS, X-Content-Type-Options, etc.)
  app.use(helmet());

  // Necesario para que req.ip resuelva la IP real detrás de un proxy (Vercel, etc.)
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Prefijo global para todos los endpoints
  app.setGlobalPrefix('api');

  // Validación automática de DTOs con class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,       // elimina campos no declarados en el DTO
      forbidNonWhitelisted: true,
      transform: true,       // convierte tipos automáticamente
    }),
  );

  // CORS para el frontend Angular en desarrollo
  app.enableCors({
    origin: process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:4200',
    credentials: true,
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`CHAAC XANAB API corriendo en http://localhost:${port}/api`);
}

bootstrap();
