import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { join } from 'path';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import sharp from 'sharp';
import * as QRCode from 'qrcode';
import { createHmac } from 'crypto';

@Injectable()
export class UploadsService {
  constructor(private prisma: PrismaService) {}

  private ensureDir(dir: string) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  /**
   * Proof용 업로드: sessionId 기반으로 challengeCode 찾아서
   * - 텍스트 워터마크(우하단)
   * - QR 워터마크(좌하단, HMAC 서명 포함)
   *
   * 저장:
   * - raw: uploads/raw/
   * - proof(watermarked): uploads/proof/
   *
   * 반환 URL:
   * - /uploads/proof/xxx.jpg
   */
  async uploadProof(
    userId: string,
    sessionId: string,
    file: Express.Multer.File,
  ) {
    if (!sessionId) throw new BadRequestException('sessionId is required');
    if (!file?.path) throw new BadRequestException('file missing');
    if (!isAllowedImageMime(file.mimetype)) {
      this.removeUploadedFile(file.path);
      throw new BadRequestException(
        'Only JPEG, PNG, and WebP images are allowed',
      );
    }

    const session = await this.prisma.recommendSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, challengeCode: true },
    });

    if (!session) throw new NotFoundException('Session not found');
    if (session.userId !== userId)
      throw new ForbiddenException('Not your session');

    const code = session.challengeCode ?? '----';

    const uploadsRoot = join(process.cwd(), 'uploads');
    const rawDir = join(uploadsRoot, 'raw');
    const proofDir = join(uploadsRoot, 'proof');
    this.ensureDir(rawDir);
    this.ensureDir(proofDir);

    const inputPath = file.path;

    const outName = `proof_${sessionId}_${Date.now()}.jpg`;
    const outputPath = join(proofDir, outName);

    try {
      // 1) normalize (rotate + jpeg)
      const normalized = await sharp(inputPath)
        .rotate() // iOS EXIF 회전 대응
        .resize({ width: 1280, withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer();

      const meta = await sharp(normalized).metadata();
      const w = meta.width ?? 1080;
      const h = meta.height ?? 1080;

      // 공통 값
      const stamp = new Date().toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
      });
      const sidTail = sessionId.slice(-6);

      // 2) 텍스트 워터마크(우하단)
      const text = `CODE ${code} · SID ${sidTail} · ${stamp}`;
      const textSvg = this.makeTextWatermarkSvg(w, h, text);

      // 3) QR 워터마크(좌하단) - HMAC 서명 포함
      const qrSecret = process.env.PROOF_QR_SECRET ?? 'dev-proof-qr-secret';
      const ts = Date.now();
      const sig = this.signQr(qrSecret, sessionId, code, ts);

      const qrText = `MR1|sid=${sessionId}|code=${code}|ts=${ts}|sig=${sig}`;

      const qrSize = Math.max(170, Math.min(240, Math.round(w * 0.2)));
      const qrPng = await QRCode.toBuffer(qrText, {
        type: 'png',
        width: qrSize,
        errorCorrectionLevel: 'H',
        margin: 2,
      });

      // 좌하단 배경 카드(SVG) + QR 합성 좌표
      const pad = Math.max(16, Math.round(w * 0.015));
      const cardPad = Math.max(10, Math.round(w * 0.01));
      const cardW = qrSize + cardPad * 2;
      const cardH = qrSize + cardPad * 2;

      const textPad = Math.max(24, Math.round(w * 0.02));
      const textFontSize = Math.max(24, Math.round(w * 0.032));
      const bottomReserved = textFontSize + 2 * textPad;

      const qrX = pad;
      let qrY = h - pad - cardH - bottomReserved;
      qrY = Math.max(pad, qrY);

      const qrBgSvg = this.makeQrBackgroundSvg(cardW, cardH);

      // 4) composite
      await sharp(normalized)
        .composite([
          // 좌하단 QR 배경 카드
          { input: Buffer.from(qrBgSvg), left: qrX, top: qrY },

          // 좌하단 QR (배경 카드 안쪽)
          { input: qrPng, left: qrX + cardPad, top: qrY + cardPad },

          // 우하단 텍스트 워터마크
          { input: Buffer.from(textSvg), top: 0, left: 0 },
        ])
        .jpeg({ quality: 90 })
        .toFile(outputPath);
    } catch {
      this.removeUploadedFile(inputPath);
      throw new BadRequestException('Invalid or unsupported image file');
    }

    return {
      ok: true,
      url: `/uploads/proof/${outName}`,
      rawUrl: `/uploads/raw/${file.filename}`,
      code,
    };
  }

  private signQr(secret: string, sessionId: string, code: string, ts: number) {
    return createHmac('sha256', secret)
      .update(`MR1|sid=${sessionId}|code=${code}|ts=${ts}`)
      .digest('hex')
      .slice(0, 64);
  }

  private removeUploadedFile(path: string) {
    try {
      if (path && existsSync(path)) unlinkSync(path);
    } catch {
      // best-effort cleanup only
    }
  }

  private makeQrBackgroundSvg(cardW: number, cardH: number) {
    return `
<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="rgba(0,0,0,0.28)"/>
    </filter>
  </defs>
  <rect x="0" y="0" rx="16" ry="16" width="${cardW}" height="${cardH}"
        fill="rgba(0,0,0,0.40)" filter="url(#shadow)" />
</svg>
    `.trim();
  }

  private makeTextWatermarkSvg(w: number, h: number, text: string) {
    const pad = Math.max(24, Math.round(w * 0.02));
    const fontSize = Math.max(24, Math.round(w * 0.032));
    const boxH = fontSize + pad;
    const boxW = Math.min(w - pad * 2, Math.round(w * 0.92));

    const safe = escapeXml(text);

    return `
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${w - boxW - pad}" y="${h - boxH - pad}" rx="16" ry="16"
        width="${boxW}" height="${boxH}" fill="rgba(0,0,0,0.45)"/>
  <text x="${w - boxW - pad + Math.round(pad * 0.6)}"
        y="${h - pad - Math.round(pad * 0.55)}"
        font-family="Arial, sans-serif"
        font-size="${fontSize}"
        fill="white"
        font-weight="800">${safe}</text>
</svg>
    `.trim();
  }
}

function escapeXml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isAllowedImageMime(mimetype?: string) {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(
    String(mimetype ?? '').toLowerCase(),
  );
}
