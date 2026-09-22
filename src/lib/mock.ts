// Offline stand-in for Jev so the voice → canvas loop can be exercised
// before a TYPESAFE_API_KEY is configured (JEV_MOCK=1). Rule-based and
// deliberately dumb; Jev's answers are far better on real phrasing.
import type { Answers } from "./apply";
import { KINDS, flatten, type Design } from "./design";

const n = (v: boolean): Answers[string] => ({ type: "noul", noul: v ? 0.9 : 0.1 });
const c = (choice: string, conf = 0.8): Answers[string] => ({ type: "choice", choice, confidence: conf, probabilities: { [choice]: conf } });

const KIND_RE: [RegExp, string][] = [
  [/\bside ?nav|\bsidebar|\bside (?:navigation|menu)|\bleft (?:nav|menu)/, "sidenav"],
  [/\bapp ?header|\btop ?bar|\bnav ?bar|\bnavigation bar|\bapp bar|\btoolbar|\bmenu bar/, "header"],
  [/\btable|\bdata ?grid|\bspreadsheet/, "table"],
  [/\bavatar|\bprofile (?:picture|photo)|\buser (?:photo|image)/, "avatar"],
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
  [/\bseparator|\bdivider/, "separator"],
  [/\bparagraph|\bdescription|\bcaption|\btext\b|\bcopy\b/, "text"],
];

export function mockAnswers(transcript: string, design: Design, selection: string | null): Answers {
  const t = transcript.toLowerCase();
  const els = flatten(design).map((x) => x.el);
  const add = /\b(add|insert|create|put in|make (?:a|an)|give me|i need|i want|a |an )/.test(t) && !/\b(move|remove|delete)\b/.test(t);
  const remove = /\b(remove|delete|get rid of|drop)\b/.test(t);
  const move = /\b(move|put it|place it|reorder|beside|next to|under|above|below|first|last)\b/.test(t) && !add;
  const relabel = /\b(say|says|titled|called|named|label|rename|text to|change (?:it|the \w+) to)\b/.test(t);
  const restyle = /\b(red|danger|destructive|primary|secondary|outline|muted|style|colou?r|subtle)\b/.test(t);
  const resize = /\b(bigger|smaller|larger|wider|full width|small|large|big)\b/.test(t);
  const layout = /\b(side by side|in a row|horizontal|stacked|vertical|in a column)\b/.test(t);
  const fresh = /\b(start over|new screen|from scratch|clear|reset)\b/.test(t) || (design.elements.length === 0 && add);

  const kind = KIND_RE.find(([re]) => re.test(t))?.[1] ?? "none";
  const refM = t.match(/\b(?:beside|next to|under|below|above|inside|into|in|after|before)\s+(?:the\s+)?(\w+)/);
  const reference = refM ? els.find((e) => e.kind === refM[1] || e.text.toLowerCase().includes(refM[1]))?.id ?? "none" : "none";
  const head = refM ? t.slice(0, refM.index) : t; // target is mentioned before the reference phrase
  const mention = (skipKind?: string) =>
    els.find((e) => e.id !== reference && e.kind !== skipKind && ((e.text && head.includes(e.text.toLowerCase())) || head.includes(e.kind)))?.id ?? "none";
  const target = /\b(it|this|that|them)\b/.test(t) && selection ? "selected" : mention(add ? kind : undefined);
  const placement = /\binside|into|\bin the\b/.test(t) ? "inside" : /\bbefore|above|left of\b/.test(t) ? "before" : /\bafter|below|under|beside|next to|right of\b/.test(t) ? "after" : /\bfirst|top\b/.test(t) ? "start" : "end";
  const variant = /red|danger|destructive|delete/.test(t) ? "danger" : /secondary|subtle|grey|gray/.test(t) ? "secondary" : /outline|ghost/.test(t) ? "outline" : /muted|quiet/.test(t) ? "muted" : /primary|main|blue/.test(t) ? "primary" : "unchanged";
  const size = /full width|stretch/.test(t) ? "full" : /bigger|larger|large|big|wide/.test(t) ? "lg" : /smaller|small|compact|tiny/.test(t) ? "sm" : "unchanged";
  const cards = els.filter((e) => e.kind === "card");
  const container = placement === "inside" && reference !== "none" ? reference : cards.length && !/\b(outside|top level|root)\b/.test(t) && kind !== "card" ? cards[cards.length - 1].id : "root";

  const isUi = add || remove || move || relabel || restyle || resize || layout || fresh || KINDS.some((k) => t.includes(k));
  const colorM = t.match(/\b(red|orange|amber|yellow|lime|green|teal|cyan|blue|indigo|purple|pink|rose|brown|gr[ae]y|black|white)\b/);
  const theme = /\bdark (?:mode|theme)|\bnight mode\b/.test(t) ? "dark" : /\blight (?:mode|theme)\b/.test(t) ? "light" : "unchanged";
  const answers: Answers = {
    is_ui: n(isUi || theme !== "unchanged" || !!colorM),
    color: c(colorM ? colorM[1].replace("grey", "gray") : /\b(remove|reset|clear) the colou?r\b/.test(t) ? "none" : "unchanged"),
    theme: c(theme),
    mode: c(fresh ? "new_design" : /^(select|pick|focus)\b/.test(t) ? "select_only" : isUi ? "edit" : "none"),
    op_add: n(add && kind !== "none"),
    op_remove: n(remove),
    op_move: n(move),
    op_resize: n(resize),
    op_restyle: n(restyle || !!colorM),
    op_relabel: n(relabel && !add),
    op_layout: n(layout),
    component: c(add ? kind : "none"),
    size: c(size),
    variant: c(variant),
    layout: c(/side by side|in a row|horizontal/.test(t) ? "row" : layout ? "column" : "unchanged"),
    placement: c(placement),
  };
  if (els.length) {
    answers.target = c(target);
    answers.reference = c(reference);
  }
  if (cards.length) answers.container = c(container);
  if (els.some((e) => e.kind === "header" || e.kind === "sidenav")) {
    const linkWord = /\b(link|menu item|nav item|item|entry)s?\b/.test(t);
    const nc = linkWord && remove ? "remove_item" : linkWord && /\brename\b/.test(t) ? "rename_item" : linkWord ? "add_item" : "none";
    answers.nav_change = c(nc);
    if (nc !== "none") { answers.op_add = n(false); answers.op_remove = n(false); }
  }
  if (els.some((e) => e.kind === "table")) {
    const avatarWord = /\bavatars?\b|\bphotos?\b|\bpictures?\b/.test(t);
    const tc = avatarWord && remove ? "remove_avatars" : avatarWord && /\btable\b|\bit\b|\bthem\b|\brows?\b/.test(t) ? "add_avatars"
      : /\bcolumn\b/.test(t) ? (remove ? "remove_column" : "add_column")
      : /\brows?\b|\bentry|\bentries|\bmore (?:users|people|data)\b/.test(t) ? (remove ? "remove_row" : "add_row") : "none";
    answers.table_change = c(tc);
    if (tc !== "none") { answers.op_add = n(false); answers.op_remove = n(false); }
  }
  return answers;
}
