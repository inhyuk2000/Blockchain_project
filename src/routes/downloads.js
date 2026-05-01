import fs from "fs";
import path from "path";
import express from "express";
import { getDownloadTokenRow } from "../data/downloadTokenStore.js";

const router = express.Router();

router.get("/:token", (req, res) => {
  try {
    const row = getDownloadTokenRow(req.params.token);
    if (!row) {
      return res.status(404).json({ message: "다운로드 링크를 찾을 수 없습니다." });
    }
    const exp = new Date(row.expires_at);
    if (Number.isNaN(exp.getTime()) || exp.getTime() < Date.now()) {
      const abs = path.resolve(process.cwd(), row.file_path);
      fs.unlink(abs, () => {});
      return res.status(404).json({ message: "만료된 다운로드 링크입니다." });
    }

    const absPath = path.resolve(process.cwd(), row.file_path);
    if (!fs.existsSync(absPath)) {
      return res.status(404).json({ message: "파일을 찾을 수 없습니다." });
    }

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `attachment; filename="watermarked-${req.params.token.slice(0, 8)}.png"`);
    return res.sendFile(absPath);
  } catch (err) {
    console.error("[GET /downloads/:token]", err);
    return res.status(500).json({ message: "서버 오류가 발생했습니다." });
  }
});

export default router;
