import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

/**
 * Password hashing service for admin users.
 * Note: IptvLine passwords remain plain text for Xtream Codes API compatibility.
 */
export const passwordService = {
  /**
   * Hash a password using bcrypt
   */
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  },

  /**
   * Verify a password against a hash
   */
  async verify(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  },

  /**
   * Check if a string is already a bcrypt hash
   */
  isBcryptHash(str: string): boolean {
    // bcrypt hashes start with $2a$, $2b$, or $2y$ followed by cost factor
    return /^\$2[aby]\$\d{2}\$/.test(str);
  },

  /**
   * Verify password, supporting both legacy plain text and bcrypt hashes.
   * This allows gradual migration from plain text to hashed passwords.
   */
  async verifyWithLegacySupport(password: string, storedPassword: string): Promise<boolean> {
    if (this.isBcryptHash(storedPassword)) {
      return this.verify(password, storedPassword);
    }
    // Legacy plain text comparison (will be removed after migration)
    return password === storedPassword;
  },
};
