import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Increase body size limits for base64 image uploads
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Serve uploaded images from the uploads directory at project root
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  // ✅ Allow frontend running on port 9000
  app.enableCors({
    origin: 'http://localhost:9000',
    credentials: true,
  });

  // ✅ Global API prefix
  app.setGlobalPrefix('api');

  // ✅ Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ✅ Backend port locked to 9001
  const port = parseInt(process.env.PORT || '9001', 10);
  await app.listen(port);

  console.log(`🚀 Backend running on http://localhost:${port}`);
}

bootstrap();
