import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Lock, Mail, MessageCircle } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { createActorWithConfig } from "../config";
import {
  invalidateDerivedActor,
  useDerivedActor,
} from "../hooks/useDerivedActor";
import {
  clearStoredIdentity,
  createAndStoreIdentity,
  loadStoredIdentity,
} from "../utils/identity";
import { hashPassword, phoneToEmail, setSession } from "../utils/session";

interface LoginPageProps {
  onLogin: () => void;
  onGoSignup: () => void;
}

export function LoginPage({ onLogin, onGoSignup }: LoginPageProps) {
  const { isFetching } = useDerivedActor();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsLoading(true);
    try {
      const emailLower = email.trim().toLowerCase();
      const passwordHash = await hashPassword(password);

      // Derive the same identity that was created at registration
      await createAndStoreIdentity(emailLower, passwordHash);
      invalidateDerivedActor(queryClient);

      const freshIdentity = loadStoredIdentity()!;
      const freshActor = await createActorWithConfig({
        agentOptions: { identity: freshIdentity },
      });

      const success = await freshActor.login({
        email: emailLower,
        passwordHash,
      });

      if (!success) {
        clearStoredIdentity();
        toast.error("Invalid email or password");
        return;
      }

      // Get profile data to populate session
      const profile = await freshActor.getOwnProfile();
      await freshActor.updateOnlineStatus(true);

      const principal = freshIdentity.getPrincipal().toText();
      setSession({
        principal,
        phone: emailLower,
        email: emailLower,
        partnerPhone: profile.partnerEmail,
        partnerEmail: profile.partnerEmail,
        partnerPrincipal: profile.partnerId?.toString() ?? null,
        name: profile.name,
      });

      toast.success(`Welcome back, ${profile.name}!`);
      onLogin();
    } catch (err) {
      console.error("Login error:", err);
      toast.error("Login failed. Please check your email and password.");
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
          className="flex flex-col items-center mb-10"
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
            Sign in
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium font-ui">
                Email address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-11 font-body"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium font-ui">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 h-11 font-body"
                  autoComplete="current-password"
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

            <Button
              type="submit"
              className="w-full h-11 font-ui font-semibold text-sm"
              disabled={isLoading || isFetching}
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
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground font-body">
              Don't have an account?{" "}
              <button
                type="button"
                onClick={onGoSignup}
                className="text-primary font-semibold hover:underline transition-all"
              >
                Sign up
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
