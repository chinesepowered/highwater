"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { callTool, getLog, listTools, subscribe, toolDeclarations, webmcpSupported } from "@/lib/webmcp";

type Part =
  | { text: string; thought?: boolean }
  | { functionCall: { name: string; args: Record<string, unknown>; id?: string } }
  | { functionResponse: { name: string; response: unknown; id?: string } };
type Content = { role: "user" | "model"; parts: Part[] };

type ChatMsg =
  | { kind: "user"; text: string }
  | { kind: "agent"; text: string }
  | { kind: "tool"; name: string; args: Record<string, unknown>; ok: boolean; ms: number };

type Props = {
  title: string;
  systemPrompt: string;
  suggestions: string[];
  placeholder?: string;
  accent?: string; // tailwind color class prefix e.g. "violet"
  speakReplies?: boolean;
  intro?: string;
};

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    SpeechRecognition?: new () => SpeechRecognitionLike;
  }
}
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export default function AgentPanel({ title, systemPrompt, suggestions, placeholder, speakReplies = false, intro }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>(intro ? [{ kind: "agent", text: intro }] : []);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(speakReplies);
  const contentsRef = useRef<Content[]>([]);
  const modelRef = useRef<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  const tools = useSyncExternalStore(subscribe, () => listTools(), () => []);
  const log = useSyncExternalStore(subscribe, () => getLog(), () => []);
  const supported = useSyncExternalStore(subscribe, () => webmcpSupported(), () => false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const say = useCallback(
    (text: string) => {
      if (!speak || typeof speechSynthesis === "undefined") return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02;
      speechSynthesis.speak(u);
    },
    [speak],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setInput("");
      setBusy(true);
      setMessages((m) => [...m, { kind: "user", text: trimmed }]);
      contentsRef.current.push({ role: "user", parts: [{ text: trimmed }] });

      try {
        for (let turn = 0; turn < 10; turn++) {
          const res = await fetch("/api/agent", {
            method: "POST",
            signal: AbortSignal.timeout(110000),
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: contentsRef.current,
              tools: toolDeclarations(),
              system: systemPrompt,
              model: modelRef.current,
            }),
          });
          const data = (await res.json()) as { content?: Content; error?: string; model?: string };
          if (data.model) modelRef.current = data.model;
          if (!res.ok || !data.content) {
            setMessages((m) => [...m, { kind: "agent", text: `⚠️ ${data.error ?? "Agent error"}` }]);
            break;
          }
          contentsRef.current.push(data.content);
          const calls = data.content.parts.filter((p): p is Extract<Part, { functionCall: unknown }> => "functionCall" in p);
          const texts = data.content.parts
            .filter((p): p is Extract<Part, { text: string }> => "text" in p && !p.thought)
            .map((p) => p.text)
            .join("")
            .trim();

          if (calls.length === 0) {
            if (texts) {
              setMessages((m) => [...m, { kind: "agent", text: texts }]);
              say(texts);
            }
            break;
          }

          const responses: Part[] = [];
          for (const c of calls) {
            const started = performance.now();
            // Dispatch through WebMCP: the same tool the browser agent would call.
            const result = await callTool(c.functionCall.name, c.functionCall.args ?? {});
            const ms = Math.round(performance.now() - started);
            setMessages((m) => [
              ...m,
              { kind: "tool", name: c.functionCall.name, args: c.functionCall.args ?? {}, ok: !result.isError, ms },
            ]);
            responses.push({
              functionResponse: {
                name: c.functionCall.name,
                id: c.functionCall.id,
                response: { result: result.content.map((x) => x.text).join("\n") || "ok", isError: !!result.isError },
              },
            });
          }
          contentsRef.current.push({ role: "user", parts: responses });
        }
      } catch (err) {
        setMessages((m) => [...m, { kind: "agent", text: `⚠️ ${err instanceof Error ? err.message : String(err)}` }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, say, systemPrompt],
  );

  const toggleMic = useCallback(() => {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setMessages((m) => [...m, { kind: "agent", text: "Voice input isn't available in this browser. Type instead." }]);
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.onresult = (e) => {
      const t = Array.from({ length: e.results.length }, (_, i) => e.results[i][0].transcript).join(" ");
      setInput(t);
    };
    rec.onend = () => {
      setListening(false);
      setInput((cur) => {
        if (cur.trim()) void send(cur);
        return "";
      });
    };
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [listening, send]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 dark:border-white/10">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-[11px] text-neutral-500">
            {tools.length} WebMCP tools ·{" "}
            <span className={supported ? "text-emerald-600" : "text-amber-600"}>
              {supported ? "document.modelContext live" : "in-page agent (browser lacks WebMCP)"}
            </span>
          </div>
        </div>
        <label className="flex items-center gap-1 text-[11px] text-neutral-500">
          <input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} /> speak
        </label>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3 text-sm">
        {messages.length === 0 && (
          <div className="text-neutral-500">Ask the agent to do something. It will call the page&apos;s WebMCP tools.</div>
        )}
        {messages.map((m, i) => {
          if (m.kind === "user")
            return (
              <div key={i} className="ml-8 rounded-2xl rounded-br-sm bg-neutral-900 px-3 py-2 text-white dark:bg-white dark:text-black">
                {m.text}
              </div>
            );
          if (m.kind === "agent")
            return (
              <div key={i} className="mr-8 whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-neutral-100 px-3 py-2 dark:bg-neutral-800">
                {m.text}
              </div>
            );
          return (
            <div
              key={i}
              data-testid="tool-call"
              className="flex items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-2 py-1 font-mono text-[11px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
            >
              <span className={m.ok ? "text-emerald-600" : "text-red-500"}>{m.ok ? "⚙" : "✗"}</span>
              <span className="font-semibold">{m.name}</span>
              <span className="truncate opacity-70">{JSON.stringify(m.args)}</span>
              <span className="ml-auto opacity-50">{m.ms}ms</span>
            </div>
          );
        })}
        {busy && <div className="text-xs text-neutral-500 animate-pulse">agent is working…</div>}
      </div>

      {messages.length <= 1 && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 px-4 pb-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => void send(s)}
              className="rounded-full border border-neutral-300 px-2 py-0.5 text-[11px] hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex items-center gap-2 border-t border-black/5 p-3 dark:border-white/10"
      >
        <button
          type="button"
          onClick={toggleMic}
          title="Voice input"
          className={`h-9 w-9 shrink-0 rounded-full border text-base ${listening ? "animate-pulse border-red-400 bg-red-50 dark:bg-red-950" : "border-neutral-300 dark:border-neutral-700"}`}
        >
          🎤
        </button>
        <input
          data-testid="agent-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder ?? "Tell the agent what you want…"}
          className="h-9 flex-1 rounded-full border border-neutral-300 bg-transparent px-3 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="h-9 rounded-full bg-neutral-900 px-4 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          Send
        </button>
      </form>
      <div className="border-t border-black/5 px-4 py-1 text-[10px] text-neutral-400 dark:border-white/10">
        {log.length} tool calls this session
      </div>
    </div>
  );
}
