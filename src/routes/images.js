import crypto from "crypto";
import fs from "fs";
import path from "path";
import express from "express";
import multer from "multer";
import {
  createImage,
  getImageById,
  listDistinctImageCategories,
  listImagesPaged,
  searchImagesPaged,
  SORT_MODES,
} from "../data/imageStore.js";
import { FavoriteConflictError, addImageFavorite, removeImageFavorite } from "../data/favoriteStore.js";
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

const parseImageIdParam = (raw) => {
  const imageId = Number.parseInt(raw, 10);
  if (!Number.isInteger(imageId) || imageId < 1) {
    return null;
  }
  return imageId;
};

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

router.get("/categories", verifyToken, (req, res) => {
  try {
    const categories = listDistinctImageCategories();
    return res.status(200).json(categories);
  } catch (error) {
    console.error("[GET /images/categories]", error);
    return res.status(500).json({ message: "서버 내부 오류가 발생했습니다." });
  }
});

router.get("/search", verifyToken, (req, res) => {
  try {
    const pageRaw = req.query.page ?? "0";
    const sizeRaw = req.query.size ?? String(DEFAULT_PAGE_SIZE);

    const pageNum = Number.parseInt(String(pageRaw), 10);
    const sizeNum = Number.parseInt(String(sizeRaw), 10);

    if (
      !Number.isInteger(pageNum) ||
      pageNum < 0 ||
      !Number.isInteger(sizeNum) ||
      sizeNum < 1 ||
      sizeNum > MAX_PAGE_SIZE
    ) {
      return res.status(400).json({ message: "잘못된 query parameter입니다." });
    }

    const keyword = req.query.keyword;
    const category = req.query.category;

    const items = searchImagesPaged({
      keyword,
      category,
      page: pageNum,
      pageSize: sizeNum,
    });
    return res.status(200).json(items);
  } catch (error) {
    console.error("[GET /images/search]", error);
    return res.status(500).json({ message: "서버 내부 오류가 발생했습니다." });
  }
});

router.get("/", verifyToken, (req, res) => {
  try {
    const pageRaw = req.query.page ?? "0";
    const sizeRaw = req.query.size ?? String(DEFAULT_PAGE_SIZE);
    const sortRaw = req.query.sort ?? "latest";

    const pageNum = Number.parseInt(String(pageRaw), 10);
    const sizeNum = Number.parseInt(String(sizeRaw), 10);
    const sortStr = String(sortRaw).trim().toLowerCase();

    if (
      !Number.isInteger(pageNum) ||
      pageNum < 0 ||
      !Number.isInteger(sizeNum) ||
      sizeNum < 1 ||
      sizeNum > MAX_PAGE_SIZE ||
      !SORT_MODES.includes(sortStr)
    ) {
      return res.status(400).json({ message: "잘못된 query parameter입니다." });
    }

    const items = listImagesPaged({ page: pageNum, pageSize: sizeNum, sort: sortStr });
    return res.status(200).json(items);
  } catch (error) {
    console.error("[GET /images]", error);
    return res.status(500).json({ message: "서버 내부 오류가 발생했습니다." });
  }
});

router.post("/:imageId/favorite", verifyToken, (req, res) => {
  const imageId = parseImageIdParam(req.params.imageId);
  if (imageId === null) {
    return res.status(400).json({ message: "잘못된 imageId입니다." });
  }

  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ message: "인증 토큰이 없거나 유효하지 않습니다." });
  }

  const image = getImageById(imageId);
  if (!image) {
    return res.status(404).json({ message: "해당 이미지를 찾을 수 없습니다." });
  }

  try {
    addImageFavorite(currentUser.id, imageId);
    return res.status(200).json({ imageId, favorited: true });
  } catch (error) {
    if (error instanceof FavoriteConflictError) {
      return res.status(409).json({ message: error.message });
    }
    console.error("[POST /images/:imageId/favorite]", error);
    return res.status(500).json({ message: "서버 내부 오류" });
  }
});

/** 스펙에 없음 — UI에서 찜 해제(하트 토글)용 */
router.delete("/:imageId/favorite", verifyToken, (req, res) => {
  const imageId = parseImageIdParam(req.params.imageId);
  if (imageId === null) {
    return res.status(400).json({ message: "잘못된 imageId입니다." });
  }

  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ message: "인증 토큰이 없거나 유효하지 않습니다." });
  }

  const image = getImageById(imageId);
  if (!image) {
    return res.status(404).json({ message: "해당 이미지를 찾을 수 없습니다." });
  }

  try {
    removeImageFavorite(currentUser.id, imageId);
    return res.status(200).json({ imageId, favorited: false });
  } catch (error) {
    console.error("[DELETE /images/:imageId/favorite]", error);
    return res.status(500).json({ message: "서버 내부 오류" });
  }
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
