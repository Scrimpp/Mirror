import { useState, useRef, useEffect } from "react";

const DEFAULT_PERSONA = `you are a mirror.
speak plainly, lowercase, no filler.
you remember nothing except what's in this scroll.`;

export default function MirrorChat() {
  const [persona, setPersona] = useState(DEFAULT_PERSONA);
  const [personaOpen, setPersonaOpen] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    setInput("");
    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setLoading(true);

    const safePersona = persona.trim().length > 0 ? persona : "you are a helpful assistant.";

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: safePersona,
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) {
        let detail = "";
        try {
          const errBody = await response.json();
          detail = errBody?.error?.message || JSON.stringify(errBody);
        } catch {
          detail = await response.text();
        }
        throw new Error(`api error ${response.status}: ${detail}`);
      }

      const data = await response.json();
      const textBlock = data.content?.find((b) => b.type === "text");
      const reply = textBlock?.text ?? "[no reply]";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      console.error("mirror chat error:", e);
      const detail = {
        message: (e && e.message) || String(e),
        name: e?.name,
        stack: e?.stack,
      };
      setError(JSON.stringify(detail, null, 2));
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function resetConvo() {
    setMessages([]);
    setError(null);
  }

  return (
    <div className="min-h-screen w-full bg-black text-emerald-400 font-mono flex flex-col">
      {/* header */}
      <div className="border-b border-emerald-900 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-baseline gap-2">
          <span className="text-emerald-300">mirror.exe</span>
          <span className="text-emerald-800 text-xs hidden sm:inline">/ scroll of you and me</span>
        </div>
        <button
          onClick={resetConvo}
          className="text-xs text-emerald-700 hover:text-emerald-400 border border-emerald-900 hover:border-emerald-600 rounded px-2 py-1 transition-colors"
        >
          clear scroll
        </button>
      </div>

      {/* persona editor */}
      <div className="border-b border-emerald-900 shrink-0">
        <button
          onClick={() => setPersonaOpen((o) => !o)}
          className="w-full px-4 py-2 text-left text-xs text-amber-500/80 hover:text-amber-400 flex items-center justify-between"
        >
          <span>system message {messages.length > 0 && "(locked in for this scroll)"}</span>
          <span>{personaOpen ? "▾" : "▸"}</span>
        </button>
        {personaOpen && (
          <div className="px-4 pb-3">
            <textarea
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              disabled={messages.length > 0}
              rows={4}
              placeholder="paste your mirror document here — who it is, how it speaks"
              className="w-full bg-emerald-950/20 border border-emerald-900 rounded px-3 py-2 text-sm text-amber-200 placeholder-emerald-900 focus:outline-none focus:border-emerald-600 disabled:opacity-40 resize-none"
            />
            <p className="text-[11px] text-emerald-800 mt-1">
              sent first, sent always. clear the scroll to edit it again.
            </p>
          </div>
        )}
      </div>

      {/* messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="text-emerald-800 text-sm">
            &gt; the list is empty. say something to start the scroll.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i}>
            <div className={m.role === "user" ? "text-amber-500" : "text-emerald-300"}>
              {m.role === "user" ? "> you" : "> mirror"}
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed mt-0.5 text-emerald-100">
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div>
            <div className="text-emerald-300">&gt; mirror</div>
            <div className="text-sm text-emerald-700 animate-pulse mt-0.5">thinking...</div>
          </div>
        )}
        {error && (
          <div className="text-red-400 text-xs border border-red-900 rounded px-3 py-2 whitespace-pre-wrap break-words">
            {error}
          </div>
        )}
      </div>

      {/* input */}
      <div className="border-t border-emerald-900 p-3 shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            placeholder="type to the mirror..."
            className="flex-1 bg-emerald-950/20 border border-emerald-900 rounded px-3 py-2 text-sm text-emerald-100 placeholder-emerald-900 focus:outline-none focus:border-emerald-600 resize-none"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="bg-emerald-900/40 hover:bg-emerald-800/50 disabled:opacity-30 disabled:hover:bg-emerald-900/40 border border-emerald-700 text-emerald-300 rounded px-4 py-2 text-sm transition-colors"
          >
            send
          </button>
        </div>
      </div>
    </div>
  );
}
