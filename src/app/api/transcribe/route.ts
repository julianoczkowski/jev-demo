// Browser audio blob → ffmpeg (16 kHz mono wav) → local whisper.cpp server.
import { spawn } from "node:child_process";

export const runtime = "nodejs";

const WHISPER_URL = process.env.WHISPER_URL ?? "http://127.0.0.1:8178";

function toWav(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", ["-loglevel", "error", "-i", "pipe:0", "-ar", "16000", "-ac", "1", "-f", "wav", "pipe:1"]);
    const chunks: Buffer[] = [];
    let err = "";
    ff.stdout.on("data", (d) => chunks.push(d));
    ff.stderr.on("data", (d) => (err += d));
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`ffmpeg exited ${code}: ${err}`))));
    ff.stdin.end(input);
  });
}

const JUNK = /^\s*[\[(].*[\])]\s*$/; // "[BLANK_AUDIO]", "(silence)" etc.

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) return Response.json({ error: "no file" }, { status: 400 });

  const t0 = Date.now();
  let wav: Buffer;
  try {
    wav = await toWav(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return Response.json({ error: `ffmpeg failed: ${(e as Error).message}` }, { status: 500 });
  }

  const out = new FormData();
  out.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "audio.wav");
  out.append("response_format", "json");
  out.append("temperature", "0.0");
  out.append("no_timestamps", "true");

  let r: Response;
  try {
    r = await fetch(`${WHISPER_URL}/inference`, { method: "POST", body: out });
  } catch {
    return Response.json(
      { error: `whisper-server is not running at ${WHISPER_URL}. Start it with: pnpm whisper` },
      { status: 503 },
    );
  }
  if (!r.ok) return Response.json({ error: `whisper-server ${r.status}: ${await r.text()}` }, { status: 502 });
  const data = (await r.json()) as { text?: string };
  let text = (data.text ?? "").replace(/\s+/g, " ").trim();
  if (JUNK.test(text)) text = "";
  return Response.json({ text, ms: Date.now() - t0 });
}
