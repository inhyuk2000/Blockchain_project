import db from "./db.js";

export const SORT_MODES = Object.freeze(["latest", "price", "popular"]);

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
        blockNumber:
          row.block_number !== undefined && row.block_number !== null
            ? Number(row.block_number)
            : null,
        isSold: Boolean(row.is_sold ?? row.isSold ?? 0),
        createdAt: row.created_at,
      }
    : null;

const mapRowToListItem = (row) => ({
  id: row.id,
  title: row.title,
  thumbnailUrl: row.thumbnail_url,
  price: row.price,
  verificationStatus: row.verification_status,
  isSold: Boolean(row.is_sold),
});

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
  blockNumber = null,
}) => {
  const result = db
    .prepare(
      `
      INSERT INTO images (
        user_id, title, description, price, category,
        device_id, captured_at, image_url, thumbnail_url,
        image_hash, verification_status, tx_hash, block_number, is_sold, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
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
      txHash,
      blockNumber
    );

  return getImageById(result.lastInsertRowid);
};

export const getImageById = (id) =>
  toImage(
    db
      .prepare(
        `
        SELECT id, user_id, title, description, price, category, device_id, captured_at,
               image_url, thumbnail_url, image_hash, verification_status, tx_hash,
               block_number, is_sold, created_at
        FROM images
        WHERE id = ?
        `
      )
      .get(id)
  );

/** 업로드 파일 해시로 등록 이미지 1건 조회 (진품 검증) */
export function findImageByContentHash(normalizedHashLower) {
  const h = String(normalizedHashLower ?? "").trim().toLowerCase();
  if (!h) return null;
  const row = db
    .prepare(
      `
      SELECT id, image_hash, tx_hash
      FROM images
      WHERE LOWER(TRIM(image_hash)) = ?
      ORDER BY id ASC
      LIMIT 1
      `
    )
    .get(h);
  if (!row) return null;
  return {
    id: row.id,
    imageHash: row.image_hash,
    txHash: row.tx_hash,
  };
}

export const deleteImageById = (id) => {
  db.prepare(`DELETE FROM image_favorites WHERE image_id = ?`).run(id);
  const result = db.prepare(`DELETE FROM images WHERE id = ?`).run(id);
  return result.changes > 0;
};

export const getAllImages = () =>
  db
    .prepare(
      `
      SELECT id, user_id, title, description, price, category, device_id, captured_at,
             image_url, thumbnail_url, image_hash, verification_status, tx_hash,
             block_number, is_sold, created_at
      FROM images
      ORDER BY id DESC
      `
    )
    .all()
    .map(toImage);

/** 목록 피드: 스펙 필드만 (페이징·정렬) */
export function listImagesPaged({ page, pageSize, sort }) {
  const offset = page * pageSize;
  let orderClause = `ORDER BY i.id DESC`;
  let joinPopular = "";

  if (sort === "price") {
    orderClause = `ORDER BY i.price ASC, i.id DESC`;
  }
  if (sort === "popular") {
    joinPopular = `
      LEFT JOIN (
        SELECT image_id, COUNT(*) AS fav_count FROM image_favorites GROUP BY image_id
      ) pf ON pf.image_id = i.id
    `;
    orderClause = `ORDER BY COALESCE(pf.fav_count, 0) DESC, i.id DESC`;
  }

  const sql = `
    SELECT 
      i.id,
      i.title,
      i.thumbnail_url,
      i.price,
      i.verification_status,
      COALESCE(i.is_sold, 0) AS is_sold
    FROM images i
    ${joinPopular}
    ${orderClause}
    LIMIT ? OFFSET ?
  `;

  return db.prepare(sql).all(pageSize, offset).map(mapRowToListItem);
}

const mapRowToSearchResult = (row) => ({
  id: row.id,
  title: row.title,
  thumbnailUrl: row.thumbnail_url,
  price: row.price,
  verificationStatus: row.verification_status,
});

const escapeSqlLikeChars = (term) =>
  term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");

export function searchImagesPaged({ keyword, category, page, pageSize }) {
  const offset = page * pageSize;
  const conditions = [];
  const params = [];

  const kw =
    keyword !== undefined && keyword !== null && String(keyword).trim() !== ""
      ? String(keyword).trim()
      : null;
  if (kw !== null) {
    const pattern = `%${escapeSqlLikeChars(kw)}%`;
    conditions.push("(i.title LIKE ? ESCAPE '\\' OR IFNULL(i.description,'') LIKE ? ESCAPE '\\')");
    params.push(pattern, pattern);
  }

  const cat =
    category !== undefined && category !== null && String(category).trim() !== ""
      ? String(category).trim()
      : null;
  if (cat !== null) {
    conditions.push("LOWER(TRIM(i.category)) = LOWER(TRIM(?))");
    params.push(cat);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `
    SELECT i.id, i.title, i.thumbnail_url, i.price, i.verification_status
    FROM images i
    ${where}
    ORDER BY i.id DESC
    LIMIT ? OFFSET ?
  `;
  params.push(pageSize, offset);
  return db.prepare(sql).all(...params).map(mapRowToSearchResult);
}

export function listDistinctImageCategories() {
  return db
    .prepare(
      `
      SELECT DISTINCT TRIM(category) AS c FROM images WHERE LENGTH(TRIM(category)) > 0
      ORDER BY c COLLATE NOCASE ASC
      `
    )
    .all()
    .map((row) => row.c);
}

/** SQLite/문자열 시각 → ISO 8601 UTC (스펙 예시와 동일한 형태) */
export function toIso8601UtcZ(raw) {
  if (raw == null || raw === "") return "";
  const s = String(raw).trim();
  if (!s) return "";
  const hasTz = /Z$/i.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
  const normalized = hasTz ? s : s.includes("T") ? `${s}Z` : `${s.replace(" ", "T")}Z`;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

const mapRowToMyUploadItem = (row) => ({
  id: row.id,
  title: row.title,
  thumbnailUrl: row.thumbnail_url,
  price: row.price,
  verificationStatus: row.verification_status,
  isSold: Boolean(row.is_sold),
  createdAt: toIso8601UtcZ(row.created_at),
});

/** 로그인 사용자 업로드 목록 (GET /users/me/images) */
export function listImagesByUserPaged(userId, page, pageSize) {
  const offset = page * pageSize;
  const rows = db
    .prepare(
      `
      SELECT id, title, thumbnail_url, price, verification_status, is_sold, created_at
      FROM images
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ? OFFSET ?
      `
    )
    .all(userId, pageSize, offset);
  return rows.map(mapRowToMyUploadItem);
}
