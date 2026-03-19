import * as crypto from 'crypto';

const algorithm = 'aes-256-cbc';

export function encrypt(text: string, secret: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.createHash('sha256').update(secret).digest();

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);

  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string, secret: string): string {
  const [ivHex, encryptedHex] = text.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const encryptedText = Buffer.from(encryptedHex, 'hex');
  const key = crypto.createHash('sha256').update(secret).digest();

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);

  return decrypted.toString();
}
