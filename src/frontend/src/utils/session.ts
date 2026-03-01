export interface Session {
  principal: string;
  phone: string; // primary display field (e.g. "+15550000000")
  email: string; // backward compat alias for phone@sc.app (used by backend)
  partnerPhone: string; // display field
  partnerEmail: string; // backward compat alias for partnerPhone@sc.app
  partnerPrincipal: string | null;
  name: string;
}

const SESSION_KEY = "securechat_session";

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    // Backward compat: old sessions only have email/partnerEmail
    if (!parsed.phone && parsed.email) {
      parsed.phone = parsed.email;
    }
    if (!parsed.partnerPhone && parsed.partnerEmail) {
      parsed.partnerPhone = parsed.partnerEmail;
    }
    return parsed as Session;
  } catch {
    return null;
  }
}

export function setSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export async function hashPassword(password: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Derives a deterministic password hash from a phone number (as email).
 * phoneAsEmail = normalized digits + "@sc.app"
 */
export async function hashPhonePassword(phoneAsEmail: string): Promise<string> {
  const input = `${phoneAsEmail}|securechat-otp-v1`;
  return hashPassword(input);
}

/**
 * Normalizes a phone number to digits-only + "@sc.app" format.
 * e.g. "+1 555 000 0000" => "15550000000@sc.app"
 */
export function phoneToEmail(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `${digits}@sc.app`;
}
