import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useStorageClient } from "../hooks/useStorageClient";

interface ProfileAvatarProps {
  name: string;
  imageId: string | null | undefined;
  online?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeMap = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-base",
  xl: "w-20 h-20 text-xl",
};

const dotSizeMap = {
  sm: "w-2 h-2 border",
  md: "w-2.5 h-2.5 border-[1.5px]",
  lg: "w-3 h-3 border-2",
  xl: "w-4 h-4 border-2",
};

export function ProfileAvatar({
  name,
  imageId,
  online,
  size = "md",
  className,
}: ProfileAvatarProps) {
  const storageClient = useStorageClient();
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imageId || !storageClient) {
      setImageUrl(null);
      return;
    }
    storageClient
      .getDirectURL(imageId)
      .then((url) => setImageUrl(url))
      .catch(() => setImageUrl(null));
  }, [imageId, storageClient]);

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      <Avatar className={cn(sizeMap[size], "ring-2 ring-background")}>
        {imageUrl && <AvatarImage src={imageUrl} alt={name} />}
        <AvatarFallback className="bg-primary/15 text-primary font-ui font-semibold">
          {initials || "?"}
        </AvatarFallback>
      </Avatar>
      {online !== undefined && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full border-background",
            dotSizeMap[size],
            online
              ? "bg-[oklch(var(--online-green))]"
              : "bg-muted-foreground/40",
          )}
          style={{ borderColor: "oklch(var(--card))" }}
          aria-label={online ? "Online" : "Offline"}
        />
      )}
    </div>
  );
}
