import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Camera,
  Check,
  LogOut,
  Moon,
  Pencil,
  Phone,
  Sun,
  User,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { useDerivedActor } from "../hooks/useDerivedActor";
import {
  useOwnProfile,
  useOwnProfileImageId,
  useSaveProfile,
  useSetProfilePicture,
} from "../hooks/useQueries";
import { useStorageClient } from "../hooks/useStorageClient";
import { useTheme } from "../hooks/useTheme";
import { clearSession, getSession } from "../utils/session";

interface ProfilePageProps {
  onBack: () => void;
  onLogout: () => void;
}

export function ProfilePage({ onBack, onLogout }: ProfilePageProps) {
  const { actor } = useDerivedActor();
  const { theme, toggleTheme } = useTheme();
  const session = getSession();
  const storageClient = useStorageClient();

  const { data: ownProfile, refetch: refetchProfile } = useOwnProfile();
  const { data: ownImageId } = useOwnProfileImageId();

  const setProfilePictureMutation = useSetProfilePicture();
  const saveProfileMutation = useSaveProfile();

  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(
    ownProfile?.name ?? session?.name ?? "",
  );
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !storageClient) {
      if (!storageClient) toast.error("Storage not ready");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      toast.error("Please upload a JPEG, PNG, WebP, or GIF image");
      return;
    }

    try {
      setUploadProgress(0);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { hash } = await storageClient.putFile(bytes, (pct) =>
        setUploadProgress(pct),
      );
      await setProfilePictureMutation.mutateAsync(hash);
      setUploadProgress(null);
      toast.success("Profile picture updated!");
    } catch (err) {
      console.error("Upload error:", err);
      setUploadProgress(null);
      toast.error("Failed to upload profile picture");
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSaveName = async () => {
    if (!editName.trim() || !ownProfile) return;
    try {
      await saveProfileMutation.mutateAsync({
        ...ownProfile,
        name: editName.trim(),
      });
      await refetchProfile();
      setIsEditingName(false);
      toast.success("Name updated!");
    } catch {
      toast.error("Failed to update name");
    }
  };

  const handleLogout = async () => {
    try {
      if (actor) {
        await actor.updateOnlineStatus(false);
      }
    } catch {
      // ignore
    }
    clearSession();
    onLogout();
  };

  const displayName = ownProfile?.name ?? session?.name ?? "You";
  // Show phone number (strip @sc.app suffix if stored in backend format)
  const rawPhone = session?.phone ?? session?.email ?? ownProfile?.email ?? "";
  const displayPhone = rawPhone.endsWith("@sc.app")
    ? `+${rawPhone.replace("@sc.app", "")}`
    : rawPhone;
  const rawPartnerPhone =
    session?.partnerPhone ??
    session?.partnerEmail ??
    ownProfile?.partnerEmail ??
    "";
  const displayPartnerPhone = rawPartnerPhone.endsWith("@sc.app")
    ? `+${rawPartnerPhone.replace("@sc.app", "")}`
    : rawPartnerPhone;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="glass-header px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold font-ui text-foreground">
          Profile & Settings
        </h1>
      </header>

      <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full space-y-6">
        {/* Avatar section */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex flex-col items-center gap-4 py-2"
        >
          <button
            type="button"
            className="relative group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
            onClick={handleAvatarClick}
            aria-label="Change profile picture"
          >
            <ProfileAvatar name={displayName} imageId={ownImageId} size="xl" />
            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-6 h-6 text-white" />
            </div>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleFileChange}
          />

          {uploadProgress !== null && (
            <div className="w-full max-w-[200px]">
              <Progress value={uploadProgress} className="h-1.5" />
              <p className="text-xs text-center text-muted-foreground mt-1 font-body">
                Uploading {uploadProgress}%
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={handleAvatarClick}
            className="text-xs text-primary font-ui font-medium hover:underline"
          >
            Change photo
          </button>
        </motion.div>

        {/* Info card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="bg-card rounded-2xl border border-border overflow-hidden shadow-xs"
        >
          {/* Name row */}
          <div className="px-4 py-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-ui uppercase tracking-wide mb-0.5">
                Name
              </p>
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-8 text-sm font-body"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveName();
                      if (e.key === "Escape") setIsEditingName(false);
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-primary shrink-0"
                    onClick={handleSaveName}
                    disabled={saveProfileMutation.isPending}
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium font-body text-foreground truncate">
                    {displayName}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditName(displayName);
                      setIsEditingName(true);
                    }}
                    className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                    aria-label="Edit name"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Phone row */}
          <div className="px-4 py-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Phone className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-ui uppercase tracking-wide mb-0.5">
                Your number
              </p>
              <span className="text-sm font-body text-foreground truncate block">
                {displayPhone}
              </span>
            </div>
          </div>

          <Separator />

          {/* Partner phone row */}
          <div className="px-4 py-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-ui uppercase tracking-wide mb-0.5">
                Partner's number
              </p>
              <span className="text-sm font-body text-foreground truncate block">
                {displayPartnerPhone || "Not set"}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Settings card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="bg-card rounded-2xl border border-border overflow-hidden shadow-xs"
        >
          {/* Dark mode toggle */}
          <button
            type="button"
            className="w-full px-4 py-4 flex items-center gap-3 hover:bg-muted/40 transition-colors"
            onClick={toggleTheme}
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              {theme === "dark" ? (
                <Sun className="w-4 h-4 text-primary" />
              ) : (
                <Moon className="w-4 h-4 text-primary" />
              )}
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium font-ui text-foreground">
                {theme === "dark"
                  ? "Switch to Light Mode"
                  : "Switch to Dark Mode"}
              </p>
              <p className="text-xs text-muted-foreground font-body">
                Currently using {theme} mode
              </p>
            </div>
            <div className="shrink-0">
              <div
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  theme === "dark" ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    theme === "dark" ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </div>
            </div>
          </button>
        </motion.div>

        {/* Logout button */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15 }}
        >
          <Button
            variant="destructive"
            className="w-full h-12 font-ui font-semibold"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </motion.div>

        {/* Encryption notice */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center"
        >
          <p className="text-xs text-muted-foreground font-body">
            🔒 All messages are end-to-end encrypted
          </p>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center border-t border-border">
        <p className="text-xs text-muted-foreground font-body">
          © {new Date().getFullYear()}.{" "}
          <a
            href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors"
          >
            Built with ❤️ using caffeine.ai
          </a>
        </p>
      </footer>
    </div>
  );
}
