import crypto from "crypto";
import fs from "fs";
import path from "path";
import express from "express";
import multer from "multer";
import {
  createImage,
  deleteImageById,
  getImageById,
  listDistinctImageCategories,
  listImagesPaged,
  searchImagesPaged,
  SORT_MODES,
  toIso8601UtcZ,
} from "../data/imageStore.js";
import { FavoriteConflictError, addImageFavorite, removeImageFavorite } from "../data/favoriteStore.js";
import { insertDownloadToken } from "../data/downloadTokenStore.js";
import {
  findFirstOrderIdForBuyerAndImage,
  getOrderById,
} from "../data/orderStore.js";
import { upsertWatermarkedDeliveryHash } from "../data/watermarkDeliveryStore.js";
import { findUserByEmail, findUserByGoogleId, findUserById, findUserByWalletAddress } from "../data/userStore.js";
import { writeWatermarkedCopy } from "../services/watermarkService.js";
import { optionalVerifyToken, verifyToken } from "../middlewares/authMiddleware.js";

const router = express.Router();

const normalize0xHex = (raw) => {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.startsWith("0x") ? s.toLowerCase() : `0x${s}`.toLowerCase();
};

const isValidEthereumTxHash = (raw) =>
  /^0x[a-fA-F0-9]{64}$/.test(String(raw ?? "").trim());

const digestImageBufferToHash = (buffer) =>
  `0x${crypto.createHash("sha256").update(buffer).digest("hex")}`;

const uploadsDir = path.resolve(process.cwd(), "uploads");
const privateDownloadsDir = path.resolve(process.cwd(), "data", "downloads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(privateDownloadsDir)) {
  fs.mkdirSync(privateDownloadsDir, { recursive: true });
}

const watermarkDownloadTtlMs = () => {
  const m = Number.parseInt(process.env.WATERMARK_DOWNLOAD_TTL_MINUTES ?? "10", 10);
  return Number.isInteger(m) && m >= 1 && m <= 1440 ? m * 60 * 1000 : 10 * 60 * 1000;
};

const WATERMARK_POSITION = "bottom-right";

function resolveUploadAbsolute(webPath) {
  const rel = String(webPath ?? "").replace(/^\/+/, "");
  if (!rel || rel.includes("..")) return null;
  const abs = path.resolve(process.cwd(), rel);
  if (!abs.startsWith(uploadsDir)) return null;
  return abs;
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

router.get("/categories", optionalVerifyToken, (req, res) => {
  try {
    const categories = listDistinctImageCategories();
    return res.status(200).json(categories);
  } catch (error) {
    console.error("[GET /images/categories]", error);
    return res.status(500).json({ message: "서버 내부 오류가 발생했습니다." });
  }
});

router.get("/search", optionalVerifyToken, (req, res) => {
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

router.get("/", optionalVerifyToken, (req, res) => {
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

const verificationContractAddress = () =>
  String(process.env.IMAGE_AUTHENTICATOR_CONTRACT ?? process.env.CONTRACT_ADDRESS ?? "").trim() ||
  "0x6154ab54f64106e00C715EBfC7cE6ce8C5dfF9CB";

router.post("/:imageId/download", verifyToken, async (req, res) => {
  try {
    const imageId = parseImageIdParam(req.params.imageId);
    if (imageId === null) {
      return res.status(400).json({ message: "잘못된 imageId입니다." });
    }

    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ message: "인증이 필요합니다." });
    }

    const body = req.body ?? {};
    const orderIdRaw = body.orderId;
    const orderIdNum =
      typeof orderIdRaw === "number" && Number.isInteger(orderIdRaw)
        ? orderIdRaw
        : typeof orderIdRaw === "string" && orderIdRaw.trim() !== ""
          ? Number.parseInt(orderIdRaw.trim(), 10)
          : NaN;

    if (!Number.isInteger(orderIdNum) || orderIdNum < 1) {
      return res.status(400).json({ message: "orderId는 필수입니다." });
    }

    const image = getImageById(imageId);
    if (!image) {
      return res.status(404).json({ message: "이미지를 찾을 수 없습니다." });
    }

    const order = getOrderById(orderIdNum);
    if (!order) {
      return res.status(404).json({ message: "주문을 찾을 수 없습니다." });
    }

    if (order.buyerUserId !== currentUser.id) {
      return res.status(403).json({ message: "구매한 사용자만 다운로드할 수 있습니다." });
    }

    if (order.imageId !== imageId) {
      return res.status(403).json({ message: "해당 리소스에 대한 권한이 없습니다." });
    }

    const srcAbs = resolveUploadAbsolute(image.imageUrl);
    if (!srcAbs || !fs.existsSync(srcAbs)) {
      return res.status(404).json({ message: "이미지를 찾을 수 없습니다." });
    }

    const token = crypto.randomBytes(24).toString("hex");
    const relPath = path.posix.join("data", "downloads", `wm-${token}.png`);
    const destAbs = path.resolve(process.cwd(), "data", "downloads", `wm-${token}.png`);

    const nickname =
      (currentUser.nickname && String(currentUser.nickname).trim()) ||
      (currentUser.name && String(currentUser.name).trim()) ||
      `user_${currentUser.id}`;
    const watermarkText = `Purchased by ${nickname}`;

    await writeWatermarkedCopy(srcAbs, destAbs, watermarkText);

    const wmBuf = fs.readFileSync(destAbs);
    const deliveredHash = normalize0xHex(digestImageBufferToHash(wmBuf));
    upsertWatermarkedDeliveryHash({
      contentHash: deliveredHash,
      imageId,
      orderId: orderIdNum,
    });

    const expiresAt = new Date(Date.now() + watermarkDownloadTtlMs()).toISOString();
    insertDownloadToken({ token, filePathRelative: relPath, expiresAtIso: expiresAt });

    const hostBase = `${req.protocol}://${req.get("host")}`;
    const downloadUrl = `${hostBase}/downloads/${token}`;

    return res.status(200).json({
      downloadUrl,
      expiresAt,
      watermark: {
        applied: true,
        text: watermarkText,
        position: WATERMARK_POSITION,
      },
    });
  } catch (error) {
    console.error("[POST /images/:imageId/download]", error);
    return res.status(500).json({ message: "워터마크 적용 또는 다운로드 URL 생성에 실패했습니다." });
  }
});

router.get("/:imageId/verification", verifyToken, (req, res) => {
  try {
    const imageId = parseImageIdParam(req.params.imageId);
    if (imageId === null) {
      return res.status(400).json({ message: "잘못된 imageId입니다." });
    }

    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ message: "인증이 필요합니다." });
    }

    const image = getImageById(imageId);
    if (!image) {
      return res.status(404).json({ message: "이미지를 찾을 수 없습니다." });
    }

    const registeredRaw = image.capturedAt || image.createdAt || "";
    const registeredAt = toIso8601UtcZ(registeredRaw) || "";

    return res.status(200).json({
      imageId: image.id,
      verificationStatus: image.verificationStatus,
      imageHash: image.imageHash,
      txHash: image.txHash,
      blockNumber: image.blockNumber ?? 0,
      contractAddress: verificationContractAddress(),
      registeredAt,
    });
  } catch (error) {
    console.error("[GET /images/:imageId/verification]", error);
    return res.status(500).json({ message: "서버 내부 오류가 발생했습니다." });
  }
});

router.get("/:imageId", verifyToken, (req, res) => {
  try {
    const imageId = parseImageIdParam(req.params.imageId);
    if (imageId === null) {
      return res.status(400).json({ message: "잘못된 imageId입니다." });
    }

    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ message: "인증이 필요합니다." });
    }

    const image = getImageById(imageId);
    if (!image) {
      return res.status(404).json({ message: "이미지를 찾을 수 없습니다." });
    }

    const seller = findUserById(image.userId);
    const nickname =
      (seller?.nickname && String(seller.nickname).trim()) ||
      (seller?.name && String(seller.name).trim()) ||
      `user_${image.userId}`;

    const verificationTimestamp = image.capturedAt || image.createdAt || "";

    const purchasedOrderId =
      currentUser.id !== image.userId
        ? findFirstOrderIdForBuyerAndImage(currentUser.id, image.id)
        : null;

    return res.status(200).json({
      id: image.id,
      title: image.title,
      description: image.description ?? "",
      imageUrl: image.imageUrl,
      thumbnailUrl: image.thumbnailUrl,
      price: image.price,
      category: image.category,
      seller: {
        id: seller?.id ?? image.userId,
        nickname,
      },
      verification: {
        status: image.verificationStatus,
        imageHash: image.imageHash,
        timestamp: verificationTimestamp,
        deviceId: image.deviceId ?? "",
        txHash: image.txHash,
        blockNumber: image.blockNumber ?? 0,
      },
      isOwner: currentUser.id === image.userId,
      isSold: image.isSold,
      purchasedOrderId,
    });
  } catch (error) {
    console.error("[GET /images/:imageId]", error);
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
    return res.status(401).json({ message: "인증이 필요합니다." });
  }

  const image = getImageById(imageId);
  if (!image) {
    return res.status(404).json({ message: "이미지를 찾을 수 없습니다." });
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

router.delete("/:imageId/favorite", verifyToken, (req, res) => {
  const imageId = parseImageIdParam(req.params.imageId);
  if (imageId === null) {
    return res.status(400).json({ message: "잘못된 imageId입니다." });
  }

  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ message: "인증이 필요합니다." });
  }

  const image = getImageById(imageId);
  if (!image) {
    return res.status(404).json({ message: "이미지를 찾을 수 없습니다." });
  }

  try {
    const removed = removeImageFavorite(currentUser.id, imageId);
    if (!removed) {
      return res.status(404).json({ message: "찜한 이미지가 아닙니다." });
    }
    return res.status(204).send();
  } catch (error) {
    console.error("[DELETE /images/:imageId/favorite]", error);
    return res.status(500).json({ message: "서버 내부 오류" });
  }
});

router.delete("/:imageId", verifyToken, (req, res) => {
  const imageId = parseImageIdParam(req.params.imageId);
  if (imageId === null) {
    return res.status(400).json({ message: "잘못된 imageId입니다." });
  }

  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ message: "인증이 필요합니다." });
  }

  const image = getImageById(imageId);
  if (!image) {
    return res.status(404).json({ message: "이미지를 찾을 수 없습니다." });
  }

  if (currentUser.id !== image.userId) {
    return res.status(403).json({ message: "해당 리소스에 대한 권한이 없습니다." });
  }

  try {
    deleteImageById(imageId);
    return res.status(204).send();
  } catch (error) {
    console.error("[DELETE /images/:imageId]", error);
    return res.status(500).json({ message: "서버 내부 오류가 발생했습니다." });
  }
});

router.post("/", verifyToken, upload.single("image"), (req, res) => {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ message: "인증이 필요합니다." });
    }

    const {
      title,
      description,
      price,
      category,
      deviceId,
      capturedAt,
      imageHash: clientImageHash,
      txHash,
      verificationStatus: clientVerificationStatus,
      blockNumber: clientBlockNumber,
    } = req.body ?? {};
    if (!req.file) {
      return res.status(400).json({ message: "image 파일은 필수입니다." });
    }
    if (!title || !price || !category) {
      return res.status(400).json({ message: "title, price, category는 필수입니다." });
    }

    if (clientImageHash === undefined || clientImageHash === null || String(clientImageHash).trim() === "") {
      return res.status(400).json({ message: "imageHash는 필수입니다." });
    }
    if (txHash === undefined || txHash === null || String(txHash).trim() === "") {
      return res.status(400).json({ message: "txHash는 필수입니다." });
    }
    if (!isValidEthereumTxHash(txHash)) {
      return res.status(400).json({ message: "txHash 형식이 올바르지 않습니다." });
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

    const computedHash = digestImageBufferToHash(req.file.buffer);
    const normalizedClientHash = normalize0xHex(clientImageHash);
    if (normalizedClientHash !== computedHash) {
      return res.status(400).json({ message: "imageHash가 업로드 파일 내용과 일치하지 않습니다." });
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

    const trimmedStatus =
      clientVerificationStatus !== undefined && clientVerificationStatus !== null
        ? String(clientVerificationStatus).trim()
        : "";
    const verificationStatus = trimmedStatus || "VERIFIED";

    let blockNumber = null;
    if (clientBlockNumber !== undefined && clientBlockNumber !== null && String(clientBlockNumber).trim() !== "") {
      const bn = Number.parseInt(String(clientBlockNumber).trim(), 10);
      if (!Number.isInteger(bn) || bn < 0) {
        return res.status(400).json({ message: "blockNumber는 0 이상의 정수여야 합니다." });
      }
      blockNumber = bn;
    }

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
      imageHash: computedHash,
      verificationStatus,
      txHash: String(txHash).trim(),
      blockNumber,
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
    });
  } catch (error) {
    console.error("[POST /images]", error);
    return res.status(500).json({ message: "이미지 등록 중 서버 오류가 발생했습니다." });
  }
});

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ message: "업로드 파일 크기 제한을 초과했습니다." });
  }
  return next(error);
});

export default router;
