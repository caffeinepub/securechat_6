import { Toaster } from "@/components/ui/sonner";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { ThemeProvider } from "./hooks/useTheme";
import { ChatPage } from "./pages/ChatPage";
import { OTPAuthPage } from "./pages/OTPAuthPage";
import { ProfilePage } from "./pages/ProfilePage";
import { clearStoredIdentity } from "./utils/identity";
import { clearSession, getSession } from "./utils/session";

type Screen = "auth" | "chat" | "profile";

function AppInner() {
  const [screen, setScreen] = useState<Screen>(() => {
    const session = getSession();
    return session ? "chat" : "auth";
  });

  // Keep screen in sync with session
  useEffect(() => {
    const session = getSession();
    if (!session && (screen === "chat" || screen === "profile")) {
      setScreen("auth");
    }
  }, [screen]);

  const handleAuth = () => setScreen("chat");
  const handleLogout = () => {
    clearStoredIdentity();
    clearSession();
    setScreen("auth");
  };

  return (
    <>
      <AnimatePresence mode="wait">
        {screen === "auth" && (
          <motion.div
            key="auth"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <OTPAuthPage onAuth={handleAuth} />
          </motion.div>
        )}

        {screen === "chat" && (
          <motion.div
            key="chat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="h-screen"
          >
            <ChatPage onOpenProfile={() => setScreen("profile")} />
          </motion.div>
        )}

        {screen === "profile" && (
          <motion.div
            key="profile"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="min-h-screen"
          >
            <ProfilePage
              onBack={() => setScreen("chat")}
              onLogout={handleLogout}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <Toaster
        position="top-center"
        toastOptions={{
          className: "font-body text-sm",
        }}
      />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
