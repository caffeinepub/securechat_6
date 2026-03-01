import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  MessageCircle,
  User,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { createActorWithConfig } from "../config";
import {
  invalidateDerivedActor,
  useDerivedActor,
} from "../hooks/useDerivedActor";
import { createAndStoreIdentity, loadStoredIdentity } from "../utils/identity";
import { hashPassword, setSession } from "../utils/session";

interface SignupPageProps {
  onSignup: () => void;
  onGoLogin: () => void;
}

export function SignupPage({ onSignup, onGoLogin }: SignupPageProps) {
  const { isFetching } = useDerivedActor();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !email.trim() || !partnerEmail.trim() || !password) {
      toast.error("Please fill in all fields");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    if (email.trim().toLowerCase() === partnerEmail.trim().toLowerCase()) {
      toast.error("Partner email must be different from your email");
      return;
    }

    setIsLoading(true);
    try {
      const passwordHash = await hashPassword(password);
      const emailLower = email.trim().toLowerCase();
      const partnerEmailLower = partnerEmail.trim().toLowerCase();

      // Derive a unique identity from this user's email + password
      await createAndStoreIdentity(emailLower, passwordHash);
      invalidateDerivedActor(queryClient);

      // Create a fresh actor signed with the derived identity
      const freshIdentity = loadStoredIdentity()!;
      const freshActor = await createActorWithConfig({
        agentOptions: { identity: freshIdentity },
      });

      await freshActor.register({
        name: name.trim(),
        email: emailLower,
        partnerEmail: partnerEmailLower,
        passwordHash,
      });

      // Auto-login after registration
      const success = await freshActor.login({
        email: emailLower,
        passwordHash,
      });
      if (!success) {
        toast.success("Account created! Please sign in.");
        onGoLogin();
        return;
      }

      await freshActor.updateOnlineStatus(true);

      const principal = freshIdentity.getPrincipal().toText();
      setSession({
        principal,
        phone: emailLower,
        email: emailLower,
        partnerPhone: partnerEmailLower,
        partnerEmail: partnerEmailLower,
        partnerPrincipal: null,
        name: name.trim(),
      });

      toast.success("Account created successfully!");
      onSignup();
    } catch (err) {
      console.error("Signup error:", err);
      const msg = err instanceof Error ? err.message : "Registration failed";
      toast.error(
        msg.includes("already")
          ? "This email is already registered. Please sign in instead."
          : "Registration failed. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-gradient min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center mb-8"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-bubble-own">
            <MessageCircle className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold font-ui tracking-tight text-foreground">
            SecureChat
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Private. Encrypted. Just two of you.
          </p>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-card rounded-2xl shadow-glass border border-border p-8"
        >
          <h2 className="text-xl font-semibold font-ui mb-6 text-foreground">
            Create account
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium font-ui">
                Your name
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="name"
                  type="text"
                  placeholder="Alice"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-10 h-11 font-body"
                  autoComplete="name"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="signup-email"
                className="text-sm font-medium font-ui"
              >
                Your email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="alice@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-11 font-body"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="partner-email"
                className="text-sm font-medium font-ui"
              >
                Partner's email
              </Label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="partner-email"
                  type="email"
                  placeholder="bob@example.com"
                  value={partnerEmail}
                  onChange={(e) => setPartnerEmail(e.target.value)}
                  className="pl-10 h-11 font-body"
                  autoComplete="off"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground font-body">
                The one person you'll be chatting with
              </p>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="signup-password"
                className="text-sm font-medium font-ui"
              >
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 h-11 font-body"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="confirm-password"
                className="text-sm font-medium font-ui"
              >
                Confirm password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10 h-11 font-body"
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 font-ui font-semibold text-sm mt-2"
              disabled={isLoading || isFetching}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Creating account...
                </span>
              ) : (
                "Create account"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground font-body">
              Already have an account?{" "}
              <button
                type="button"
                onClick={onGoLogin}
                className="text-primary font-semibold hover:underline transition-all"
              >
                Sign in
              </button>
            </p>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center text-xs text-muted-foreground mt-6 font-body"
        >
          End-to-end encrypted · Secure · Private
        </motion.p>
      </div>
    </div>
  );
}
