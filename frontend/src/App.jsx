// src/App.jsx
import { useState, useRef, useEffect, useCallback } from "react";
import { useChat } from "./hooks/useChat";
import { useKnowledgeBase } from "./hooks/useKnowledgeBase";

// ── Icons (inline SVG — no extra dependency) ──────────────────────────────────
const Icon = {
  Brain: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-full h-full">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.44-3.14Z"/>
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.44-3.14Z"/>
    </svg>
  ),
  Upload: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-full h-full">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  Link: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-full h-full">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  ),
  File: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-full h-full">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
    </svg>
  ),
  Globe: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-full h-full">
      <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  ),
  Trash: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-full h-full">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  ),
  Send: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  ),
  Stop: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
      <rect x="6" y="6" width="12" height="12" rx="2"/>
    </svg>
  ),
  ChevronDown: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  ),
  ChevronRight: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  Menu: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full">
      <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  ),
  X: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  Sparkles: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-full h-full">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    </svg>
  ),
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const truncate = (str, n) => str.length > n ? str.slice(0, n) + "…" : str;

const STATUS_CONFIG = {
  parsing:   { label: "Parsing",   color: "#f59e0b", pulse: true  },
  embedding: { label: "Embedding", color: "#8b5cf6", pulse: true  },
  ready:     { label: "Ready",     color: "#10b981", pulse: false },
  error:     { label: "Error",     color: "#ef4444", pulse: false },
};

const CONN_COLOR = {
  connected:    "#10b981",
  disconnected: "#ef4444",
  connecting:   "#f59e0b",
};

const STARTER_PROMPTS = [
  "Summarize the key points from the uploaded documents.",
  "What are the main topics covered across all sources?",
  "Extract any action items or recommendations mentioned.",
];

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusDot({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.parsing;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: cfg.color, display: "inline-block",
        animation: cfg.pulse ? "pulse 1.5s ease-in-out infinite" : "none",
      }} />
      <span style={{ fontSize: 11, color: cfg.color, fontWeight: 500 }}>
        {cfg.label}
      </span>
    </span>
  );
}

function DocItem({ doc, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const iconColor = doc.type === "pdf" ? "#fb7185"
    : doc.type === "docx" ? "#60a5fa"
    : doc.type === "web" ? "#34d399" : "#a78bfa";

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await onDelete(doc.id);
    } catch (err) {
      console.error("Delete failed:", err?.message || err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "9px 12px", borderRadius: 10, cursor: "default",
        background: hovered ? "rgba(39,39,42,0.8)" : "transparent",
        transition: "background .15s",
      }}
    >
      <span style={{ width: 16, height: 16, color: iconColor, flexShrink: 0 }}>
        {doc.type === "web" ? <Icon.Globe /> : <Icon.File />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, color: "#d4d4d8",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {truncate(doc.name, 28)}
        </div>
        <div style={{ marginTop: 3 }}>
          <StatusDot status={doc.status} />
        </div>
      </div>
      {hovered && (
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          style={{
            width: 20, height: 20, padding: 2, borderRadius: 5,
            border: "none", background: "transparent",
            color: "#71717a", cursor: isDeleting ? "not-allowed" : "pointer",
            opacity: isDeleting ? 0.6 : 1,
          }}
          onMouseEnter={e => e.currentTarget.style.color = "#f87171"}
          onMouseLeave={e => e.currentTarget.style.color = "#71717a"}
        >
          <Icon.Trash />
        </button>
      )}
    </div>
  );
}

function DropZone({ onFiles }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault();
        setDragging(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? "#7c3aed" : "#3f3f46"}`,
        borderRadius: 12, padding: "18px 12px", textAlign: "center",
        cursor: "pointer", background: dragging ? "rgba(124,58,237,.08)" : "rgba(39,39,42,0.4)",
        transition: "all .2s",
      }}
    >
      <input
        ref={inputRef} type="file" multiple
        accept=".pdf,.docx,.txt" style={{ display: "none" }}
        onChange={e => onFiles(Array.from(e.target.files))}
      />
      <div style={{ width: 24, height: 24, margin: "0 auto 8px", color: dragging ? "#a78bfa" : "#71717a" }}>
        <Icon.Upload />
      </div>
      <div style={{ fontSize: 12, color: "#a1a1aa" }}>
        <span style={{ color: "#a78bfa", fontWeight: 600 }}>Click to upload</span> or drag & drop
      </div>
      <div style={{ fontSize: 11, color: "#52525b", marginTop: 4 }}>PDF, DOCX, TXT</div>
    </div>
  );
}

function SourcesAccordion({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 10px", borderRadius: 8,
          border: "1px solid rgba(63,63,70,.5)",
          background: "rgba(39,39,42,.6)",
          cursor: "pointer", color: "#71717a",
          fontSize: 12, fontFamily: "inherit",
          transition: "all .15s",
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "#52525b"}
        onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(63,63,70,.5)"}
      >
        <span style={{ width: 14, height: 14 }}>
          {open ? <Icon.ChevronDown /> : <Icon.ChevronRight />}
        </span>
        <span>{sources.length} Retrieved Source{sources.length !== 1 ? "s" : ""}</span>
        <span style={{
          width: 18, height: 18, borderRadius: "50%",
          background: "rgba(124,58,237,.25)", color: "#a78bfa",
          fontSize: 10, display: "flex", alignItems: "center",
          justifyContent: "center", fontWeight: 600,
        }}>
          {sources.length}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {sources.map((src, i) => (
            <div key={i} style={{
              padding: "10px 12px", borderRadius: 10,
              background: "rgba(39,39,42,.5)",
              border: "1px solid rgba(63,63,70,.5)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                <span style={{
                  width: 14, height: 14, flexShrink: 0,
                  color: src.source_type === "pdf" ? "#fb7185"
                    : src.source_type === "web" ? "#34d399" : "#60a5fa",
                }}>
                  {src.source_type === "web" ? <Icon.Globe /> : <Icon.File />}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#d4d4d8" }}>
                  {truncate(src.source_name, 40)}
                </span>
                {src.page && (
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "#52525b" }}>
                    p.{src.page}
                  </span>
                )}
              </div>
              <p style={{ fontSize: 11, color: "#71717a", lineHeight: 1.6, margin: 0 }}>
                {src.snippet}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SkeletonLoader() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 0" }}>
      {[75, 100, 88, 55].map((w, i) => (
        <div key={i} style={{
          height: 12, borderRadius: 6,
          background: "#27272a", width: `${w}%`,
          animation: "shimmer 1.4s ease-in-out infinite",
          animationDelay: `${i * 0.1}s`,
        }} />
      ))}
    </div>
  );
}

function ChatMessage({ msg }) {
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
        <div style={{ maxWidth: "72%" }}>
          <div style={{
            background: "#27272a",
            border: "1px solid rgba(63,63,70,.5)",
            borderRadius: "18px 18px 4px 18px",
            padding: "10px 16px",
          }}>
            <p style={{ fontSize: 14, color: "#e4e4e7", lineHeight: 1.6, margin: 0 }}>
              {msg.content}
            </p>
          </div>
          <div style={{ fontSize: 11, color: "#52525b", textAlign: "right", marginTop: 4 }}>
            {msg.ts}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: "rgba(124,58,237,.2)",
        border: "1px solid rgba(124,58,237,.3)",
        display: "flex", alignItems: "center",
        justifyContent: "center", marginTop: 2,
        color: "#a78bfa", padding: 6,
      }}>
        <Icon.Brain />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#d4d4d8" }}>
            NexusRetrieval
          </span>
          <span style={{ fontSize: 11, color: "#52525b" }}>{msg.ts}</span>
          {msg.isStreaming && (
            <span style={{
              fontSize: 11, color: "#a78bfa",
              animation: "pulse 1s ease-in-out infinite",
            }}>
              ● thinking
            </span>
          )}
        </div>

        {msg.isStreaming && !msg.content
          ? <SkeletonLoader />
          : (
            <div style={{
              fontSize: 13, color: "#a1a1aa", lineHeight: 1.8,
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {msg.content}
            </div>
          )
        }

        <SourcesAccordion sources={msg.sources} />
      </div>
    </div>
  );
}

function WelcomeState({ onStarterClick }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      height: "100%", textAlign: "center", padding: "0 32px",
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 20, padding: 16,
        background: "rgba(124,58,237,.2)",
        border: "1px solid rgba(124,58,237,.3)",
        color: "#a78bfa", marginBottom: 20,
      }}>
        <Icon.Brain />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: "#f4f4f5", marginBottom: 8 }}>
        Ask your documents anything
      </h2>
      <p style={{ fontSize: 13, color: "#71717a", maxWidth: 340, lineHeight: 1.7, marginBottom: 36 }}>
        Upload PDFs, Word docs, or scrape websites. NexusRetrieval finds the
        exact passages that answer your question and cites every source.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 400 }}>
        {STARTER_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onStarterClick(prompt)}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 16px", borderRadius: 12,
              border: "1px solid rgba(63,63,70,.5)",
              background: "rgba(39,39,42,.5)",
              cursor: "pointer", textAlign: "left",
              fontFamily: "inherit", transition: "all .2s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = "#52525b";
              e.currentTarget.style.background = "rgba(39,39,42,.9)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = "rgba(63,63,70,.5)";
              e.currentTarget.style.background = "rgba(39,39,42,.5)";
            }}
          >
            <span style={{ width: 18, height: 18, color: "#a78bfa", flexShrink: 0 }}>
              <Icon.Sparkles />
            </span>
            <span style={{ fontSize: 13, color: "#d4d4d8" }}>{prompt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [input, setInput] = useState("");
  const [url, setUrl] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [urlError, setUrlError] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);

  const messagesEndRef = useRef();
  const textareaRef = useRef();
  const [isResetting, setIsResetting] = useState(false);

  const { messages, isStreaming, sendMessage, stopStreaming, clearMessages } = useChat();
  const {
    docs, connectionStatus, docCount,
    handleFileUpload, handleScrapeUrl, removeDoc, resetKB,
  } = useKnowledgeBase();

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback((text) => {
    const content = (text || input).trim();
    if (!content || isStreaming) return;
    setInput("");
    sendMessage(content);
  }, [input, isStreaming, sendMessage]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleScrape = async () => {
    if (!url.trim()) return;
    setUrlError("");
    setUrlLoading(true);
    try {
      new URL(url); // validate format
      await handleScrapeUrl(url.trim());
      setUrl("");
    } catch (err) {
      setUrlError(err.message.includes("Invalid URL") ? "Please enter a valid URL" : err.message);
    } finally {
      setUrlLoading(false);
    }
  };

  const connColor = CONN_COLOR[connectionStatus] || "#f59e0b";

  const handleResetChat = async () => {
    if (isResetting) return;

    setIsResetting(true);
    try {
      if (isStreaming) {
        stopStreaming();
      }
      await resetKB();
      clearMessages();
      setInput("");
      setUrl("");
      setUrlError("");
    } catch (err) {
      console.error("Reset failed:", err?.message || err);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <>
      {/* Global styles */}
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #09090b; font-family: 'SF Pro Display', 'Segoe UI', system-ui, sans-serif; overflow: hidden; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 4px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes shimmer { 0%,100%{opacity:.35} 50%{opacity:.65} }
        @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        textarea { font-family: inherit; }
        textarea::placeholder { color: #52525b; }
      `}</style>

      <div style={{ display: "flex", height: "100vh", background: "#09090b", color: "#f4f4f5", overflow: "hidden" }}>

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <div style={{
          width: sidebarOpen ? 280 : 0, flexShrink: 0,
          display: "flex", flexDirection: "column",
          borderRight: "1px solid #1c1c1e",
          background: "rgba(18,18,20,.8)",
          transition: "width .3s ease", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid #1c1c1e" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, padding: 6,
                  background: "rgba(124,58,237,.25)",
                  border: "1px solid rgba(124,58,237,.4)", color: "#a78bfa",
                }}>
                  <Icon.Brain />
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.02em" }}>
                  NexusRetrieval
                </span>
              </div>
              {/* Connection badge */}
              <div style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "rgba(39,39,42,.6)",
                border: "1px solid rgba(63,63,70,.4)",
                borderRadius: 999, padding: "3px 8px",
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: connColor, display: "inline-block",
                  animation: connectionStatus === "connecting" ? "pulse 1.5s infinite" : "none",
                }} />
                <span style={{ fontSize: 10, color: "#71717a", textTransform: "capitalize" }}>
                  {connectionStatus}
                </span>
              </div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
            {/* Upload section */}
            <div style={{ padding: "14px 12px", borderBottom: "1px solid #1c1c1e" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
                Knowledge Base
              </div>
              <DropZone onFiles={handleFileUpload} />

              {/* URL scraper */}
              <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                <div style={{
                  flex: 1, display: "flex", alignItems: "center", gap: 8,
                  background: "rgba(39,39,42,.6)", border: "1px solid #3f3f46",
                  borderRadius: 8, padding: "7px 10px",
                }}>
                  <span style={{ width: 14, height: 14, color: "#71717a", flexShrink: 0 }}>
                    <Icon.Link />
                  </span>
                  <input
                    type="text"
                    placeholder="Paste URL to scrape…"
                    value={url}
                    onChange={e => { setUrl(e.target.value); setUrlError(""); }}
                    onKeyDown={e => e.key === "Enter" && handleScrape()}
                    style={{
                      background: "transparent", border: "none", outline: "none",
                      fontSize: 12, color: "#d4d4d8", flex: 1, fontFamily: "inherit",
                    }}
                  />
                </div>
                <button
                  onClick={handleScrape}
                  disabled={urlLoading || !url.trim()}
                  style={{
                    padding: "7px 12px", borderRadius: 8, border: "none",
                    background: urlLoading ? "#4c1d95" : "#7c3aed",
                    color: "#fff", fontSize: 12, fontWeight: 500,
                    cursor: urlLoading ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap", fontFamily: "inherit",
                    transition: "background .2s",
                  }}
                >
                  {urlLoading ? "…" : "Scrape"}
                </button>
              </div>
              {urlError && (
                <p style={{ fontSize: 11, color: "#f87171", marginTop: 5, paddingLeft: 2 }}>
                  {urlError}
                </p>
              )}
            </div>

            {/* Document list */}
            <div style={{ padding: "10px 8px", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px 8px" }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Sources
                </span>
                <span style={{ fontSize: 11, color: "#52525b" }}>
                  {docCount} vectors
                </span>
              </div>
              {docs.length === 0 ? (
                <p style={{ fontSize: 12, color: "#3f3f46", textAlign: "center", padding: "20px 8px" }}>
                  No documents yet
                </p>
              ) : (
                docs.map(doc => (
                  <DocItem key={doc.id} doc={doc} onDelete={removeDoc} />
                ))
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: "10px 16px", borderTop: "1px solid #1c1c1e" }}>
            <span style={{ fontSize: 11, color: "#3f3f46" }}>
              ⚡ LCEL · ChromaDB · LLaMA 3.1
            </span>
          </div>
        </div>

        {/* ── Main area ────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

          {/* Top bar */}
          <div style={{
            height: 48, display: "flex", alignItems: "center", gap: 10,
            padding: "0 16px", borderBottom: "1px solid #1c1c1e",
            background: "rgba(9,9,11,.8)", flexShrink: 0,
          }}>
            <button
              onClick={() => setSidebarOpen(p => !p)}
              style={{
                width: 28, height: 28, padding: 6, borderRadius: 8,
                border: "none", background: "transparent",
                color: "#52525b", cursor: "pointer",
              }}
              onMouseEnter={e => e.currentTarget.style.color = "#d4d4d8"}
              onMouseLeave={e => e.currentTarget.style.color = "#52525b"}
            >
              <Icon.Menu />
            </button>
            <div style={{ width: 1, height: 16, background: "#27272a" }} />
            <span style={{ fontSize: 13, color: "#71717a", fontWeight: 500 }}>
              Document Intelligence Chat
            </span>
            <button
              onClick={handleResetChat}
              disabled={isResetting}
              style={{
                marginLeft: 12,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(239,68,68,.35)",
                background: "rgba(127,29,29,.2)",
                color: "#fca5a5",
                cursor: isResetting ? "not-allowed" : "pointer",
                fontSize: 12,
                fontFamily: "inherit",
                opacity: isResetting ? 0.7 : 1,
              }}
            >
              {isResetting ? "Resetting..." : "Reset Chat"}
            </button>
            <div style={{ marginLeft: "auto", fontSize: 11, color: "#3f3f46" }}>
              {messages.length > 0 && `${messages.filter(m => m.role === "user").length} exchanges`}
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px 0" }}>
            {messages.length === 0
              ? <WelcomeState onStarterClick={handleSend} />
              : (
                <div style={{ maxWidth: 680, margin: "0 auto" }}>
                  {messages.map(msg => (
                    <div key={msg.id} style={{ animation: "fadeIn .25s ease-out" }}>
                      <ChatMessage msg={msg} />
                    </div>
                  ))}
                  <div ref={messagesEndRef} style={{ height: 8 }} />
                </div>
              )
            }
          </div>

          {/* Input bar */}
          <div style={{ flexShrink: 0, padding: "12px 24px 20px", borderTop: "1px solid #1c1c1e" }}>
            <div style={{ maxWidth: 680, margin: "0 auto" }}>
              <div style={{
                display: "flex", alignItems: "flex-end", gap: 10,
                background: "rgba(18,18,20,.9)",
                border: "1px solid #3f3f46",
                borderRadius: 18, padding: "10px 12px 10px 16px",
                boxShadow: "0 8px 32px rgba(0,0,0,.4)",
                transition: "border-color .2s",
              }}
                onFocusCapture={e => e.currentTarget.style.borderColor = "#52525b"}
                onBlurCapture={e => e.currentTarget.style.borderColor = "#3f3f46"}
              >
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question about your documents…"
                  rows={1}
                  maxLength={4000}
                  style={{
                    flex: 1, background: "transparent", border: "none",
                    outline: "none", fontSize: 14, color: "#e4e4e7",
                    lineHeight: 1.6, resize: "none", maxHeight: 120,
                    overflowY: "auto",
                  }}
                />
                <button
                  onClick={isStreaming ? stopStreaming : handleSend}
                  style={{
                    width: 34, height: 34, borderRadius: 10, border: "none",
                    flexShrink: 0, cursor: "pointer", padding: 8,
                    background: isStreaming ? "#7f1d1d"
                      : input.trim() ? "#7c3aed" : "#27272a",
                    color: isStreaming ? "#fca5a5"
                      : input.trim() ? "#fff" : "#52525b",
                    transition: "all .2s",
                    boxShadow: input.trim() && !isStreaming
                      ? "0 4px 14px rgba(124,58,237,.4)" : "none",
                  }}
                >
                  {isStreaming ? <Icon.Stop /> : <Icon.Send />}
                </button>
              </div>

              <div style={{
                display: "flex", justifyContent: "space-between",
                padding: "6px 4px 0", fontSize: 11, color: "#3f3f46",
              }}>
                <span>
                  {docs.filter(d => d.status === "ready").length} sources ready
                  {docs.some(d => d.status === "parsing" || d.status === "embedding") && (
                    <span style={{ color: "#f59e0b", marginLeft: 8 }}>
                      · {docs.filter(d => d.status !== "ready" && d.status !== "error").length} processing
                    </span>
                  )}
                </span>
                <span>{input.length > 0 ? `${input.length}/4000` : "⏎ send · ⇧⏎ newline"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}