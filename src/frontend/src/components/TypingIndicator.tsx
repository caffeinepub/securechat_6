export function TypingIndicator() {
  return (
    <div className="flex justify-start animate-fade-in-up">
      <div className="bubble-partner rounded-[18px] rounded-bl-[4px] border border-border/40 px-4 py-3 shadow-bubble">
        <div className="flex items-center gap-1">
          <span className="typing-dot w-2 h-2 rounded-full bg-current opacity-60" />
          <span className="typing-dot w-2 h-2 rounded-full bg-current opacity-60" />
          <span className="typing-dot w-2 h-2 rounded-full bg-current opacity-60" />
        </div>
      </div>
    </div>
  );
}
