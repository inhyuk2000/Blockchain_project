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

/** 멱등: 찜이 없어도 삭제만 시도 (토글 UI용) */
export const removeImageFavorite = (userId, imageId) => {
  db.prepare(`DELETE FROM image_favorites WHERE user_id = ? AND image_id = ?`).run(userId, imageId);
};

export const getFavoritedImageIds = (userId) => {
  const rows = db.prepare(`SELECT image_id FROM image_favorites WHERE user_id = ?`).all(userId);
  return new Set(rows.map((r) => r.image_id));
};
