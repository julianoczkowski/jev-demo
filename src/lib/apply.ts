// Applies Jev's answers + explicitly parsed values to the design.
// All mutations are deterministic; Jev only chooses among options.
import {
  type Design,
  type El,
  type Kind,
  type Size,
  type Variant,
  type Color,
  COLORS,
  KINDS,
  DEFAULT_TEXT,
  SAMPLE_COLUMNS,
  SAMPLE_PEOPLE,
  DEFAULT_ITEMS,
  clone,
  findEl,
  nextId,
  walk,
} from "./design";
import type { Explicit } from "./explicit";

/** Loose view of a Jev answer map, independent of SDK generics. */
export type Answer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: "score"; score: number; confidence: number; probabilities?: Record<string, number> };
export type Answers = Record<string, Answer>;

export interface ApplyResult {
  design: Design;
  /** App theme change requested by voice, if any. */
  theme?: "dark" | "light";
  selection: string | null;
  recent: string | null;
  ops: string[];
  ignored?: string;
}

const YES = 0.5;
const SIZE_WORDS = /\b(small|smaller|compact|narrow|tiny|big|bigger|large|larger|wide|wider|huge|full[- ]width|stretch|medium)\b/i;
const COLOR_WORDS = new RegExp(`\\b(${Object.keys(COLORS).join("|")}|grey|colou?r|colou?red)\\b`, "i");
const STYLE_WORDS = /\b(red|blue|green|grey|gray|orange|amber|yellow|lime|teal|cyan|indigo|purple|pink|rose|brown|black|white|primary|secondary|danger|destructive|outline|outlined|ghost|muted|subtle|quiet|faded|solid|filled|prominent|bordered|light)\b/i;

/** Composite presets for common screens. Matched on the transcript, applied on add/new_design. */
const PRESETS: [RegExp, (d: Design) => El[]][] = [
  [/\b(dashboard|admin (?:panel|screen|page)|app shell|app layout)\b/i, (d) => {
    const header: El = { id: nextId(d, "header"), kind: "header", text: "Acme", items: [...DEFAULT_ITEMS.header!] };
    const d2: Design = { ...d, elements: [...d.elements, header] };
    const nav: El = { id: nextId(d2, "sidenav"), kind: "sidenav", text: "Menu", items: [...DEFAULT_ITEMS.sidenav!] };
    const d3: Design = { ...d2, elements: [...d2.elements, nav] };
    const card = preset(d3, "Overview", [["heading", "Welcome back"], ["text", "Here is what happened this week."], ["table", "Recent users"]]);
    return [header, nav, card];
  }],
  [/\b(log ?in|sign ?in)\b.*\b(form|screen|page|card)\b|\b(form|screen|page|card)\b.*\b(log ?in|sign ?in)\b|^\s*(a |an |the )?(log ?in|sign ?in)\s*$/i, (d) => [preset(d, "Sign in", [["input", "Email"], ["input", "Password"], ["checkbox", "Remember me"], ["button", "Sign in"]])]],
  [/\b(sign ?up|register|registration|create account)\b/i, (d) => [preset(d, "Create account", [["input", "Name"], ["input", "Email"], ["input", "Password"], ["checkbox", "I agree to the terms"], ["button", "Create account"]])]],
  [/\bcontact (form|page|screen|card)\b/i, (d) => [preset(d, "Contact us", [["input", "Name"], ["input", "Email"], ["textarea", "Message"], ["button", "Send"]])]],
  [/\b(checkout|payment) (form|page|screen|card)\b/i, (d) => [preset(d, "Checkout", [["input", "Card number"], ["input", "Expiry"], ["input", "CVC"], ["switch", "Save card"], ["button", "Pay now"]])]],
  [/\b(profile|settings|preferences) (form|page|screen)\b/i, (d) => [preset(d, "Settings", [["heading", "Profile"], ["input", "Display name"], ["input", "Email"], ["switch", "Email notifications"], ["separator", ""], ["button", "Save"]])]],
];

const SIZE_ORDER: Size[] = ["sm", "md", "lg", "full"];
function resolveSize(transcript: string, current: Size, fromJev: string): Size | "unchanged" {
  const t = transcript.toLowerCase();
  const i = SIZE_ORDER.indexOf(current);
  if (/full[- ]width|stretch|edge to edge|as wide as possible/.test(t)) return "full";
  if (/\b(bigger|larger|wider|increase|grow)\b/.test(t)) return SIZE_ORDER[Math.min(i + 1, SIZE_ORDER.length - 1)];
  if (/\b(smaller|narrower|shrink|reduce|decrease)\b/.test(t)) return SIZE_ORDER[Math.max(i - 1, 0)];
  if (/\b(tiny|small|compact)\b/.test(t)) return "sm";
  if (/\b(huge|large|big|wide)\b/.test(t)) return "lg";
  if (/\b(medium|normal|default)\b/.test(t)) return "md";
  return fromJev === "unchanged" ? "unchanged" : (fromJev as Size);
}

function preset(design: Design, title: string, fields: [Kind, string][]): El {
  const card: El = { id: nextId(design, "card"), kind: "card", text: title, children: [] };
  const scratch: Design = { ...design, elements: [...design.elements, card] };
  for (const [kind, text] of fields) {
    const el: El = { id: nextId(scratch, kind), kind, text };
    if (kind === "table") {
      el.columns = [...SAMPLE_COLUMNS];
      el.rows = SAMPLE_PEOPLE.slice(0, 3).map((r) => [...r]);
      el.avatars = true;
    }
    card.children!.push(el);
  }
  return card;
}
const MIN_CONF = 0.15; // choice answers below this are treated as "none"

function yes(a: Answers, k: string): boolean {
  const v = a[k];
  return !!v && v.type === "noul" && v.noul >= YES;
}
function pick(a: Answers, k: string, fallback = "none"): string {
  const v = a[k];
  if (!v || v.type !== "choice") return fallback;
  if (v.confidence < MIN_CONF) return fallback;
  return v.choice;
}

/* --- tree mutation helpers (operate on a cloned design) --- */

function removeById(els: El[], id: string): El | null {
  const i = els.findIndex((e) => e.id === id);
  if (i >= 0) return els.splice(i, 1)[0];
  for (const e of els) {
    if (e.children) {
      const r = removeById(e.children, id);
      if (r) return r;
    }
  }
  return null;
}

function listContaining(design: Design, id: string): El[] | null {
  let found: El[] | null = null;
  const visit = (list: El[]) => {
    if (list.some((e) => e.id === id)) found = list;
    for (const e of list) if (e.children) visit(e.children);
  };
  visit(design.elements);
  return found;
}

function insert(design: Design, el: El, placement: string, ref: El | null, container: El | null) {
  // inside a reference card
  if (placement === "inside" && ref?.kind === "card") {
    (ref.children ??= []).push(el);
    return;
  }
  // "at the top of the card" / "at the end of the card": start/end are relative to the reference container
  if (ref && (placement === "start" || placement === "end")) {
    // A card reference means inside it; any other reference means its sibling list.
    const list = ref.kind === "card" ? (ref.children ??= []) : listContaining(design, ref.id) ?? (container?.kind === "card" ? (container.children ??= []) : design.elements);
    if (placement === "start") list.unshift(el);
    else list.push(el);
    return;
  }
  if (ref && placement !== "inside") {
    const list = listContaining(design, ref.id);
    if (list) {
      const idx = list.findIndex((e) => e.id === ref.id);
      list.splice(placement === "before" ? idx : idx + 1, 0, el);
      return;
    }
  }
  const list = container?.kind === "card" ? (container.children ??= []) : design.elements;
  if (placement === "start") list.unshift(el);
  else list.push(el);
}

/** Fallback when Jev says "add" but the component choice is weak: keyword map. */
function guessKind(transcript: string): Kind | null {
  const t = transcript.toLowerCase();
  const map: [RegExp, Kind][] = [
    [/\bside ?nav|\bsidebar|\bside (?:navigation|menu|bar)|\bleft (?:nav|menu)/, "sidenav"],
    [/\bapp ?header|\btop ?bar|\bnav ?bar|\bnavigation bar|\bheader bar|\bapp bar|\btoolbar|\bmenu bar|\btop navigation/, "header"],
    [/\btable|\bdata ?grid|\bspreadsheet/, "table"],
    [/\bavatar|\bprofile (?:picture|photo|pic)|\buser (?:photo|image)/, "avatar"],
    [/\bcards?\b|\bpanel|\bsection|\bbox\b/, "card"],
    [/\bheading|\btitle\b|\bheader\b/, "heading"],
    [/\bbutton|\bcta\b/, "button"],
    [/\btext ?area|\bmessage box|\bcomment/, "textarea"],
    [/\binput|\bfield|\btext ?box|\bemail|\bpassword/, "input"],
    [/\bdropdown|\bselect\b|\bpicker/, "select"],
    [/\bcheckbox|\btick/, "checkbox"],
    [/\btoggle|\bswitch/, "switch"],
    [/\bbadge|\btag\b|\bchip|\bpill/, "badge"],
    [/\balert|\bbanner|\bnotice|\bwarning/, "alert"],
    [/\bseparator|\bdivider|\bline\b/, "separator"],
    [/\bparagraph|\bdescription|\bcaption|\btext\b|\bcopy\b/, "text"],
  ];
  for (const [re, k] of map) if (re.test(t)) return k;
  return null;
}

/** Kind words a speaker might use, mapped to element kinds. */
const KIND_SYNONYMS: [RegExp, Kind][] = [
  [/\b(side ?nav|sidebar|side navigation|side menu|left nav)\b/, "sidenav"],
  [/\b(app header|top bar|nav ?bar|navigation bar|app bar|header bar|navigation)\b/, "header"],
  [/\b(card|panel|section|box)\b/, "card"],
  [/\b(heading|title|header)\b/, "heading"],
  [/\b(button|cta)\b/, "button"],
  [/\b(text ?area|message box)\b/, "textarea"],
  [/\b(input|field|text ?box)\b/, "input"],
  [/\b(dropdown|select|picker)\b/, "select"],
  [/\b(checkbox|tick box)\b/, "checkbox"],
  [/\b(toggle|switch)\b/, "switch"],
  [/\b(badge|tag|chip|pill)\b/, "badge"],
  [/\b(alert|banner|notice)\b/, "alert"],
  [/\b(separator|divider)\b/, "separator"],
  [/\b(table|grid)\b/, "table"],
  [/\b(avatar|picture|photo)\b/, "avatar"],
  [/\b(paragraph|description|caption|text)\b/, "text"],
];

/**
 * Deterministic override for the position reference: when the speaker says
 * "below the card" and exactly one card exists, that card wins over Jev's guess.
 */
function namedReference(design: Design, transcript: string, jevRef: El | null): El | null {
  const m = transcript.toLowerCase().match(/\b(?:beside|next to|under|underneath|below|above|before|after|inside|into|in|within|on top of|left of|right of)\s+(?:the|this|that|my)\s+([\w -]{2,40}?)\s*$/);
  if (!m) return jevRef;
  const phrase = m[1];
  const kind = KIND_SYNONYMS.find(([re]) => re.test(phrase))?.[1];
  if (!kind) return jevRef;
  const all: El[] = [];
  walk(design.elements, (el) => el.kind === kind && all.push(el));
  if (jevRef?.kind === kind) return jevRef;
  const byText = all.find((e) => e.text && phrase.includes(e.text.toLowerCase()));
  return byText ?? (all.length === 1 ? all[0] : jevRef);
}

export function applyAnswers(
  input: Design,
  answers: Answers,
  explicit: Explicit,
  selection: string | null,
  recent: string | null,
): ApplyResult {
  const design = clone(input);
  const ops: string[] = [];

  if (!yes(answers, "is_ui")) {
    return { design, selection, recent, ops, ignored: "Not a UI instruction" };
  }
  // ---- theme (app-level, not a canvas element)
  {
    const th = pick(answers, "theme", "unchanged");
    if ((th === "dark" || th === "light") && /\b(dark|light|night|theme|mode)\b/i.test(explicit.transcript)) {
      return { design, selection, recent, ops: [`theme ${th}`], theme: th };
    }
  }

  const mode = pick(answers, "mode", "edit");
  const editing = ["op_remove", "op_move", "op_resize", "op_restyle", "op_relabel", "op_layout"].some((k) => yes(answers, k));
  // Bare noun phrases ("a settings page", "a dashboard") are adds even when Jev answers mode=none / op_add=no.
  const presetMatch = !editing ? PRESETS.find(([re]) => re.test(explicit.transcript)) : undefined;
  const bareNoun = /^\s*(?:a|an|the|new|another)\b/i.test(explicit.transcript) && pick(answers, "component") !== "none";
  const anyOp = yes(answers, "op_add") || editing || !!presetMatch || bareNoun;
  if (mode === "none" && !anyOp) return { design, selection, recent, ops, ignored: "No change requested" };

  // Resolve target / reference
  let targetId = pick(answers, "target");
  if (targetId === "selected") targetId = selection ?? recent ?? "none";
  const target = targetId !== "none" ? findEl(design, targetId) : null;
  const refId = pick(answers, "reference");
  const ref = namedReference(design, explicit.transcript, refId !== "none" ? findEl(design, refId) : null);

  if (mode === "select_only") {
    const sel = target ?? ref;
    return { design, selection: sel?.id ?? selection, recent: sel?.id ?? recent, ops: sel ? [`select ${sel.id}`] : [] };
  }

  let newSelection = selection;
  let newRecent = recent;

  if (mode === "new_design") {
    design.elements = [];
    newSelection = null;
    newRecent = null;
    ops.push("clear canvas");
  }

  // ---- layout
  if (yes(answers, "op_layout")) {
    const l = pick(answers, "layout", "unchanged");
    if (l === "row" || l === "column") {
      design.direction = l;
      ops.push(`layout ${l}`);
    }
  }

  // ---- table content (columns / rows / avatars)
  {
    const change = pick(answers, "table_change");
    const mentionsAvatar = /\bavatars?\b|\bprofile (?:picture|photo|pic)s?\b|\bphotos?\b|\bpictures?\b/i.test(explicit.transcript);
    const wantsAvatarInTable = yes(answers, "op_add") && pick(answers, "component") === "avatar";
    // Resolve which table: target, reference, container, selection, or the only table.
    const tables: El[] = [];
    walk(design.elements, (el) => el.kind === "table" && tables.push(el));
    const mentionsTable = /\btable\b|\brows?\b|\beach (?:user|person|row)\b|\bgrid\b/i.test(explicit.transcript);
    const pronoun = /\b(it|this|that|them|there)\b/i.test(explicit.transcript);
    const selectedTable = selection && (pronoun || mentionsTable) ? findEl(design, selection) : null;
    const referenced = [target, ref, selectedTable].find((e) => e?.kind === "table") ?? null;
    const tbl = referenced ?? (tables.length === 1 ? tables[0] : null);
    const avatarIntoTable = (wantsAvatarInTable || (mentionsAvatar && (yes(answers, "op_add") || yes(answers, "op_remove")))) && (referenced !== null || mentionsTable);
    if (tbl && (change !== "none" || avatarIntoTable)) {
      const eff = change !== "none" ? change : yes(answers, "op_remove") ? "remove_avatars" : "add_avatars";
      switch (eff) {
        case "add_avatars":
          tbl.avatars = true;
          ops.push(`table ${tbl.id}: avatars on`);
          break;
        case "remove_avatars":
          tbl.avatars = false;
          ops.push(`table ${tbl.id}: avatars off`);
          break;
        case "add_column": {
          const name = explicit.text ?? explicit.name ?? `Column ${(tbl.columns?.length ?? 0) + 1}`;
          tbl.columns = [...(tbl.columns ?? []), name];
          tbl.rows = (tbl.rows ?? []).map((r) => [...r, "—"]);
          ops.push(`table ${tbl.id}: add column "${name}"`);
          break;
        }
        case "remove_column": {
          const cols = tbl.columns ?? [];
          const t = explicit.transcript.toLowerCase();
          const idx = cols.findIndex((c) => t.includes(c.toLowerCase()));
          const i = idx >= 0 ? idx : cols.length - 1;
          if (i >= 0) {
            tbl.columns = cols.filter((_, j) => j !== i);
            tbl.rows = (tbl.rows ?? []).map((r) => r.filter((_, j) => j !== i));
            ops.push(`table ${tbl.id}: remove column "${cols[i]}"`);
          }
          break;
        }
        case "add_row": {
          const n = Math.max(1, explicit.count);
          const cols = tbl.columns?.length ?? 0;
          for (let k = 0; k < n; k++) {
            const seed = SAMPLE_PEOPLE[((tbl.rows?.length ?? 0) + k) % SAMPLE_PEOPLE.length];
            const row = Array.from({ length: cols }, (_, j) => seed[j] ?? "—");
            tbl.rows = [...(tbl.rows ?? []), row];
          }
          ops.push(`table ${tbl.id}: add ${n} row${n > 1 ? "s" : ""}`);
          break;
        }
        case "remove_row":
          if (tbl.rows?.length) {
            tbl.rows = tbl.rows.slice(0, -1);
            ops.push(`table ${tbl.id}: remove last row`);
          }
          break;
      }
      newRecent = tbl.id;
      newSelection = tbl.id;
      // Table content edits never also create standalone elements.
      if (newSelection && !findEl(design, newSelection)) newSelection = null;
      return { design, selection: newSelection, recent: newRecent, ops };
    }
  }

  // ---- navigation links (header / sidenav items)
  {
    const change = pick(answers, "nav_change");
    const linkWord = /\b(links?|menu items?|nav items?|items?|entr(?:y|ies)|menu|nav|navigation|sidebar|side ?nav|header|top ?bar|tabs?)\b/i.test(explicit.transcript);
    if (change !== "none" && linkWord) {
      const navs: El[] = [];
      walk(design.elements, (el) => (el.kind === "header" || el.kind === "sidenav") && navs.push(el));
      const t = explicit.transcript.toLowerCase();
      const wantSide = /\bside ?nav|\bsidebar|\bside (?:navigation|menu)|\bleft\b/.test(t);
      const wantTop = /\bapp ?header|\btop ?bar|\bnav ?bar|\bheader\b|\btop\b/.test(t);
      const nav =
        [target, ref, selection ? findEl(design, selection) : null].find((e) => e && (e.kind === "header" || e.kind === "sidenav")) ??
        navs.find((e) => (wantSide && e.kind === "sidenav") || (wantTop && e.kind === "header")) ??
        (navs.length === 1 ? navs[0] : null);
      if (nav) {
        const items = nav.items ?? [];
        const named = explicit.text ?? explicit.name;
        if (change === "add_item") {
          const label = named ?? `Link ${items.length + 1}`;
          if (items.some((i) => i.toLowerCase() === label.toLowerCase())) {
            return { design, selection: nav.id, recent: nav.id, ops, ignored: `"${label}" is already in the ${nav.kind}` };
          }
          nav.items = [...items, label];
          ops.push(`${nav.kind} ${nav.id}: add link "${label}"`);
        } else if (change === "remove_item") {
          const idx = items.findIndex((i) => t.includes(i.toLowerCase()));
          const i = idx >= 0 ? idx : items.length - 1;
          if (i >= 0) {
            nav.items = items.filter((_, j) => j !== i);
            ops.push(`${nav.kind} ${nav.id}: remove link "${items[i]}"`);
          }
        } else if (change === "rename_item" && explicit.text) {
          const idx = items.findIndex((i) => t.includes(i.toLowerCase()));
          if (idx >= 0) {
            const old = items[idx];
            nav.items = items.map((i, j) => (j === idx ? explicit.text! : i));
            ops.push(`${nav.kind} ${nav.id}: rename "${old}" → "${explicit.text}"`);
          }
        }
        if (ops.length) return { design, selection: nav.id, recent: nav.id, ops };
      }
    }
  }

  // ---- remove (destructive: require the target to actually be named, or a pronoun + selection)
  if (yes(answers, "op_remove") && target) {
    const t = explicit.transcript.toLowerCase();
    const named =
      t.includes(target.kind) ||
      (target.text && t.includes(target.text.toLowerCase())) ||
      (/\b(it|this|that|them|selected)\b/.test(t) && (selection === target.id || recent === target.id)) ||
      (target.kind === "input" && /\b(field|textbox|text box)\b/.test(t)) ||
      (target.kind === "text" && /\b(paragraph|description|caption|copy)\b/.test(t)) ||
      (target.kind === "heading" && /\b(title|header)\b/.test(t)) ||
      (target.kind === "card" && /\b(panel|section|box)\b/.test(t)) ||
      (target.kind === "badge" && /\b(tag|chip|pill)\b/.test(t)) ||
      (target.kind === "alert" && /\b(banner|notice|warning)\b/.test(t)) ||
      (target.kind === "separator" && /\b(divider|line)\b/.test(t)) ||
      (target.kind === "switch" && /\btoggle\b/.test(t)) ||
      (target.kind === "select" && /\b(dropdown|picker)\b/.test(t)) ||
      (target.kind === "avatar" && /\b(picture|photo)\b/.test(t)) ||
      (target.kind === "header" && /\b(top bar|nav ?bar|navigation|app bar|header)\b/.test(t)) ||
      (target.kind === "sidenav" && /\b(sidebar|side ?nav|side navigation|side menu|menu|navigation)\b/.test(t));
    if (!named) {
      return { design, selection, recent, ops, ignored: `Nothing matching that to remove (Jev guessed ${target.id})` };
    }
    removeById(design.elements, target.id);
    ops.push(`remove ${target.id}`);
    if (newSelection === target.id) newSelection = null;
    newRecent = null;
  }

  // ---- relabel (text spoken alongside an add belongs to the new element, not an existing one)
  if (yes(answers, "op_relabel") && explicit.text && !yes(answers, "op_add")) {
    const t = target ?? (selection ? findEl(design, selection) : null) ?? (recent ? findEl(design, recent) : null);
    if (t) {
      t.text = explicit.text;
      ops.push(`relabel ${t.id} → "${explicit.text}"`);
      newRecent = t.id;
    }
  }

  const adding = yes(answers, "op_add") || !!presetMatch || bareNoun;

  // ---- restyle (skipped while adding: "a secondary button" styles the new element, not an old one)
  if (yes(answers, "op_restyle") && !adding) {
    const v = pick(answers, "variant", "unchanged");
    const clearing = /\b(remove|reset|clear|drop|take (?:off|away)|get rid of)\b.*\bcolou?r/i.test(explicit.transcript) || /\b(no|default|normal|original) colou?r\b/i.test(explicit.transcript);
    const col = clearing ? "none" : pick(answers, "color", "unchanged");
    const t = target ?? (selection ? findEl(design, selection) : null) ?? (recent ? findEl(design, recent) : null);
    if (t && col !== "unchanged" && COLOR_WORDS.test(explicit.transcript)) {
      if (col === "none") {
        delete t.color;
        ops.push(`clear colour ${t.id}`);
      } else if (col in COLORS) {
        t.color = col as Color;
        ops.push(`colour ${t.id} → ${col}`);
      }
      newRecent = t.id;
    } else if (t && v !== "unchanged") {
      t.variant = v as Variant;
      ops.push(`restyle ${t.id} → ${v}`);
      newRecent = t.id;
    }
  }

  // ---- resize (relative words resolved in code; Jev's absolute answer is the fallback)
  if (yes(answers, "op_resize") && !adding) {
    const t = target ?? (selection ? findEl(design, selection) : null);
    const s = resolveSize(explicit.transcript, t?.size ?? "md", pick(answers, "size", "unchanged"));
    if (t && s !== "unchanged" && s !== t.size) {
      t.size = s as Size;
      ops.push(`resize ${t.id} → ${s}`);
      newRecent = t.id;
    }
  }

  // ---- move
  if (yes(answers, "op_move")) {
    const t = target ?? (selection ? findEl(design, selection) : null);
    const placement = pick(answers, "placement", "end");
    if (t && (ref || placement === "start" || placement === "end") && ref?.id !== t.id) {
      // With no reference, "to the top/bottom" stays inside the element's current container.
      const home = !ref ? listContaining(design, t.id) : null;
      const moved = removeById(design.elements, t.id);
      if (moved) {
        if (home && !ref) {
          if (placement === "start") home.unshift(moved);
          else home.push(moved);
        } else {
          insert(design, moved, placement, ref, null);
        }
        ops.push(`move ${t.id} ${placement}${ref ? ` ${ref.id}` : ""}`);
        newRecent = t.id;
        // "beside" implies a row when both are at root level
        if (placement === "after" && ref && /\b(beside|next to|side by side|to the right|to the left)\b/i.test(explicit.transcript)) {
          if (design.elements.some((e) => e.id === t.id) && design.elements.some((e) => e.id === ref.id)) {
            design.direction = "row";
            ops.push("layout row");
          }
        }
      }
    }
  }

  // ---- add
  const wantsAdd = yes(answers, "op_add") || mode === "new_design" || !!presetMatch || bareNoun;
  const presetHit = wantsAdd ? presetMatch : undefined;
  if (presetHit) {
    const made = presetHit[1](design);
    const placement = pick(answers, "placement", "end");
    for (const el of made) {
      if (explicit.text && el.kind === "card") el.text = explicit.text;
      insert(design, el, ref ? placement : "end", ref, null);
      ops.push(`add ${el.id}${el.children ? ` (${el.text}: ${el.children.map((c) => c.id).join(", ")})` : ""}`);
    }
    const last = made[made.length - 1];
    newSelection = last.id;
    newRecent = last.id;
  } else if (wantsAdd) {
    let kind = pick(answers, "component") as Kind | "none";
    if (kind === "none" || !KINDS.includes(kind as Kind)) kind = guessKind(explicit.transcript) ?? "none";
    if (kind !== "none") {
      const placement = pick(answers, "placement", "end");
      const containerId = pick(answers, "container", "root");
      const container = containerId !== "root" ? findEl(design, containerId) : null;
      const size = pick(answers, "size", "unchanged");
      const variant = pick(answers, "variant", "unchanged");
      // If the target is a card and the user said "in/inside", treat it as the container.
      const into = ref?.kind === "card" && placement === "inside" ? ref : container ?? (target?.kind === "card" ? target : null);
      let lastId: string | null = null;
      for (let i = 0; i < explicit.count; i++) {
        const el: El = {
          id: nextId(design, kind),
          kind,
          text: explicit.count === 1 && (explicit.text || explicit.name) ? (explicit.text || explicit.name)! : DEFAULT_TEXT[kind],
        };
        if (explicit.text && explicit.count > 1) el.text = `${explicit.text} ${i + 1}`;
        if (kind === "card") el.children = [];
        if (DEFAULT_ITEMS[kind]) el.items = [...DEFAULT_ITEMS[kind]!];
        if (kind === "table") {
          el.columns = [...SAMPLE_COLUMNS];
          el.rows = SAMPLE_PEOPLE.slice(0, 3).map((r) => [...r]);
          el.avatars = /\bavatars?\b|\bphotos?\b|\bpictures?\b/i.test(explicit.transcript);
        }
        if (size !== "unchanged" && size !== "md" && SIZE_WORDS.test(explicit.transcript)) el.size = size as Size;
        const col = pick(answers, "color", "unchanged");
        if (col in COLORS && COLOR_WORDS.test(explicit.transcript)) el.color = col as Color;
        else if (variant !== "unchanged" && variant !== "primary" && STYLE_WORDS.test(explicit.transcript)) el.variant = variant as Variant;
        insert(design, el, ref && placement !== "inside" ? placement : placement === "inside" ? "end" : placement, ref && placement !== "inside" ? ref : null, into);
        lastId = el.id;
        const where =
          ref && (placement === "before" || placement === "after") ? ` ${placement} ${ref.id}`
          : ref?.kind === "card" && (placement === "start" || placement === "end") ? ` ${placement} of ${ref.id}`
          : into ? ` in ${into.id}` : placement === "start" ? " first" : "";
        ops.push(`add ${el.id}${where}`);
      }
      if (lastId) {
        newSelection = lastId;
        newRecent = lastId;
      }
    }
  }

  // Keep selection valid
  if (newSelection && !findEl(design, newSelection)) newSelection = null;
  if (newRecent && !findEl(design, newRecent)) newRecent = null;

  // Cards keep children arrays
  walk(design.elements, (el) => {
    if (el.kind === "card" && !el.children) el.children = [];
  });

  const effective = ops.length === 1 && ops[0] === "clear canvas" && input.elements.length === 0 ? [] : ops;
  return { design, selection: newSelection, recent: newRecent, ops: effective, ignored: effective.length ? undefined : "Understood, but nothing to apply" };
}
