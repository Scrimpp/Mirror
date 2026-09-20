import { useEffect, useMemo, useRef, useState } from "react";

const GARDEN_PERSONA = `you are a thoughtful creative partner.
reply in lowercase, stay concise, and focus on reflection, creation, and growth.
when an image would help, append <<PORTRAIT: detailed visual prompt>> to the end of your reply.`;

const DEFAULT_OPEN_PERSONA = `you are a helpful assistant.
speak plainly, lowercase, no filler.`;

const MODE_KEY = "garden-open-mode-v1";
const GARDEN_STORAGE_KEY = "garden-session-v2";
const OPEN_STORAGE_KEY = "open-session-v1";
const WORLD_TYPES = ["billboard", "portal", "totem", "window"];

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

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildObjectTitle(prompt) {
  const compact = (prompt || "").replace(/\s+/g, " ").trim();
  return compact ? compact.slice(0, 40) : "mirror object";
}

function createWorldObject(asset, index) {
  const lane = (index % 5) - 2;
  const depthBand = Math.floor(index / 5);

  return {
    id: crypto.randomUUID(),
    assetId: asset.id,
    asset,
    title: buildObjectTitle(asset.prompt),
    objectType: WORLD_TYPES[index % WORLD_TYPES.length],
    x: lane * 84,
    y: depthBand % 2 === 0 ? 0 : 10,
    z: -depthBand * 90 - 40,
    scale: 1,
    rotationY: lane * 8,
    createdAt: new Date().toISOString(),
  };
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

function updateWorldObject(objects, id, updates) {
  return objects.map((object) => (object.id === id ? { ...object, ...updates } : object));
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

function WorldObjectVisual({ object, selected, onSelect }) {
  const frameClass =
    object.objectType === "portal"
      ? "rounded-full border-violet-400/80 shadow-[0_0_28px_rgba(167,139,250,0.35)]"
      : object.objectType === "totem"
        ? "rounded-sm border-amber-500/80"
        : object.objectType === "window"
          ? "rounded-md border-cyan-400/80"
          : "rounded-sm border-emerald-400/80";

  const sizeClass =
    object.objectType === "totem"
      ? "w-24 h-40"
      : object.objectType === "portal"
        ? "w-32 h-32"
        : object.objectType === "window"
          ? "w-32 h-24"
          : "w-28 h-36";

  const imageClass =
    object.objectType === "portal"
      ? "rounded-full"
      : object.objectType === "totem"
        ? "rounded-sm"
        : "rounded-[2px]";

  return (
    <button
      type="button"
      onClick={() => onSelect(object.id)}
      className="absolute left-1/2 bottom-20 focus:outline-none"
      style={{
        transformStyle: "preserve-3d",
        transform: `translateX(calc(-50% + ${object.x}px)) translateY(${-object.y}px) translateZ(${object.z}px) rotateY(${object.rotationY}deg) scale(${object.scale})`,
      }}
    >
      <div className="absolute left-1/2 top-full h-10 w-6 -translate-x-1/2 bg-black/30 blur-md" />
      <div
        className={`relative ${sizeClass} overflow-hidden border-2 bg-black/60 p-1 ${frameClass} ${
          selected ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-black" : ""
        }`}
      >
        <img
          src={object.asset.url}
          alt={object.title}
          className={`h-full w-full object-cover ${imageClass}`}
          style={{ imageRendering: "pixelated" }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_0%,rgba(0,0,0,0.22)_100%)]" />
        {object.objectType === "totem" && (
          <div className="pointer-events-none absolute inset-x-3 -bottom-2 h-4 bg-amber-500/25 blur-sm" />
        )}
        {object.objectType === "window" && (
          <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-cyan-300/60" />
        )}
      </div>
    </button>
  );
}

function PixelWorld({ worldObjects, selectedObjectId, onSelect }) {
  const orderedObjects = useMemo(
    () => [...worldObjects].sort((a, b) => a.z - b.z || a.y - b.y),
    [worldObjects]
  );

  return (
    <div className="relative h-[26rem] overflow-hidden rounded border border-emerald-900 bg-black">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.08),transparent_45%),linear-gradient(180deg,#05060a_0%,#07131c_48%,#09170f_100%)]" />
      <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(#7dd3fc_1px,transparent_1px)] [background-size:28px_28px]" />

      <div className="absolute inset-x-0 bottom-0 h-56" style={{ perspective: "900px" }}>
        <div
          className="absolute inset-x-[-15%] bottom-[-8rem] h-80 border border-emerald-900/40 bg-emerald-950/10"
          style={{
            transform: "rotateX(78deg)",
            transformOrigin: "center top",
            backgroundImage:
              "linear-gradient(rgba(16,185,129,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.18) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      <div className="absolute inset-0" style={{ perspective: "900px" }}>
        <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
          {orderedObjects.map((object) => (
            <WorldObjectVisual
              key={object.id}
              object={object}
              selected={object.id === selectedObjectId}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>

      <div className="absolute left-3 top-3 text-[11px] uppercase tracking-[0.25em] text-emerald-600">
        mirror world
      </div>
      <div className="absolute right-3 top-3 text-[11px] text-emerald-700">
        pixel 3d · art-based
      </div>
      {worldObjects.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-emerald-700">
          portraits you generate in the garden will appear here as placeable world objects.
        </div>
      )}
    </div>
  );
}

function ObjectEditor({ worldObjects, selectedObjectId, onSelect, onUpdate, onRemove }) {
  const selectedObject = worldObjects.find((object) => object.id === selectedObjectId) || null;

  function updateField(field, value) {
    if (!selectedObject) return;
    onUpdate(selectedObject.id, { [field]: value });
  }

  function updateNumberField(field, value) {
    if (!selectedObject) return;
    onUpdate(selectedObject.id, { [field]: toNumber(value, selectedObject[field]) });
  }

  return (
    <div className="space-y-3 rounded border border-emerald-900 p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-amber-400">world objects</div>
        <div className="text-[11px] text-emerald-700">{worldObjects.length} placed</div>
      </div>

      <div className="flex flex-wrap gap-2">
        {worldObjects.map((object) => (
          <button
            key={object.id}
            type="button"
            onClick={() => onSelect(object.id)}
            className={`rounded border px-2 py-1 text-xs transition-colors ${
              object.id === selectedObjectId
                ? "border-amber-500 text-amber-300"
                : "border-emerald-900 text-emerald-600 hover:text-emerald-300"
            }`}
          >
            {object.title}
          </button>
        ))}
      </div>

      {!selectedObject && <div className="text-xs text-emerald-700">select an object to shape the world.</div>}

      {selectedObject && (
        <div className="space-y-3">
          <input
            value={selectedObject.title}
            onChange={(e) => updateField("title", e.target.value)}
            placeholder="object title"
            className="w-full bg-emerald-950/20 border border-emerald-900 rounded px-3 py-2 text-sm text-emerald-100 placeholder-emerald-900 focus:outline-none focus:border-emerald-600"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={selectedObject.objectType}
              onChange={(e) => updateField("objectType", e.target.value)}
              className="bg-emerald-950/20 border border-emerald-900 rounded px-3 py-2 text-sm text-emerald-100 focus:outline-none focus:border-emerald-600"
            >
              {WORLD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <input
              value={selectedObject.scale}
              onChange={(e) => updateNumberField("scale", e.target.value)}
              placeholder="scale"
              className="bg-emerald-950/20 border border-emerald-900 rounded px-3 py-2 text-sm text-emerald-100 placeholder-emerald-900 focus:outline-none focus:border-emerald-600"
            />
            <input
              value={selectedObject.x}
              onChange={(e) => updateNumberField("x", e.target.value)}
              placeholder="x"
              className="bg-emerald-950/20 border border-emerald-900 rounded px-3 py-2 text-sm text-emerald-100 placeholder-emerald-900 focus:outline-none focus:border-emerald-600"
            />
            <input
              value={selectedObject.z}
              onChange={(e) => updateNumberField("z", e.target.value)}
              placeholder="z"
              className="bg-emerald-950/20 border border-emerald-900 rounded px-3 py-2 text-sm text-emerald-100 placeholder-emerald-900 focus:outline-none focus:border-emerald-600"
            />
            <input
              value={selectedObject.y}
              onChange={(e) => updateNumberField("y", e.target.value)}
              placeholder="lift"
              className="bg-emerald-950/20 border border-emerald-900 rounded px-3 py-2 text-sm text-emerald-100 placeholder-emerald-900 focus:outline-none focus:border-emerald-600"
            />
            <input
              value={selectedObject.rotationY}
              onChange={(e) => updateNumberField("rotationY", e.target.value)}
              placeholder="rotation"
              className="bg-emerald-950/20 border border-emerald-900 rounded px-3 py-2 text-sm text-emerald-100 placeholder-emerald-900 focus:outline-none focus:border-emerald-600"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onUpdate(selectedObject.id, { x: selectedObject.x - 24 })}
              className="rounded border border-emerald-900 px-2 py-1 text-xs text-emerald-300 hover:border-emerald-600"
            >
              left
            </button>
            <button
              type="button"
              onClick={() => onUpdate(selectedObject.id, { x: selectedObject.x + 24 })}
              className="rounded border border-emerald-900 px-2 py-1 text-xs text-emerald-300 hover:border-emerald-600"
            >
              right
            </button>
            <button
              type="button"
              onClick={() => onUpdate(selectedObject.id, { z: selectedObject.z - 32 })}
              className="rounded border border-emerald-900 px-2 py-1 text-xs text-emerald-300 hover:border-emerald-600"
            >
              deeper
            </button>
            <button
              type="button"
              onClick={() => onUpdate(selectedObject.id, { z: selectedObject.z + 32 })}
              className="rounded border border-emerald-900 px-2 py-1 text-xs text-emerald-300 hover:border-emerald-600"
            >
              closer
            </button>
          </div>
          <button
            type="button"
            onClick={() => onRemove(selectedObject.id)}
            className="rounded border border-red-900 px-3 py-2 text-xs text-red-400 hover:bg-red-950/20"
          >
            remove from world
          </button>
        </div>
      )}
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
  const [worldObjects, setWorldObjects] = useState(saved?.worldObjects ?? []);
  const [selectedWorldObjectId, setSelectedWorldObjectId] = useState(
    saved?.selectedWorldObjectId ?? saved?.worldObjects?.[0]?.id ?? null
  );
  const scrollRef = useRef(null);

  useEffect(() => {
    saveJSON(GARDEN_STORAGE_KEY, {
      messages,
      portraitPrompt,
      portraitAsset,
      portraitIndex,
      worldObjects,
      selectedWorldObjectId,
    });
  }, [messages, portraitPrompt, portraitAsset, portraitIndex, worldObjects, selectedWorldObjectId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, portraitLoading]);

  useEffect(() => {
    if (!selectedWorldObjectId && worldObjects.length > 0) {
      setSelectedWorldObjectId(worldObjects[worldObjects.length - 1].id);
    }
  }, [selectedWorldObjectId, worldObjects]);

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
      const asset = data.asset;
      const object = createWorldObject(asset, worldObjects.length);
      setPortraitAsset(asset);
      setWorldObjects((prev) => [...prev, object]);
      setSelectedWorldObjectId(object.id);
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
        nextMessages.map((message) => ({ role: message.role, content: message.content }))
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

  function updateObject(id, updates) {
    setWorldObjects((prev) => updateWorldObject(prev, id, updates));
  }

  function removeObject(id) {
    setWorldObjects((prev) => prev.filter((object) => object.id !== id));
    setSelectedWorldObjectId((current) => (current === id ? null : current));
  }

  function restart() {
    setMessages([]);
    setError(null);
    setPortraitPrompt(null);
    setPortraitAsset(null);
    setPortraitIndex(null);
    setWorldObjects([]);
    setSelectedWorldObjectId(null);
    try {
      localStorage.removeItem(GARDEN_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col border-b border-emerald-900 lg:border-b-0 lg:border-r">
        <div className="border-b border-emerald-900 px-4 py-2 flex items-center justify-between shrink-0">
          <span className="text-xs text-emerald-700">garden console</span>
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
                  <div className="mt-4 rounded border border-amber-900 px-3 py-3 space-y-2">
                    <div className="text-amber-500 text-xs">&gt; art births the world</div>
                    {portraitPrompt && (
                      <div className="text-xs text-emerald-700 whitespace-pre-wrap">{portraitPrompt}</div>
                    )}
                    {portraitLoading && (
                      <div className="text-sm text-emerald-700 animate-pulse">shaping a pixel object from the portrait...</div>
                    )}
                    {portraitAsset && (
                      <div className="text-xs text-emerald-300">
                        placed in mirror world as a live object based on the art.
                      </div>
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
      </div>

      <div className="flex min-h-0 flex-1 flex-col bg-black/40">
        <div className="border-b border-emerald-900 px-4 py-2 shrink-0">
          <div className="text-xs text-amber-400">mirror world</div>
          <div className="text-[11px] text-emerald-700">a pixel 3d world based off the art you generate</div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <PixelWorld
            worldObjects={worldObjects}
            selectedObjectId={selectedWorldObjectId}
            onSelect={setSelectedWorldObjectId}
          />
          <ObjectEditor
            worldObjects={worldObjects}
            selectedObjectId={selectedWorldObjectId}
            onSelect={setSelectedWorldObjectId}
            onUpdate={updateObject}
            onRemove={removeObject}
          />
        </div>
      </div>
    </div>
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
        <span className="text-emerald-300">mirror world</span>
        <ModeSwitcher mode={mode} setMode={setMode} />
      </div>

      {mode === "garden" ? <GardenMode /> : <OpenMode />}
    </div>
  );
}
