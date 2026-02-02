import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from "express";
import { join } from "path";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const uploadsDir = join(process.cwd(), "uploads");

  app.use("/uploads", express.static(uploadsDir));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
