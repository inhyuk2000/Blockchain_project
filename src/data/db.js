import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const dataDir = path.resolve(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "app.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT UNIQUE,
  nickname TEXT UNIQUE,
  google_id TEXT UNIQUE,
  wallet_address TEXT UNIQUE,
  profile_image_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wallet_nonces (
  wallet_address TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  message TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  wallet_type TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,
  category TEXT NOT NULL,
  device_id TEXT,
  captured_at TEXT,
  image_url TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  image_hash TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  is_sold INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS image_favorites (
  user_id INTEGER NOT NULL,
  image_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, image_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (image_id) REFERENCES images(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_user_id INTEGER NOT NULL,
  image_id INTEGER NOT NULL,
  price INTEGER NOT NULL,
  payment_method TEXT NOT NULL,
  order_status TEXT NOT NULL DEFAULT 'PAID',
  purchased_at TEXT NOT NULL,
  FOREIGN KEY (buyer_user_id) REFERENCES users(id),
  FOREIGN KEY (image_id) REFERENCES images(id)
);

CREATE TABLE IF NOT EXISTS download_tokens (
  token TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watermarked_delivery_hashes (
  content_hash TEXT PRIMARY KEY,
  image_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (image_id) REFERENCES images(id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
`);

const existingImageCols = db.prepare(`PRAGMA table_info(images)`).all().map((c) => c.name);
if (!existingImageCols.includes("is_sold")) {
  db.exec(`ALTER TABLE images ADD COLUMN is_sold INTEGER NOT NULL DEFAULT 0`);
}
if (!existingImageCols.includes("block_number")) {
  db.exec(`ALTER TABLE images ADD COLUMN block_number INTEGER`);
}

export default db;
