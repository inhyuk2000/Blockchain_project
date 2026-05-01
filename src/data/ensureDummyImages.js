import crypto from "crypto";
import fs from "fs";
import path from "path";
import db from "./db.js";
import { createImage } from "./imageStore.js";
import { ensureUserByWalletAddress } from "./userStore.js";

const SEED_DEVICE = "SEED_DEMO";
const SEED_WALLET = "0xfeed000000000000000000000000000000000001";

function digestBuffer(buf) {
  return `0x${crypto.createHash("sha256").update(buf).digest("hex")}`;
}

function svgBuffer(title, accent) {
  const safe = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">\n  <rect width="480" height="360" fill="#1a1a2e"/>\n  <rect x="24" y="24" width="432" height="312" rx="12" fill="${accent}"/>\n  <text x="240" y="180" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" font-family="system-ui,sans-serif" font-size="22" font-weight="600">${safe}</text>\n  <text x="240" y="230" text-anchor="middle" fill="#eeeeee" font-family="system-ui,sans-serif" font-size="12">DEMO</text>\n</svg>\n`;
  return Buffer.from(svg, "utf8");
}

const SAMPLES = [
  {
    title: "[DEMO] 산 풍경",
    description: "더미 이미지 1",
    price: 1000,
    category: "LANDSCAPE",
    fileBase: "seed-demo-mountain",
    accent: "#2d6a4f",
  },
  {
    title: "[DEMO] 도시 야경",
    description: "더미 이미지 2",
    price: 2500,
    category: "URBAN",
    fileBase: "seed-demo-city",
    accent: "#1d3557",
  },
  {
    title: "[DEMO] 추상 패턴",
    description: "더미 이미지 3",
    price: 500,
    category: "ABSTRACT",
    fileBase: "seed-demo-abstract",
    accent: "#6a4c93",
  },
];

function clearIncompleteSeed() {
  const rows = db.prepare(`SELECT id FROM images WHERE device_id = ?`).all(SEED_DEVICE);
  const n = rows.length;
  if (n === SAMPLES.length || n === 0) return;

  for (const { id } of rows) {
    db.prepare(`DELETE FROM image_favorites WHERE image_id = ?`).run(id);
    db.prepare(`DELETE FROM images WHERE id = ?`).run(id);
  }
}

/**
 * DB에 SEED_DEMO 이미지가 3개 미만이면 채웁니다. 서버 기동 시 1회 호출.
 * 비활성: .env 에 SEED_DUMMY_IMAGES=false
 */
export function ensureDummyImages() {
  if (process.env.SEED_DUMMY_IMAGES === "false") {
    return;
  }

  clearIncompleteSeed();

  const count = db.prepare(`SELECT COUNT(*) AS c FROM images WHERE device_id = ?`).get(SEED_DEVICE).c;
  if (count >= SAMPLES.length) {
    console.log(`[dummy] 건너뜀: 시드 이미지 ${count}개 이미 있음 (${SEED_DEVICE})`);
    return;
  }

  const uploadsDir = path.resolve(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const owner = ensureUserByWalletAddress(SEED_WALLET);
  const userId = owner.id;

  for (let i = 0; i < SAMPLES.length; i += 1) {
    const s = SAMPLES[i];
    const buf = svgBuffer(s.title, s.accent);
    const fileName = `${s.fileBase}.svg`;
    fs.writeFileSync(path.join(uploadsDir, fileName), buf);

    const padded = String(i + 1).padStart(2, "0");
    const txHash = `0x${padded.repeat(32)}`;

    createImage({
      userId,
      title: s.title,
      description: s.description,
      price: s.price,
      category: s.category,
      deviceId: SEED_DEVICE,
      capturedAt: null,
      imageUrl: `/uploads/${fileName}`,
      thumbnailUrl: `/uploads/${fileName}`,
      imageHash: digestBuffer(buf),
      verificationStatus: "VERIFIED",
      txHash,
    });
  }

  console.log(`[dummy] ${SAMPLES.length}개 시드 이미지 준비됨 (device_id=${SEED_DEVICE})`);
}
