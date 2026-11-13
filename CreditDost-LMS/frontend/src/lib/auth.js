const TOKEN_KEY = "lms_token";
const USER_KEY = "lms_user";

export const setAuth = ({ token, user }) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const getAuth = () => {
  const token = localStorage.getItem(TOKEN_KEY);
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    user = null;
  }
  return { token, user };
};

export const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};
