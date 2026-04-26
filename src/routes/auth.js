import express from "express";
import jwt from "jsonwebtoken";
import { verifyMessage, isAddress } from "ethers";
import { findUserByWalletAddress } from "../data/userStore.js";
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
  const { walletAddress } = req.body ?? {};
  if (typeof walletAddress !== "string" || !isAddress(walletAddress)) {
    return res.status(400).json({ message: "유효한 walletAddress가 필요합니다." });
  }

  const normalizedAddress = walletAddress.toLowerCase();
  const nonce = issueWalletNonce(normalizedAddress);
  const message = `Sign in to Blockchain App\nWallet: ${normalizedAddress}\nNonce: ${nonce}`;

  return res.status(200).json({
    walletAddress: normalizedAddress,
    nonce,
    message,
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
router.post("/wallet/verify", (req, res) => {
  try {
    const { walletAddress, signature } = req.body ?? {};
    if (
      typeof walletAddress !== "string" ||
      typeof signature !== "string" ||
      !isAddress(walletAddress)
    ) {
      return res.status(400).json({ message: "walletAddress와 signature를 확인해주세요." });
    }

    const normalizedAddress = walletAddress.toLowerCase();
    const nonce = consumeWalletNonce(normalizedAddress);
    if (!nonce) {
      return res.status(401).json({ message: "nonce가 없거나 만료되었습니다." });
    }

    const message = `Sign in to Blockchain App\nWallet: ${normalizedAddress}\nNonce: ${nonce}`;
    const recoveredAddress = verifyMessage(message, signature).toLowerCase();

    if (recoveredAddress !== normalizedAddress) {
      return res.status(401).json({ message: "지갑 서명 검증에 실패했습니다." });
    }

    const existingUser = findUserByWalletAddress(normalizedAddress);
    const payload = {
      id: existingUser?.id ?? null,
      walletAddress: normalizedAddress,
      email: existingUser?.email ?? null,
      name: existingUser?.name ?? null,
      isNewUser: !existingUser,
    };

    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });

    return res.status(200).json({
      message: "지갑 로그인 성공",
      accessToken,
      isNewUser: !existingUser,
      redirectTo: existingUser ? "/home" : "/users/signup",
    });
  } catch (error) {
    return res.status(500).json({ message: "지갑 로그인 처리 중 오류가 발생했습니다." });
  }
  }
);

export default router;