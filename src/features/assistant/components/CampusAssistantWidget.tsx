import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, MessageCircle, Send, X } from 'lucide-react';

import { useAuth } from '../../../context/useAuth';
import {
  sendAssistantMessage,
  type AssistantContext,
  type AssistantMessage,
  type AssistantRouteAction,
} from '../api/assistant';

type ChatEntry = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

const EMPTY_CONTEXT: AssistantContext = {};
const DEFAULT_SUGGESTIONS = [
  '¿Cómo llego a Control Escolar?',
  '¿Qué clases tengo hoy?',
  '¿Cuál es mi promedio?',
];
const DEFAULT_WELCOME_ENTRY: ChatEntry = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Hola, soy tu asistente CUCEIverse. Puedo ayudarte con rutas del campus, horario, materias y dudas de la plataforma.',
};

function MarkdownRenderer({ text }: { text: string }) {
  const navigate = useNavigate();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>, url: string) => {
    if (url.startsWith('/')) {
      e.preventDefault();
      navigate(url);
    }
  };

  const parts = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  let lastIndex = 0;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.substring(lastIndex, match.index) });
    }
    parts.push({ type: 'link', label: match[1], url: match[2] });
    lastIndex = linkRegex.lastIndex;
  }
  
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.substring(lastIndex) });
  }

  return (
    <span className="leading-relaxed">
      {parts.map((part, i) => {
        if (part.type === 'link') {
          return (
            <a
              key={i}
              href={part.url}
              onClick={(e) => handleClick(e, part.url as string)}
              target={part.url?.startsWith('/') ? undefined : '_blank'}
              rel={part.url?.startsWith('/') ? undefined : 'noopener noreferrer'}
              className="text-emerald-400 font-medium underline hover:text-emerald-300 transition-colors inline-block mx-0.5"
            >
              {part.label}
            </a>
          );
        }

        // Process bold and newlines within the text
        const content = part.content as string;
        
        // Handle double newlines as paragraphs first
        const paragraphs = content.split('\n\n');
        
        return (
          <span key={i}>
            {paragraphs.map((para, pIdx) => (
              <span key={pIdx}>
                {para.split(/(\*\*.*?\*\*)/g).map((t, j) => {
                  if (t.startsWith('**') && t.endsWith('**')) {
                    return <strong key={j} className="text-white font-semibold">{t.slice(2, -2)}</strong>;
                  }
                  
                  const lines = t.split('\n');
                  return (
                    <span key={j}>
                      {lines.map((ln, k) => (
                        <span key={k}>
                          {ln}
                          {k < lines.length - 1 && <br />}
                        </span>
                      ))}
                    </span>
                  );
                })}
                {pIdx < paragraphs.length - 1 && <div className="h-2" />}
              </span>
            ))}
          </span>
        );
      })}
    </span>
  );
}

export function CampusAssistantWidget() {
  const { token, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState<string | null>(null);
  const [context, setContext] = useState<AssistantContext>(EMPTY_CONTEXT);
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const [entries, setEntries] = useState<ChatEntry[]>([DEFAULT_WELCOME_ENTRY]);

  const history = useMemo<AssistantMessage[]>(
    () => entries.map((entry) => ({ role: entry.role, content: entry.content })),
    [entries],
  );
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, [entries, loading, open]);

  useEffect(() => {
    if (!isAuthenticated) return;
    // Cleared the previous localStorage hydration so conversations reset on reload
    setEntries([DEFAULT_WELCOME_ENTRY]);
    setContext(EMPTY_CONTEXT);
    setSuggestions(DEFAULT_SUGGESTIONS);
  }, [isAuthenticated]);

  const pushAssistantAction = (action?: AssistantRouteAction) => {
    if (!action || action.type !== 'highlight-route') return;
    window.dispatchEvent(
      new CustomEvent('cuceiverse.assistant.route', {
        detail: action,
      }),
    );
  };

  const sendMessage = async (messageOverride?: string) => {
    const message = (messageOverride ?? input).trim();
    if (!message || !token || loading) return;

    if (!messageOverride) {
      setActiveSuggestion(null);
    }

    const userEntry: ChatEntry = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: message,
    };

    const nextEntries = [...entries, userEntry];
    setEntries(nextEntries);
    setInput('');
    setLoading(true);

    try {
      const response = await sendAssistantMessage(token, {
        message,
        history,
        context,
      });

      setEntries((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: response.reply,
        },
      ]);

      setContext(response.context ?? EMPTY_CONTEXT);
      setSuggestions(response.suggestions ?? []);
      setActiveSuggestion(null);
      pushAssistantAction(response.action);
    } catch (error) {
      setEntries((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content:
            error instanceof Error
              ? error.message
              : 'No pude responder en este momento. Intenta de nuevo.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <>
        {open ? (
        <section className="fixed bottom-6 left-6 z-[1200] flex h-[36rem] w-[24rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/90 shadow-[0_0_80px_rgba(0,0,0,0.8),0_0_30px_rgba(34,211,238,0.15)] backdrop-blur-xl">
          <header className="flex items-center justify-between border-b border-white/5 bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-emerald-400 text-slate-900 shadow-[0_0_15px_rgba(34,211,238,0.4)]">
                <Bot size={18} />
              </div>
              <strong className="text-sm font-medium tracking-wide text-white">Asistente CUCEIverse</strong>
            </div>
            <button
              type="button"
              className="rounded-full p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </header>

          <div ref={messagesContainerRef} className="flex-1 space-y-8 overflow-y-auto bg-slate-900/40 p-5 pt-10 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
            {entries.map((entry) => (
              <article
                key={entry.id}
                className={`relative max-w-[88%] rounded-2xl px-4 py-2.5 text-[0.93rem] leading-relaxed shadow-md transition-all ${
                  entry.role === 'assistant'
                    ? 'mr-auto rounded-tl-none bg-[#202c33] text-gray-100'
                    : 'ml-auto rounded-tr-none bg-[#005c4b] text-white'
                }`}
              >
                {/* Whatsapp-style tail injection */}
                <div className={`absolute top-0 w-3 h-3 ${entry.role === 'assistant' ? '-left-2 bg-[#202c33] [clip-path:polygon(100%_0,0_0,100%_100%)]' : '-right-2 bg-[#005c4b] [clip-path:polygon(0_0,100%_0,0_100%)]'}`}></div>
                <MarkdownRenderer text={entry.content} />
              </article>
            ))}
            {loading ? (
              <article className="relative mr-auto flex gap-2 rounded-2xl rounded-tl-none bg-[#202c33] px-4 py-3 text-sm text-slate-400 shadow-sm">
                 <div className="absolute top-0 -left-2 w-3 h-3 bg-[#202c33] [clip-path:polygon(100%_0,0_0,100%_100%)]"></div>
                 <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-500/80"></span>
                 <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-500/80 [animation-delay:-0.15s]"></span>
                 <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-500/80 [animation-delay:-0.3s]"></span>
              </article>
            ) : null}
          </div>

          <footer className="border-t border-white/5 bg-slate-900/90 p-3 shadow-[0_-10px_30px_rgba(0,0,0,0.3)] backdrop-blur-md">
            {suggestions.length > 0 ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {suggestions.slice(0, 3).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setActiveSuggestion(suggestion);
                      void sendMessage(suggestion);
                    }}
                    className={`rounded-full border px-3 py-1.5 text-[0.8rem] tracking-wide transition-all disabled:opacity-50 ${
                      activeSuggestion === suggestion
                        ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                        : 'border-cyan-500/30 bg-slate-800/80 text-cyan-300 hover:border-cyan-400 md:hover:bg-cyan-500/10'
                    }`}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  if (activeSuggestion) setActiveSuggestion(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="Pregunta por rutas, clases o profesores..."
                className="h-11 flex-1 rounded-xl border border-white/10 bg-slate-950 px-4 text-sm text-slate-100 shadow-inner outline-none transition placeholder:text-slate-500 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
              />
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-500 text-white shadow-lg transition hover:brightness-110 active:scale-95 disabled:pointer-events-none disabled:opacity-50 grayscale-0 disabled:grayscale"
                disabled={loading || !input.trim()}
                onClick={() => void sendMessage()}
              >
                <Send size={18} className="translate-x-[1px]" />
              </button>
            </div>
          </footer>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-6 left-6 z-[1199] flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-600 to-emerald-500 text-white shadow-[0_10px_35px_rgba(16,185,129,0.35)] transition-all hover:scale-110 hover:shadow-[0_15px_40px_rgba(34,211,238,0.5)] active:scale-95"
        aria-label="Abrir asistente universitario"
      >
        <MessageCircle size={28} />
      </button>
    </>
  );
}
