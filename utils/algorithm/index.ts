import "dotenv/config";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY;

  if (!key) {
    throw new Error("Credential encryption key is missing");
  }

  const decodedKey = Buffer.from(key, "base64");

  if (decodedKey.length !== 32) {
    throw new Error("Encryption key must be 32 bytes");
  }

  return decodedKey;
}

export function encryptData(text: string): string {
  const key = getEncryptionKey();

  // Generate a unique 12-byte IV
  const iv = randomBytes(12);

  const cipher = createCipheriv(algorithm, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Store IV, authentication tag and ciphertext
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptData(encryptedData: string): string {
  const key = getEncryptionKey();

  const [ivString, authTagString, encryptedString] = encryptedData.split(":");

  if (!ivString || !authTagString || encryptedString === undefined) {
    throw new Error("Invalid encrypted data format");
  }

  const iv = Buffer.from(ivString, "base64");
  const authTag = Buffer.from(authTagString, "base64");
  const encrypted = Buffer.from(encryptedString, "base64");

  if (iv.length !== 12 || authTag.length !== 16) {
    throw new Error("Invalid encryption parameters");
  }

  const decipher = createDecipheriv(algorithm, key, iv);

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

// node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
