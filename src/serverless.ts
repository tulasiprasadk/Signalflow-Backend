import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as express from 'express';
import serverless from 'serverless-http';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';

let cachedHandler: any = null;

async function createServer() {
  const expressApp = express();

  // Increase body size limits for base64 image uploads
  expressApp.use(express.json({ limit: '15mb' }));
  expressApp.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Serve uploads
  expressApp.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));

  const origins = (
    process.env.CORS_ORIGINS ||
    process.env.CORS_ORIGIN ||
    process.env.FRONTEND_URL ||
    process.env.NEXT_PUBLIC_FRONTEND_URL ||
    'http://localhost:6002'
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  await app.init();
  return expressApp;
}

export const handler = async (req: any, res: any) => {
  if (!cachedHandler) {
    const app = await createServer();
    cachedHandler = serverless(app);
  }
  return cachedHandler(req, res);
};
