import {
  Body,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import type { Request } from 'express';
import { UploadsService } from './uploads.service';

type AuthenticatedRequest = Request & {
  user: { userId: string };
};

const MAX_PROOF_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function extensionForMime(mimetype?: string) {
  return (
    ALLOWED_IMAGE_MIME_TO_EXT[String(mimetype ?? '').toLowerCase()] ?? null
  );
}

@Controller('uploads')
@UseGuards(AuthGuard('jwt'))
export class UploadsController {
  constructor(private service: UploadsService) {}

  @Post('proof')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), 'uploads', 'raw');
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const ext = extensionForMime(file.mimetype) ?? '.jpg';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!extensionForMime(file.mimetype)) {
          cb(
            new BadRequestException(
              'Only JPEG, PNG, and WebP images are allowed',
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
      limits: { fileSize: MAX_PROOF_UPLOAD_BYTES },
    }),
  )
  async uploadProof(
    @UploadedFile() file: Express.Multer.File,
    @Body('sessionId') sessionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!sessionId) throw new BadRequestException('sessionId is required');
    const result = await this.service.uploadProof(
      req.user.userId,
      sessionId,
      file,
    );

    const base = `${req.protocol}://${req.get('host')}`;

    return {
      ...result,
      absoluteUrl: base + result.url,
      rawAbsoluteUrl: base + result.rawUrl,
    };
  }
}
