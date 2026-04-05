import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";

const router = express.Router();

/**
 * @swagger
 * /auth/oauth2/authorization/google:
 *   get:
 *     summary: 구글 소셜 로그인 시작
 *     responses:
 *       302:
 *         description: Google 로그인 페이지로 리다이렉트
 */
router.get(
  "/oauth2/authorization/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);

/**
 * @swagger
 * /auth/google/callback:
 *   get:
 *     summary: 구글 로그인 콜백
 *     responses:
 *       200:
 *         description: JWT 발급 성공
 */
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/login?error=google_auth_failed",
    session: false,
  }),
  (req, res) => {
    const token = jwt.sign(
      {
        googleId: req.user.googleId ?? null,
        email: req.user.email,
        name: req.user.name,
        isNewUser: req.user.isNewUser,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    return res.status(200).json({
      message: "구글 로그인 성공",
      accessToken: token,
      isNewUser: req.user.isNewUser,
      redirectTo: req.user.isNewUser ? "/users/signup" : "/home",
    });
  }
);

export default router;