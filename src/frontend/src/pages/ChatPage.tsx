import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Principal as DfinityPrincipal } from "@dfinity/principal";

import type { Principal } from "@icp-sdk/core/principal";
import { Send, Settings, Smile, WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import type { Message } from "../backend.d";
import { MessageBubble } from "../components/MessageBubble";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { TypingIndicator } from "../components/TypingIndicator";
import { useDerivedActor } from "../hooks/useDerivedActor";
import {
  useOwnProfile,
  useOwnProfileImageId,
  usePartnerProfileImageId,
  useUserProfile,
} from "../hooks/useQueries";

import {
  decryptMessage,
  deriveSharedKey,
  encryptMessage,
} from "../utils/encryption";
import { getSession } from "../utils/session";

interface ChatPageProps {
  onOpenProfile: () => void;
}

const POLL_INTERVAL = 2500;

const COMMON_EMOJIS = [
  "😀",
  "😂",
  "😍",
  "🥰",
  "😎",
  "🤔",
  "😢",
  "😭",
  "😡",
  "🥳",
  "👍",
  "👎",
  "❤️",
  "🔥",
  "💯",
  "✨",
  "🎉",
  "🙏",
  "💪",
  "👏",
  "😘",
  "🤗",
  "😴",
  "🤣",
  "😅",
  "😬",
  "🤩",
  "😏",
  "😒",
  "🙄",
  "👋",
  "🤝",
  "🫶",
  "💔",
  "💕",
  "😻",
  "🌟",
  "⭐",
  "🎊",
  "🥂",
  "🍕",
  "☕",
  "🎂",
  "🍰",
  "🎁",
  "🌹",
  "🌈",
  "☀️",
  "🌙",
  "⚡",
  "😈",
  "👻",
  "💀",
  "🤡",
  "🎃",
  "🐶",
  "🐱",
  "🐼",
  "🦊",
  "🐸",
];
const SKELETON_KEYS = ["s0", "s1", "s2", "s3", "s4", "s5"];
const SKELETON_ALIGNS = [
  "justify-end",
  "justify-start",
  "justify-end",
  "justify-start",
  "justify-end",
  "justify-start",
];
const SKELETON_WIDTHS = [
  "w-48 rounded-br-[4px]",
  "w-56 rounded-bl-[4px]",
  "w-40 rounded-br-[4px]",
  "w-52 rounded-bl-[4px]",
  "w-44 rounded-br-[4px]",
  "w-48 rounded-bl-[4px]",
];

function formatLastSeen(ns: bigint): string {
  if (ns === BigInt(0)) return "Last seen: unknown";
  const ms = Number(ns / BigInt(1_000_000));
  const diff = Date.now() - ms;
  if (diff < 60_000) return "Last seen: just now";
  if (diff < 3_600_000) return `Last seen: ${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)
    return `Last seen: ${Math.floor(diff / 3_600_000)}h ago`;
  return `Last seen: ${Math.floor(diff / 86_400_000)}d ago`;
}

export function ChatPage({ onOpenProfile }: ChatPageProps) {
  const { actor, isFetching } = useDerivedActor();

  const session = getSession();
  const sessionEmail = session?.email ?? "";
  const sessionPartnerEmail = session?.partnerEmail ?? "";
  const sessionPartnerPhone =
    session?.partnerPhone ?? session?.partnerEmail ?? "";
  const sessionPartnerPrincipal = session?.partnerPrincipal ?? null;
  const sessionName = session?.name ?? "Me";

  const { data: ownProfile } = useOwnProfile();
  const { data: ownImageId } = useOwnProfileImageId();

  // Derive partner principal from session
  const [partnerPrincipal, setPartnerPrincipal] = useState<Principal | null>(
    () => {
      if (sessionPartnerPrincipal) {
        try {
          return DfinityPrincipal.fromText(
            sessionPartnerPrincipal,
          ) as unknown as Principal;
        } catch {
          return null;
        }
      }
      return null;
    },
  );

  const { data: partnerProfile } = useUserProfile(partnerPrincipal);
  const { data: partnerImageId } = usePartnerProfileImageId(partnerPrincipal);

  // Messages state
  const [messages, setMessages] = useState<Message[]>([]);
  const [decryptedMessages, setDecryptedMessages] = useState<
    Map<string, string>
  >(new Map());
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [partnerIsTyping, setPartnerIsTyping] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [partnerLastSeen, setPartnerLastSeen] = useState<bigint>(BigInt(0));
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derive crypto key from emails — stable deps as plain strings
  useEffect(() => {
    if (!sessionEmail || !sessionPartnerEmail) return;
    deriveSharedKey(sessionEmail, sessionPartnerEmail)
      .then((key) => setCryptoKey(key))
      .catch(() => toast.error("Encryption setup failed"));
  }, [sessionEmail, sessionPartnerEmail]);

  // Decrypt messages when they arrive — use ref to avoid stale closure loop
  const decryptedMessagesRef = useRef(decryptedMessages);
  useEffect(() => {
    decryptedMessagesRef.current = decryptedMessages;
  });

  useEffect(() => {
    if (!cryptoKey || messages.length === 0) return;
    const currentMap = decryptedMessagesRef.current;
    const decrypt = async () => {
      const newMap = new Map<string, string>();
      await Promise.all(
        messages.map(async (msg) => {
          const key = msg.id.toString();
          if (currentMap.has(key)) {
            newMap.set(key, currentMap.get(key) as string);
          } else {
            const plain = await decryptMessage(cryptoKey, msg.content);
            newMap.set(key, plain);
          }
        }),
      );
      setDecryptedMessages(newMap);
    };
    decrypt();
  }, [messages, cryptoKey]);

  // Polling function
  const poll = useCallback(async () => {
    if (!actor || !partnerPrincipal) return;
    try {
      const [msgs, typing, profile] = await Promise.all([
        actor.getMessages(partnerPrincipal, BigInt(0), BigInt(100)),
        actor.getPartnerTyping(),
        actor.getUserProfile(partnerPrincipal),
      ]);

      setMessages(msgs);
      setPartnerIsTyping(typing);
      if (profile) {
        setPartnerOnline(profile.online);
        setPartnerLastSeen(profile.lastSeen);
      }
      setIsLoadingMessages(false);

      // Mark as read
      const unreadCount = await actor.getUnreadMessageCount(partnerPrincipal);
      if (unreadCount > BigInt(0)) {
        await actor.markAsRead(partnerPrincipal);
      }
    } catch (err) {
      console.error("Poll error:", err);
      setIsLoadingMessages(false);
    }
  }, [actor, partnerPrincipal]);

  // Load partner principal from own profile if not in session
  useEffect(() => {
    if (!actor || isFetching || partnerPrincipal) return;
    actor
      .getOwnProfile()
      .then((profile) => {
        if (profile.partnerId) {
          try {
            setPartnerPrincipal(profile.partnerId as unknown as Principal);
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {});
  }, [actor, isFetching, partnerPrincipal]);

  // Polling interval
  useEffect(() => {
    if (!actor || isFetching) return;
    poll();
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [actor, isFetching, poll]);

  // Online status update
  useEffect(() => {
    if (!actor || isFetching) return;
    actor.updateOnlineStatus(true).catch(() => {});
    return () => {
      actor.updateOnlineStatus(false).catch(() => {});
    };
  }, [actor, isFetching]);

  // Scroll to bottom on new messages
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on message count / typing change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, partnerIsTyping]);

  // Handle typing indicator
  const handleInputChange = (value: string) => {
    setInputValue(value);
    if (!actor) return;

    if (!isTyping) {
      setIsTyping(true);
      actor.setTyping(true).catch(() => {});
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      actor.setTyping(false).catch(() => {});
    }, 2000);
  };

  const handleSend = async () => {
    if (
      !inputValue.trim() ||
      !actor ||
      !partnerPrincipal ||
      !cryptoKey ||
      isSending
    )
      return;

    const plaintext = inputValue.trim();
    setInputValue("");
    setIsSending(true);

    // Clear typing
    setIsTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    actor.setTyping(false).catch(() => {});

    try {
      const encrypted = await encryptMessage(cryptoKey, plaintext);
      await actor.sendMessage({
        content: encrypted,
        receiverId: partnerPrincipal,
      });
      await poll();
    } catch (err) {
      console.error("Send error:", err);
      toast.error("Failed to send message");
      setInputValue(plaintext);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiSelect = (emoji: { native: string }) => {
    setInputValue((prev) => `${prev}${emoji.native}`);
    inputRef.current?.focus();
  };

  const partnerName =
    partnerProfile?.name ?? sessionPartnerPhone ?? "Your partner";

  // Show empty/waiting state while partner hasn't registered
  if (!partnerPrincipal && !isLoadingMessages) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <header className="glass-header px-4 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <ProfileAvatar
              name={ownProfile?.name ?? sessionName}
              imageId={ownImageId}
              size="md"
            />
            <div>
              <h1 className="text-base font-semibold font-ui text-foreground">
                SecureChat
              </h1>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenProfile}
            className="text-muted-foreground"
          >
            <Settings className="w-5 h-5" />
          </Button>
        </header>

        <main className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-sm animate-fade-in-up">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <WifiOff className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold font-ui text-foreground mb-2">
              Waiting for your partner
            </h2>
            <p className="text-muted-foreground font-body text-sm leading-relaxed">
              Your partner (
              <span className="text-foreground font-medium">
                {sessionPartnerPhone || sessionPartnerEmail}
              </span>
              ) hasn't registered yet. Once they sign in and add your number as
              their partner, you'll be connected.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Header */}
      <header className="glass-header px-4 py-3 flex items-center justify-between sticky top-0 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <ProfileAvatar
            name={partnerName}
            imageId={partnerImageId}
            online={partnerOnline}
            size="md"
          />
          <div>
            <h1 className="text-base font-semibold font-ui text-foreground leading-tight">
              {partnerName}
            </h1>
            <p className="text-xs text-muted-foreground font-body leading-tight">
              {partnerOnline ? (
                <span
                  className="font-medium"
                  style={{ color: "oklch(var(--online-green))" }}
                >
                  Online
                </span>
              ) : (
                formatLastSeen(partnerLastSeen)
              )}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenProfile}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Profile settings"
        >
          <Settings className="w-5 h-5" />
        </Button>
      </header>

      {/* Messages area */}
      <main
        className="flex-1 overflow-y-auto chat-bg scrollbar-thin px-3 sm:px-4 py-4"
        style={{ overscrollBehavior: "contain" }}
      >
        {isLoadingMessages ? (
          <div className="space-y-3 px-2">
            {SKELETON_KEYS.map((key, i) => (
              <div key={key} className={`flex ${SKELETON_ALIGNS[i]}`}>
                <Skeleton
                  className={`h-12 rounded-[18px] ${SKELETON_WIDTHS[i]}`}
                />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 animate-fade-in-up">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <span className="text-2xl" role="img" aria-label="wave">
                👋
              </span>
            </div>
            <p className="text-muted-foreground font-body text-sm">
              No messages yet. Say hello!
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {messages.map((msg) => {
              // isMine: this message was sent by us (receiver is partner)
              const isMine = partnerPrincipal
                ? msg.receiverId.toString() === partnerPrincipal.toString()
                : false;

              return (
                <MessageBubble
                  key={msg.id.toString()}
                  message={msg}
                  isOwn={isMine}
                  decryptedContent={
                    decryptedMessages.get(msg.id.toString()) ?? "..."
                  }
                />
              );
            })}

            {/* Typing indicator */}
            <AnimatePresence>
              {partnerIsTyping && (
                <motion.div
                  key="typing"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.18 }}
                >
                  <TypingIndicator />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Emoji picker */}
      <AnimatePresence>
        {showEmojiPicker && (
          <motion.div
            key="emoji-picker"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.18 }}
            className="shrink-0 border-t border-border bg-card px-3 py-3"
          >
            <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
              {COMMON_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleEmojiSelect({ native: emoji })}
                  className="text-xl w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
                  aria-label={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input bar */}
      <div className="glass-input px-3 py-3 shrink-0">
        <div className="flex items-end gap-2 max-w-4xl mx-auto">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setShowEmojiPicker((v) => !v)}
            className={`shrink-0 text-muted-foreground hover:text-primary transition-colors ${showEmojiPicker ? "text-primary" : ""}`}
            aria-label="Emoji picker"
          >
            <Smile className="w-5 h-5" />
          </Button>

          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="w-full resize-none bg-muted/60 rounded-2xl px-4 py-2.5 text-sm font-body text-foreground placeholder:text-muted-foreground border border-border/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 transition-shadow max-h-32 overflow-y-auto"
              style={{
                lineHeight: "1.5",
                minHeight: "40px",
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
              }}
            />
          </div>

          <Button
            type="button"
            size="icon"
            onClick={handleSend}
            disabled={!inputValue.trim() || isSending || !partnerPrincipal}
            className="shrink-0 rounded-full w-10 h-10 shadow-bubble-own"
            aria-label="Send message"
          >
            {isSending ? (
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
