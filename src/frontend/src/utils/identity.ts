import { Ed25519KeyIdentity } from "@dfinity/identity";

const IDENTITY_KEY = "securechat_identity";

/**
 * Derives a deterministic 32-byte seed from email + passwordHash using HKDF.
 * This gives each user a unique Ed25519 identity (and thus a unique IC Principal)
 * without requiring Internet Identity login.
 */
export async function deriveIdentitySeed(
  email: string,
  passwordHash: string,
): Promise<Uint8Array> {
  const combined = `${email.toLowerCase()}|${passwordHash}|securechat-identity-v1`;
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(combined),
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("securechat-salt"),
      info: new TextEncoder().encode("ed25519-identity"),
    },
    keyMaterial,
    256, // 32 bytes
  );
  return new Uint8Array(bits);
}

/**
 * Creates and returns an Ed25519 identity derived from credentials.
 * Also persists the identity JSON to localStorage.
 */
export async function createAndStoreIdentity(
  email: string,
  passwordHash: string,
): Promise<Ed25519KeyIdentity> {
  const seed = await deriveIdentitySeed(email, passwordHash);
  const identity = Ed25519KeyIdentity.generate(seed);
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity.toJSON()));
  return identity;
}

/**
 * Loads the stored Ed25519 identity from localStorage, if any.
 */
export function loadStoredIdentity(): Ed25519KeyIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    return Ed25519KeyIdentity.fromJSON(raw);
  } catch {
    return null;
  }
}

/**
 * Clears the stored identity from localStorage.
 */
export function clearStoredIdentity(): void {
  localStorage.removeItem(IDENTITY_KEY);
}
