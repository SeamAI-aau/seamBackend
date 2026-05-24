/** Minimum password length for register, reset, and change-password flows. */
export const PASSWORD_MIN_LENGTH = 8;

/** At least one lowercase, one uppercase, and one digit. */
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

export const PASSWORD_PATTERN_MESSAGE =
  'Password must be at least 8 characters and include uppercase, lowercase, and a number.';
