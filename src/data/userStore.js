import db from "./db.js";

const toUser = (row) =>
  row
    ? {
        id: row.id,
        name: row.name,
        email: row.email,
        nickname: row.nickname,
        googleId: row.google_id,
        walletAddress: row.wallet_address,
        profileImageUrl: row.profile_image_url,
      }
    : null;

export const getAllUsers = () =>
  db
    .prepare(
      "SELECT id, name, email, nickname, google_id, wallet_address, profile_image_url FROM users ORDER BY id ASC"
    )
    .all()
    .map(toUser);

export const findUserByEmail = (email) => {
  if (!email) {
    return null;
  }
  return toUser(
    db
      .prepare(
        "SELECT id, name, email, nickname, google_id, wallet_address, profile_image_url FROM users WHERE email = ?"
      )
      .get(email)
  );
};

export const findUserByGoogleId = (googleId) => {
  if (!googleId) {
    return null;
  }
  return toUser(
    db
      .prepare(
        "SELECT id, name, email, nickname, google_id, wallet_address, profile_image_url FROM users WHERE google_id = ?"
      )
      .get(googleId)
  );
};

export const findUserByWalletAddress = (walletAddress) => {
  if (!walletAddress) {
    return null;
  }
  return toUser(
    db
      .prepare(
        "SELECT id, name, email, nickname, google_id, wallet_address, profile_image_url FROM users WHERE wallet_address = ?"
      )
      .get(walletAddress.toLowerCase())
  );
};

export const findUserById = (id) =>
  toUser(
    db
      .prepare(
        "SELECT id, name, email, nickname, google_id, wallet_address, profile_image_url FROM users WHERE id = ?"
      )
      .get(id)
  );

export const createUser = ({
  name,
  email,
  nickname,
  googleId = null,
  walletAddress = null,
  profileImageUrl = null,
}) => {
  const normalizedWalletAddress = walletAddress ? walletAddress.toLowerCase() : null;
  const result = db
    .prepare(
      `
      INSERT INTO users (name, email, nickname, google_id, wallet_address, profile_image_url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `
    )
    .run(name ?? null, email ?? null, nickname ?? null, googleId, normalizedWalletAddress, profileImageUrl);

  return findUserById(result.lastInsertRowid);
};

export const ensureUserByWalletAddress = (walletAddress) => {
  const normalizedWalletAddress = walletAddress.toLowerCase();
  const existingUser = findUserByWalletAddress(normalizedWalletAddress);
  if (existingUser) {
    return existingUser;
  }

  const result = db
    .prepare(
      `
      INSERT INTO users (wallet_address, updated_at)
      VALUES (?, datetime('now'))
      `
    )
    .run(normalizedWalletAddress);

  return findUserById(result.lastInsertRowid);
};

export const updateUserById = (id, updates) => {
  const currentUser = findUserById(id);
  if (!currentUser) {
    return null;
  }

  const nextName = typeof updates.name === "string" ? updates.name : currentUser.name;
  const nextNickname = typeof updates.nickname === "string" ? updates.nickname : currentUser.nickname;
  const nextEmail = typeof updates.email === "string" ? updates.email : currentUser.email;
  const nextProfileImageUrl =
    typeof updates.profileImageUrl === "string" ? updates.profileImageUrl : currentUser.profileImageUrl;

  db.prepare(
    `
    UPDATE users
    SET name = ?, nickname = ?, email = ?, profile_image_url = ?, updated_at = datetime('now')
    WHERE id = ?
    `
  ).run(nextName, nextNickname, nextEmail, nextProfileImageUrl, id);

  return findUserById(id);
};
