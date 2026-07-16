import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

function keyBytes(key: string): Buffer {
  const decoded = Buffer.from(key, "base64");
  if (decoded.length === 32) return decoded;
  return createHash("sha256").update(key).digest();
}

export function encryptSecret(plaintext: string, key: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(key), nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${nonce.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptSecret(payload: string, key: string): string {
  const [version, nonce, tag, ciphertext] = payload.split(".");
  if (version !== "v1" || !nonce || !tag || !ciphertext) throw new Error("Invalid ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(key), Buffer.from(nonce, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function tokenHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
