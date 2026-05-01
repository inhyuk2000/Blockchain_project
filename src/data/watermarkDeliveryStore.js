import db from "./db.js";

/**
 * 플랫폼이 발급한 워터마크 PNG 파일의 SHA-256 (정규화된 0x 소문자).
 * 동일 바이트면 같은 해시 → 재다운로드 시 UPSERT.
 */
export function upsertWatermarkedDeliveryHash({ contentHash, imageId, orderId }) {
  const h = String(contentHash ?? "").trim().toLowerCase();
  if (!h) return;
  db.prepare(
    `
    INSERT INTO watermarked_delivery_hashes (content_hash, image_id, order_id, created_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(content_hash) DO UPDATE SET
      image_id = excluded.image_id,
      order_id = excluded.order_id,
      created_at = datetime('now')
    `
  ).run(h, imageId, orderId);
}

export function findImageByWatermarkedDeliveryHash(normalizedHashLower) {
  const h = String(normalizedHashLower ?? "").trim().toLowerCase();
  if (!h) return null;
  const row = db
    .prepare(
      `
      SELECT i.id AS image_id, i.image_hash, i.tx_hash, wdh.order_id
      FROM watermarked_delivery_hashes wdh
      INNER JOIN images i ON i.id = wdh.image_id
      WHERE LOWER(TRIM(wdh.content_hash)) = ?
      LIMIT 1
      `
    )
    .get(h);
  if (!row) return null;
  return {
    imageId: row.image_id,
    imageHash: row.image_hash,
    txHash: row.tx_hash,
    orderId: row.order_id,
  };
}
