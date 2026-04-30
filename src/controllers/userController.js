import {
  createUser,
  findUserByEmail,
  findUserByGoogleId,
  findUserById,
  findUserByWalletAddress,
  getAllUsers,
  updateUserById,
} from "../data/userStore.js";
import { getFavoritedImageIds } from "../data/favoriteStore.js";

export const getUsers = (req, res) => {
  res.json({ users: getAllUsers() });
};

export const signupUser = (req, res) => {
  const { name, email, nickname } = req.body;

  if (!req.user) {
    return res.status(401).json({ message: "인증 토큰이 없거나 유효하지 않습니다." });
  }

  if (!name || !email || !nickname) {
    return res.status(400).json({ message: "name, email, nickname은 필수입니다." });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: "이메일 형식이 올바르지 않습니다." });
  }

  const currentUser =
    (req.user.id ? findUserById(req.user.id) : null) ??
    (req.user.walletAddress ? findUserByWalletAddress(req.user.walletAddress) : null) ??
    (req.user.googleId ? findUserByGoogleId(req.user.googleId) : null) ??
    (req.user.email ? findUserByEmail(req.user.email) : null);

  const existingEmail = findUserByEmail(email);
  if (existingEmail && existingEmail.id !== currentUser?.id) {
    return res.status(409).json({ message: "이미 존재하는 이메일입니다." });
  }

  const existingNickname = getAllUsers().find(
    (user) => user.nickname === nickname && user.id !== currentUser?.id
  );
  if (existingNickname) {
    return res.status(409).json({ message: "이미 존재하는 닉네임입니다." });
  }

  if (currentUser) {
    const updatedUser = updateUserById(currentUser.id, { name, email, nickname });
    return res.status(200).json(updatedUser);
  }

  const newUser = createUser({
    name,
    email,
    nickname,
    googleId: req.user.googleId ?? null,
    walletAddress: req.user.walletAddress ?? null,
    profileImageUrl: req.user.profileImageUrl ?? null,
  });

  return res.status(201).json(newUser);
};

export const getMe = (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "인증 토큰이 없거나 유효하지 않습니다." });
    }

    const user =
      (req.user.id ? findUserById(req.user.id) : null) ??
      (req.user.walletAddress ? findUserByWalletAddress(req.user.walletAddress) : null) ??
      (req.user.googleId ? findUserByGoogleId(req.user.googleId) : null) ??
      (req.user.email ? findUserByEmail(req.user.email) : null);

    if (!user) {
      return res.status(404).json({ message: "사용자 정보를 찾을 수 없습니다." });
    }

    return res.status(200).json({
      id: user.id,
      name: user.name,
      email: user.email,
      nickname: user.nickname,
      profileImageUrl: user.profileImageUrl ?? null,
    });
  } catch (error) {
    return res.status(500).json({ message: "서버 내부 오류가 발생했습니다." });
  }
};

export const getMyFavoriteImageIds = (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "인증 토큰이 없거나 유효하지 않습니다." });
    }

    const user =
      (req.user.id ? findUserById(req.user.id) : null) ??
      (req.user.walletAddress ? findUserByWalletAddress(req.user.walletAddress) : null) ??
      (req.user.googleId ? findUserByGoogleId(req.user.googleId) : null) ??
      (req.user.email ? findUserByEmail(req.user.email) : null);

    if (!user) {
      return res.status(404).json({ message: "사용자 정보를 찾을 수 없습니다." });
    }

    const imageIds = Array.from(getFavoritedImageIds(user.id)).sort((a, b) => a - b);
    return res.status(200).json({ imageIds });
  } catch (error) {
    return res.status(500).json({ message: "서버 내부 오류가 발생했습니다." });
  }
};

export const updateMyProfile = (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "인증 토큰이 없거나 유효하지 않습니다." });
    }

    const { name, nickname, email } = req.body ?? {};
    const hasName = name !== undefined;
    const hasNickname = nickname !== undefined;
    const hasEmail = email !== undefined;

    if (!hasName && !hasNickname && !hasEmail) {
      return res.status(400).json({ message: "name, nickname, email 중 하나는 필요합니다." });
    }

    if (
      (hasName && typeof name !== "string") ||
      (hasNickname && typeof nickname !== "string") ||
      (hasEmail && typeof email !== "string")
    ) {
      return res.status(400).json({ message: "name, nickname, email은 문자열이어야 합니다." });
    }

    const trimmedName = hasName ? name.trim() : undefined;
    const trimmedNickname = hasNickname ? nickname.trim() : undefined;
    const trimmedEmail = hasEmail ? email.trim().toLowerCase() : undefined;

    if ((hasName && !trimmedName) || (hasNickname && !trimmedNickname) || (hasEmail && !trimmedEmail)) {
      return res.status(400).json({ message: "name, nickname, email은 빈 문자열일 수 없습니다." });
    }

    if (hasEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        return res.status(400).json({ message: "이메일 형식이 올바르지 않습니다." });
      }
    }

    const currentUser =
      (req.user.id ? findUserById(req.user.id) : null) ??
      (req.user.walletAddress ? findUserByWalletAddress(req.user.walletAddress) : null) ??
      (req.user.googleId ? findUserByGoogleId(req.user.googleId) : null) ??
      (req.user.email ? findUserByEmail(req.user.email) : null);

    if (!currentUser) {
      return res.status(401).json({ message: "인증 토큰이 없거나 유효하지 않습니다." });
    }

    if (hasNickname) {
      const duplicatedNickname = getAllUsers().find(
        (user) => user.nickname === trimmedNickname && user.id !== currentUser.id
      );
      if (duplicatedNickname) {
        return res.status(409).json({ message: "이미 존재하는 닉네임입니다." });
      }
    }

    if (hasEmail) {
      const duplicatedEmail = getAllUsers().find(
        (user) => user.email?.toLowerCase() === trimmedEmail && user.id !== currentUser.id
      );
      if (duplicatedEmail) {
        return res.status(409).json({ message: "이미 존재하는 이메일입니다." });
      }
    }

    const updatedUser = updateUserById(currentUser.id, {
      ...(hasName ? { name: trimmedName } : {}),
      ...(hasNickname ? { nickname: trimmedNickname } : {}),
      ...(hasEmail ? { email: trimmedEmail } : {}),
    });

    if (!updatedUser) {
      return res.status(500).json({ message: "사용자 정보 수정 중 오류가 발생했습니다." });
    }

    return res.status(200).json({
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      nickname: updatedUser.nickname,
      profileImageUrl: updatedUser.profileImageUrl ?? null,
    });
  } catch (error) {
    return res.status(500).json({ message: "서버 내부 오류가 발생했습니다." });
  }
};