import express from "express";
import jwt from "jsonwebtoken";
import { verifyMessage, isAddress } from "ethers";
import { ensureUserByWalletAddress, findUserByWalletAddress } from "../data/userStore.js";
import { consumeWalletNonce, issueWalletNonce } from "../data/walletAuthStore.js";

const router = express.Router();

/**
 * @swagger
 * /auth/wallet/nonce:
 *   post:
 *     summary: 지갑 로그인 nonce 발급
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [walletAddress]
 *             properties:
 *               walletAddress:
 *                 type: string
 *     responses:
 *       200:
 *         description: nonce 발급 성공
 *       400:
 *         description: 요청 데이터 형식 오류
 */
router.post("/wallet/nonce", (req, res) => {
  const { walletAddress, chainId, walletType } = req.body ?? {};
  if (
    typeof walletAddress !== "string" ||
    !isAddress(walletAddress) ||
    typeof chainId !== "number" ||
    !Number.isInteger(chainId) ||
    chainId <= 0 ||
    typeof walletType !== "string" ||
    !walletType.trim()
  ) {
    return res
      .status(400)
      .json({ message: "walletAddress, chainId, walletType를 올바르게 입력해주세요." });
  }

  const normalizedAddress = walletAddress.toLowerCase();
  const noncePayload = issueWalletNonce({
    walletAddress: normalizedAddress,
    chainId,
    walletType,
  });

  return res.status(200).json({
    walletAddress: normalizedAddress,
    nonce: noncePayload.nonce,
    message: noncePayload.message,
    expiresAt: noncePayload.expiresAt,
  });
});

/**
 * @swagger
 * /auth/wallet/verify:
 *   post:
 *     summary: 지갑 서명 검증 후 로그인
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [walletAddress, signature]
 *             properties:
 *               walletAddress:
 *                 type: string
 *               signature:
 *                 type: string
 *     responses:
 *       200:
 *         description: 로그인 성공
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 서명 검증 실패
 */
const buildAccessPayload = (existingUser, walletAddress) => ({
  id: existingUser?.id ?? null,
  walletAddress,
  email: existingUser?.email ?? null,
  name: existingUser?.name ?? null,
  isNewUser: !existingUser,
});

const buildLoginResponse = (accessToken, refreshToken, existingUser, walletAddress) => ({
  accessToken,
  refreshToken,
  tokenType: "Bearer",
  expiresIn: 3600,
  isNewUser: !existingUser,
  user: {
    id: existingUser?.id ?? null,
    walletAddress,
    nickname: existingUser?.nickname ?? null,
    role: "USER",
  },
});

const handleWalletLogin = (req, res) => {
  try {
    const { walletAddress, signature, nonce, chainId, walletType } = req.body ?? {};
    if (
      typeof walletAddress !== "string" ||
      typeof signature !== "string" ||
      typeof nonce !== "string" ||
      typeof chainId !== "number" ||
      !Number.isInteger(chainId) ||
      chainId <= 0 ||
      typeof walletType !== "string" ||
      !walletType.trim() ||
      !isAddress(walletAddress)
    ) {
      return res
        .status(400)
        .json({ message: "walletAddress, signature, nonce, chainId, walletType를 확인해주세요." });
    }

    const normalizedAddress = walletAddress.toLowerCase();
    const noncePayload = consumeWalletNonce(normalizedAddress);
    if (!noncePayload) {
      return res.status(401).json({ message: "nonce가 없거나 만료되었습니다." });
    }

    if (
      noncePayload.nonce !== nonce ||
      noncePayload.chainId !== chainId ||
      noncePayload.walletType !== walletType
    ) {
      return res.status(401).json({ message: "nonce 또는 지갑 정보가 일치하지 않습니다." });
    }

    const recoveredAddress = verifyMessage(noncePayload.message, signature).toLowerCase();

    if (recoveredAddress !== normalizedAddress) {
      return res.status(401).json({ message: "지갑 서명 검증에 실패했습니다." });
    }

    const existingUser = ensureUserByWalletAddress(normalizedAddress);
    const payload = buildAccessPayload(existingUser, normalizedAddress);

    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });
    const refreshToken = jwt.sign(
      { walletAddress: normalizedAddress, type: "refresh" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json(buildLoginResponse(accessToken, refreshToken, existingUser, normalizedAddress));
  } catch (error) {
    return res.status(500).json({ message: "지갑 로그인 처리 중 오류가 발생했습니다." });
  }
};

router.post("/wallet/login", handleWalletLogin);
router.post("/wallet/verify", handleWalletLogin);

router.post("/refresh", (req, res) => {
  try {
    const { refreshToken } = req.body ?? {};
    if (typeof refreshToken !== "string" || !refreshToken.trim()) {
      return res.status(400).json({ message: "refreshToken이 필요합니다." });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    if (!decoded || decoded.type !== "refresh" || typeof decoded.walletAddress !== "string") {
      return res.status(401).json({ message: "유효하지 않은 refreshToken입니다." });
    }

    const existingUser = findUserByWalletAddress(decoded.walletAddress);
    const payload = buildAccessPayload(existingUser, decoded.walletAddress);
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });

    return res.status(200).json({
      accessToken,
      tokenType: "Bearer",
      expiresIn: 3600,
    });
  } catch (error) {
    return res.status(401).json({ message: "유효하지 않은 refreshToken입니다." });
  }
});

export default router;