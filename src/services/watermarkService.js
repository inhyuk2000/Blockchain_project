import sharp from "sharp";

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

/**
 * 원본 이미지에 텍스트 워터마크(우하단) 후 PNG로 저장.
 */
export async function writeWatermarkedCopy(sourceAbsPath, destAbsPath, watermarkText) {
  const text = watermarkText?.trim() || "Licensed copy";
  const meta = await sharp(sourceAbsPath).metadata();
  const w = meta.width || 480;
  const h = meta.height || 360;
  const fontSize = Math.max(12, Math.min(56, Math.floor(Math.min(w, h) / 18)));
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <text x="${w - 12}" y="${h - 16}" text-anchor="end" font-family="system-ui,sans-serif" font-size="${fontSize}" font-weight="700"
        fill="rgba(255,255,255,0.92)" stroke="rgba(0,0,0,0.55)" stroke-width="4" paint-order="stroke">${escapeXml(
          text
        )}</text>
</svg>`;

  await sharp(sourceAbsPath)
    .composite([{ input: Buffer.from(svg, "utf8"), left: 0, top: 0 }])
    .png()
    .toFile(destAbsPath);
}
