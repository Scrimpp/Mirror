import { useState, useRef, useEffect } from "react";

const MODE_KEY = "-mode-v1";
const LISTING_TYPES = ["art", "nft", "3d"];
const GARDEN_STORAGE_KEY = "garden-session-v1";
const OPEN_STORAGE_KEY = "open-market-v1";
const DEFAULT_OPEN_PERSONA = `you are warm, curious, a little playful. you speak simply and don't perform. you care about what's real. you find beauty in ordinary things. sunny but never fake.`;

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

  

  const portraitMatch = text.match(/<<PORTRAIT:\s*([\s\S]*?)>>/);
  if (portraitMatch) {
    portraitPrompt = portraitMatch[1].trim();
    text = text.replace(portraitMatch[0], "").trim();
  } else {
    // fallback: the model sometimes writes the closing line and the
    // portrait description but forgets the <<PORTRAIT:>> wrapper.
    // if there's substantial text after " heard enough",
    // treat it as the prompt anyway.
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
        🌳
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
  const scrollRef = useRef(null);

  useEffect(() => {
    saveJSON(GARDEN_STORAGE_KEY, { messages });
  }, [messages]);

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
      const reply = await callChat(
        DEFAULT_OPEN_PERSONA,
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
      localStorage.removeItem(GARDEN_STORAGE_KEY);
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

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="text-emerald-800 text-sm">
            &gt; the list is empty. say something to start the scroll.
          </div>
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

function resizeImage(file, max = 800) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("could not read that image"));
    };
    img.src = url;
  });
}

function OpenMode() {
  const saved = loadJSON(OPEN_STORAGE_KEY);
  const [listings, setListings] = useState(saved?.listings ?? []);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [type, setType] = useState("art");
  const [image, setImage] = useState(null);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState(null);

  useEffect(() => {
    saveJSON(OPEN_STORAGE_KEY, { listings });
  }, [listings]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("photos only for now");
      return;
    }
    setError(null);
    try {
      setImage(await resizeImage(file));
    } catch (err) {
      setError(err.message);
    }
  }

  function addListing() {
    if (!image || !title.trim()) return;
    setListings((prev) => [
      { id: Date.now(), title: title.trim(), description: description.trim(), price: price.trim(), type, image },
      ...prev,
    ]);
    setTitle("");
    setDescription("");
    setPrice("");
    setImage(null);
    setError(null);
  }

  const shown = filter === "all" ? listings : listings.filter((l) => l.type === filter);
  const inputCls =
    "w-full bg-emerald-950/20 border border-emerald-900 rounded px-3 py-2 text-sm text-emerald-100 placeholder-emerald-900 focus:outline-none focus:border-emerald-600";

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <div className="border border-emerald-900 rounded p-3 space-y-2">
        <div className="text-amber-500 text-xs">&gt; list something</div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="title" className={inputCls} />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="description"
          className={`${inputCls} resize-none`}
        />
        <div className="flex gap-2">
          <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="price" className={inputCls} />
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            {LISTING_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-emerald-300 border border-emerald-700 rounded px-3 py-2 cursor-pointer hover:bg-emerald-900/40">
            {image ? "change photo" : "upload photo"}
            <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
          </label>
          {image && <img src={image} alt="preview" className="h-12 rounded border border-emerald-900" />}
          <button
            onClick={addListing}
            disabled={!image || !title.trim()}
            className="ml-auto bg-emerald-900/40 hover:bg-emerald-800/50 disabled:opacity-30 border border-emerald-700 text-emerald-300 rounded px-4 py-2 text-sm transition-colors"
          >
            list it
          </button>
        </div>
        {error && <div className="text-red-400 text-xs">{error}</div>}
      </div>

      <div className="flex gap-1 text-xs">
        {["all", ...LISTING_TYPES].map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-2 py-1 rounded border ${
              filter === t ? "border-amber-500 text-amber-400" : "border-emerald-900 text-emerald-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="text-emerald-800 text-sm">&gt; nothing listed yet.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {shown.map((l) => (
            <div key={l.id} className="border border-emerald-900 rounded overflow-hidden">
              <img src={l.image} alt={l.title} className="w-full aspect-square object-cover" />
              <div className="p-2 text-xs space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="text-emerald-200 break-words">{l.title}</span>
                  <span className="text-amber-500 shrink-0">{l.type}</span>
                </div>
                {l.description && <div className="text-emerald-700 break-words">{l.description}</div>}
                <div className="flex justify-between items-center">
                  <span className="text-amber-400">{l.price}</span>
                  <button
                    onClick={() => setListings((prev) => prev.filter((x) => x.id !== l.id))}
                    className="text-emerald-800 hover:text-red-400"
                  >
                    remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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
        <span className="text-emerald-300"></span>
        <ModeSwitcher mode={mode} setMode={setMode} />
      </div>

      {mode === "garden" ? <GardenMode /> : <OpenMode />}
    </div>
  );
}
