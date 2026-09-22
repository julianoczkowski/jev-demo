// Deterministic parsing of values the model should never invent: replacement
// text, counts, and quoted strings. Follows the gist: "to say…", "titled…".

const WORD_NUM: Record<string, number> = {
  one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

export interface Explicit {
  /** Replacement / initial text, if the speaker gave one. */
  text?: string;
  /** Softer inference for new elements: "a settings card" → "Settings". Never used for relabel. */
  name?: string;
  /** How many elements to add (default 1). */
  count: number;
  /** Raw transcript, normalised. */
  transcript: string;
}

const TEXT_PATTERNS: RegExp[] = [
  /\b(?:to|should|that|which)\s+(?:say|says|read|reads)\s+(.+)$/i,
  /\b(?:saying|reading|titled|entitled|called|named|labell?ed|captioned)\s+(.+)$/i,
  /\bwith\s+(?:the\s+)?(?:text|label|title|caption|words?|copy|name)\s+(?:of\s+)?(.+)$/i,
  /\b(?:text|label|title|caption|copy)\s+(?:to|is|=)\s+(.+)$/i,
  /\brename\s+(?:it|that|this|the\s+\w+)\s+(?:to\s+)?(.+)$/i,
];

// Trailing placement phrases are not part of the text: "Settings inside the card".
const LOCATION_TAIL =
  /\s+(?:(?:inside|into|in|within|beside|next to|under|underneath|below|above|before|after|on top of|to the left of|to the right of|at the (?:top|bottom|start|end)(?: of)?)\s+(?:the|a|an|this|that|my|it)\b.*|(?:at the (?:top|bottom|start|end)|first|last|on top|on the left|on the right))\s*$/i;

function clean(s: string): string {
  return s
    .trim()
    .replace(LOCATION_TAIL, "")
    .replace(/^["'“‘]+|["'”’.,!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const KIND_WORDS = "table|data table|grid|column|row|avatar|avatars|profile picture|link|menu item|nav item|navigation item|item|entry|app header|top bar|navbar|nav bar|navigation bar|side navigation|side nav|sidebar|side menu|navigation|nav|menu|card|panel|section|box|heading|title|header|button|cta|textarea|text area|input|field|textbox|text box|dropdown|select|picker|checkbox|toggle|switch|badge|tag|chip|pill|alert|banner|notice|separator|divider|paragraph|description|caption|text|label";
const QUALIFIERS = new Set(["app","side","top","left","right","main","global","navigation","nav","new","another","second","third","small","big","large","medium","wide","full","full-width","red","blue","green","primary","secondary","danger","destructive","outline","muted","subtle","simple","nice","little","tiny","huge","extra","more","one","single","empty","blank","basic","default","plain","main","first","last","same","different","other","fresh","quick"]);

/** "a settings card", "an email field", "a save button" → Settings / Email / Save */
function inferName(t: string): string | undefined {
  const m = t.match(new RegExp(`\\b(?:a|an|the|another|new)\\s+((?:[\\w'-]+\\s+){1,4}?)(?:${KIND_WORDS})s?\\b`, "i"));
  if (!m) return undefined;
  const words = m[1].trim().split(/\s+/).filter((w) => !QUALIFIERS.has(w.toLowerCase()));
  if (!words.length) return undefined;
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

export function parseExplicit(raw: string): Explicit {
  const transcript = raw.replace(/\s+/g, " ").trim();
  let text: string | undefined;

  // 1. Quoted string wins.
  const q = transcript.match(/["“]([^"”]{1,80})["”]/);
  if (q) text = clean(q[1]);

  // 2. Otherwise tail phrases.
  if (!text) {
    for (const re of TEXT_PATTERNS) {
      const m = transcript.match(re);
      if (m && m[1]) {
        text = clean(m[1]);
        break;
      }
    }
  }
  if (text) {
    // Title-case a lone word so buttons don't read like "save".
    if (!/\s/.test(text) && text === text.toLowerCase()) text = text[0].toUpperCase() + text.slice(1);
  }

  // Count: "add three buttons", "add 2 inputs"
  let count = 1;
  const c = transcript.match(/\b(?:add|create|insert|put|make|need|want)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i);
  if (c) {
    const w = c[1].toLowerCase();
    count = /^\d+$/.test(w) ? Math.min(10, parseInt(w, 10)) : WORD_NUM[w] ?? 1;
  }

  const name = text ? undefined : inferName(transcript);
  return { text, name, count, transcript };
}
