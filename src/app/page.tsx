"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Redo2, Undo2, Trash2, CornerDownLeft, Loader2, PanelLeft, PanelRight, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Canvas, toSpec } from "@/components/canvas";
import { useVoice } from "@/components/use-voice";
import { EMPTY_DESIGN, SAMPLE_DESIGN, type Design, flatten, label } from "@/lib/design";
import type { Answers } from "@/lib/apply";
import { cn } from "@/lib/utils";

interface Turn {
  id: number;
  transcript: string;
  pending: boolean;
  ops?: string[];
  ignored?: string;
  error?: string;
  answers?: Answers;
  explicit?: { text?: string; count: number };
  ms?: number;
  sttMs?: number;
  model?: string;
}

const SAMPLES = [
  "a settings card",
  "add a save button",
  "add an email field inside the card",
  "put it beside the title",
  "change it to say Done",
  "make the button red",
  "make the heading purple",
  "dark mode",
  "add an app header",
  "add a side navigation",
  "add a billing link to the sidebar",
  "add a table of users",
  "add avatars to the table",
  "add a status column",
  "remove the badge",
];

export default function Page() {
  const [design, setDesign] = useState<Design>(EMPTY_DESIGN);
  const [selection, setSelection] = useState<string | null>(null);
  const [recent, setRecent] = useState<string | null>(null);
  const [past, setPast] = useState<Design[]>([]);
  const [future, setFuture] = useState<Design[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [threshold, setThreshold] = useState(0.025);
  const [busy, setBusy] = useState(false);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("jev-theme");
      if (saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)) setDark(true);
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("jev-theme", dark ? "dark" : "light");
    } catch {}
  }, [dark]);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const seq = useRef(0);
  const live = useRef({ design, selection, recent });
  live.current = { design, selection, recent };

  const patchTurn = (id: number, p: Partial<Turn>) =>
    setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));

  /** Evaluate one utterance against the current design. Serialised so turns apply in order. */
  const submit = useCallback((transcript: string, sttMs?: number) => {
    const t = transcript.trim();
    if (!t) return;
    const id = ++seq.current;
    setTurns((ts) => [{ id, transcript: t, pending: true, sttMs }, ...ts].slice(0, 40));
    queue.current = queue.current.then(async () => {
      setBusy(true);
      try {
        const { design, selection, recent } = live.current;
        const r = await fetch("/api/evaluate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ transcript: t, design, selection, recent }),
        });
        const data = await r.json();
        if (!r.ok) {
          patchTurn(id, { pending: false, error: data.error ?? r.statusText });
          return;
        }
        patchTurn(id, { pending: false, ops: data.ops, ignored: data.ignored, answers: data.answers, explicit: data.explicit, ms: data.ms, model: data.model });
        if (data.theme) setDark(data.theme === "dark");
        if (data.ops?.length && !data.theme) {
          setPast((p) => [...p, design].slice(-50));
          setFuture([]);
          setDesign(data.design);
        }
        setSelection(data.selection ?? null);
        setRecent(data.recent ?? null);
      } catch (e) {
        patchTurn(id, { pending: false, error: (e as Error).message });
      } finally {
        setBusy(false);
      }
    });
  }, []);

  const transcribe = useCallback(
    async (blob: Blob) => {
      const fd = new FormData();
      fd.append("file", blob, "utterance.webm");
      const t0 = performance.now();
      try {
        const r = await fetch("/api/transcribe", { method: "POST", body: fd });
        const data = await r.json();
        if (!r.ok) {
          setTurns((ts) => [{ id: ++seq.current, transcript: "(voice)", pending: false, error: data.error }, ...ts]);
          return;
        }
        if (data.text) submit(data.text, Math.round(performance.now() - t0));
      } catch (e) {
        setTurns((ts) => [{ id: ++seq.current, transcript: "(voice)", pending: false, error: (e as Error).message }, ...ts]);
      }
    },
    [submit],
  );

  const voice = useVoice({ onUtterance: transcribe, threshold });

  const undo = () => {
    setPast((p) => {
      if (!p.length) return p;
      setFuture((f) => [design, ...f]);
      setDesign(p[p.length - 1]);
      return p.slice(0, -1);
    });
  };
  const redo = () => {
    setFuture((f) => {
      if (!f.length) return f;
      setPast((p) => [...p, design]);
      setDesign(f[0]);
      return f.slice(1);
    });
  };
  const loadSample = () => {
    setPast((p) => [...p, design]);
    setFuture([]);
    setDesign(SAMPLE_DESIGN);
    setSelection(null);
    setRecent(null);
  };
  const clear = () => {
    if (design.elements.length) setPast((p) => [...p, design]);
    setDesign(EMPTY_DESIGN);
    setSelection(null);
    setRecent(null);
  };

  // Keyboard: ⌘Z / ⇧⌘Z, Space toggles mic when not typing
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA";
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === "m" && !typing && !e.metaKey) {
        if (voice.active) voice.stop();
        else voice.start();
      } else if (e.key === "[" && !typing && !e.metaKey) {
        setLeftOpen((v) => !v);
      } else if (e.key === "]" && !typing && !e.metaKey) {
        setRightOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const last = turns.find((t) => t.answers);
  const elements = flatten(design);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <span className="font-semibold tracking-tight">Jev voice prototyper</span>
        <span className="text-xs text-muted-foreground">whisper.cpp → Jev → json-render → shadcn/ui</span>
        <div className="ml-auto flex items-center gap-1">
          {!leftOpen && (
            <Button size="sm" variant={voice.active ? "destructive" : "default"} onClick={() => (voice.active ? voice.stop() : voice.start())} className="mr-2">
              {voice.active ? <MicOff /> : <Mic />}
              {voice.status === "speaking" ? "Hearing you…" : voice.active ? "Listening" : "Listen"}
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={() => setDark((d) => !d)} title="Toggle dark mode (or say “dark mode”)">{dark ? <Sun /> : <Moon />}</Button>
          <Button variant="ghost" size="sm" onClick={loadSample}>Load sample</Button>
          <Button variant="ghost" size="icon-sm" onClick={undo} disabled={!past.length} title="Undo (⌘Z)"><Undo2 /></Button>
          <Button variant="ghost" size="icon-sm" onClick={redo} disabled={!future.length} title="Redo (⇧⌘Z)"><Redo2 /></Button>
          <Button variant="ghost" size="icon-sm" onClick={clear} disabled={!design.elements.length} title="Clear canvas"><Trash2 /></Button>
          <span className="mx-1 h-5 w-px bg-border" />
          <Button variant={leftOpen ? "secondary" : "ghost"} size="icon-sm" onClick={() => setLeftOpen((v) => !v)} title="Toggle voice panel ( [ )"><PanelLeft /></Button>
          <Button variant={rightOpen ? "secondary" : "ghost"} size="icon-sm" onClick={() => setRightOpen((v) => !v)} title="Toggle Jev panel ( ] )"><PanelRight /></Button>
        </div>
      </header>

      <div
        className="grid min-h-0 flex-1"
        style={{ gridTemplateColumns: `${leftOpen ? "320px " : ""}minmax(0,1fr)${rightOpen ? " 360px" : ""}` }}
      >
        {/* Left: voice + transcript */}
        {leftOpen && (
        <aside className="flex min-h-0 flex-col border-r">
          <div className="space-y-3 border-b p-4">
            <div className="flex items-center gap-3">
              <Button
                size="lg"
                variant={voice.active ? "destructive" : "default"}
                className="flex-1"
                onClick={() => (voice.active ? voice.stop() : voice.start())}
              >
                {voice.active ? <MicOff /> : <Mic />}
                {voice.status === "idle" && "Start listening"}
                {voice.status === "starting" && "Starting…"}
                {voice.status === "listening" && "Listening"}
                {voice.status === "speaking" && "Hearing you…"}
                {voice.status === "error" && "Retry"}
              </Button>
              <kbd className="rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">M</kbd>
            </div>
            <Meter level={voice.level} threshold={threshold} speaking={voice.status === "speaking"} />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-16 shrink-0">Sensitivity</span>
              <Slider min={0.005} max={0.1} step={0.005} value={[threshold]} onValueChange={(v) => setThreshold(v[0])} />
            </div>
            {voice.error && <p className="text-xs text-destructive">{voice.error}</p>}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit(text);
                setText("");
              }}
            >
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="…or type an instruction" />
              <Button type="submit" size="icon" variant="secondary" disabled={!text.trim()}><CornerDownLeft /></Button>
            </form>
            <div className="flex flex-wrap gap-1">
              {SAMPLES.map((s) => (
                <button key={s} onClick={() => submit(s)} className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground">
                  {s}
                </button>
              ))}
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <ol className="divide-y">
              {turns.length === 0 && <li className="p-4 text-xs text-muted-foreground">Utterances appear here with what Jev decided.</li>}
              {turns.map((t) => (
                <li key={t.id} className="space-y-1 p-3 text-sm">
                  <div className="flex items-start gap-2">
                    {t.pending ? <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground" /> : <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", t.error ? "bg-destructive" : t.ops?.length ? "bg-emerald-500" : "bg-muted-foreground/40")} />}
                    <p className="leading-snug">“{t.transcript}”</p>
                  </div>
                  {t.error && <p className="pl-5 text-xs text-destructive">{t.error}</p>}
                  {t.ops?.map((o) => <p key={o} className="pl-5 font-mono text-[11px] text-emerald-700 dark:text-emerald-400">{o}</p>)}
                  {!t.pending && !t.error && !t.ops?.length && <p className="pl-5 text-xs text-muted-foreground">{t.ignored}</p>}
                  {t.ms != null && (
                    <p className="pl-5 text-[10px] text-muted-foreground">
                      {t.model?.startsWith("mock") ? "mock" : "jev"} {t.ms} ms{t.sttMs != null ? ` · whisper ${t.sttMs} ms` : ""}{t.explicit?.text ? ` · text “${t.explicit.text}”` : ""}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </ScrollArea>
        </aside>
        )}

        {/* Center: canvas */}
        <main className="relative min-h-0 overflow-auto bg-muted/30">
          <div className="sticky top-0 z-10 flex h-9 items-center gap-2 border-b bg-background/80 px-3 text-xs backdrop-blur">
            <span className="text-muted-foreground">Canvas</span>
            {elements.map(({ el }) => (
              <button
                key={el.id}
                onClick={() => setSelection(selection === el.id ? null : el.id)}
                className={cn("rounded border px-1.5 py-px font-mono text-[10px]", selection === el.id ? "border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300" : "text-muted-foreground hover:bg-accent")}
                title={label(el)}
              >
                {el.id}
              </button>
            ))}
            {busy && <Loader2 className="ml-auto size-3.5 animate-spin text-muted-foreground" />}
          </div>
          <Canvas design={design} selection={selection} onSelect={setSelection} />
        </main>

        {/* Right: Jev answers / state */}
        {rightOpen && (
        <aside className="min-h-0 border-l">
          <Tabs defaultValue="jev" className="flex h-full flex-col">
            <TabsList className="m-2 grid grid-cols-3">
              <TabsTrigger value="jev">Jev</TabsTrigger>
              <TabsTrigger value="design">Design</TabsTrigger>
              <TabsTrigger value="spec">Spec</TabsTrigger>
            </TabsList>
            <TabsContent value="jev" className="min-h-0 flex-1">
              <ScrollArea className="h-full">
                <div className="space-y-3 px-3 pb-4">
                  {!last && <p className="text-xs text-muted-foreground">Jev&apos;s typed answers for the last utterance show here: every question, the chosen option, and its probability.</p>}
                  {last && <p className="text-xs text-muted-foreground">“{last.transcript}”</p>}
                  {last && Object.entries(last.answers!).map(([k, a]) => <AnswerRow key={k} name={k} a={a} />)}
                </div>
              </ScrollArea>
            </TabsContent>
            <TabsContent value="design" className="min-h-0 flex-1">
              <Json value={design} />
            </TabsContent>
            <TabsContent value="spec" className="min-h-0 flex-1">
              <Json value={toSpec(design)} />
            </TabsContent>
          </Tabs>
        </aside>
        )}
      </div>
    </div>
  );
}

function Meter({ level, threshold, speaking }: { level: number; threshold: number; speaking: boolean }) {
  const pct = Math.min(100, (level / 0.2) * 100);
  const th = Math.min(100, (threshold / 0.2) * 100);
  return (
    <div className="relative h-2 overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full transition-[width] duration-75", speaking ? "bg-emerald-500" : "bg-sky-400")} style={{ width: `${pct}%` }} />
      <div className="absolute top-0 h-full w-px bg-foreground/60" style={{ left: `${th}%` }} />
    </div>
  );
}

function AnswerRow({ name, a }: { name: string; a: Answers[string] }) {
  if (a.type === "noul") {
    const yes = a.noul >= 0.5;
    return (
      <div className="text-xs">
        <div className="flex items-center justify-between">
          <span className="font-mono">{name}</span>
          <Badge variant={yes ? "default" : "outline"} className="font-mono text-[10px]">{yes ? "yes" : "no"} {a.noul.toFixed(2)}</Badge>
        </div>
        <Bar v={a.noul} strong={yes} />
      </div>
    );
  }
  if (a.type === "choice") {
    const rows = Object.entries(a.probabilities).sort((x, y) => y[1] - x[1]).slice(0, 4);
    return (
      <div className="text-xs">
        <div className="flex items-center justify-between">
          <span className="font-mono">{name}</span>
          <Badge variant="secondary" className="font-mono text-[10px]">{a.choice} · conf {a.confidence.toFixed(2)}</Badge>
        </div>
        {rows.map(([opt, p]) => (
          <div key={opt} className="mt-0.5 flex items-center gap-2">
            <span className={cn("w-28 truncate font-mono text-[10px]", opt === a.choice ? "text-foreground" : "text-muted-foreground")}>{opt}</span>
            <div className="flex-1"><Bar v={p} strong={opt === a.choice} /></div>
            <span className="w-8 text-right font-mono text-[10px] text-muted-foreground">{p.toFixed(2)}</span>
          </div>
        ))}
      </div>
    );
  }
  return <div className="text-xs font-mono">{name}: {a.score.toFixed(2)}</div>;
}

function Bar({ v, strong }: { v: number; strong: boolean }) {
  return (
    <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full", strong ? "bg-sky-500" : "bg-muted-foreground/40")} style={{ width: `${Math.round(v * 100)}%` }} />
    </div>
  );
}

function Json({ value }: { value: unknown }) {
  return (
    <ScrollArea className="h-full">
      <pre className="px-3 pb-4 font-mono text-[11px] leading-relaxed text-muted-foreground">{JSON.stringify(value, null, 2)}</pre>
    </ScrollArea>
  );
}
