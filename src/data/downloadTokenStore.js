import db from "./db.js";

export function insertDownloadToken({ token, filePathRelative, expiresAtIso }) {
  db.prepare(
    `
    INSERT INTO download_tokens (token, file_path, expires_at)
    VALUES (?, ?, ?)
    `
  ).run(token, filePathRelative, expiresAtIso);
}

export function getDownloadTokenRow(token) {
  if (!token || typeof token !== "string") return null;
  const safe = token.trim();
  if (!/^[a-f0-9]{48}$/i.test(safe)) return null;
  return db
    .prepare(`SELECT token, file_path, expires_at FROM download_tokens WHERE token = ?`)
    .get(safe);
}

export function deleteDownloadToken(token) {
  db.prepare(`DELETE FROM download_tokens WHERE token = ?`).run(token);
}
