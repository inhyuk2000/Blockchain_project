import db from "./db.js";

const toImage = (row) =>
  row
    ? {
        id: row.id,
        userId: row.user_id,
        title: row.title,
        description: row.description,
        price: row.price,
        category: row.category,
        deviceId: row.device_id,
        capturedAt: row.captured_at,
        imageUrl: row.image_url,
        thumbnailUrl: row.thumbnail_url,
        imageHash: row.image_hash,
        verificationStatus: row.verification_status,
        txHash: row.tx_hash,
        createdAt: row.created_at,
      }
    : null;

export const createImage = ({
  userId,
  title,
  description = null,
  price,
  category,
  deviceId = null,
  capturedAt = null,
  imageUrl,
  thumbnailUrl,
  imageHash,
  verificationStatus,
  txHash,
}) => {
  const result = db
    .prepare(
      `
      INSERT INTO images (
        user_id, title, description, price, category,
        device_id, captured_at, image_url, thumbnail_url,
        image_hash, verification_status, tx_hash, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `
    )
    .run(
      userId,
      title,
      description,
      price,
      category,
      deviceId,
      capturedAt,
      imageUrl,
      thumbnailUrl,
      imageHash,
      verificationStatus,
      txHash
    );

  return getImageById(result.lastInsertRowid);
};

export const getImageById = (id) =>
  toImage(
    db
      .prepare(
        `
        SELECT id, user_id, title, description, price, category, device_id, captured_at,
               image_url, thumbnail_url, image_hash, verification_status, tx_hash, created_at
        FROM images
        WHERE id = ?
        `
      )
      .get(id)
  );

export const getAllImages = () =>
  db
    .prepare(
      `
      SELECT id, user_id, title, description, price, category, device_id, captured_at,
             image_url, thumbnail_url, image_hash, verification_status, tx_hash, created_at
      FROM images
      ORDER BY id DESC
      `
    )
    .all()
    .map(toImage);
