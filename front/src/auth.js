import { apiRequest } from "./api";

const TOKEN_KEY = "accessToken";
const REFRESH_TOKEN_KEY = "refreshToken";

export const getAccessToken = () => localStorage.getItem(TOKEN_KEY) ?? "";
export const setAccessToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearAccessToken = () => localStorage.removeItem(TOKEN_KEY);
export const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY) ?? "";
export const setRefreshToken = (token) => localStorage.setItem(REFRESH_TOKEN_KEY, token);
export const clearRefreshToken = () => localStorage.removeItem(REFRESH_TOKEN_KEY);

export async function loginWithMetaMask() {
  if (!window.ethereum) {
    throw new Error("MetaMask extension not found.");
  }

  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const walletAddress = accounts?.[0];
  if (!walletAddress) {
    throw new Error("No wallet account selected.");
  }

  const chainHex = await window.ethereum.request({ method: "eth_chainId" });
  const chainId = Number.parseInt(chainHex, 16);
  if (!Number.isInteger(chainId)) {
    throw new Error("Invalid chainId from wallet.");
  }

  const walletType = "METAMASK";

  const noncePayload = await apiRequest("/auth/wallet/nonce", {
    method: "POST",
    body: { walletAddress, chainId, walletType },
  });

  const signature = await window.ethereum.request({
    method: "personal_sign",
    params: [noncePayload.message, walletAddress],
  });

  const verifyPayload = await apiRequest("/auth/wallet/login", {
    method: "POST",
    body: {
      walletAddress,
      signature,
      nonce: noncePayload.nonce,
      chainId,
      walletType,
    },
  });

  if (!verifyPayload.accessToken) {
    throw new Error("Access token was not returned.");
  }

  setAccessToken(verifyPayload.accessToken);
  if (verifyPayload.refreshToken) {
    setRefreshToken(verifyPayload.refreshToken);
  }
  return verifyPayload;
}
