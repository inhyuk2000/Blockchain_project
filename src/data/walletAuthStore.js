import crypto from "crypto";

const nonceStore = new Map();
const NONCE_TTL_MS = 5 * 60 * 1000;

export const issueWalletNonce = (walletAddress) => {
  const nonce = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + NONCE_TTL_MS;

  nonceStore.set(walletAddress.toLowerCase(), { nonce, expiresAt });
  return nonce;
};

export const consumeWalletNonce = (walletAddress) => {
  const key = walletAddress.toLowerCase();
  const payload = nonceStore.get(key);

  if (!payload) {
    return null;
  }

  nonceStore.delete(key);

  if (payload.expiresAt < Date.now()) {
    return null;
  }

  return payload.nonce;
};
