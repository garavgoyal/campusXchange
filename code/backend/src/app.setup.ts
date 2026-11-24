import { ValidationPipe, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

/**
 * Browser origins allowed to call the API (the Expo web build, an admin site).
 * The phone app is not a browser, so CORS never affects it.
 *   CORS_ORIGINS=https://admin.example.com,http://localhost:8081
 * Not set: every origin is allowed, which is what local development needs.
 */
export function corsOrigins(): string[] | true {
  const list = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return list.length ? list : true;
}

/**
 * Everything main.ts sets up on the app, in one place so the automated tests
 * run the backend exactly as it runs for real.
 */
export function configureApp(app: INestApplication): INestApplication {
  const express = app as NestExpressApplication;
  // Behind a hosting proxy (Render, Railway…) set TRUST_PROXY=1 so rate limits
  // see the student's IP rather than the proxy's.
  if (process.env.TRUST_PROXY) express.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  express.disable('x-powered-by');
  app.use(helmet());
  app.enableCors({ origin: corsOrigins() });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  return app;
}
