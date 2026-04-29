import crypto from "crypto";
import db from "./db.js";

const NONCE_TTL_MS = 5 * 60 * 1000;

export const issueWalletNonce = ({ walletAddress, chainId, walletType, service = "ImageChain Market" }) => {
  const nonce = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + NONCE_TTL_MS;
  const issuedAt = Date.now();
  const issuedAtIso = new Date(issuedAt).toISOString();
  const expiresAtIso = new Date(expiresAt).toISOString();
  const normalizedAddress = walletAddress.toLowerCase();
  const message = [
    "Sign this message to login.",
    `Service: ${service}`,
    `Wallet: ${normalizedAddress}`,
    `Nonce: ${nonce}`,
    `Chain ID: ${chainId}`,
    `Wallet Type: ${walletType}`,
    `Issued At: ${issuedAtIso}`,
    `Expires At: ${expiresAtIso}`,
  ].join("\n");

  db.prepare(
    `
    INSERT INTO wallet_nonces (wallet_address, nonce, message, chain_id, wallet_type, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(wallet_address) DO UPDATE SET
      nonce = excluded.nonce,
      message = excluded.message,
      chain_id = excluded.chain_id,
      wallet_type = excluded.wallet_type,
      expires_at = excluded.expires_at
    `
  ).run(normalizedAddress, nonce, message, chainId, walletType, expiresAt);

  return {
    nonce,
    expiresAt: expiresAtIso,
    message,
  };
};

export const consumeWalletNonce = (walletAddress) => {
  const key = walletAddress.toLowerCase();
  const payload = db
    .prepare(
      `
      SELECT nonce, message, chain_id, wallet_type, expires_at
      FROM wallet_nonces
      WHERE wallet_address = ?
      `
    )
    .get(key);

  if (!payload) {
    return null;
  }

  db.prepare("DELETE FROM wallet_nonces WHERE wallet_address = ?").run(key);

  if (payload.expires_at < Date.now()) {
    return null;
  }

  return {
    nonce: payload.nonce,
    message: payload.message,
    chainId: payload.chain_id,
    walletType: payload.wallet_type,
    expiresAt: payload.expires_at,
  };
};
