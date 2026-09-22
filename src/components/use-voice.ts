"use client";
// Continuous listening with pause detection. Audio never leaves the machine:
// each utterance is POSTed to /api/transcribe which talks to local whisper.cpp.
import { useCallback, useEffect, useRef, useState } from "react";

export interface VoiceOptions {
  onUtterance: (blob: Blob) => void;
  /** RMS level (0..1) that counts as speech. */
  threshold?: number;
  /** ms of silence after speech before the utterance is committed. */
  pauseMs?: number;
  /** Hard cap on one utterance. */
  maxMs?: number;
}

export type VoiceStatus = "idle" | "starting" | "listening" | "speaking" | "error";

function pickMime(): string {
  const c = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return c.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

export function useVoice({ onUtterance, threshold = 0.025, pauseMs = 900, maxMs = 15000 }: VoiceOptions) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);
  const onUtt = useRef(onUtterance);
  const opts = useRef({ threshold, pauseMs, maxMs });
  useEffect(() => {
    onUtt.current = onUtterance;
    opts.current = { threshold, pauseMs, maxMs };
  }, [onUtterance, threshold, pauseMs, maxMs]);

  // Per-segment state
  const seg = useRef({ spoke: false, lastVoice: 0, started: 0, chunks: [] as Blob[] });

  const stop = useCallback(() => {
    if (timer.current) cancelAnimationFrame(timer.current);
    timer.current = null;
    try {
      if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    } catch {}
    recorder.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    audioCtx.current?.close();
    audioCtx.current = null;
    analyser.current = null;
    setStatus("idle");
    setLevel(0);
  }, []);

  const startRecorder = useCallback((discard = false) => {
    const s = stream.current;
    if (!s) return;
    const mime = pickMime();
    const rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
    const state = { spoke: false, lastVoice: 0, started: performance.now(), chunks: [] as Blob[] };
    seg.current = state;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) state.chunks.push(e.data);
    };
    rec.onstop = () => {
      if (state.spoke && !discard && state.chunks.length) {
        onUtt.current(new Blob(state.chunks, { type: rec.mimeType || mime }));
      }
    };
    rec.start(250);
    recorder.current = rec;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus("starting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      stream.current = s;
      const ctx = new AudioContext();
      audioCtx.current = ctx;
      const src = ctx.createMediaStreamSource(s);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      analyser.current = an;
      startRecorder();
      setStatus("listening");

      const buf = new Float32Array(an.fftSize);
      const tick = () => {
        const a = analyser.current;
        const rec = recorder.current;
        if (!a || !rec) return;
        a.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        setLevel(rms);
        const now = performance.now();
        const st = seg.current;
        const { threshold, pauseMs, maxMs } = opts.current;
        if (rms > threshold) {
          if (!st.spoke) setStatus("speaking");
          st.spoke = true;
          st.lastVoice = now;
        }
        const tooLong = now - st.started > maxMs;
        const paused = st.spoke && now - st.lastVoice > pauseMs;
        const staleSilence = !st.spoke && now - st.started > 8000;
        if (paused || tooLong) {
          rec.stop(); // onstop hands the blob to onUtterance
          startRecorder();
          setStatus("listening");
        } else if (staleSilence) {
          rec.onstop = null;
          rec.stop();
          startRecorder();
        }
        timer.current = requestAnimationFrame(tick);
      };
      timer.current = requestAnimationFrame(tick);
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
      stop();
    }
  }, [startRecorder, stop]);

  useEffect(() => () => stop(), [stop]);

  return { status, level, error, start, stop, active: status !== "idle" && status !== "error" };
}
