import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import express from "express";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ uploads 디렉토리 보장
  const uploadsRoot = join(process.cwd(), "uploads");
  if (!existsSync(uploadsRoot)) mkdirSync(uploadsRoot, { recursive: true });

  // ✅ /uploads/* 로 정적 서빙
  app.use("/uploads", express.static(uploadsRoot));

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
