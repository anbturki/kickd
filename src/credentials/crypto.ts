import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-cbc";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 16;

function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return scryptSync(masterKey, salt, KEY_LENGTH);
}

function getMasterKey(): string {
  const key = process.env.KICKD_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "KICKD_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32"
    );
  }
  return key;
}

export interface EncryptedBlob {
  algorithm: string;
  ciphertext: string;
  iv: string;
  salt: string;
  version: number;
}

export function encrypt(plaintext: string): EncryptedBlob {
  const masterKey = getMasterKey();
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(masterKey, salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  let ciphertext = cipher.update(plaintext, "utf8", "hex");
  ciphertext += cipher.final("hex");

  return {
    algorithm: ALGORITHM,
    ciphertext,
    iv: iv.toString("hex"),
    salt: salt.toString("hex"),
    version: 1,
  };
}

export function decrypt(blob: EncryptedBlob): string {
  const masterKey = getMasterKey();
  const salt = Buffer.from(blob.salt, "hex");
  const iv = Buffer.from(blob.iv, "hex");
  const key = deriveKey(masterKey, salt);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  let plaintext = decipher.update(blob.ciphertext, "hex", "utf8");
  plaintext += decipher.final("utf8");

  return plaintext;
}

export function encryptFields(
  data: Record<string, unknown>,
  sensitiveFields: string[]
): { encrypted: Record<string, unknown>; blob: EncryptedBlob | null } {
  const sensitiveData: Record<string, unknown> = {};
  const publicData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (sensitiveFields.includes(key)) {
      sensitiveData[key] = value;
    } else {
      publicData[key] = value;
    }
  }

  if (Object.keys(sensitiveData).length === 0) {
    return { encrypted: publicData, blob: null };
  }

  const blob = encrypt(JSON.stringify(sensitiveData));
  return { encrypted: publicData, blob };
}

export function decryptFields(
  publicData: Record<string, unknown>,
  blob: EncryptedBlob | null
): Record<string, unknown> {
  if (!blob) return { ...publicData };

  const sensitiveData = JSON.parse(decrypt(blob));
  return { ...publicData, ...sensitiveData };
}

export function hasEncryptionKey(): boolean {
  return !!process.env.KICKD_ENCRYPTION_KEY;
}
