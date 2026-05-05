import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  MessageCircle,
  PanelLeft,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';

const API = '/api';

function authHeaders(extra = {}) {
  const h = { ...extra };
  const secret = import.meta.env.VITE_ADMIN_TRAIN_SECRET;
  if (secret) h.Authorization = `Bearer ${secret}`;
  return h;
}

async function apiJson(path, opts = {}) {
  const headers = authHeaders(opts.headers);
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    opts = { ...opts, body: JSON.stringify(opts.body) };
  }
  const r = await fetch(`${API}${path}`, { ...opts, headers });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || r.statusText);
  }
  return r.json();
}

function mapRowsToMessages(rows) {
  return (rows || []).map((m) => ({
    id: m.id,
    role: m.role,
    text: m.body,
    prototype: !!m.prototype,
    createdAt: m.created_at,
  }));
}

export default function ChatPage() {
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [err, setErr] = useState('');
  const [apiOk, setApiOk] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const bottomRef = useRef(null);

  const refreshConversations = useCallback(async () => {
    setLoadingList(true);
    try {
      const d = await apiJson('/chat/conversations');
      setConversations(d.conversations || []);
    } catch {
      setConversations([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadMessages = useCallback(async (id) => {
    if (!id) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    try {
      const d = await apiJson(`/chat/conversations/${id}/messages`);
      setMessages(mapRowsToMessages(d.messages));
    } catch (e) {
      setErr(e.message || String(e));
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const r = await fetch(`${API}/health`, { headers: authHeaders() });
        if (!c) setApiOk(r.ok);
      } catch {
        if (!c) setApiOk(false);
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  useEffect(() => {
    if (apiOk !== true) return;
    refreshConversations();
  }, [apiOk, refreshConversations]);

  useEffect(() => {
    if (conversationId) loadMessages(conversationId);
  }, [conversationId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const newChat = async () => {
    setErr('');
    try {
      const d = await apiJson('/chat/conversations', { method: 'POST' });
      setConversationId(d.id);
      await refreshConversations();
      await loadMessages(d.id);
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  useEffect(() => {
    if (apiOk !== true || conversationId != null || loadingList) return;
    if (conversations.length > 0) {
      setConversationId(conversations[0].id);
    }
  }, [apiOk, conversationId, conversations, loadingList]);

  useEffect(() => {
    if (!conversationId) return;
    if (!conversations.length) {
      setConversationId(null);
      setMessages([]);
      return;
    }
    if (!conversations.some((c) => c.id === conversationId)) {
      setConversationId(conversations[0].id);
    }
  }, [conversations, conversationId]);

  const selectConversation = (id) => {
    setErr('');
    setConversationId(id);
  };

  const deleteConversation = async (id, e) => {
    e?.stopPropagation();
    if (!id) return;
    setErr('');
    try {
      await apiJson(`/chat/conversations/${id}`, { method: 'DELETE' });
      await refreshConversations();
      if (conversationId === id) {
        setConversationId(null);
        setMessages([]);
      }
    } catch (errDel) {
      setErr(errDel.message || String(errDel));
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending || apiOk === false) return;
    setInput('');
    setErr('');
    const optimisticUser = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      text,
      prototype: false,
    };
    setMessages((m) => [...m, optimisticUser]);
    setSending(true);
    try {
      const data = await apiJson('/chat', {
        method: 'POST',
        body: { message: text, conversationId },
      });
      if (data.conversationId && data.conversationId !== conversationId) {
        setConversationId(data.conversationId);
      }
      await loadMessages(data.conversationId);
      await refreshConversations();
    } catch (e) {
      setErr(e.message || String(e));
      setMessages((m) => [
        ...m.filter((x) => x.id !== optimisticUser.id),
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: 'Could not reach the chat API. Run `npm run dev:all` (or `dev:api`).',
          error: true,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const fmtTime = (iso) => {
    if (!iso) return '';
    try {
      const d = new Date(iso.replace(' ', 'T') + 'Z');
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="min-h-screen bg-[#070708] text-white font-sans selection:bg-white/20">
      <div className="fixed inset-0 pointer-events-none opacity-[0.35] bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.2),transparent)]" />

      <header className="relative z-20 border-b border-white/[0.06] px-4 sm:px-8 py-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setSidebarOpen((o) => !o)}
          className="inline-flex items-center justify-center rounded-lg border border-white/15 p-2 text-white/70 hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25 md:hidden"
          aria-expanded={sidebarOpen}
          aria-label="Toggle chat history"
        >
          <PanelLeft className="w-5 h-5" aria-hidden />
        </button>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-white/45 hover:text-white text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-md px-1 -ml-1"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden />
          Home
        </Link>
        <span className="text-white/20 hidden sm:inline">/</span>
        <span className="text-sm font-medium text-white/80 flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-white/50 shrink-0" aria-hidden />
          Chat
        </span>
        <span className="text-[11px] font-mono text-white/35 uppercase tracking-widest hidden sm:inline">
          History
        </span>
        <Link
          to="/admin"
          className="sm:ml-auto text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          Admin
        </Link>
        <button
          type="button"
          onClick={() => setSidebarOpen((o) => !o)}
          className="hidden md:inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white/75 rounded-lg border border-white/10 px-2.5 py-1.5"
        >
          <PanelLeft className="w-3.5 h-3.5" aria-hidden />
          Sidebar
        </button>
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
            apiOk === true
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-amber-500/35 bg-amber-500/10 text-amber-100'
          }`}
        >
          API {apiOk === true ? 'ok' : apiOk === false ? 'offline' : '…'}
        </span>
      </header>

      {/* Floating sidebar */}
      <aside
        className={`fixed z-30 top-[4.25rem] bottom-4 left-4 w-[min(18rem,calc(100vw-2rem))] flex flex-col rounded-2xl border border-white/[0.1] bg-[#0c0c0e]/95 backdrop-blur-xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.85)] transition-transform duration-200 ease-out md:top-[4.25rem] ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-[calc(100%+1.5rem)]'
        }`}
        aria-hidden={!sidebarOpen}
      >
        <div className="shrink-0 p-3 border-b border-white/[0.06] flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-white/80 tracking-wide">Chats</span>
          <button
            type="button"
            onClick={newChat}
            disabled={apiOk === false}
            className="inline-flex items-center gap-1 rounded-lg bg-white text-black text-xs font-medium px-2.5 py-1.5 hover:bg-white/90 disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden />
            New
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-2 space-y-1">
          {loadingList && conversations.length === 0 ? (
            <p className="text-xs text-white/35 px-2 py-3">Loading…</p>
          ) : null}
          {!loadingList && conversations.length === 0 ? (
            <p className="text-xs text-white/40 px-2 py-3 leading-relaxed">
              No chats yet. Start a new one.
            </p>
          ) : null}
          {conversations.map((c) => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => selectConversation(c.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectConversation(c.id);
                }
              }}
              className={`group relative w-full text-left rounded-xl px-3 py-2.5 pr-9 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25 ${
                conversationId === c.id
                  ? 'bg-white/[0.1] border border-white/15'
                  : 'border border-transparent hover:bg-white/[0.05]'
              }`}
            >
              <p className="text-sm text-white/90 line-clamp-2 leading-snug">{c.title}</p>
              <p className="text-[10px] font-mono text-white/30 mt-1">
                {fmtTime(c.updated_at)} · {c.message_count ?? 0} msgs
              </p>
              <button
                type="button"
                onClick={(e) => deleteConversation(c.id, e)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-white/25 hover:text-red-300 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 md:opacity-100 transition-opacity"
                aria-label="Delete chat"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>
        <p className="shrink-0 text-[10px] text-white/25 px-3 py-2 border-t border-white/[0.06] font-mono truncate" title="Stored in SQLite on the train API">
          SQLite · local
        </p>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <main
        className={`relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col min-h-[calc(100vh-4.5rem)] transition-[padding] duration-200 ${
          sidebarOpen ? 'md:pl-[calc(18rem+2.5rem)]' : 'md:pl-4'
        }`}
      >
        {loadingMessages && conversationId ? (
          <p className="text-xs text-white/35 mb-2">Loading messages…</p>
        ) : null}
        {!conversationId && apiOk === true && !loadingList ? (
          <p className="text-sm text-white/45 mb-4">
            Select a chat or create <strong className="text-white/70">New</strong>.
          </p>
        ) : null}

        <div className="flex-1 overflow-y-auto space-y-4 pb-4 no-scrollbar">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-white text-black rounded-br-md'
                    : msg.error
                      ? 'bg-red-500/15 text-red-100/90 border border-red-500/25 rounded-bl-md'
                      : 'bg-white/[0.06] text-white/85 border border-white/[0.08] rounded-bl-md'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                {msg.prototype ? (
                  <p className="mt-2 text-[10px] font-mono uppercase tracking-wider text-white/35">
                    prototype reply
                  </p>
                ) : null}
              </div>
            </div>
          ))}
          {sending ? (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-white/[0.04] border border-white/[0.06] text-sm text-white/45">
                …
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        {err ? (
          <p className="text-xs text-red-300/90 mb-2 font-mono whitespace-pre-wrap">{err}</p>
        ) : null}

        <form
          className="flex gap-2 pt-2 border-t border-white/[0.06]"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={conversationId ? 'Type a message…' : 'Pick or start a chat…'}
            disabled={sending || apiOk === false || !conversationId}
            className="flex-1 min-w-0 rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-sm text-white/90 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:opacity-45"
            autoComplete="off"
            aria-label="Message"
          />
          <button
            type="submit"
            disabled={sending || !input.trim() || apiOk === false || !conversationId}
            className="shrink-0 inline-flex items-center justify-center gap-2 bg-white text-black font-medium px-5 py-3 rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 min-w-[44px] min-h-[44px]"
            aria-label="Send"
          >
            <Send className="w-4 h-4" aria-hidden />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      </main>
    </div>
  );
}
