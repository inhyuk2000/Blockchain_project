let users = [];
let sequence = 1;

export const getUsers = (req, res) => {
  res.json({ users });
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

  const existingEmail = users.find((user) => user.email === email);
  if (existingEmail) {
    return res.status(409).json({ message: "이미 존재하는 이메일입니다." });
  }

  const existingNickname = users.find((user) => user.nickname === nickname);
  if (existingNickname) {
    return res.status(409).json({ message: "이미 존재하는 닉네임입니다." });
  }

  const newUser = {
    id: sequence++,
    name,
    email,
    nickname,
    googleId: req.user.googleId ?? null,
  };

  users.push(newUser);

  return res.status(201).json(newUser);
};