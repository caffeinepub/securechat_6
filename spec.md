# SecureChat

## Current State
The app has email + password registration/login, pre-approved partner by email, AES-GCM encrypted chat, emoji support, typing indicator, read receipts, dark/light mode, and profile picture upload.

## Requested Changes (Diff)

### Add
- Mobile number entry screen as the only login method
- Simulated OTP flow: user enters phone number, backend generates a 6-digit OTP and returns it (simulated, no SMS), user enters the code to authenticate
- Session token stored in localStorage after successful OTP verification
- Pre-approved partner stored as a mobile number (set once on first login)

### Modify
- Replace all email/password registration and login flows with mobile-number + OTP flow
- Replace partner email field with partner mobile number field
- Identity derivation based on mobile number instead of email+password
- All user records use mobile number as the unique identifier

### Remove
- Email input fields
- Password input fields
- Sign up / Log in distinction (single flow: enter number -> verify OTP -> done)
- Any reference to email in the UI or backend

## Implementation Plan
1. Backend: rewrite user store to key on mobile number; add `requestOtp(phone)` which generates+stores a 6-digit OTP; add `verifyOtp(phone, code)` which checks the code, creates/retrieves the user, and returns a session token; update all auth checks to use session token; keep existing chat, message, typing, read-receipt logic intact but wire to phone-based identity
2. Frontend: replace auth screens with two-step flow (Step 1: enter mobile number, Step 2: enter 6-digit OTP); after verification show partner setup if first login (enter partner's mobile number); then go straight to chat UI; preserve all existing chat features (bubbles, emoji, timestamps, read receipts, typing indicator, dark/light mode)
