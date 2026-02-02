import sharp from "sharp";

function escapeXml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function addChallengeWatermark(
  inputBuffer: Buffer,
  challengeCode: string,
  stampedAt = new Date()
) {
  const image = sharp(inputBuffer);
  const meta = await image.metadata();

  const width = meta.width ?? 1080;
  const height = meta.height ?? 1080;

  const fontSize = Math.max(26, Math.round(width * 0.04));
  const pad = Math.max(24, Math.round(width * 0.03));
  const boxH = Math.round(fontSize * 2.2);

  const text1 = `CHALLENGE: ${challengeCode}`;
  const text2 = `TIME: ${stampedAt.toISOString()}`;

  const svg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${pad}" y="${height - pad - boxH}" width="${Math.round(width * 0.78)}" height="${boxH}"
          rx="${Math.round(fontSize * 0.5)}"
          fill="rgba(0,0,0,0.45)"/>
    <text x="${pad + Math.round(fontSize * 0.6)}" y="${height - pad - Math.round(boxH * 0.55)}"
          font-size="${fontSize}" fill="white" font-family="Arial" font-weight="700">
      ${escapeXml(text1)}
    </text>
    <text x="${pad + Math.round(fontSize * 0.6)}" y="${height - pad - Math.round(boxH * 0.18)}"
          font-size="${Math.round(fontSize * 0.72)}" fill="rgba(255,255,255,0.9)" font-family="Arial">
      ${escapeXml(text2)}
    </text>
  </svg>`;

  const svgBuffer = Buffer.from(svg);

  // JPEG으로 통일(용량/호환성)
  return await sharp(inputBuffer)
    .composite([{ input: svgBuffer, top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}
