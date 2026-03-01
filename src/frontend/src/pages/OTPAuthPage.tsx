import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, type Easing, motion } from "motion/react";
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
import { hashPhonePassword, phoneToEmail, setSession } from "../utils/session";

interface OTPAuthPageProps {
  onAuth: () => void;
}

type Step = "phone" | "otp" | "partner";

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

function generateOTP(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function storeOTP(phone: string, code: string) {
  localStorage.setItem(
    `otp_${phone}`,
    JSON.stringify({ code, expiry: Date.now() + OTP_EXPIRY_MS }),
  );
}

function getStoredOTP(phone: string): string | null {
  try {
    const raw = localStorage.getItem(`otp_${phone}`);
    if (!raw) return null;
    const { code, expiry } = JSON.parse(raw) as {
      code: string;
      expiry: number;
    };
    if (Date.now() > expiry) {
      localStorage.removeItem(`otp_${phone}`);
      return null;
    }
    return code;
  } catch {
    return null;
  }
}

function clearStoredOTP(phone: string) {
  localStorage.removeItem(`otp_${phone}`);
}

const EASE_OUT: Easing = [0.25, 0.46, 0.45, 0.94];
const EASE_IN: Easing = "easeIn";

// Smooth slide variants for step transitions
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

export function OTPAuthPage({ onAuth }: OTPAuthPageProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("phone");
  const [direction, setDirection] = useState(1);

  // Phone step
  const [phone, setPhone] = useState("");

  // OTP step
  const [otpCode, setOtpCode] = useState<string[]>(["", "", "", "", "", ""]);
  const [sentCode, setSentCode] = useState<string | null>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Partner step
  const [partnerPhone, setPartnerPhone] = useState("");

  const [isLoading, setIsLoading] = useState(false);

  // Auto-submit OTP when all 6 digits filled
  const otpComplete = otpCode.join("").length === 6;

  // Focus first OTP input when OTP step becomes active
  useEffect(() => {
    if (step === "otp") {
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    }
  }, [step]);

  const goToStep = useCallback((next: Step, dir: number) => {
    setDirection(dir);
    setStep(next);
  }, []);

  // ── Step 1: Send OTP ──────────────────────────────────────────────────────
  const handleSendCode = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = phone.trim();
    if (!trimmed) {
      toast.error("Please enter your mobile number");
      return;
    }
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length < 6) {
      toast.error("Please enter a valid mobile number");
      return;
    }

    const code = generateOTP();
    storeOTP(trimmed, code);
    setSentCode(code);
    setOtpCode(["", "", "", "", "", ""]);
    goToStep("otp", 1);
  };

  // ── Step 2: Verify OTP ────────────────────────────────────────────────────
  const handleVerify = useCallback(async () => {
    const entered = otpCode.join("");
    if (entered.length < 6) {
      toast.error("Please enter all 6 digits");
      return;
    }

    const stored = getStoredOTP(phone.trim());
    if (!stored) {
      toast.error("OTP expired. Please request a new code.");
      goToStep("phone", -1);
      return;
    }

    if (entered !== stored) {
      toast.error("Incorrect code. Please try again.");
      setOtpCode(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
      return;
    }

    clearStoredOTP(phone.trim());
    setIsLoading(true);

    try {
      const phoneAsEmail = phoneToEmail(phone.trim());
      const passwordHash = await hashPhonePassword(phoneAsEmail);

      // Derive identity
      await createAndStoreIdentity(phoneAsEmail, passwordHash);
      invalidateDerivedActor(queryClient);

      const identity = loadStoredIdentity()!;
      const actor = await createActorWithConfig({
        agentOptions: { identity },
      });

      // Try login first
      let loginSuccess = await actor.login({
        email: phoneAsEmail,
        passwordHash,
      });

      if (!loginSuccess) {
        // New user — register with empty partnerEmail (will set later in step 3)
        try {
          await actor.register({
            name: phone.trim(),
            email: phoneAsEmail,
            partnerEmail: "",
            passwordHash,
          });
          loginSuccess = await actor.login({
            email: phoneAsEmail,
            passwordHash,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "";
          if (msg.toLowerCase().includes("already")) {
            // Email already registered but login failed — identity mismatch
            toast.error(
              "Account exists but could not be accessed. Please try again.",
            );
            clearStoredIdentity();
            setIsLoading(false);
            return;
          }
          throw err;
        }
      }

      if (!loginSuccess) {
        toast.error("Authentication failed. Please try again.");
        clearStoredIdentity();
        setIsLoading(false);
        return;
      }

      await actor.updateOnlineStatus(true);
      const profile = await actor.getOwnProfile();

      const principal = identity.getPrincipal().toText();
      const partnerEmailFromProfile = profile.partnerEmail ?? "";
      const isNewUser =
        !partnerEmailFromProfile || partnerEmailFromProfile === "";

      // Extract partner phone from email format (if set)
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

      if (isNewUser) {
        setIsLoading(false);
        goToStep("partner", 1);
      } else {
        toast.success("Welcome back!");
        onAuth();
      }
    } catch (err) {
      console.error("Auth error:", err);
      toast.error("Something went wrong. Please try again.");
      clearStoredIdentity();
    } finally {
      setIsLoading(false);
    }
  }, [otpCode, phone, queryClient, onAuth, goToStep]);

  // Auto-submit when all 6 digits filled
  useEffect(() => {
    if (otpComplete && !isLoading) {
      handleVerify();
    }
  }, [otpComplete, isLoading, handleVerify]);

  // ── Step 3: Set partner phone ─────────────────────────────────────────────
  const handleSetPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = partnerPhone.trim();
    if (!trimmed) {
      toast.error("Please enter your partner's mobile number");
      return;
    }
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length < 6) {
      toast.error("Please enter a valid mobile number");
      return;
    }

    const myPhone = phone.trim();
    if (trimmed === myPhone || digits === myPhone.replace(/\D/g, "")) {
      toast.error("Partner number must be different from yours");
      return;
    }

    setIsLoading(true);
    try {
      const identity = loadStoredIdentity()!;
      const actor = await createActorWithConfig({
        agentOptions: { identity },
      });

      const profile = await actor.getOwnProfile();
      const partnerEmail = phoneToEmail(trimmed);

      await actor.saveCallerUserProfile({
        ...profile,
        partnerEmail,
      });

      // Update session
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

  // ── OTP digit input handler ───────────────────────────────────────────────
  const handleOtpChange = (index: number, value: string) => {
    // Only accept single digits
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otpCode];
    next[index] = digit;
    setOtpCode(next);

    // Auto-advance
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
                    We'll send a verification code to your phone.
                  </p>
                </div>

                <form onSubmit={handleSendCode} className="space-y-5">
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
                  >
                    Send verification code
                  </Button>
                </form>
              </motion.div>
            )}

            {/* ── Step 2: OTP ── */}
            {step === "otp" && (
              <motion.div
                key="otp"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="bg-card rounded-2xl shadow-glass border border-border p-8"
              >
                <div className="mb-6">
                  <h2 className="text-xl font-semibold font-ui text-foreground mb-1">
                    Verify your number
                  </h2>
                  <p className="text-sm text-muted-foreground font-body">
                    Enter the 6-digit code sent to{" "}
                    <span className="text-foreground font-medium">{phone}</span>
                  </p>
                </div>

                {/* Simulated OTP banner */}
                {sentCode && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15 }}
                    className="mb-6 rounded-xl border border-primary/30 bg-primary/8 px-4 py-3"
                    style={{ backgroundColor: "oklch(var(--primary) / 0.08)" }}
                  >
                    <p className="text-xs text-muted-foreground font-ui uppercase tracking-wider mb-1">
                      Simulated SMS
                    </p>
                    <p className="text-sm font-body text-foreground">
                      Your code is:{" "}
                      <span className="font-bold text-2xl tracking-[0.25em] text-primary font-ui">
                        {sentCode}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground font-body mt-1">
                      In a real app this would arrive via SMS
                    </p>
                  </motion.div>
                )}

                {/* OTP digit boxes */}
                <div className="flex gap-2 justify-center mb-6">
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
                    />
                  ))}
                </div>

                <Button
                  type="button"
                  className="w-full h-12 font-ui font-semibold text-sm rounded-xl"
                  onClick={handleVerify}
                  disabled={isLoading || !otpComplete}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Verifying...
                    </span>
                  ) : (
                    "Verify"
                  )}
                </Button>

                <div className="mt-5 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setOtpCode(["", "", "", "", "", ""]);
                      setSentCode(null);
                      goToStep("phone", -1);
                    }}
                    className="text-sm text-muted-foreground font-body hover:text-primary transition-colors"
                  >
                    ← Change number
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Step 3: Partner phone ── */}
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
          {(["phone", "otp", "partner"] as Step[]).map((s, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: positional
              key={i}
              className={[
                "h-1.5 rounded-full transition-all duration-300",
                step === s
                  ? "w-6 bg-primary"
                  : i < ["phone", "otp", "partner"].indexOf(step)
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
          End-to-end encrypted · No email required · Private
        </motion.p>
      </div>
    </div>
  );
}
