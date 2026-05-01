import { API_BASE_URL } from "./api";

/** 데모 업로더 등으로 로그인했을 때 구매 내역·워터마크 UI만 로컬에서 검증할 때 사용 */
export function isDemoUiTest() {
  return import.meta.env.VITE_DEMO_UI_TEST === "true";
}

export function buildMockOrdersFromImages(images) {
  const arr = Array.isArray(images) ? images.slice(0, 6) : [];
  const purchasedAt = new Date().toISOString();
  return arr.map((img, i) => ({
    orderId: 91001 + i,
    imageId: img.id,
    title: `[데모 주문] ${img.title}`,
    thumbnailUrl: img.thumbnailUrl,
    price: img.price,
    orderStatus: "PAID",
    purchasedAt,
  }));
}

/**
 * 서버·주문 없이 브라우저에서만 텍스트 워터마크를 얹어 PNG 저장 (UI 테스트용).
 */
export async function downloadWatermarkedImageClientSide(imageSrcUrl, watermarkText, filename) {
  const res = await fetch(imageSrcUrl);
  if (!res.ok) throw new Error(`이미지를 불러오지 못했습니다. (${res.status})`);
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas를 사용할 수 없습니다.");
  ctx.drawImage(bmp, 0, 0);
  const fontSize = Math.max(12, Math.min(48, Math.floor(Math.min(bmp.width, bmp.height) / 18)));
  ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  const text = watermarkText || "DEMO";
  const x = bmp.width - 12;
  const y = bmp.height - 14;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = Math.max(3, fontSize / 8);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);

  await new Promise((resolve, reject) => {
    canvas.toBlob(
      (out) => {
        if (!out) {
          reject(new Error("PNG 생성에 실패했습니다."));
          return;
        }
        const u = URL.createObjectURL(out);
        const a = document.createElement("a");
        a.href = u;
        a.download = filename || "watermarked-demo.png";
        a.rel = "noopener";
        a.click();
        URL.revokeObjectURL(u);
        resolve();
      },
      "image/png",
      0.92
    );
  });
}

/** 상세의 imageUrl 경로로 브라우저 워터마크 다운로드 */
export async function demoDownloadDetailImage(imageUrlPath, title, imageId) {
  const path = String(imageUrlPath ?? "").startsWith("/") ? imageUrlPath : `/${imageUrlPath}`;
  const url = `${API_BASE_URL}${path}`;
  const safe = String(title ?? "image").slice(0, 40);
  await downloadWatermarkedImageClientSide(url, `DEMO · ${safe}`, `demo-watermark-${imageId}.png`);
}
