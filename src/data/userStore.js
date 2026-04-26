const users = [];
let sequence = 1;

export const getAllUsers = () => users;

export const findUserByEmail = (email) => users.find((user) => user.email === email);

export const findUserByGoogleId = (googleId) =>
  users.find((user) => user.googleId && user.googleId === googleId);

export const findUserByWalletAddress = (walletAddress) =>
  users.find(
    (user) =>
      user.walletAddress && user.walletAddress.toLowerCase() === walletAddress.toLowerCase()
  );

export const findUserById = (id) => users.find((user) => user.id === id);

export const createUser = ({
  name,
  email,
  nickname,
  googleId = null,
  walletAddress = null,
  profileImageUrl = null,
}) => {
  const newUser = {
    id: sequence++,
    name,
    email,
    nickname,
    googleId,
    walletAddress,
    profileImageUrl,
  };

  users.push(newUser);
  return newUser;
};

export const updateUserById = (id, updates) => {
  const user = findUserById(id);
  if (!user) {
    return null;
  }

  if (typeof updates.name === "string") {
    user.name = updates.name;
  }

  if (typeof updates.nickname === "string") {
    user.nickname = updates.nickname;
  }

  return user;
};
