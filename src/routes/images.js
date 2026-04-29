import crypto from "crypto";
import fs from "fs";
import path from "path";
import express from "express";
import multer from "multer";
import { createImage, getAllImages } from "../data/imageStore.js";
import { findUserByEmail, findUserByGoogleId, findUserById, findUserByWalletAddress } from "../data/userStore.js";
import { verifyToken } from "../middlewares/authMiddleware.js";
import { registerImageHashOnChain } from "../services/blockchainService.js";

const router = express.Router();

const uploadsDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const getCurrentUser = (req) =>
  (req.user?.id ? findUserById(req.user.id) : null) ??
  (req.user?.walletAddress ? findUserByWalletAddress(req.user.walletAddress) : null) ??
  (req.user?.googleId ? findUserByGoogleId(req.user.googleId) : null) ??
  (req.user?.email ? findUserByEmail(req.user.email) : null);

router.get("/", (req, res) => {
  return res.status(200).json({ images: getAllImages() });
});

router.post("/", verifyToken, upload.single("image"), async (req, res) => {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ message: "인증 토큰이 없거나 유효하지 않습니다." });
    }

    const { title, description, price, category, deviceId, capturedAt } = req.body ?? {};
    if (!req.file) {
      return res.status(400).json({ message: "image 파일은 필수입니다." });
    }
    if (!title || !price || !category) {
      return res.status(400).json({ message: "title, price, category는 필수입니다." });
    }

    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ message: "price는 0 이상의 숫자여야 합니다." });
    }

    if (capturedAt) {
      const parsed = new Date(capturedAt);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ message: "capturedAt은 ISO 8601 datetime 형식이어야 합니다." });
      }
    }

    const extension = path.extname(req.file.originalname || "").toLowerCase() || ".jpg";
    const baseName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
    const originalFilename = `${baseName}${extension}`;
    const thumbFilename = `${baseName}-thumb${extension}`;
    const originalPath = path.join(uploadsDir, originalFilename);
    const thumbPath = path.join(uploadsDir, thumbFilename);

    fs.writeFileSync(originalPath, req.file.buffer);
    // Prototype thumbnail: copy original until real thumbnail pipeline is added.
    fs.writeFileSync(thumbPath, req.file.buffer);

    const imageHash = `0x${crypto.createHash("sha256").update(req.file.buffer).digest("hex")}`;
    const chainResult = await registerImageHashOnChain({
      imageHash,
      price: Math.round(numericPrice),
      metadata: JSON.stringify({
        title: String(title),
        description: description ? String(description) : "",
        price: Math.round(numericPrice),
        category: String(category),
        deviceId: deviceId ? String(deviceId) : "",
        capturedAt: capturedAt ? new Date(capturedAt).toISOString() : "",
      }),
    });

    const created = createImage({
      userId: currentUser.id,
      title: String(title),
      description: description ? String(description) : null,
      price: Math.round(numericPrice),
      category: String(category),
      deviceId: deviceId ? String(deviceId) : null,
      capturedAt: capturedAt ? new Date(capturedAt).toISOString() : null,
      imageUrl: `/uploads/${originalFilename}`,
      thumbnailUrl: `/uploads/${thumbFilename}`,
      imageHash,
      verificationStatus: chainResult.verificationStatus,
      txHash: chainResult.txHash,
    });

    return res.status(201).json({
      id: created.id,
      title: created.title,
      imageUrl: created.imageUrl,
      thumbnailUrl: created.thumbnailUrl,
      price: created.price,
      imageHash: created.imageHash,
      verificationStatus: created.verificationStatus,
      txHash: created.txHash,
      createdAt: created.createdAt,
      chainEvent: chainResult.chainEvent,
    });
  } catch (error) {
    return res.status(500).json({ message: "이미지 등록 중 오류 또는 블록체인 등록 실패가 발생했습니다." });
  }
});

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ message: "업로드 파일 크기 제한을 초과했습니다." });
  }
  return next(error);
});

export default router;
