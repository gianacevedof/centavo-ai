export function getPasswordValidationError(password) {
  if (typeof password !== "string") return "Password must be a string.";
  if (password.length < 8) {
    return "Password must be at least 8 characters long.";
  }
  if (password.length > 128) {
    return "Password must not exceed 128 characters.";
  }
  return null;
}
