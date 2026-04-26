import express from "express";

import { getMe, getUsers, signupUser, updateMyProfile } from "../controllers/userController.js";
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
 * /users/me:
 *   get:
 *     summary: 로그인 사용자 정보 조회
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: number
 *                 name:
 *                   type: string
 *                 email:
 *                   type: string
 *                 nickname:
 *                   type: string
 *                 profileImageUrl:
 *                   type: string
 *                   nullable: true
 *       401:
 *         description: 인증 토큰이 없거나 유효하지 않음
 *       404:
 *         description: 사용자 정보를 찾을 수 없음
 *       500:
 *         description: 서버 내부 오류
 */
router.get("/me", verifyToken, getMe);

/**
 * @swagger
 * /users/profile:
 *   patch:
 *     summary: 로그인 사용자 정보 수정
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               nickname:
 *                 type: string
 *     responses:
 *       200:
 *         description: 수정 성공
 *       400:
 *         description: 요청 데이터 형식 오류
 *       401:
 *         description: 인증 토큰이 없거나 유효하지 않음
 *       409:
 *         description: 이미 존재하는 닉네임
 *       500:
 *         description: 서버 내부 오류
 */
router.patch("/profile", verifyToken, updateMyProfile);

/**
 * @swagger
 * /users/signup:
 *   post:
 *     summary: 신규 유저 회원가입
 *     description: 지갑 로그인 후 JWT를 이용해 추가 회원가입을 진행합니다.
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