declare module 'qrcode' {
  export type QRCodeErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

  export type QRCodeToBufferOptions = {
    type?: 'png';
    width?: number;
    errorCorrectionLevel?: QRCodeErrorCorrectionLevel;
    margin?: number;
  };

  export function toBuffer(
    text: string,
    options?: QRCodeToBufferOptions,
  ): Promise<Buffer>;
}
