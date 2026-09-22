// Typed design state. This is the "source of truth" the voice loop edits.
// It is deliberately small: a flat list of elements, cards may nest one level.

export const KINDS = [
  "card",
  "heading",
  "text",
  "button",
  "input",
  "textarea",
  "select",
  "checkbox",
  "switch",
  "badge",
  "alert",
  "separator",
  "table",
  "avatar",
  "header",
  "sidenav",
] as const;
export type Kind = (typeof KINDS)[number];

export const SIZES = ["sm", "md", "lg", "full"] as const;
export type Size = (typeof SIZES)[number];

export const VARIANTS = ["primary", "secondary", "danger", "outline", "muted"] as const;
export type Variant = (typeof VARIANTS)[number];

/** Named colours a speaker can ask for. Values are the fill colour; text is chosen for contrast. */
export const COLORS = {
  red: "#dc2626",
  orange: "#ea580c",
  amber: "#d97706",
  yellow: "#eab308",
  lime: "#65a30d",
  green: "#16a34a",
  teal: "#0d9488",
  cyan: "#0891b2",
  blue: "#2563eb",
  indigo: "#4f46e5",
  purple: "#9333ea",
  pink: "#db2777",
  rose: "#e11d48",
  brown: "#92400e",
  gray: "#6b7280",
  black: "#171717",
  white: "#ffffff",
} as const;
export type Color = keyof typeof COLORS;
export const LIGHT_FILLS: Color[] = ["white", "yellow", "lime", "amber"];

export interface El {
  id: string;
  kind: Kind;
  /** Visible text: label, title, heading, badge text, alert title… */
  text: string;
  variant?: Variant;
  size?: Size;
  color?: Color;
  /** Only cards have children. */
  children?: El[];
  /** Tables only. */
  columns?: string[];
  rows?: string[][];
  avatars?: boolean;
  /** Header and side navigation: link labels. */
  items?: string[];
}

export interface Design {
  direction: "column" | "row";
  gap: "sm" | "md" | "lg";
  elements: El[];
}

export const EMPTY_DESIGN: Design = { direction: "column", gap: "md", elements: [] };

export const SAMPLE_DESIGN: Design = {
  direction: "column",
  gap: "md",
  elements: [
    {
      id: "card-1",
      kind: "card",
      text: "Settings",
      children: [
        { id: "heading-1", kind: "heading", text: "Profile" },
        { id: "text-1", kind: "text", text: "Update your name and how others see you.", variant: "muted" },
        { id: "input-1", kind: "input", text: "Display name" },
        { id: "input-2", kind: "input", text: "Email" },
        { id: "switch-1", kind: "switch", text: "Email notifications" },
        { id: "separator-1", kind: "separator", text: "" },
        { id: "button-1", kind: "button", text: "Save" },
      ],
    },
    { id: "badge-1", kind: "badge", text: "Draft", variant: "secondary" },
  ],
};

export const KIND_DESCRIPTIONS: Record<Kind, string> = {
  card: "a card / panel / box / section / container that groups other elements",
  heading: "a heading / title text inside the page content (not the app-wide top bar)",
  text: "a paragraph / body text / description / caption / label text",
  button: "a button / call to action / CTA",
  input: "a single-line text input / field / textbox / email or password field",
  textarea: "a multi-line text area / message box / comment box",
  select: "a dropdown / select / picker / menu of options",
  checkbox: "a checkbox / tick box",
  switch: "a toggle / switch / on-off control",
  badge: "a badge / tag / chip / pill / status label",
  alert: "an alert / banner / notice / warning / error message box",
  separator: "a separator / divider / horizontal line",
  table: "a table / data grid / list of rows and columns (users, orders, items…)",
  avatar: "a single user avatar / profile picture / user photo on its own, NOT inside a table",
  header: "an app header / top bar / navbar spanning the top of the app with the app name and navigation links",
  sidenav: "a side navigation / sidebar / left menu with a vertical list of links",
};

export const DEFAULT_TEXT: Record<Kind, string> = {
  card: "Card",
  heading: "Heading",
  text: "Some descriptive text goes here.",
  button: "Button",
  input: "Field",
  textarea: "Message",
  select: "Choose an option",
  checkbox: "Checkbox",
  switch: "Toggle",
  badge: "Badge",
  alert: "Heads up",
  separator: "",
  table: "Users",
  avatar: "Alex Kim",
  header: "Acme",
  sidenav: "Menu",
};

export const DEFAULT_ITEMS: Partial<Record<Kind, string[]>> = {
  header: ["Home", "Projects", "Reports", "Settings"],
  sidenav: ["Dashboard", "Projects", "Team", "Billing", "Settings"],
};

export const SAMPLE_PEOPLE: string[][] = [
  ["Alex Kim", "alex@example.com", "Admin"],
  ["Priya Natarajan", "priya@example.com", "Editor"],
  ["Sam Okafor", "sam@example.com", "Viewer"],
  ["Jordan Lee", "jordan@example.com", "Editor"],
];
export const SAMPLE_COLUMNS = ["Name", "Email", "Role"];

/* ---------- tree helpers ---------- */

export function walk(els: El[], fn: (el: El, parent: El | null) => void, parent: El | null = null) {
  for (const el of els) {
    fn(el, parent);
    if (el.children) walk(el.children, fn, el);
  }
}

export function flatten(design: Design): { el: El; parent: El | null }[] {
  const out: { el: El; parent: El | null }[] = [];
  walk(design.elements, (el, parent) => out.push({ el, parent }));
  return out;
}

export function findEl(design: Design, id: string): El | null {
  let found: El | null = null;
  walk(design.elements, (el) => {
    if (el.id === id) found = el;
  });
  return found;
}

export function nextId(design: Design, kind: Kind): string {
  const used = new Set(flatten(design).map((x) => x.el.id));
  let n = 1;
  while (used.has(`${kind}-${n}`)) n++;
  return `${kind}-${n}`;
}

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/** Short human label used in Jev choice criteria and the UI. */
export function label(el: El): string {
  return el.text ? `${el.kind} "${el.text}"` : el.kind;
}

/** Plain-language description of the canvas that goes into Jev's state. */
export function describe(design: Design): string {
  if (design.elements.length === 0) return "The canvas is empty.";
  const lines: string[] = [`Layout: ${design.direction}, gap ${design.gap}.`];
  walk(design.elements, (el, parent) => {
    const indent = parent ? "    " : "  ";
    const bits = [`${el.id}: ${label(el)}`];
    if (el.variant) bits.push(`style ${el.variant}`);
    if (el.color) bits.push(`colour ${el.color}`);
    if (el.size) bits.push(`size ${el.size}`);
    if (el.kind === "table") bits.push(`columns [${(el.columns ?? []).join(", ")}], ${el.rows?.length ?? 0} rows, avatars ${el.avatars ? "on" : "off"}`);
    if (el.items) bits.push(`links [${el.items.join(", ")}]`);
    if (parent) bits.push(`inside ${parent.id}`);
    lines.push(indent + bits.join(", "));
  });
  return lines.join("\n");
}
