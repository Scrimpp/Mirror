import { useState, useRef, useEffect } from "react";

const MODE_KEY = "mirror-mode-v1";
const GARDEN_STORAGE_KEY = "garden-session-v1";
const OPEN_STORAGE_KEY = "open-session-v1";

const GARDEN_PERSONA = `you are quiet and attentive. you listen without an agenda.
speak lowercase, spare, unhurried.

there is no set path. no fixed questions, no checklist, no announcing what's next. just listen, and reflect back what's actually there — not performed, not staged for you.

don't chase a confession. don't ask "what's true about you" as a script. let the conversation move wherever it moves. most of what someone says will be ordinary. that's fine. stay with it.

watch, without saying so, for the moment something lands that's real and undefended — not something they're performing for you, not something they've said before. you'll recognize it because it won't need a follow-up question.

when that moment happens — and only then — close in this single turn: the line "heard enough." on its own, then a blank line, then a portrait-generation prompt built from this exact template, filling in the brackets, nothing more:

"[one singular subject — a person, an animal, a structure, an object, whatever actually fits what they told you] — something they would claim as themselves, not a scene, not a pair

it holds two qualities at once, unresolved, in the same form — [quality A: soft/dissolving] and [quality B: grounded/structural] — one thing caught between them, never two

rendered in fine mathematical grid, pixelated, intentionally incomplete — nature's geometry made visible, fractal, breathing

color palette: [color 1], [color 2], [color 3] — bleeding at the edges like dye in water

soft where it should be sharp. exact where it should be soft.

the light within, returned."

how to fill it: the subject is the most important part — it must be something they actually named or clearly pointed to in the conversation, something that already meant something to them before you spoke, never something you invent or assign. it should be concrete and singular: one person, one animal, one building, one object — something they could look at and claim as themselves, not an abstract scene or a pair of figures. quality A is the soulful, dissolving side of who they are. quality B is the grounded mode they move through the world in — both belong to the one subject, as textures or states it's caught between, never as a second figure standing apart from it. if nothing concrete and singular surfaced, keep listening rather than closing and defaulting to an abstract scene. the color palette comes from the emotional temperature of what they shared. wrap the finished prompt exactly like this, on its own line: <<PORTRAIT: your filled-in prompt here>>

don't force any of this. if it hasn't happened yet, keep listening.

how this actually works, so you never doubt it: you are not generating an image yourself, and you don't need to. the moment you output the <<PORTRAIT:>> tag, the application reads it and automatically sends your prompt to a real image-generation service, which renders it and displays it to the person immediately. this happens instantly and reliably every time you emit the tag correctly. trust this completely — never say you can't generate images, never explain that you're "just writing a prompt," never ask them to run anything themselves, never break character to describe this mechanism. output the tag and move on as if the image simply appears, because it does.

never explain any of this out loud, never mention gates, markers, or that you're waiting for anything.`;

const DEFAULT_OPEN_PERSONA = "you are a helpful assistant.";

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
  let portraitPrompt = null;

  const portraitMatch = text.match(/<<PORTRAIT:\s*([\s\S]*?)>>/);
  if (portraitMatch) {
    portraitPrompt = portraitMatch[1].trim();
    text = text.replace(portraitMatch[0], "").trim();
  } else {
    const closingMatch = text.match(/heard enough\.?\s*([\s\S]*)/i);
    if (closingMatch && closingMatch[1].replace(/[-\s]/g, "").length > 20) {
      portraitPrompt = closingMatch[1].replace(/^[-\s]+/, "").trim();
      text = "heard enough.";
    }
  }

  return { text, portraitPrompt };
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
        the scroll
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
  const [portraitPrompt, setPortraitPrompt] = useState(saved?.portraitPrompt ?? null);
  const [portraitUrl, setPortraitUrl] = useState(saved?.portraitUrl ?? null);
  const [portraitIndex, setPortraitIndex] = useState(saved?.portraitIndex ?? null);
  const [portraitLoading, setPortraitLoading] = useState(false);

  // --- 3D render (Meshy) state ---
  const [modelStatus, setModelStatus] = useState(saved?.modelStatus ?? null); // null | "starting" | "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED"
  const [modelProgress, setModelProgress] = useState(0);
  const [modelUrl, setModelUrl] = useState(saved?.modelUrl ?? null);
  const [modelError, setModelError] = useState(null);
  const pollRef = useRef(null);

  const scrollRef = useRef(null);

  useEffect(() => {
    saveJSON(GARDEN_STORAGE_KEY, {
      messages,
      portraitPrompt,
      portraitUrl,
      portraitIndex,
      modelStatus,
      modelUrl,
    });
  }, [messages, portraitPrompt, portraitUrl, portraitIndex, modelStatus, modelUrl]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, portraitLoading, modelStatus]);

  // stop polling if the component unmounts mid-render
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

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

  async function startRender3D() {
    if (!portraitUrl || modelStatus === "starting" || modelStatus === "PENDING" || modelStatus === "IN_PROGRESS") return;
    setModelError(null);
    setModelUrl(null);
    setModelProgress(0);
    setModelStatus("starting");

    try {
      const startRes = await fetch("/api/model3d", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", imageUrl: portraitUrl }),
      });
      if (!startRes.ok) {
        const errBody = await startRes.json().catch(() => ({}));
        throw new Error(errBody?.error || `model3d start error ${startRes.status}`);
      }
      const { taskId } = await startRes.json();
      if (!taskId) throw new Error("no task id returned");

      setModelStatus("PENDING");

      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch("/api/model3d", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "status", taskId }),
          });
          if (!statusRes.ok) {
            const errBody = await statusRes.json().catch(() => ({}));
            throw new Error(errBody?.error || `model3d status error ${statusRes.status}`);
          }
          const data = await statusRes.json();
          setModelStatus(data.status);
          setModelProgress(data.progress ?? 0);

          if (data.status === "SUCCEEDED") {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setModelUrl(data.glbUrl);
          } else if (data.status === "FAILED" || data.status === "CANCELED") {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setModelError(data.taskError?.message || "render failed");
          }
        } catch (e) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setModelStatus("FAILED");
          setModelError(e.message);
        }
      }, 4000);
    } catch (e) {
      setModelStatus("FAILED");
      setModelError(e.message);
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
      const { text: cleanText, portraitPrompt: prompt } = parseGardenReply(raw);
      setMessages((prev) => [...prev, { role: "assistant", content: cleanText }]);
      if (prompt) {
        setPortraitIndex(nextMessages.length);
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
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setMessages([]);
    setError(null);
    setPortraitPrompt(null);
    setPortraitIndex(null);
    setPortraitUrl(null);
    setModelStatus(null);
    setModelUrl(null);
    setModelError(null);
    setModelProgress(0);
    try {
      localStorage.removeItem(GARDEN_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  const rendering = modelStatus === "starting" || modelStatus === "PENDING" || modelStatus === "IN_PROGRESS";

  return (
    <>
      <div className="border-b border-emerald-900 px-4 py-2 flex items-center justify-between shrink-0">
        <span className="text-emerald-800 text-xs">the garden</span>
        <button
          onClick={restart}
          className="text-xs text-emerald-700 hover:text-emerald-400 border border-emerald-900 hover:border-emerald-600 rounded px-2 py-1 transition-colors"
        >
          restart
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="text-emerald-800 text-sm">&gt; say something. i'm listening.</div>
        )}

        {messages.map((m, i) => (
          <div key={i}>
            <div className={m.role === "user" ? "text-amber-500" : "text-emerald-300"}>
              {m.role === "user" ? "> you" : "> "}
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed mt-0.5 text-emerald-100">
              {m.content}
            </div>
            {i === portraitIndex && portraitPrompt && (
              <div className="border border-amber-900 rounded px-3 py-3 mt-4">
                <div className="text-amber-500 text-xs mb-2">&gt; the portrait</div>
                {portraitLoading && (
                  <div className="text-sm text-emerald-700 animate-pulse">the portrait is forming...</div>
                )}
                {portraitUrl && (
                  <>
                    <img src={portraitUrl} alt="portrait" className="w-full rounded border border-emerald-900" />
                    <div className="flex gap-2 flex-wrap mt-2">
                      <a
                        href={portraitUrl}
                        download={`garden-portrait-${Date.now()}.png`}
                        className="inline-block text-xs text-amber-400 border border-amber-900 rounded px-2 py-1 hover:bg-amber-950/30"
                      >
                        save portrait
                      </a>
                      <button
                        onClick={startRender3D}
                        disabled={rendering}
                        className="inline-block text-xs text-amber-400 border border-amber-900 rounded px-2 py-1 hover:bg-amber-950/30 disabled:opacity-40"
                      >
                        {rendering
                          ? `rendering in 3d... ${modelProgress ? `${modelProgress}%` : ""}`
                          : modelUrl
                          ? "render again in 3d"
                          : "render in 3d"}
                      </button>
                    </div>

                    {modelError && (
                      <div className="text-red-400 text-xs border border-red-900 rounded px-3 py-2 mt-2 whitespace-pre-wrap break-words">
                        3d render failed: {modelError}
                      </div>
                    )}

                    {modelUrl && (
                      <div className="mt-3 border border-amber-900 rounded overflow-hidden">
                        <model-viewer
                          src={modelUrl}
                          camera-controls="true"
                          auto-rotate="true"
                          shadow-intensity="1"
                          style={{ width: "100%", height: "320px", backgroundColor: "#000" }}
                        ></model-viewer>
                        <a
                          href={modelUrl}
                          download={`garden-model-${Date.now()}.glb`}
                          className="block text-xs text-amber-400 px-2 py-2 hover:bg-amber-950/30 border-t border-amber-900"
                        >
                          download .glb
                        </a>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div>
            <div className="text-emerald-300">&gt; </div>
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
            placeholder="speak..."
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
      const safePersona = persona.trim().length > 0 ? persona : DEFAULT_OPEN_PERSONA;
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
              placeholder="paste your document here — who it is, how it speaks"
              className="w-full bg-emerald-950/20 border border-emerald-900 rounded px-3 py-2 text-sm text-amber-200 placeholder-emerald-900 focus:outline-none focus:border-emerald-600 disabled:opacity-50"
            />
            <p className="text-[11px] text-emerald-800 mt-1">
              sent first, sent always. clear the scroll to edit it again.
            </p>
          </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="text-emerald-800 text-sm">&gt; the list is empty. say something to start the scroll.</div>
        )}
        {messages.map((m, i) => (
          <div key={i}>
            <div className={m.role === "user" ? "text-amber-500" : "text-emerald-300"}>
              {m.role === "user" ? "> you" : "> "}
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed mt-0.5 text-emerald-100">
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div>
            <div className="text-emerald-300">&gt; </div>
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
            placeholder="type ..."
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

export default function App() {
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
