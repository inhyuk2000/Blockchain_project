import express from "express";
import { verifyToken } from "../middlewares/authMiddleware.js";
import { createPaidOrder } from "../data/orderStore.js";

const router = express.Router();

router.post("/", verifyToken, (req, res) => {
  try {
    const buyerUserId = req.user?.id;
    if (!buyerUserId || !Number.isInteger(Number(buyerUserId))) {
      return res.status(401).json({ message: "인증이 필요합니다." });
    }

    const body = req.body ?? {};
    const imageIdRaw = body.imageId;
    const paymentMethod = typeof body.paymentMethod === "string" ? body.paymentMethod.trim() : "";

    const imageId =
      typeof imageIdRaw === "number" && Number.isInteger(imageIdRaw)
        ? imageIdRaw
        : typeof imageIdRaw === "string" && imageIdRaw.trim() !== ""
          ? Number.parseInt(imageIdRaw.trim(), 10)
          : NaN;

    if (!Number.isInteger(imageId) || imageId < 1) {
      return res.status(400).json({ message: "imageId는 필수입니다." });
    }
    if (!paymentMethod) {
      return res.status(400).json({ message: "paymentMethod는 필수입니다." });
    }

    const result = createPaidOrder({
      buyerUserId: Number(buyerUserId),
      imageId,
      paymentMethod,
    });

    if (result.error === "NOT_FOUND") {
      return res.status(404).json({ message: "해당 이미지를 찾을 수 없습니다." });
    }
    if (result.error === "SOLD") {
      return res.status(409).json({ message: "이미 구매된 이미지입니다." });
    }
    if (result.error === "SELF") {
      return res.status(400).json({ message: "본인이 등록한 이미지는 구매할 수 없습니다." });
    }

    return res.status(201).json({
      orderId: result.orderId,
      imageId: result.imageId,
      price: result.price,
      orderStatus: result.orderStatus,
      purchasedAt: result.purchasedAt,
    });
  } catch (error) {
    console.error("[POST /orders]", error);
    return res.status(500).json({ message: "서버 오류 또는 결제 처리에 실패했습니다." });
  }
});

export default router;
