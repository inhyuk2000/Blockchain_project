import express from "express";

import { getUsers, signupUser } from "../controllers/userController.js";
import { verifyToken } from "../middlewares/authMiddleware.js";

const router = express.Router();

/**
 * @swagger
 * /users:
 *   get:
 *     summary: 유저 목록 조회
 *     responses:
 *       200:
 *         description: 성공
 */
router.get("/", getUsers);

/**
 * @swagger
 * /users/signup:
 *   post:
 *     summary: 신규 유저 회원가입
 *     description: 구글 로그인 후 JWT를 이용해 추가 회원가입을 진행합니다.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, nickname]
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               nickname:
 *                 type: string
 *     responses:
 *       201:
 *         description: 회원가입 성공
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 로그인 필요
 *       409:
 *         description: 이메일 또는 닉네임 중복
 */
router.post("/signup", verifyToken, signupUser);

export default router;