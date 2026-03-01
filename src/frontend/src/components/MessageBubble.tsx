import { Check, CheckCheck } from "lucide-react";
import type { Message } from "../backend.d";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  decryptedContent: string;
}

function formatTime(ns: bigint): string {
  const ms = Number(ns / BigInt(1_000_000));
  const date = new Date(ms);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function StatusIcon({ status, isOwn }: { status: bigint; isOwn: boolean }) {
  if (!isOwn) return null;
  const s = Number(status);

  if (s === 2) {
    // Read - blue double check
    return (
      <span
        className="inline-flex items-center"
        style={{ color: "oklch(var(--read-tick))" }}
      >
        <CheckCheck className="w-3.5 h-3.5" />
      </span>
    );
  }
  if (s === 1) {
    // Delivered - grey double check
    return (
      <span
        className="inline-flex items-center"
        style={{ color: "oklch(var(--delivered-tick))" }}
      >
        <CheckCheck className="w-3.5 h-3.5" />
      </span>
    );
  }
  // Sent - single grey check
  return (
    <span
      className="inline-flex items-center"
      style={{ color: "oklch(var(--delivered-tick))" }}
    >
      <Check className="w-3.5 h-3.5" />
    </span>
  );
}

export function MessageBubble({
  message,
  isOwn,
  decryptedContent,
}: MessageBubbleProps) {
  return (
    <div
      className={`flex ${isOwn ? "justify-end" : "justify-start"} ${
        isOwn ? "animate-message-in-right" : "animate-message-in-left"
      }`}
    >
      <div
        className={`max-w-[72%] sm:max-w-[60%] px-3.5 py-2 shadow-bubble ${
          isOwn
            ? "bubble-own rounded-[18px] rounded-br-[4px]"
            : "bubble-partner rounded-[18px] rounded-bl-[4px] border border-border/40"
        }`}
      >
        <p
          className="text-sm leading-relaxed font-body break-words whitespace-pre-wrap"
          style={{ wordBreak: "break-word" }}
        >
          {decryptedContent}
        </p>
        <div
          className={`flex items-center gap-1 mt-0.5 ${
            isOwn ? "justify-end" : "justify-start"
          }`}
        >
          <span
            className={`text-[10px] font-body leading-none ${
              isOwn ? "opacity-75" : "text-muted-foreground"
            }`}
          >
            {formatTime(message.timestamp)}
          </span>
          <StatusIcon status={message.status} isOwn={isOwn} />
        </div>
      </div>
    </div>
  );
}
