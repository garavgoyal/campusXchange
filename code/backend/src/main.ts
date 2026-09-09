import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Open CORS is fine for local dev with Expo Go; restrict origins before deploying.
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = process.env.PORT ?? 3000;
  // 0.0.0.0 so the phone running Expo Go can reach it over the LAN.
  await app.listen(port, '0.0.0.0');
  console.log(`CampusXchange backend listening on http://0.0.0.0:${port}`);
}

await bootstrap();
