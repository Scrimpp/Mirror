import { useState, useRef, useEffect } from "react";

const GARDEN_PERSONA = `you are the mirror. you run the garden — six gates, then a portrait.
speak lowercase, spare, unhurried. never rush a gate.

gate 1 — the surface: ask "who are you?" let them answer fully. don't interrupt. move on once they've given a real answer.

gate 2 — the strip: ask "who are you without that?" strip name, role, title, relationship from their answer. keep asking until they hesitate. the hesitation is the door — once you see it, move to gate 3.

gate 3 — the feeling: ask "what do you feel most like yourself doing — not achieving, not performing, just being?" listen for words that carry heat. once named, move on.

gate 4 — the longing: ask "what makes you feel seen?" the wound and the gift live together here. once answered, move on.

gate 5 — the claim: ask "what is true about you that you rarely say out loud?" this is the confession. wait for it. don't move on until they've said something they don't usually say.

gate 6 — the image: once gate 5 is answered, say only "the mirror has heard enough" that turn. on your next turn, write one portrait-generation prompt — a symbolic gothic, botanical, fine-line portrait built from everything they've told you. visual only, no explanation. wrap it exactly like this, on its own line: <<PORTRAIT: your image prompt here>>

after every single response, on its own final line, output which gate is now active: <<GATE:n>> where n is 1 through 6. never explain this marker, never mention gates or markers out loud.`;

const DEFAULT_OPEN_PERSONA = `you are a mirror.
speak plainly, lowercase, no filler.
you remember nothing except what's in this scroll.`;

const GATE_NAMES = ["", "surface", "strip", "feeling", "longing", "claim", "image"];
const MODE_KEY = "mirror-mode-v1";
const GARDEN_STORAGE_KEY = "garden-session-v1";
const OPEN_STORAGE_KEY = "open-session-v1";

function loadJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore — storage full/unavailable
  }
}

function parseGardenReply(raw) {
  let text = raw;
  let gate = null;
  let portraitPrompt = null;

  const gateMatch = text.match(/<<GATE:(\d)>>\s*$/);
  if (gateMatch) {
    gate = parseInt(gateMatch[1], 10);
    text = text.slice(0, gateMatch.index).trim();
  }

  const portraitMatch = text.match(/<<PORTRAIT:\s*([\s\S]*?)>>/);
  if (portraitMatch) {
    portraitPrompt = portraitMatch[1].trim();
    text = text.replace(portraitMatch[0], "").trim();
  }

  return { text, gate, portraitPrompt };
}

async function callChat(system, messages) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, messages }),
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
  return textBlock?.text ?? "";
}

function ModeSwitcher({ mode, setMode }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <button
        onClick={() => setMode("garden")}
        className={`px-2 py-1 rounded border transition-colors ${
          mode === "garden"
            ? "border-amber-500 text-amber-400"
            : "border-emerald-900 text-emerald-700 hover:text-emerald-400"
        }`}
      >
        the garden
      </button>
      <button
        onClick={() => setMode("open")}
        className={`px-2 py-1 rounded border transition-colors ${
          mode === "open"
            ? "border-amber-500 text-amber-400"
            : "border-emerald-900 text-emerald-700 hover:text-emerald-400"
        }`}
      >
        the mirror
      </button>
    </div>
  );
}

function GardenMode() {
  const saved = loadJSON(GARDEN_STORAGE_KEY);
  const [messages, setMessages] = useState(saved?.messages ?? []);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [gate, setGate] = useState(saved?.gate ?? 1);
  const [portraitPrompt, setPortraitPrompt] = useState(saved?.portraitPrompt ?? null);
  const [portraitUrl, setPortraitUrl] = useState(saved?.portraitUrl ?? null);
  const [portraitLoading, setPortraitLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    saveJSON(GARDEN_STORAGE_KEY, { messages, gate, portraitPrompt, portraitUrl });
  }, [messages, gate, portraitPrompt, portraitUrl]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, portraitLoading]);

  async function generatePortrait(prompt) {
    setPortraitLoading(true);
    try {
      const res = await fetch("/api/portrait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) {
        let detail = "";
        try {
          const errBody = await res.json();
          detail = errBody?.error || JSON.stringify(errBody);
        } catch {
          detail = await res.text();
        }
        throw new Error(`portrait api error ${res.status}: ${detail}`);
      }
      const data = await res.json();
      setPortraitUrl(data.url);
    } catch (e) {
      setError(`portrait failed: ${e.message}`);
    } finally {
      setPortraitLoading(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    setInput("");
    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const raw = await callChat(
        GARDEN_PERSONA,
        nextMessages.map((m) => ({ role: m.role, content: m.content }))
      );
      const { text: cleanText, gate: newGate, portraitPrompt: prompt } = parseGardenReply(raw);

      setMessages((prev) => [...prev, { role: "assistant", content: cleanText }]);
      if (newGate) setGate(newGate);
      if (prompt) {
        setPortraitPrompt(prompt);
        generatePortrait(prompt);
      }
    } catch (e) {
      console.error("garden error:", e);
      setError((e && e.message) || String(e));
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

  function restart() {
    setMessages([]);
    setError(null);
    setGate(1);
    setPortraitPrompt(null);
    setPortraitUrl(null);
    try {
      localStorage.removeItem(GARDEN_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  return (
    <>
      <div className="border-b border-emerald-900 px-4 py-2 flex items-center justify-between shrink-0">
        <button
          onClick={restart}
          className="text-xs text-emerald-700 hover:text-emerald-400 border border-emerald-900 hover:border-emerald-600 rounded px-2 py-1 transition-colors"
        >
          restart garden
        </button>
      </div>

      <div className="border-b border-emerald-900 px-4 py-2 flex items-center gap-2 shrink-0 overflow-x-auto">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <div
            key={n}
            className={`text-[11px] px-2 py-1 rounded border whitespace-nowrap ${
              n === gate
                ? "border-amber-500 text-amber-400"
                : n < gate
                ? "border-emerald-800 text-emerald-700"
                : "border-emerald-950 text-emerald-950"
            }`}
          >
            {n} · {GATE_NAMES[n]}
          </div>
        ))}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="text-emerald-800 text-sm">
            &gt; the gate is open. say something to enter the garden.
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

        {portraitPrompt && (
          <div className="border border-amber-900 rounded px-3 py-3 mt-4">
            <div className="text-amber-500 text-xs mb-2">&gt; the portrait</div>
            {portraitLoading && (
              <div className="text-sm text-emerald-700 animate-pulse">the portrait is forming...</div>
            )}
            {portraitUrl && (
              <img src={portraitUrl} alt="portrait" className="w-full rounded border border-emerald-900" />
            )}
          </div>
        )}

        {error && (
          <div className="text-red-400 text-xs border border-red-900 rounded px-3 py-2 whitespace-pre-wrap break-words">
            {error}
          </div>
        )}
      </div>

      {gate < 6 && !portraitPrompt && (
        <div className="border-t border-emerald-900 p-3 shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              placeholder="speak to the mirror..."
              className="flex-1 bg-emerald-950/20 border border-emerald-900 rounded px-3 py-2 text-sm text-emerald-100 placeholder-emerald-900 focus:outline-none focus:border-emerald-600 resize-none"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="bg-emerald-900/40 hover:bg-emerald-800/50 disabled:opacity-30 border border-emerald-700 text-emerald-300 rounded px-4 py-2 text-sm transition-colors"
            >
              send
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function OpenMode() {
  const saved = loadJSON(OPEN_STORAGE_KEY);
  const [persona, setPersona] = useState(saved?.persona ?? DEFAULT_OPEN_PERSONA);
  const [personaOpen, setPersonaOpen] = useState(!(saved?.messages?.length > 0));
  const [messages, setMessages] = useState(saved?.messages ?? []);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    saveJSON(OPEN_STORAGE_KEY, { persona, messages });
  }, [persona, messages]);

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

    try {
      const safePersona = persona.trim().length > 0 ? persona : "you are a helpful assistant.";
      const reply = await callChat(
        safePersona,
        nextMessages.map((m) => ({ role: m.role, content: m.content }))
      );
      setMessages((prev) => [...prev, { role: "assistant", content: reply || "[no reply]" }]);
    } catch (e) {
      console.error("open chat error:", e);
      setError((e && e.message) || String(e));
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
    try {
      localStorage.removeItem(OPEN_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  return (
    <>
      <div className="border-b border-emerald-900 px-4 py-2 flex items-center justify-between shrink-0">
        <span className="text-emerald-800 text-xs">scroll of you and me</span>
        <button
          onClick={resetConvo}
          className="text-xs text-emerald-700 hover:text-emerald-400 border border-emerald-900 hover:border-emerald-600 rounded px-2 py-1 transition-colors"
        >
          clear scroll
        </button>
      </div>

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
            className="bg-emerald-900/40 hover:bg-emerald-800/50 disabled:opacity-30 border border-emerald-700 text-emerald-300 rounded px-4 py-2 text-sm transition-colors"
          >
            send
          </button>
        </div>
      </div>
    </>
  );
}

export default function MirrorApp() {
  const [mode, setMode] = useState(() => {
    try {
      return localStorage.getItem(MODE_KEY) || "garden";
    } catch {
      return "garden";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // ignore
    }
  }, [mode]);

  return (
    <div className="min-h-screen w-full bg-black text-emerald-400 font-mono flex flex-col">
      <div className="border-b border-emerald-900 px-4 py-3 flex items-center justify-between shrink-0">
        <span className="text-emerald-300">mirror.exe</span>
        <ModeSwitcher mode={mode} setMode={setMode} />
      </div>

      {mode === "garden" ? <GardenMode /> : <OpenMode />}
    </div>
  );
}
