import db from "./db.js";

export class FavoriteConflictError extends Error {
  constructor(message = "이미 찜한 이미지입니다.") {
    super(message);
    this.name = "FavoriteConflictError";
  }
}

export const addImageFavorite = (userId, imageId) => {
  try {
    db.prepare(`
      INSERT INTO image_favorites (user_id, image_id)
      VALUES (?, ?)
    `).run(userId, imageId);
  } catch (e) {
    if (e.code === "SQLITE_CONSTRAINT_PRIMARYKEY" || e.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new FavoriteConflictError();
    }
    throw e;
  }
};

/** @returns {boolean} 삭제된 행이 있었으면 true */
export const removeImageFavorite = (userId, imageId) => {
  const result = db.prepare(`DELETE FROM image_favorites WHERE user_id = ? AND image_id = ?`).run(userId, imageId);
  return result.changes > 0;
};

export const getFavoritedImageIds = (userId) => {
  const rows = db.prepare(`SELECT image_id FROM image_favorites WHERE user_id = ?`).all(userId);
  return new Set(rows.map((r) => r.image_id));
};

/** GET /users/me/favorites 응답 스펙 */
export function listFavoritesSpecPaged(userId, page, pageSize) {
  const offset = page * pageSize;
  const rows = db
    .prepare(
      `
      SELECT i.id, i.title, i.thumbnail_url, i.price, i.verification_status
      FROM image_favorites f
      INNER JOIN images i ON i.id = f.image_id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
      LIMIT ? OFFSET ?
      `
    )
    .all(userId, pageSize, offset);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    thumbnailUrl: row.thumbnail_url,
    price: row.price,
    verificationStatus: row.verification_status,
  }));
}
