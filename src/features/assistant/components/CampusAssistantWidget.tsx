import { useEffect, useMemo, useRef, useState } from 'react';
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
const ASSISTANT_STORAGE_KEY = 'cuceiverse.assistant.widget.v1';
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

type PersistedAssistantWidgetState = {
  entries: ChatEntry[];
  context: AssistantContext;
  suggestions: string[];
};

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
  const storageHydratedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, [entries, loading, open]);

  useEffect(() => {
    if (!isAuthenticated || storageHydratedRef.current || typeof window === 'undefined') return;
    storageHydratedRef.current = true;

    const raw = window.localStorage.getItem(ASSISTANT_STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as PersistedAssistantWidgetState;
      const nextEntries = Array.isArray(parsed.entries) && parsed.entries.length > 0
        ? parsed.entries.slice(-40)
        : [DEFAULT_WELCOME_ENTRY];

      setEntries(nextEntries);
      setContext(parsed.context ?? EMPTY_CONTEXT);
      setSuggestions(
        Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0
          ? parsed.suggestions.slice(0, 6)
          : DEFAULT_SUGGESTIONS,
      );
    } catch {
      window.localStorage.removeItem(ASSISTANT_STORAGE_KEY);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !storageHydratedRef.current || typeof window === 'undefined') return;

    const payload: PersistedAssistantWidgetState = {
      entries: entries.slice(-40),
      context,
      suggestions: suggestions.slice(0, 6),
    };

    window.localStorage.setItem(ASSISTANT_STORAGE_KEY, JSON.stringify(payload));
  }, [entries, context, suggestions, isAuthenticated]);

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
        <section className="fixed bottom-6 left-6 z-[1200] flex h-[30rem] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-cyan-500/25 bg-[#050B1C]/95 shadow-[0_25px_60px_rgba(0,0,0,0.65)] backdrop-blur-md">
          <header className="flex items-center justify-between border-b border-slate-700/70 bg-slate-900/70 px-4 py-3">
            <div className="flex items-center gap-2 text-cyan-200">
              <Bot size={18} />
              <strong className="text-sm">Asistente CUCEIverse</strong>
            </div>
            <button
              type="button"
              className="rounded-full p-1 text-slate-300 transition hover:bg-slate-700 hover:text-white"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </header>

          <div ref={messagesContainerRef} className="flex-1 space-y-3 overflow-y-auto bg-[#060F26] px-3 py-3">
            {entries.map((entry) => (
              <article
                key={entry.id}
                className={`max-w-[90%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  entry.role === 'assistant'
                    ? 'mr-auto border border-cyan-500/20 bg-cyan-500/10 text-cyan-100'
                    : 'ml-auto border border-emerald-500/20 bg-emerald-500/15 text-emerald-100'
                }`}
              >
                {entry.content}
              </article>
            ))}
            {loading ? (
              <article className="mr-auto rounded-xl border border-slate-700/60 bg-slate-800/60 px-3 py-2 text-sm text-slate-300">
                Pensando respuesta...
              </article>
            ) : null}
          </div>

          <footer className="border-t border-slate-700/60 bg-slate-900/80 p-3">
            {suggestions.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {suggestions.slice(0, 3).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setActiveSuggestion(suggestion);
                      void sendMessage(suggestion);
                    }}
                    className={`rounded-full border px-3 py-1 text-xs transition disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500 ${
                      activeSuggestion === suggestion
                        ? 'border-emerald-400/65 bg-emerald-500/25 text-emerald-100'
                        : 'border-cyan-500/35 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20'
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
                placeholder="Pregunta por rutas, clases o promedio..."
                className="h-10 flex-1 rounded-lg border border-slate-700 bg-[#0a132d] px-3 text-sm text-slate-100 outline-none focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-500/20"
              />
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-500/20 text-cyan-100 transition hover:bg-cyan-500/30 disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
                disabled={loading || !input.trim()}
                onClick={() => void sendMessage()}
              >
                <Send size={16} />
              </button>
            </div>
          </footer>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-6 left-6 z-[1199] inline-flex h-14 w-14 items-center justify-center rounded-full border border-cyan-400/45 bg-gradient-to-br from-cyan-500/25 to-emerald-500/25 text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.35)] transition hover:scale-105 hover:shadow-[0_0_34px_rgba(16,185,129,0.45)]"
        aria-label="Abrir asistente universitario"
      >
        <MessageCircle size={22} />
      </button>
    </>
  );
}
