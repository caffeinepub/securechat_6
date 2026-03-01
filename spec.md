# SecureChat

## Current State
- Mobile number + simulated OTP login (code generated client-side, shown on screen, stored in localStorage)
- Three-step auth flow: enter phone → verify fake OTP → set partner number
- Backend stores email/passwordHash per user (phone number converted to email-style string)
- Ed25519 identity derived from phone + password hash to get a unique IC Principal
- AES-GCM end-to-end encrypted messages between one pre-approved partner
- Chat features: emoji, timestamps, read receipts, typing indicator, online/offline status

## Requested Changes (Diff)

### Add
- TOTP secret generation: when a user registers for the first time, generate a TOTP secret server-side and return it once for QR code display
- QR code display: show a `otpauth://` URI as a QR code so the user can scan it with Google Authenticator, Authy, or any TOTP app
- TOTP verification: replace the simulated OTP check with a real server-side TOTP code validation (RFC 6238, HMAC-SHA1, 6-digit, 30-second window, ±1 step tolerance)
- Backend: `generateTOTPSecret(phone)` returns a base32 TOTP secret (for new users only), `verifyTOTP(phone, code)` validates a 6-digit TOTP code

### Modify
- Auth flow: "phone → scan QR (first time only) → enter TOTP code → set partner" for new users; "phone → enter TOTP code" for returning users
- OTPAuthPage: remove simulated SMS banner; replace with QR code scan step for new users and direct code entry for existing users
- Backend UserProfile: replace `passwordHash` with `totpSecret` (base32 string); remove email/password fields not needed for TOTP login

### Remove
- Simulated OTP generation and localStorage storage of OTP codes
- SMS-related UI copy ("We'll send a verification code to your phone")
- hashPhonePassword utility (no longer needed)

## Implementation Plan
1. Update Motoko backend: add TOTP secret storage to UserProfile, implement HMAC-SHA1-based TOTP verification, add `generateTOTPSecret` and `verifyTOTP` endpoints
2. Update backend.d.ts to reflect new API (generateTOTPSecret, verifyTOTP, updated UserProfile without passwordHash)
3. Rewrite OTPAuthPage: 
   - Step 1: enter phone number
   - Step 2a (new user): show QR code + instructions to scan with authenticator app, then enter first code to confirm
   - Step 2b (returning user): enter 6-digit TOTP code directly
   - Step 3 (new user only): set partner phone number
4. Update identity derivation: use phone + totpSecret (from backend) instead of phone + passwordHash
5. Remove LoginPage and SignupPage if still referenced; ensure App.tsx uses only OTPAuthPage (TOTP variant)
6. Install qrcode package for QR code rendering in frontend
