import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers, CORS (CORS_ORIGINS), validation — see app.setup.ts.
  configureApp(app);

  const port = process.env.PORT ?? 3000;
  // 0.0.0.0 so the phone running Expo Go can reach it over the LAN.
  await app.listen(port, '0.0.0.0');
  console.log(`CampusXchange backend listening on http://0.0.0.0:${port}`);
}

await bootstrap();
