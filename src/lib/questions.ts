// Builds the single Jev request for one utterance.
// Every question is atomic; code (apply.ts) combines the answers.
import { choice, noul, type ChoiceCriteria } from "@typesafe-ai/sdk";
import { KINDS, KIND_DESCRIPTIONS, COLORS, type Design, flatten, label } from "./design";

export interface Context {
  transcript: string;
  design: Design;
  selection: string | null;
  /** id of the element touched by the previous instruction, for "it"/"that" */
  recent: string | null;
}

export function buildState(ctx: Context) {
  const { design, selection, recent } = ctx;
  return {
    instruction: ctx.transcript,
    selected_element: selection ?? "none",
    most_recently_edited_element: recent ?? "none",
    canvas: {
      layout: design.direction,
      elements: flatten(design).map(({ el, parent }) => ({
        id: el.id,
        kind: el.kind,
        text: el.text,
        style: el.variant ?? "default",
        colour: el.color ?? "default",
        size: el.size ?? "md",
        inside: parent?.id ?? "root",
        ...(el.kind === "table" ? { columns: el.columns, row_count: el.rows?.length ?? 0, avatars: !!el.avatars } : {}),
        ...(el.items ? { links: el.items } : {}),
      })),
    },
  };
}

function elementCriteria(design: Design, extra: ChoiceCriteria): ChoiceCriteria {
  const c: ChoiceCriteria = {};
  for (const { el, parent } of flatten(design)) {
    c[el.id] = `the ${label(el)}${parent ? ` inside ${parent.id}` : ""}`;
  }
  return { ...c, ...extra };
}

export function buildQuestions(ctx: Context) {
  const { design } = ctx;
  const hasElements = design.elements.length > 0;
  const cards = flatten(design).filter((x) => x.el.kind === "card");
  const tables = flatten(design).filter((x) => x.el.kind === "table");
  const navs = flatten(design).filter((x) => x.el.kind === "header" || x.el.kind === "sidenav");

  const componentCriteria: ChoiceCriteria = { none: "no new component is requested" };
  for (const k of KINDS) componentCriteria[k] = KIND_DESCRIPTIONS[k];

  const q = {
    is_ui: noul("Is the instruction asking to create, change, style, colour, select, or remove something in a user interface / screen / design, or to change its theme?"),

    mode: choice("What kind of change is requested?", {
      new_design: "start over, replace everything, or build a brand new screen from scratch",
      edit: "add to or modify the design (add, remove, move, restyle, or relabel elements); a bare noun phrase like 'a settings card' means add it",
      select_only: "only select / point at / focus an element, changing nothing",
      none: "no design change is requested",
    }),

    op_add: noul("Does the instruction ask to ADD or insert one or more new elements?"),
    op_remove: noul("Does the instruction ask to REMOVE, delete, or get rid of an element?"),
    op_move: noul("Does the instruction ask to MOVE, reorder, or reposition an existing element (e.g. 'put it beside/under/above/first/last', 'move it into the card')?"),
    op_resize: noul("Does the instruction ask to RESIZE an element (bigger, smaller, wider, full width)?"),
    op_restyle: noul("Does the instruction ask to change an element's STYLE, emphasis, colour, or variant (e.g. primary, secondary, destructive/red, outline, subtle)?"),
    op_relabel: noul("Does the instruction ask to change the TEXT, label, title, wording, or name of an element?"),
    op_layout: noul("Does the instruction ask to change the overall LAYOUT direction (side by side / in a row vs stacked / in a column) or spacing of the whole design?"),

    component: choice("If a new element is being added, which component type is it?", componentCriteria),

    size: choice("If a size is mentioned, which size?", {
      unchanged: "no size mentioned",
      sm: "small, compact, narrow, tiny",
      md: "medium, normal, default",
      lg: "large, big, wide",
      full: "full width, stretch across, edge to edge",
    }),

    variant: choice("If a style or emphasis is mentioned, which one?", {
      unchanged: "no style mentioned",
      primary: "primary, main, filled, solid, prominent, blue",
      secondary: "secondary, subtle, grey, less prominent",
      danger: "destructive, danger, delete, red, error, warning-red",
      outline: "outline, outlined, bordered, ghost",
      muted: "muted, quiet, faded, caption-like, light",
    }),

    color: choice("If a COLOUR is mentioned for an element, which one?", {
      unchanged: "no colour mentioned",
      ...Object.fromEntries(Object.keys(COLORS).map((c) => [c, c === "gray" ? "gray / grey / neutral" : c])),
      none: "remove / reset / clear the colour, back to default",
    }),

    theme: choice("Is the instruction about the app's light/dark theme?", {
      unchanged: "not about the theme",
      dark: "switch to dark mode / night mode / dark theme",
      light: "switch to light mode / light theme",
    }),

    layout: choice("If the overall layout direction is mentioned, which one?", {
      unchanged: "not mentioned",
      row: "horizontal, side by side, in a row, next to each other, inline",
      column: "vertical, stacked, one under another, in a column",
    }),

    placement: choice("Where should the element go, relative to the reference element (if any)?", {
      end: "at the end / bottom / last, or no position given",
      start: "at the start / top / first",
      before: "before, above, on top of, to the left of the reference element",
      after: "after, below, under, beneath, next to, beside, to the right of the reference element",
      inside: "inside / within / into the reference element (a card)",
    }),

    ...(hasElements
      ? {
          target: choice(
            "Which existing element is the instruction acting on (the thing being removed, moved, resized, restyled, relabelled, or selected)? Use 'selected' if it says 'it', 'this', 'that' and an element is selected.",
            elementCriteria(design, {
              selected: "the currently selected element (for 'it', 'this', 'that', 'the selected one')",
              none: "no existing element is the target: only adding something new, or the element named in the instruction does not exist on the canvas",
            }),
          ),
          reference: choice(
            "Which existing element is used as a POSITION reference (the X in 'beside X', 'under X', 'inside X', 'above X')?",
            elementCriteria(design, { none: "no position reference is mentioned" }),
          ),
        }
      : {}),

    ...(tables.length > 0
      ? {
          table_change: choice(
            "If the instruction changes the CONTENT of an existing table (not the table as a whole), what does it do?",
            {
              none: "the instruction is not about a table's columns, rows, or avatars",
              add_avatars: "show avatars / profile pictures / photos / user images in the table rows",
              remove_avatars: "hide or remove the avatars / pictures from the table",
              add_column: "add a new column to the table",
              remove_column: "remove a column from the table",
              add_row: "add a row / another entry / more data to the table",
              remove_row: "remove a row / entry from the table",
            },
          ),
        }
      : {}),

    ...(navs.length > 0
      ? {
          nav_change: choice(
            "If the instruction changes the LINKS of the app header or side navigation (not the bar itself), what does it do?",
            {
              none: "the instruction is not about navigation links / menu items",
              add_item: "add a link / menu item / entry to the navigation",
              remove_item: "remove a link / menu item from the navigation",
              rename_item: "rename an existing link / menu item",
            },
          ),
        }
      : {}),

    ...(cards.length > 0
      ? {
          container: choice(
            "Which container should a NEW element be placed in?",
            Object.fromEntries([
              ["root", "the top level of the canvas, not inside any card"],
              ...cards.map(({ el }) => [el.id, `inside the ${label(el)}`]),
            ]) as ChoiceCriteria,
          ),
        }
      : {}),
  };
  return q;
}

export type Questions = ReturnType<typeof buildQuestions>;
