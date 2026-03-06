import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import express = require('express');
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';

let cachedApp: any = null;

function isAllowedPreviewOrigin(origin: string) {
  return /^https:\/\/signalflow-frontend(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(origin);
}

async function createServer() {
  const expressApp = express();

  expressApp.use(express.json({ limit: '15mb' }));
  expressApp.use(express.urlencoded({ extended: true, limit: '15mb' }));
  expressApp.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));

  const configuredOrigins = (
    process.env.CORS_ORIGINS ||
    process.env.CORS_ORIGIN ||
    process.env.FRONTEND_URL ||
    process.env.NEXT_PUBLIC_FRONTEND_URL ||
    'http://localhost:6002'
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (configuredOrigins.includes(origin) || isAllowedPreviewOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin not allowed by CORS: ${origin}`), false);
    },
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  await app.init();
  return expressApp;
}

export default async function handler(req: any, res: any) {
  if (!cachedApp) {
    cachedApp = await createServer();
  }

  return cachedApp(req, res);
}
