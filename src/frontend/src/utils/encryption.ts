// Derive a shared AES key from both user emails (sorted) + salt
export async function deriveSharedKey(
  email1: string,
  email2: string,
): Promise<CryptoKey> {
  const sorted = `${[email1, email2].sort().join("|")}|securechat-salt-v1`;
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sorted),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode("chat-salt"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptMessage(
  key: CryptoKey,
  plaintext: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptMessage(
  key: CryptoKey,
  ciphertext: string,
): Promise<string> {
  try {
    const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data,
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    // Return original if decryption fails (e.g., unencrypted legacy messages)
    return ciphertext;
  }
}
