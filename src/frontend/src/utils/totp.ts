/**
 * Pure Web Crypto TOTP implementation (RFC 6238)
 * No external dependencies -- uses browser SubtleCrypto API only.
 */

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Decode a base32 string to a Uint8Array */
function base32Decode(input: string): Uint8Array {
  const s = input.toUpperCase().replace(/=+$/, "");
  const bytes: number[] = [];
  let bits = 0;
  let bitCount = 0;

  for (const ch of s) {
    const val = BASE32_CHARS.indexOf(ch);
    if (val < 0) continue; // skip invalid chars (spaces, etc.)
    bits = (bits << 5) | val;
    bitCount += 5;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes.push((bits >> bitCount) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

/** Compute HMAC-SHA1 using SubtleCrypto */
async function hmacSha1(
  keyBytes: Uint8Array,
  message: Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    message.buffer as ArrayBuffer,
  );
  return new Uint8Array(sig);
}

/** Convert a 64-bit time step to an 8-byte big-endian buffer */
function timeStepToBuffer(step: number): Uint8Array {
  const buf = new Uint8Array(8);
  // step fits in 32 bits for decades to come; write as high 4 bytes = 0, low 4 bytes = step
  buf[4] = (step >>> 24) & 0xff;
  buf[5] = (step >>> 16) & 0xff;
  buf[6] = (step >>> 8) & 0xff;
  buf[7] = step & 0xff;
  return buf;
}

/** Compute a 6-digit TOTP code for a given secret and time step */
async function computeTOTP(
  secretBase32: string,
  step: number,
): Promise<string> {
  const key = base32Decode(secretBase32);
  const msg = timeStepToBuffer(step);
  const hmac = await hmacSha1(key, msg);

  // Dynamic truncation (RFC 4226)
  const offset = hmac[19] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = code % 1_000_000;
  return otp.toString().padStart(6, "0");
}

/**
 * Validate a 6-digit TOTP code against a base32 secret.
 * Allows ±1 time step (30s window) for clock drift tolerance.
 */
export async function validateTOTPCode(
  secretBase32: string,
  code: string,
): Promise<boolean> {
  const step = Math.floor(Date.now() / 1000 / 30);
  const [prev, curr, next] = await Promise.all([
    computeTOTP(secretBase32, step - 1),
    computeTOTP(secretBase32, step),
    computeTOTP(secretBase32, step + 1),
  ]);
  return code === prev || code === curr || code === next;
}

/**
 * Build an otpauth:// URI for QR code generation.
 */
export function buildOTPAuthURI(
  label: string,
  secret: string,
  issuer = "SecureChat",
): string {
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
