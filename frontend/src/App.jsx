import { useState, useRef, useEffect, useCallback } from "react";
import {
  FileText, Globe, Trash2, ChevronDown, ChevronRight, Send,
  Upload, Link, Brain, Sparkles, X, Menu, PanelRightOpen,
  PanelRightClose, Loader2, CheckCircle2, Clock, Zap,
  BookOpen, Search, BarChart3, MessageSquare, File, AlertCircle,
  Hash, ArrowUp, Copy, Check
} from "lucide-react";

// ─── Design Tokens ───────────────────────────────────────────────────────────
const STATUS_COLORS = {
  connected: "bg-emerald-500",
  disconnected: "bg-red-500",
  connecting: "bg-amber-400",
};

const FILE_STATUS = {
  parsing: { label: "Parsing", color: "text-amber-400", dot: "bg-amber-400", animate: true },
  embedding: { label: "Embedding", color: "text-violet-400", dot: "bg-violet-500", animate: true },
  ready: { label: "Ready", color: "text-emerald-400", dot: "bg-emerald-500", animate: false },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const truncate = (str, n) => str.length > n ? str.slice(0, n) + "…" : str;

const STARTER_CARDS = [
  { icon: BarChart3, title: "Summarize the financial report", desc: "Get key insights from uploaded documents" },
  { icon: Search, title: "Compare across sources", desc: "Find contradictions or patterns across files" },
  { icon: BookOpen, title: "Extract action items", desc: "Identify tasks and next steps from documents" },
];

const MOCK_SOURCES = [
  { id: 1, doc: "Q4_Financial_Report.pdf", page: 4, snippet: "Revenue grew by 34% YoY reaching $2.4B in Q4 2024, driven primarily by enterprise subscriptions and expansion into APAC markets..." },
  { id: 2, doc: "Strategy_Memo_2025.docx", page: 1, snippet: "The board has approved accelerated investment in AI infrastructure totaling $800M over 18 months, with focus on compute and talent acquisition..." },
  { id: 3, doc: "market_overview.txt", page: null, snippet: "Total addressable market estimated at $47B by 2027, with AI-native platforms capturing roughly 40% of new enterprise contracts..." },
];

const INITIAL_DOCS = [
  { id: 1, name: "Q4_Financial_Report.pdf", type: "pdf", status: "ready", size: "2.4 MB" },
  { id: 2, name: "Strategy_Memo_2025.docx", type: "docx", status: "embedding", size: "890 KB" },
  { id: 3, name: "market_overview.txt", type: "txt", status: "parsing", size: "124 KB" },
  { id: 4, name: "https://openai.com/blog/...", type: "web", status: "ready", size: "Web" },
];

const INITIAL_MESSAGES = [
  {
    id: 1, role: "user",
    content: "What was the revenue growth in Q4 and what's driving it?",
    ts: "10:42 AM"
  },
  {
    id: 2, role: "ai",
    content: `Based on the uploaded documents, here's a comprehensive breakdown of Q4 performance:

**Revenue Growth Overview**
Revenue reached **$2.4 billion** in Q4 2024, representing a **34% year-over-year increase** — significantly outpacing the industry average of 18%.

**Key Growth Drivers**
1. **Enterprise subscriptions** — Accounted for 62% of total revenue, up from 51% in Q3
2. **APAC expansion** — New market penetration contributed ~$340M in incremental revenue
3. **Product upsells** — Existing customers expanded usage by an average of 2.3x

**Notable Risks**
The strategy memo flags that maintaining this trajectory requires the $800M AI infrastructure investment approved by the board, with returns expected no earlier than Q3 2026.`,
    ts: "10:42 AM",
    sources: MOCK_SOURCES,
    sourcesOpen: false
  }
];

// ─── Sub-Components ───────────────────────────────────────────────────────────

function FileIcon({ type, size = 16 }) {
  const cls = `w-${size === 16 ? 4 : 5} h-${size === 16 ? 4 : 5}`;
  if (type === "pdf") return <FileText className={cls + " text-rose-400"} />;
  if (type === "docx") return <File className={cls + " text-sky-400"} />;
  if (type === "web") return <Globe className={cls + " text-emerald-400"} />;
  return <File className={cls + " text-zinc-400"} />;
}

function StatusDot({ status }) {
  const s = FILE_STATUS[status];
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${s.dot} ${s.animate ? "animate-pulse" : ""}`} />
      <span className={`text-[11px] font-medium ${s.color}`}>{s.label}</span>
    </span>
  );
}

function DocItem({ doc, onDelete }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800/60 transition-all duration-150 cursor-default"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <FileIcon type={doc.type} size={16} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-zinc-200 truncate leading-tight">{truncate(doc.name, 28)}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <StatusDot status={doc.status} />
          <span className="text-[11px] text-zinc-600">{doc.size}</span>
        </div>
      </div>
      <button
        onClick={() => onDelete(doc.id)}
        className={`p-1 rounded-md text-zinc-600 hover:text-rose-400 hover:bg-zinc-700 transition-all duration-150 ${hovered ? "opacity-100" : "opacity-0"}`}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function DropZone({ onFileDrop }) {
  const [dragging, setDragging] = useState(false);
  const [url, setUrl] = useState("");
  const inputRef = useRef();

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    onFileDrop(files);
  };

  return (
    <div className="space-y-2.5">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-200
          ${dragging
            ? "border-violet-500 bg-violet-500/10"
            : "border-zinc-700 hover:border-zinc-500 bg-zinc-800/40 hover:bg-zinc-800/70"
          }`}
      >
        <input ref={inputRef} type="file" multiple accept=".pdf,.docx,.txt" className="hidden" onChange={(e) => onFileDrop(Array.from(e.target.files))} />
        <Upload className={`w-6 h-6 mx-auto mb-2 transition-colors ${dragging ? "text-violet-400" : "text-zinc-500"}`} />
        <p className="text-[12px] text-zinc-400 leading-relaxed">
          <span className="text-violet-400 font-medium">Click to upload</span> or drag & drop
        </p>
        <p className="text-[11px] text-zinc-600 mt-1">PDF, DOCX, TXT supported</p>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 focus-within:border-zinc-500 transition-colors">
          <Link className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <input
            type="text"
            placeholder="Paste URL to scrape…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="bg-transparent text-[12px] text-zinc-300 placeholder:text-zinc-600 outline-none flex-1 min-w-0"
          />
        </div>
        <button
          onClick={() => { if (url) { onFileDrop([{ name: url, type: "web" }]); setUrl(""); }}}
          className="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[12px] font-medium transition-colors whitespace-nowrap"
        >
          Scrape
        </button>
      </div>
    </div>
  );
}

function SourceCard({ source, onClick }) {
  return (
    <button
      onClick={() => onClick(source)}
      className="w-full text-left p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50 hover:border-zinc-600 hover:bg-zinc-800 transition-all duration-150 group"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <FileIcon type={source.doc.endsWith(".pdf") ? "pdf" : source.doc.endsWith(".docx") ? "docx" : "txt"} size={14} />
        <span className="text-[11px] font-medium text-zinc-300">{truncate(source.doc, 30)}</span>
        {source.page && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-zinc-600">
            <Hash className="w-3 h-3" />p.{source.page}
          </span>
        )}
      </div>
      <p className="text-[12px] text-zinc-500 leading-relaxed line-clamp-2 group-hover:text-zinc-400 transition-colors">
        {source.snippet}
      </p>
    </button>
  );
}

function MarkdownRenderer({ content }) {
  const lines = content.split("\n");
  const rendered = [];
  let inList = false;

  lines.forEach((line, i) => {
    if (line.startsWith("**") && line.endsWith("**") && line.length > 4) {
      if (inList) { rendered.push(<ul key={`ul-${i}`} className="space-y-1 mb-3">{rendered.splice(rendered.findIndex(el => el?.type === "li"))}
      </ul>); inList = false; }
      rendered.push(<p key={i} className="text-[13px] font-semibold text-zinc-100 mt-4 mb-2 first:mt-0">{line.replace(/\*\*/g, "")}</p>);
    } else if (line.startsWith("1. ") || line.startsWith("2. ") || line.startsWith("3. ")) {
      const match = line.match(/^\d+\.\s+(.+)/);
      if (match) {
        const txt = match[1].replace(/\*\*([^*]+)\*\*/g, "$1");
        rendered.push(
          <div key={i} className="flex gap-2.5 mb-1.5">
            <span className="text-[11px] font-semibold text-violet-400 mt-0.5 shrink-0">{line.match(/^\d+/)[0]}.</span>
            <span className="text-[13px] text-zinc-300 leading-relaxed">{txt}</span>
          </div>
        );
      }
    } else if (line === "") {
      rendered.push(<div key={i} className="h-1" />);
    } else {
      // Inline bold
      const parts = line.split(/\*\*([^*]+)\*\*/g);
      rendered.push(
        <p key={i} className="text-[13px] text-zinc-300 leading-relaxed mb-1">
          {parts.map((p, j) => j % 2 === 1 ? <strong key={j} className="text-zinc-100 font-semibold">{p}</strong> : p)}
        </p>
      );
    }
  });

  return <div className="space-y-0.5">{rendered}</div>;
}

function ChatMessage({ msg, onSourceClick, onToggleSources }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (msg.role === "user") {
    return (
      <div className="flex justify-end mb-6">
        <div className="max-w-[72%]">
          <div className="bg-zinc-800 border border-zinc-700/50 rounded-2xl rounded-tr-sm px-4 py-3">
            <p className="text-[14px] text-zinc-200 leading-relaxed">{msg.content}</p>
          </div>
          <p className="text-[11px] text-zinc-600 text-right mt-1.5 mr-1">{msg.ts}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 mb-6 group">
      <div className="w-7 h-7 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center shrink-0 mt-0.5">
        <Brain className="w-3.5 h-3.5 text-violet-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[12px] font-semibold text-zinc-300">ContextMind</span>
          <span className="text-[11px] text-zinc-600">{msg.ts}</span>
          <button
            onClick={handleCopy}
            className="ml-auto opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-600 hover:text-zinc-300 transition-all"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className="text-[13px] leading-relaxed">
          <MarkdownRenderer content={msg.content} />
        </div>

        {msg.sources && (
          <div className="mt-4">
            <button
              onClick={() => onToggleSources(msg.id)}
              className="flex items-center gap-2 text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors mb-2 group/btn"
            >
              <div className="flex items-center gap-1.5 bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-2.5 py-1.5 group-hover/btn:border-zinc-600 transition-colors">
                {msg.sourcesOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <span>{msg.sources.length} Retrieved Sources</span>
                <span className="ml-1 w-4 h-4 rounded-full bg-violet-600/30 text-violet-300 text-[10px] flex items-center justify-center font-medium">
                  {msg.sources.length}
                </span>
              </div>
            </button>

            {msg.sourcesOpen && (
              <div className="grid grid-cols-1 gap-2 mt-1">
                {msg.sources.map(src => (
                  <SourceCard key={src.id} source={src} onClick={onSourceClick} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StreamingMessage() {
  return (
    <div className="flex gap-3 mb-6">
      <div className="w-7 h-7 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center shrink-0 mt-0.5">
        <Brain className="w-3.5 h-3.5 text-violet-400 animate-pulse" />
      </div>
      <div className="flex-1 pt-1">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[12px] font-semibold text-zinc-300">ContextMind</span>
          <span className="text-[11px] text-zinc-600">now</span>
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-zinc-800 rounded-full w-3/4 animate-pulse" />
          <div className="h-3 bg-zinc-800 rounded-full w-full animate-pulse" />
          <div className="h-3 bg-zinc-800 rounded-full w-5/6 animate-pulse" />
          <div className="h-3 bg-zinc-800 rounded-full w-2/3 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

function WelcomeState({ onStarterClick }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600/30 to-violet-800/20 border border-violet-500/30 flex items-center justify-center mb-6 shadow-lg shadow-violet-500/10">
        <Brain className="w-8 h-8 text-violet-400" />
      </div>
      <h2 className="text-xl font-semibold text-zinc-100 mb-2">Ask your documents anything</h2>
      <p className="text-[13px] text-zinc-500 max-w-sm leading-relaxed mb-10">
        Upload files to your knowledge base, then ask questions. ContextMind retrieves relevant passages and cites its sources.
      </p>
      <div className="grid grid-cols-1 gap-3 w-full max-w-md">
        {STARTER_CARDS.map((card) => (
          <button
            key={card.title}
            onClick={() => onStarterClick(card.title)}
            className="flex items-start gap-3 p-4 rounded-xl bg-zinc-800/50 border border-zinc-700/50 hover:border-zinc-600 hover:bg-zinc-800 text-left transition-all duration-200 group"
          >
            <div className="w-8 h-8 rounded-lg bg-zinc-700/60 flex items-center justify-center shrink-0 group-hover:bg-violet-600/20 group-hover:border group-hover:border-violet-500/30 transition-all">
              <card.icon className="w-4 h-4 text-zinc-400 group-hover:text-violet-400 transition-colors" />
            </div>
            <div>
              <p className="text-[13px] font-medium text-zinc-300 group-hover:text-zinc-100 transition-colors">{card.title}</p>
              <p className="text-[12px] text-zinc-600 mt-0.5">{card.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SourceInspector({ source, onClose }) {
  if (!source) return null;
  return (
    <div className="w-72 border-l border-zinc-800 bg-zinc-950 flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <PanelRightOpen className="w-4 h-4 text-zinc-500" />
          <span className="text-[13px] font-semibold text-zinc-300">Source Inspector</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-all">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center gap-2.5 p-3 bg-zinc-800/60 rounded-xl border border-zinc-700/50">
          <FileIcon type={source.doc.endsWith(".pdf") ? "pdf" : source.doc.endsWith(".docx") ? "docx" : "txt"} size={18} />
          <div>
            <p className="text-[12px] font-semibold text-zinc-200">{source.doc}</p>
            {source.page && <p className="text-[11px] text-zinc-600 mt-0.5">Page {source.page}</p>}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Retrieved Chunk</p>
          <div className="p-3 bg-violet-500/5 border border-violet-500/20 rounded-xl">
            <p className="text-[12px] text-zinc-300 leading-relaxed">{source.snippet}</p>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Relevance Score</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full" style={{ width: "87%" }} />
            </div>
            <span className="text-[12px] font-semibold text-violet-400">0.87</span>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Full Document Context</p>
          <div className="p-3 bg-zinc-800/40 border border-zinc-700/40 rounded-xl space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className={`h-2.5 rounded-full ${i === 2 ? "bg-violet-500/30 border border-violet-500/30" : "bg-zinc-700/60"}`}
                style={{ width: `${[85, 92, 100, 73, 88, 66][i]}%` }} />
            ))}
          </div>
          <p className="text-[11px] text-zinc-600 mt-2 text-center">Highlighted passage shown in context</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function ContextMindRAG() {
  const [docs, setDocs] = useState(INITIAL_DOCS);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [selectedSource, setSelectedSource] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [connectionStatus] = useState("connected");
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const handleFileDrop = useCallback((files) => {
    const newDocs = files.map((file, i) => ({
      id: Date.now() + i,
      name: file.name || file,
      type: file.name?.endsWith(".pdf") ? "pdf" : file.name?.endsWith(".docx") ? "docx" : file.type === "web" ? "web" : "txt",
      status: "parsing",
      size: file.size ? `${(file.size / 1024).toFixed(0)} KB` : "Web",
    }));
    setDocs(prev => [...prev, ...newDocs]);

    newDocs.forEach(doc => {
      setTimeout(() => setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, status: "embedding" } : d)), 1500);
      setTimeout(() => setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, status: "ready" } : d)), 3500);
    });
  }, []);

  const handleDelete = useCallback((id) => {
    setDocs(prev => prev.filter(d => d.id !== id));
  }, []);

  const handleSend = useCallback(async (text) => {
    const content = text || input.trim();
    if (!content || streaming) return;
    setInput("");

    const userMsg = { id: Date.now(), role: "user", content, ts: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);

    // Simulate streaming AI response
    setTimeout(() => {
      const aiMsg = {
        id: Date.now() + 1, role: "ai",
        content: `Based on the available documents in your knowledge base, I can provide the following analysis:\n\n**Key Findings**\nThe documents collectively suggest a strong forward trajectory, with the Q4 financial data corroborating the strategic initiatives outlined in the board memo. Market conditions appear favorable.\n\n**Supporting Evidence**\n1. **Financial metrics** — The Q4 report confirms above-benchmark growth with healthy margins across all product lines\n2. **Strategic alignment** — The investment roadmap directly addresses the TAM opportunity identified in the market overview\n3. **Risk considerations** — Integration timelines remain the primary execution risk flagged across multiple sources`,
        ts: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        sources: MOCK_SOURCES,
        sourcesOpen: false
      };
      setMessages(prev => [...prev, aiMsg]);
      setStreaming(false);
    }, 2200);
  }, [input, streaming]);

  const handleToggleSources = useCallback((msgId) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, sourcesOpen: !m.sourcesOpen } : m));
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const charCount = input.length;
  const maxChars = 4000;
  const charPct = Math.min((charCount / maxChars) * 100, 100);

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans">

      {/* ── Sidebar ── */}
      <div className={`${sidebarOpen ? "w-80" : "w-0"} shrink-0 flex flex-col border-r border-zinc-800/80 bg-zinc-900/50 transition-all duration-300 overflow-hidden`}>
        <div className="flex-1 overflow-y-auto">
          {/* Header */}
          <div className="px-4 py-4 border-b border-zinc-800/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-violet-600/30 border border-violet-500/40 flex items-center justify-center">
                  <Brain className="w-4 h-4 text-violet-400" />
                </div>
                <span className="text-[14px] font-bold text-zinc-100 tracking-tight">NexusRetrieval</span>
              </div>
              <div className="flex items-center gap-1.5 bg-zinc-800/60 border border-zinc-700/40 rounded-full px-2.5 py-1">
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[connectionStatus]} ${connectionStatus === "connecting" ? "animate-pulse" : ""}`} />
                <span className="text-[11px] text-zinc-500 capitalize">{connectionStatus}</span>
              </div>
            </div>
          </div>

          {/* Upload Zone */}
          <div className="px-4 py-4 border-b border-zinc-800/60">
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-3">Knowledge Base</p>
            <DropZone onFileDrop={handleFileDrop} />
          </div>

          {/* Document List */}
          <div className="px-2 py-3">
            <div className="flex items-center justify-between px-2 mb-2">
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">Sources</p>
              <span className="text-[11px] text-zinc-600">{docs.length} files</span>
            </div>
            <div className="space-y-0.5">
              {docs.map(doc => <DocItem key={doc.id} doc={doc} onDelete={handleDelete} />)}
            </div>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="px-4 py-3 border-t border-zinc-800/80">
          <div className="flex items-center gap-2 text-zinc-600">
            <Zap className="w-3.5 h-3.5 text-violet-500" />
            <span className="text-[11px]">RAG • text-embedding-3-large</span>
          </div>
        </div>
      </div>

      {/* ── Main Area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="flex items-center gap-3 px-4 h-12 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-sm shrink-0">
          <button
            onClick={() => setSidebarOpen(p => !p)}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-all"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="h-4 w-px bg-zinc-800" />
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-zinc-600" />
            <span className="text-[13px] text-zinc-400 font-medium">Document Analysis</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {selectedSource && (
              <button
                onClick={() => setSelectedSource(null)}
                className="flex items-center gap-1.5 text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <PanelRightClose className="w-4 h-4" />
                <span>Close Inspector</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* ── Chat Area ── */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {messages.length === 0 ? (
                <WelcomeState onStarterClick={handleSend} />
              ) : (
                <div className="max-w-2xl mx-auto">
                  {messages.map(msg => (
                    <ChatMessage
                      key={msg.id}
                      msg={msg}
                      onSourceClick={setSelectedSource}
                      onToggleSources={handleToggleSources}
                    />
                  ))}
                  {streaming && <StreamingMessage />}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="shrink-0 px-6 py-4 border-t border-zinc-800/60">
              <div className="max-w-2xl mx-auto">
                <div className="relative flex items-end gap-3 bg-zinc-900/80 border border-zinc-700/60 rounded-2xl px-4 py-3 shadow-lg shadow-black/20 backdrop-blur-sm focus-within:border-zinc-600 transition-all duration-200">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask a question about your documents…"
                    rows={1}
                    maxLength={maxChars}
                    className="flex-1 bg-transparent text-[14px] text-zinc-200 placeholder:text-zinc-600 outline-none resize-none leading-relaxed max-h-32 overflow-y-auto"
                    style={{ scrollbarWidth: "none" }}
                  />

                  <div className="flex items-center gap-2.5 shrink-0 pb-0.5">
                    {/* Char counter ring */}
                    <div className="relative w-5 h-5">
                      <svg viewBox="0 0 20 20" className="rotate-[-90deg] w-5 h-5">
                        <circle cx="10" cy="10" r="8" fill="none" stroke="#27272a" strokeWidth="2" />
                        <circle
                          cx="10" cy="10" r="8"
                          fill="none"
                          stroke={charPct > 90 ? "#f87171" : charPct > 70 ? "#fbbf24" : "#7c3aed"}
                          strokeWidth="2"
                          strokeDasharray={`${2 * Math.PI * 8}`}
                          strokeDashoffset={`${2 * Math.PI * 8 * (1 - charPct / 100)}`}
                          strokeLinecap="round"
                          className="transition-all duration-200"
                        />
                      </svg>
                    </div>

                    <button
                      onClick={() => handleSend()}
                      disabled={!input.trim() || streaming}
                      className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200
                        ${input.trim() && !streaming
                          ? "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/30"
                          : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                        }`}
                    >
                      {streaming
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <ArrowUp className="w-4 h-4" />
                      }
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-2 px-1">
                  <p className="text-[11px] text-zinc-700">
                    {docs.filter(d => d.status === "ready").length} sources active
                    {docs.some(d => d.status !== "ready") && (
                      <span className="text-amber-600 ml-2">
                        · {docs.filter(d => d.status !== "ready").length} processing
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-zinc-700">{charCount > 0 ? `${charCount}/${maxChars}` : "⏎ to send"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Source Inspector Panel ── */}
          {selectedSource && (
            <SourceInspector source={selectedSource} onClose={() => setSelectedSource(null)} />
          )}
        </div>
      </div>
    </div>
  );
}