import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, type Easing, motion } from "motion/react";
import QRCode from "qrcode";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { createActorWithConfig } from "../config";
import { invalidateDerivedActor } from "../hooks/useDerivedActor";
import {
  clearStoredIdentity,
  createAndStoreIdentity,
  loadStoredIdentity,
} from "../utils/identity";
import { phoneToEmail, setSession } from "../utils/session";
import { buildOTPAuthURI, validateTOTPCode } from "../utils/totp";

interface OTPAuthPageProps {
  onAuth: () => void;
}

// Steps for new user: phone → qr-setup → totp-verify → partner
// Steps for returning user: phone → totp-login
type Step = "phone" | "qr-setup" | "totp-verify" | "totp-login" | "partner";

const EASE_OUT: Easing = [0.25, 0.46, 0.45, 0.94];
const EASE_IN: Easing = "easeIn";

const slideVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 60 : -60,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.3, ease: EASE_OUT },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -60 : 60,
    opacity: 0,
    transition: { duration: 0.2, ease: EASE_IN },
  }),
};

// Compute steps list for step-indicator based on flow
function getSteps(isNewUser: boolean): Step[] {
  if (isNewUser) return ["phone", "qr-setup", "totp-verify", "partner"];
  return ["phone", "totp-login"];
}

// TOTP secret localStorage helpers
function storeTOTPSecret(phoneDigits: string, secret: string) {
  localStorage.setItem(`sc_totp_${phoneDigits}`, secret);
}

function loadTOTPSecret(phoneDigits: string): string | null {
  return localStorage.getItem(`sc_totp_${phoneDigits}`);
}

function getPhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function OTPAuthPage({ onAuth }: OTPAuthPageProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("phone");
  const [direction, setDirection] = useState(1);
  const [isNewUser, setIsNewUser] = useState(true);

  // Phone step
  const [phone, setPhone] = useState("");

  // TOTP setup
  const [totpSecret, setTotpSecret] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");

  // OTP digit input
  const [otpCode, setOtpCode] = useState<string[]>(["", "", "", "", "", ""]);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Partner step
  const [partnerPhone, setPartnerPhone] = useState("");

  const [isLoading, setIsLoading] = useState(false);

  const otpComplete = otpCode.join("").length === 6;

  // Focus first OTP input when relevant steps become active
  useEffect(() => {
    if (step === "totp-verify" || step === "totp-login") {
      setTimeout(() => otpRefs.current[0]?.focus(), 120);
    }
  }, [step]);

  const goToStep = useCallback((next: Step, dir: number) => {
    setDirection(dir);
    setStep(next);
  }, []);

  // ── Step 1: Phone number ──────────────────────────────────────────────────
  const handleSubmitPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = phone.trim();
    if (!trimmed) {
      toast.error("Please enter your mobile number");
      return;
    }
    const digits = getPhoneDigits(trimmed);
    if (digits.length < 6) {
      toast.error("Please enter a valid mobile number");
      return;
    }

    setIsLoading(true);
    try {
      const phoneAsEmail = phoneToEmail(trimmed);

      // Check if user already has a stored TOTP secret (returning user)
      const storedSecret = loadTOTPSecret(digits);

      if (storedSecret) {
        // Returning user: derive their identity using the stored secret
        await createAndStoreIdentity(phoneAsEmail, storedSecret);
        invalidateDerivedActor(queryClient);
        setTotpSecret(storedSecret);
        setIsNewUser(false);
        setOtpCode(["", "", "", "", "", ""]);
        goToStep("totp-login", 1);
      } else {
        // Possibly new user — create anonymous actor to call generateTOTPSecret
        const anonActor = await createActorWithConfig();
        const secret = await anonActor.generateTOTPSecret(phoneAsEmail);

        // Derive real identity using the secret
        await createAndStoreIdentity(phoneAsEmail, secret);
        invalidateDerivedActor(queryClient);

        // Generate QR code
        const uri = buildOTPAuthURI(phoneAsEmail, secret);
        const dataUrl = await QRCode.toDataURL(uri, {
          width: 240,
          margin: 2,
          color: { dark: "#0f172a", light: "#ffffff" },
        });

        setTotpSecret(secret);
        setQrDataUrl(dataUrl);
        setIsNewUser(true);
        setOtpCode(["", "", "", "", "", ""]);
        goToStep("qr-setup", 1);
      }
    } catch (err) {
      console.error("Phone submit error:", err);
      toast.error("Something went wrong. Please try again.");
      clearStoredIdentity();
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step 2 (new): QR scanned — proceed to verify ─────────────────────────
  const handleScanned = () => {
    setOtpCode(["", "", "", "", "", ""]);
    goToStep("totp-verify", 1);
  };

  // ── Step 3 (new): Verify TOTP code after setup ───────────────────────────
  const handleVerifySetup = useCallback(async () => {
    const entered = otpCode.join("");
    if (entered.length < 6) {
      toast.error("Please enter all 6 digits");
      return;
    }

    // Client-side validation first
    if (!(await validateTOTPCode(totpSecret, entered))) {
      toast.error("Invalid code. Check your authenticator app and try again.");
      setOtpCode(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
      return;
    }

    setIsLoading(true);
    try {
      const phoneAsEmail = phoneToEmail(phone.trim());
      const identity = loadStoredIdentity()!;
      const actor = await createActorWithConfig({ agentOptions: { identity } });

      // Server-side verification
      const serverValid = await actor.verifyTOTP(phoneAsEmail, entered);
      if (!serverValid) {
        toast.error("Code rejected by server. Please try again.");
        setOtpCode(["", "", "", "", "", ""]);
        otpRefs.current[0]?.focus();
        setIsLoading(false);
        return;
      }

      // Register the user (new user path)
      try {
        await actor.register({
          name: phone.trim(),
          email: phoneAsEmail,
          partnerEmail: "",
          passwordHash: totpSecret,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // If already registered (race condition), continue anyway
        if (!msg.toLowerCase().includes("already")) {
          throw err;
        }
      }

      // Log in
      const loginOk = await actor.login({
        email: phoneAsEmail,
        passwordHash: totpSecret,
      });

      if (!loginOk) {
        toast.error("Login failed after registration. Please try again.");
        clearStoredIdentity();
        setIsLoading(false);
        return;
      }

      // Store TOTP secret for future logins
      const digits = getPhoneDigits(phone.trim());
      storeTOTPSecret(digits, totpSecret);

      await actor.updateOnlineStatus(true);
      const profile = await actor.getOwnProfile();
      const principal = identity.getPrincipal().toText();

      setSession({
        principal,
        phone: phone.trim(),
        email: phoneAsEmail,
        partnerPhone: "",
        partnerEmail: "",
        partnerPrincipal: null,
        name: profile.name || phone.trim(),
      });

      setIsLoading(false);
      goToStep("partner", 1);
    } catch (err) {
      console.error("TOTP verify error:", err);
      toast.error("Something went wrong. Please try again.");
      clearStoredIdentity();
      setIsLoading(false);
    }
  }, [otpCode, totpSecret, phone, goToStep]);

  // ── Step 2 (returning): Verify TOTP login ────────────────────────────────
  const handleVerifyLogin = useCallback(async () => {
    const entered = otpCode.join("");
    if (entered.length < 6) {
      toast.error("Please enter all 6 digits");
      return;
    }

    // Client-side validation first
    if (!(await validateTOTPCode(totpSecret, entered))) {
      toast.error("Invalid code. Check your authenticator app and try again.");
      setOtpCode(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
      return;
    }

    setIsLoading(true);
    try {
      const phoneAsEmail = phoneToEmail(phone.trim());
      const identity = loadStoredIdentity()!;
      const actor = await createActorWithConfig({ agentOptions: { identity } });

      // Server-side TOTP check
      const serverValid = await actor.verifyTOTP(phoneAsEmail, entered);
      if (!serverValid) {
        toast.error("Code rejected. Please try again.");
        setOtpCode(["", "", "", "", "", ""]);
        otpRefs.current[0]?.focus();
        setIsLoading(false);
        return;
      }

      const loginOk = await actor.login({
        email: phoneAsEmail,
        passwordHash: totpSecret,
      });

      if (!loginOk) {
        toast.error("Login failed. Please try again.");
        clearStoredIdentity();
        setIsLoading(false);
        return;
      }

      await actor.updateOnlineStatus(true);
      const profile = await actor.getOwnProfile();
      const principal = identity.getPrincipal().toText();

      const partnerEmailFromProfile = profile.partnerEmail ?? "";
      const partnerPhoneDisplay = partnerEmailFromProfile.endsWith("@sc.app")
        ? `+${partnerEmailFromProfile.replace("@sc.app", "")}`
        : partnerEmailFromProfile;

      setSession({
        principal,
        phone: phone.trim(),
        email: phoneAsEmail,
        partnerPhone: partnerPhoneDisplay,
        partnerEmail: partnerEmailFromProfile,
        partnerPrincipal: profile.partnerId?.toString() ?? null,
        name: profile.name || phone.trim(),
      });

      const hasPartner =
        partnerEmailFromProfile && partnerEmailFromProfile !== "";

      if (!hasPartner) {
        setIsLoading(false);
        goToStep("partner", 1);
      } else {
        toast.success("Welcome back!");
        onAuth();
      }
    } catch (err) {
      console.error("Login error:", err);
      toast.error("Something went wrong. Please try again.");
      clearStoredIdentity();
      setIsLoading(false);
    }
  }, [otpCode, totpSecret, phone, goToStep, onAuth]);

  // Auto-submit when all 6 digits are filled
  useEffect(() => {
    if (otpComplete && !isLoading) {
      if (step === "totp-verify") handleVerifySetup();
      else if (step === "totp-login") handleVerifyLogin();
    }
  }, [otpComplete, isLoading, step, handleVerifySetup, handleVerifyLogin]);

  // ── Step 4: Set partner phone ─────────────────────────────────────────────
  const handleSetPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = partnerPhone.trim();
    if (!trimmed) {
      toast.error("Please enter your partner's mobile number");
      return;
    }
    const digits = getPhoneDigits(trimmed);
    if (digits.length < 6) {
      toast.error("Please enter a valid mobile number");
      return;
    }

    const myPhone = phone.trim();
    if (
      trimmed === myPhone ||
      getPhoneDigits(trimmed) === getPhoneDigits(myPhone)
    ) {
      toast.error("Partner number must be different from yours");
      return;
    }

    setIsLoading(true);
    try {
      const identity = loadStoredIdentity()!;
      const actor = await createActorWithConfig({ agentOptions: { identity } });

      const profile = await actor.getOwnProfile();
      const partnerEmail = phoneToEmail(trimmed);

      await actor.saveCallerUserProfile({ ...profile, partnerEmail });

      const phoneAsEmail = phoneToEmail(myPhone);
      const principal = identity.getPrincipal().toText();
      const refreshedProfile = await actor.getOwnProfile();

      setSession({
        principal,
        phone: myPhone,
        email: phoneAsEmail,
        partnerPhone: trimmed,
        partnerEmail,
        partnerPrincipal: refreshedProfile.partnerId?.toString() ?? null,
        name: refreshedProfile.name || myPhone,
      });

      toast.success("All set! You're connected.");
      onAuth();
    } catch (err) {
      console.error("Partner save error:", err);
      toast.error("Failed to save partner number. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── OTP digit input handlers ──────────────────────────────────────────────
  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otpCode];
    next[index] = digit;
    setOtpCode(next);
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (
    index: number,
    e: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace") {
      if (otpCode[index]) {
        const next = [...otpCode];
        next[index] = "";
        setOtpCode(next);
      } else if (index > 0) {
        otpRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      otpRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (pasted.length === 6) {
      setOtpCode(pasted.split(""));
    }
  };

  // ── Digit boxes shared component ─────────────────────────────────────────
  const DigitBoxes = () => (
    <fieldset
      className="flex gap-2 justify-center mb-6 border-0 p-0 m-0"
      aria-label="6-digit authentication code"
    >
      {otpCode.map((digit, i) => (
        <input
          // biome-ignore lint/suspicious/noArrayIndexKey: positional
          key={i}
          ref={(el) => {
            otpRefs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={digit}
          onChange={(e) => handleOtpChange(i, e.target.value)}
          onKeyDown={(e) => handleOtpKeyDown(i, e)}
          onPaste={i === 0 ? handleOtpPaste : undefined}
          onFocus={(e) => e.target.select()}
          className={[
            "w-12 h-14 text-center text-xl font-bold font-ui rounded-xl border-2 bg-background text-foreground",
            "focus:outline-none focus:ring-0 transition-colors",
            digit
              ? "border-primary"
              : "border-border hover:border-muted-foreground/50",
            "disabled:opacity-50",
          ].join(" ")}
          disabled={isLoading}
          aria-label={`Digit ${i + 1}`}
          autoComplete="one-time-code"
        />
      ))}
    </fieldset>
  );

  // ── Step indicators ───────────────────────────────────────────────────────
  const steps = getSteps(isNewUser);
  const currentStepIndex = steps.indexOf(step);

  return (
    <div className="auth-gradient min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="flex flex-col items-center mb-10"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-bubble-own">
            <span className="text-3xl" role="img" aria-label="chat">
              💬
            </span>
          </div>
          <h1 className="text-3xl font-bold font-ui tracking-tight text-foreground">
            SecureChat
          </h1>
          <p className="text-muted-foreground text-sm mt-1 font-body">
            Private. Encrypted. Just two of you.
          </p>
        </motion.div>

        {/* Step card */}
        <div className="relative overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            {/* ── Step 1: Phone number ── */}
            {step === "phone" && (
              <motion.div
                key="phone"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="bg-card rounded-2xl shadow-glass border border-border p-8"
              >
                <div className="mb-6">
                  <h2 className="text-xl font-semibold font-ui text-foreground mb-1">
                    Enter your number
                  </h2>
                  <p className="text-sm text-muted-foreground font-body">
                    Sign in with your mobile number and an authenticator app.
                  </p>
                </div>

                <form onSubmit={handleSubmitPhone} className="space-y-5">
                  <div className="space-y-2">
                    <label
                      htmlFor="phone"
                      className="text-sm font-medium font-ui text-foreground"
                    >
                      Mobile number
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-lg select-none">
                        📱
                      </span>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="+1 555 000 0000"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="pl-10 h-12 text-base font-body tracking-wide"
                        autoComplete="tel"
                        autoFocus
                        inputMode="tel"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground font-body">
                      Include country code (e.g. +1 for US)
                    </p>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 font-ui font-semibold text-sm rounded-xl"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Checking...
                      </span>
                    ) : (
                      "Continue"
                    )}
                  </Button>
                </form>
              </motion.div>
            )}

            {/* ── Step 2 (new): Scan QR code ── */}
            {step === "qr-setup" && (
              <motion.div
                key="qr-setup"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="bg-card rounded-2xl shadow-glass border border-border p-8"
              >
                <div className="mb-5">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <span className="text-2xl" role="img" aria-label="shield">
                      🔐
                    </span>
                  </div>
                  <h2 className="text-xl font-semibold font-ui text-foreground mb-1">
                    Set up authenticator
                  </h2>
                  <p className="text-sm text-muted-foreground font-body">
                    Scan this QR code with{" "}
                    <strong className="text-foreground">
                      Google Authenticator
                    </strong>{" "}
                    or <strong className="text-foreground">Authy</strong>.
                  </p>
                </div>

                {/* Instructions */}
                <ol className="mb-5 space-y-1 text-xs text-muted-foreground font-body">
                  <li className="flex gap-2">
                    <span className="font-bold text-primary shrink-0">1.</span>
                    Open your authenticator app
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-primary shrink-0">2.</span>
                    Tap <strong className="text-foreground">+</strong> → "Scan
                    QR code"
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-primary shrink-0">3.</span>
                    Point at the code below
                  </li>
                </ol>

                {/* QR code */}
                {qrDataUrl ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                    className="flex justify-center mb-5"
                  >
                    <div className="p-3 bg-white rounded-2xl shadow-bubble inline-block">
                      <img
                        src={qrDataUrl}
                        alt="TOTP QR Code for SecureChat"
                        className="w-48 h-48 block"
                        width={192}
                        height={192}
                      />
                    </div>
                  </motion.div>
                ) : (
                  <div className="flex justify-center mb-5">
                    <div className="w-48 h-48 rounded-2xl bg-muted animate-pulse" />
                  </div>
                )}

                {/* Manual entry key */}
                <div className="mb-6 rounded-xl border border-border bg-muted/40 px-4 py-3">
                  <p className="text-xs text-muted-foreground font-ui uppercase tracking-wider mb-1">
                    Manual entry key
                  </p>
                  <p className="text-sm font-mono text-foreground tracking-widest break-all select-all">
                    {totpSecret.match(/.{1,4}/g)?.join(" ") ?? totpSecret}
                  </p>
                  <p className="text-xs text-muted-foreground font-body mt-1">
                    Use this if you can't scan the QR code
                  </p>
                </div>

                <Button
                  type="button"
                  className="w-full h-12 font-ui font-semibold text-sm rounded-xl"
                  onClick={handleScanned}
                >
                  I've scanned it →
                </Button>

                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setOtpCode(["", "", "", "", "", ""]);
                      goToStep("phone", -1);
                    }}
                    className="text-sm text-muted-foreground font-body hover:text-primary transition-colors"
                  >
                    ← Change number
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Step 3 (new): Enter 6-digit code to confirm setup ── */}
            {step === "totp-verify" && (
              <motion.div
                key="totp-verify"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="bg-card rounded-2xl shadow-glass border border-border p-8"
              >
                <div className="mb-6">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <span className="text-2xl" role="img" aria-label="key">
                      🔑
                    </span>
                  </div>
                  <h2 className="text-xl font-semibold font-ui text-foreground mb-1">
                    Confirm your code
                  </h2>
                  <p className="text-sm text-muted-foreground font-body">
                    Enter the 6-digit code shown in your authenticator app to
                    confirm setup.
                  </p>
                </div>

                <DigitBoxes />

                <Button
                  type="button"
                  className="w-full h-12 font-ui font-semibold text-sm rounded-xl"
                  onClick={handleVerifySetup}
                  disabled={isLoading || !otpComplete}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Verifying...
                    </span>
                  ) : (
                    "Confirm & continue"
                  )}
                </Button>

                <div className="mt-5 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setOtpCode(["", "", "", "", "", ""]);
                      goToStep("qr-setup", -1);
                    }}
                    className="text-sm text-muted-foreground font-body hover:text-primary transition-colors"
                  >
                    ← Back to QR code
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Step 2 (returning): Enter TOTP code to log in ── */}
            {step === "totp-login" && (
              <motion.div
                key="totp-login"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="bg-card rounded-2xl shadow-glass border border-border p-8"
              >
                <div className="mb-6">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <span
                      className="text-2xl"
                      role="img"
                      aria-label="authenticator"
                    >
                      🔒
                    </span>
                  </div>
                  <h2 className="text-xl font-semibold font-ui text-foreground mb-1">
                    Enter your code
                  </h2>
                  <p className="text-sm text-muted-foreground font-body">
                    Open your authenticator app and enter the code for{" "}
                    <span className="text-foreground font-medium">
                      SecureChat
                    </span>
                    .
                  </p>
                </div>

                <DigitBoxes />

                <Button
                  type="button"
                  className="w-full h-12 font-ui font-semibold text-sm rounded-xl"
                  onClick={handleVerifyLogin}
                  disabled={isLoading || !otpComplete}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Signing in...
                    </span>
                  ) : (
                    "Sign in"
                  )}
                </Button>

                <div className="mt-5 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setOtpCode(["", "", "", "", "", ""]);
                      goToStep("phone", -1);
                    }}
                    className="text-sm text-muted-foreground font-body hover:text-primary transition-colors"
                  >
                    ← Change number
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Step 4: Partner phone ── */}
            {step === "partner" && (
              <motion.div
                key="partner"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="bg-card rounded-2xl shadow-glass border border-border p-8"
              >
                <div className="mb-6">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <span className="text-2xl" role="img" aria-label="partner">
                      🔒
                    </span>
                  </div>
                  <h2 className="text-xl font-semibold font-ui text-foreground mb-1">
                    Who can you chat with?
                  </h2>
                  <p className="text-sm text-muted-foreground font-body">
                    SecureChat is private — only one pre-approved contact. Enter
                    their mobile number.
                  </p>
                </div>

                <form onSubmit={handleSetPartner} className="space-y-5">
                  <div className="space-y-2">
                    <label
                      htmlFor="partner-phone"
                      className="text-sm font-medium font-ui text-foreground"
                    >
                      Partner's mobile number
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-lg select-none">
                        📱
                      </span>
                      <Input
                        id="partner-phone"
                        type="tel"
                        placeholder="+1 555 111 2222"
                        value={partnerPhone}
                        onChange={(e) => setPartnerPhone(e.target.value)}
                        className="pl-10 h-12 text-base font-body tracking-wide"
                        autoComplete="tel"
                        autoFocus
                        inputMode="tel"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground font-body">
                      They also need to add your number on their device
                    </p>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 font-ui font-semibold text-sm rounded-xl"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Saving...
                      </span>
                    ) : (
                      "Continue to chat"
                    )}
                  </Button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Step indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="flex justify-center gap-2 mt-6"
        >
          {steps.map((s, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: positional
              key={i}
              className={[
                "h-1.5 rounded-full transition-all duration-300",
                step === s
                  ? "w-6 bg-primary"
                  : i < currentStepIndex
                    ? "w-3 bg-primary/50"
                    : "w-3 bg-border",
              ].join(" ")}
            />
          ))}
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-xs text-muted-foreground mt-5 font-body"
        >
          TOTP secured · No email required · End-to-end encrypted
        </motion.p>
      </div>
    </div>
  );
}
