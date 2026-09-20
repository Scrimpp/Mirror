import { useEffect, useRef, useState } from "react";

const GARDEN_PERSONA = `you are a thoughtful creative partner.
reply in lowercase, stay concise, and focus on reflection, creation, and growth.
when an image would help, append <<PORTRAIT: detailed visual prompt>> to the end of your reply.`;

const DEFAULT_OPEN_PERSONA = `you are a helpful assistant.
speak plainly, lowercase, no filler.`;

const MODE_KEY = "garden-open-mode-v1";
const GARDEN_STORAGE_KEY = "garden-session-v1";
const OPEN_STORAGE_KEY = "open-session-v1";
const NEUNEX_HISTORY_KEY = "neunex-submission-history-v1";
const DEFAULT_SUBMISSION_FORM = {
  title: "",
  worldId: "",
  objectType: "billboard",
  materialStyle: "portrait",
  scale: "1",
  positionX: "0",
  positionY: "0",
  positionZ: "0",
  rotationY: "0",
};

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

function buildSubmissionTitle(prompt) {
  const compact = (prompt || "").replace(/\s+/g, " ").trim();
  if (!compact) return "garden portrait";
  return compact.slice(0, 60);
}

function createSubmissionDraft(prompt) {
  return {
    ...DEFAULT_SUBMISSION_FORM,
    title: buildSubmissionTitle(prompt),
  };
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

async function readError(response, prefix) {
  let detail = "";
  try {
    const errBody = await response.json();
    detail = errBody?.error?.message || errBody?.error || errBody?.hint || JSON.stringify(errBody);
  } catch {
    detail = await response.text();
  }
  throw new Error(`${prefix} ${response.status}: ${detail}`);
}

async function callChat(system, messages) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, messages }),
  });

  if (!response.ok) {
    await readError(response, "api error");
  }

  const data = await response.json();
  const textBlock = data.content?.find((block) => block.type === "text");
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
        open chat
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
  const [portraitAsset, setPortraitAsset] = useState(saved?.portraitAsset ?? null);
  const [portraitIndex, setPortraitIndex] = useState(saved?.portraitIndex ?? null);
  const [portraitLoading, setPortraitLoading] = useState(false);
  const [submissionDraft, setSubmissionDraft] = useState(
    saved?.submissionDraft ?? createSubmissionDraft(saved?.portraitPrompt)
  );
  const [submissionLoading, setSubmissionLoading] = useState(false);
  const [submissionError, setSubmissionError] = useState(null);
  const [submissionResult, setSubmissionResult] = useState(saved?.submissionResult ?? null);
  const [submissionHistory, setSubmissionHistory] = useState(() => {
    const history = loadJSON(NEUNEX_HISTORY_KEY);
    return Array.isArray(history) ? history : [];
  });
  const scrollRef = useRef(null);

  useEffect(() => {
    saveJSON(GARDEN_STORAGE_KEY, {
      messages,
      portraitPrompt,
      portraitAsset,
      portraitIndex,
      submissionDraft,
      submissionResult,
    });
  }, [messages, portraitPrompt, portraitAsset, portraitIndex, submissionDraft, submissionResult]);

  useEffect(() => {
    saveJSON(NEUNEX_HISTORY_KEY, submissionHistory);
  }, [submissionHistory]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, portraitLoading, submissionLoading]);

  async function generatePortrait(prompt) {
    setPortraitLoading(true);
    try {
      const res = await fetch("/api/portrait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) {
        await readError(res, "portrait api error");
      }
      const data = await res.json();
      setPortraitAsset(data.asset);
    } catch (e) {
      setError(`portrait failed: ${e.message}`);
    } finally {
      setPortraitLoading(false);
    }
  }

  async function submitToNeunex() {
    if (!portraitAsset || submissionLoading) return;

    setSubmissionLoading(true);
    setSubmissionError(null);
    setSubmissionResult(null);

    try {
      const payload = {
        asset: portraitAsset,
        submission: {
          title: submissionDraft.title.trim() || buildSubmissionTitle(portraitAsset.prompt),
          worldId: submissionDraft.worldId.trim(),
          objectType: submissionDraft.objectType,
          materialStyle: submissionDraft.materialStyle.trim() || "portrait",
          scale: toNumber(submissionDraft.scale, 1),
          position: {
            x: toNumber(submissionDraft.positionX, 0),
            y: toNumber(submissionDraft.positionY, 0),
            z: toNumber(submissionDraft.positionZ, 0),
          },
          rotation: {
            x: 0,
            y: toNumber(submissionDraft.rotationY, 0),
            z: 0,
          },
        },
        session: {
          id: portraitAsset.id,
          mode: "garden",
          messageCount: messages.length,
        },
      };

      const response = await fetch("/api/neunex-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        await readError(response, "neunex submit error");
      }

      const data = await response.json();
      setSubmissionResult(data.submission);
      setSubmissionHistory((prev) => [data.submission, ...prev].slice(0, 8));
    } catch (e) {
      setSubmissionError(e.message || String(e));
    } finally {
      setSubmissionLoading(false);
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
        nextMessages.map((message) => ({ role: message.role, content: message.content }))
      );
      const { text: cleanText, portraitPrompt: prompt } = parseGardenReply(raw);
      setMessages((prev) => [...prev, { role: "assistant", content: cleanText }]);
      if (prompt) {
        setPortraitIndex(nextMessages.length);
        setPortraitPrompt(prompt);
        setPortraitAsset(null);
        setSubmissionDraft(createSubmissionDraft(prompt));
        setSubmissionError(null);
        setSubmissionResult(null);
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

  function handleSubmissionFieldChange(field, value) {
    setSubmissionDraft((prev) => ({ ...prev, [field]: value }));
  }

  function restart() {
    setMessages([]);
    setError(null);
    setPortraitPrompt(null);
    setPortraitAsset(null);
    setPortraitIndex(null);
    setSubmissionDraft(createSubmissionDraft());
    setSubmissionError(null);
    setSubmissionResult(null);
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

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="text-emerald-800 text-sm">&gt; say something. i&apos;m listening.</div>
        )}

        {messages.map((message, index) => {
          const showPortraitPanel = index === portraitIndex && (portraitLoading || portraitAsset || portraitPrompt);

          return (
            <div key={index}>
              <div className={message.role === "user" ? "text-amber-500" : "text-emerald-300"}>
                {message.role === "user" ? "> you" : "> garden"}
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed mt-0.5 text-emerald-100">
                {message.content}
              </div>
              {showPortraitPanel && (
                <div className="border border-amber-900 rounded px-3 py-3 mt-4 space-y-3">
                  <div className="text-amber-500 text-xs">&gt; the portrait</div>
                  {portraitLoading && (
                    <div className="text-sm text-emerald-700 animate-pulse">the portrait is forming...</div>
                  )}
                  {portraitAsset && (
                    <>
                      <img
                        src={portraitAsset.url}
                        alt="portrait"
                        className="w-full rounded border border-emerald-900"
                      />
                      <div className="text-[11px] text-emerald-700 break-words">
                        asset {portraitAsset.id} · ready for neunex submission
                      </div>
                      <a
                        href={portraitAsset.url}
                        download={`portrait-${Date.now()}.png`}
                        className="inline-block text-xs text-amber-400 border border-amber-900 rounded px-2 py-1 hover:bg-amber-950/30"
                      >
                        save portrait
                      </a>

                      <div className="border border-emerald-900 rounded p-3 space-y-3">
                        <div className="text-xs text-amber-400">submit to neunex</div>
                        <input
                          value={submissionDraft.title}
                          onChange={(e) => handleSubmissionFieldChange("title", e.target.value)}
                          placeholder="title"
                          className="w-full bg-emerald-950/20 border border-emerald-900 rounded px-3 py-2 text-sm text-emerald-100 placeholder-emerald-900 focus:outline-none focus:border-emerald-600"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            value={submissionDraft.worldId}
                            onChange={(e) => handleSubmissionFieldChange("worldId", e.target.value)}
                            placeholder="world id"
                            className="bg-emerald-950/20 border border-emerald-900 rounded px-3 py-2 text-sm text-emerald-100 placeholder-emerald-900 focus:outline-none focus:border-emerald-600"
                          />
                          <select
                            value={submissionDraft.objectType}
                            onChange={(e) => handleSubmissionFieldChange("objectType", e.target.value)}
                            className="bg-emerald-950/20 border border-emerald-900 rounded px-3 py-2 text-sm text-emerald-100 focus:outline-none focus:border-emerald-600"
                          >
                            <option value="billboard">billboard</option>
                            <option value="plane">plane</option>
                            <option value="object">object</option>
                            <option value="world">world</option>
                          </select>
                          <input
                            value={submissionDraft.materialStyle}
                            onChange={(e) => handleSubmissionFieldChange("materialStyle", e.target.value)}
                            placeholder="material style"
                            className="bg-emerald-950/20 border border-emerald-900 rounded px-3 py-2 text-sm text-emerald-100 placeholder-emerald-900 focus:outline-none focus:border-emerald-600"
                          />
                          <input
                            value={submissionDraft.scale}
                            onChange={(e) => handleSubmissionFieldChange("scale", e.target.value)}
                            placeholder="scale"
                            className="bg-emerald-950/20 border border-emerald-900 rounded px-3 py-2 text-sm text-emerald-100 placeholder-emerald-900 focus:outline-none focus:border-emerald-600"
                          />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <input
                            value={submissionDraft.positionX}
                            onChange={(e) => handleSubmissionFieldChange("positionX", e.target.value)}
                            placeholder="pos x"
                            className="bg-emerald-950/20 border border-emerald-900 rounded px-3 py-2 text-sm text-emerald-100 placeholder-emerald-900 focus:outline-none focus:border-emerald-600"
                          />
                          <input
                            value={submissionDraft.positionY}
                            onChange={(e) => handleSubmissionFieldChange("positionY", e.target.value)}
                            placeholder="pos y"
                            className="bg-emerald-950/20 border border-emerald-900 rounded px-3 py-2 text-sm text-emerald-100 placeholder-emerald-900 focus:outline-none focus:border-emerald-600"
                          />
                          <input
                            value={submissionDraft.positionZ}
                            onChange={(e) => handleSubmissionFieldChange("positionZ", e.target.value)}
                            placeholder="pos z"
                            className="bg-emerald-950/20 border border-emerald-900 rounded px-3 py-2 text-sm text-emerald-100 placeholder-emerald-900 focus:outline-none focus:border-emerald-600"
                          />
                          <input
                            value={submissionDraft.rotationY}
                            onChange={(e) => handleSubmissionFieldChange("rotationY", e.target.value)}
                            placeholder="rot y"
                            className="bg-emerald-950/20 border border-emerald-900 rounded px-3 py-2 text-sm text-emerald-100 placeholder-emerald-900 focus:outline-none focus:border-emerald-600"
                          />
                        </div>
                        <button
                          onClick={submitToNeunex}
                          disabled={submissionLoading}
                          className="bg-amber-900/30 hover:bg-amber-800/40 disabled:opacity-30 border border-amber-700 text-amber-300 rounded px-4 py-2 text-sm transition-colors"
                        >
                          {submissionLoading ? "submitting..." : "submit to neunex"}
                        </button>
                        {submissionResult && (
                          <div className="text-xs text-emerald-300 border border-emerald-900 rounded px-3 py-2 break-words">
                            submitted {submissionResult.objectType}
                            {submissionResult.worldId ? ` to ${submissionResult.worldId}` : " to neunex"}
                            {submissionResult.id ? ` · id ${submissionResult.id}` : ""}
                          </div>
                        )}
                        {submissionError && (
                          <div className="text-xs text-red-400 border border-red-900 rounded px-3 py-2 whitespace-pre-wrap break-words">
                            {submissionError}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div>
            <div className="text-emerald-300">&gt; garden</div>
            <div className="text-sm text-emerald-700 animate-pulse mt-0.5">thinking...</div>
          </div>
        )}

        {submissionHistory.length > 0 && (
          <div className="border border-emerald-900 rounded px-3 py-3">
            <div className="text-xs text-amber-500 mb-2">&gt; recent neunex submissions</div>
            <div className="space-y-2">
              {submissionHistory.map((entry) => (
                <div key={`${entry.assetId}-${entry.submittedAt}`} className="text-xs text-emerald-200">
                  <div>{entry.title || "untitled"}</div>
                  <div className="text-emerald-700 break-words">
                    {entry.objectType}
                    {entry.worldId ? ` · ${entry.worldId}` : ""}
                    {entry.id ? ` · ${entry.id}` : ""}
                  </div>
                </div>
              ))}
            </div>
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
      const safePersona = persona.trim().length > 0 ? persona : "you are a helpful assistant.";
      const reply = await callChat(
        safePersona,
        nextMessages.map((message) => ({ role: message.role, content: message.content }))
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
          onClick={() => setPersonaOpen((open) => !open)}
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
          <div className="text-emerald-800 text-sm">&gt; the list is empty. say something to start the scroll.</div>
        )}
        {messages.map((message, index) => (
          <div key={index}>
            <div className={message.role === "user" ? "text-amber-500" : "text-emerald-300"}>
              {message.role === "user" ? "> you" : "> open"}
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed mt-0.5 text-emerald-100">
              {message.content}
            </div>
          </div>
        ))}
        {loading && (
          <div>
            <div className="text-emerald-300">&gt; open</div>
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
        <span className="text-emerald-300">garden chat</span>
        <ModeSwitcher mode={mode} setMode={setMode} />
      </div>

      {mode === "garden" ? <GardenMode /> : <OpenMode />}
    </div>
  );
}
