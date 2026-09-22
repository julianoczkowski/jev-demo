// design state → json-render Spec using the @json-render/shadcn catalog.
// Every design element is wrapped in a custom "Slot" so the canvas can show
// selection and apply size classes without touching the shadcn components.
import type { Spec } from "@json-render/core";
import type { Design, El } from "./design";

type SpecEl = { type: string; props: Record<string, unknown>; children?: string[] };

const GAP = { sm: "sm", md: "md", lg: "lg" } as const;

function buttonVariant(v?: string): "primary" | "secondary" | "danger" {
  if (v === "danger") return "danger";
  if (v === "secondary" || v === "outline" || v === "muted") return "secondary";
  return "primary";
}
function badgeVariant(v?: string): "default" | "secondary" | "destructive" | "outline" {
  if (v === "danger") return "destructive";
  if (v === "outline") return "outline";
  if (v === "secondary" || v === "muted") return "secondary";
  return "default";
}
function alertType(v?: string): "info" | "success" | "warning" | "error" {
  if (v === "danger") return "error";
  if (v === "secondary") return "warning";
  if (v === "primary") return "success";
  return "info";
}
function textVariant(v?: string): "body" | "caption" | "muted" | "lead" | "code" {
  if (v === "muted" || v === "secondary") return "muted";
  if (v === "primary") return "lead";
  if (v === "outline") return "caption";
  return "body";
}
function headingLevel(size?: string): "h1" | "h2" | "h3" | "h4" {
  if (size === "full" || size === "lg") return "h1";
  if (size === "sm") return "h3";
  return "h2";
}

export function toSpec(design: Design): Spec {
  const elements: Record<string, SpecEl> = {};

  const emit = (el: El): string => {
    const key = el.id;
    const slotKey = `slot:${el.id}`;
    let node: SpecEl;
    switch (el.kind) {
      case "card":
        node = {
          type: "Card",
          props: { title: el.text || null, description: null, maxWidth: null, centered: null, className: null },
          children: [],
        };
        {
          const inner = `${key}:stack`;
          elements[inner] = {
            type: "Stack",
            props: { direction: "vertical", gap: "md", align: "stretch", justify: null, className: null },
            children: (el.children ?? []).map(emit),
          };
          node.children = [inner];
        }
        break;
      case "heading":
        node = { type: "Heading", props: { text: el.text, level: headingLevel(el.size) } };
        break;
      case "text":
        node = { type: "Text", props: { text: el.text, variant: textVariant(el.variant) } };
        break;
      case "button":
        node = { type: "Button", props: { label: el.text, variant: buttonVariant(el.variant), disabled: null } };
        break;
      case "input":
        node = {
          type: "Input",
          props: { label: el.text, name: el.id, type: /email/i.test(el.text) ? "email" : /password/i.test(el.text) ? "password" : "text", placeholder: null, value: { $bindState: `/form/${el.id}` }, checks: null, validateOn: null },
        };
        break;
      case "textarea":
        node = { type: "Textarea", props: { label: el.text, name: el.id, placeholder: null, rows: 3, value: { $bindState: `/form/${el.id}` }, checks: null, validateOn: null } };
        break;
      case "select":
        node = { type: "Select", props: { label: el.text, name: el.id, options: ["Option A", "Option B", "Option C"], placeholder: "Select…", value: { $bindState: `/form/${el.id}` }, checks: null, validateOn: null } };
        break;
      case "checkbox":
        node = { type: "Checkbox", props: { label: el.text, name: el.id, checked: { $bindState: `/form/${el.id}` }, checks: null, validateOn: null } };
        break;
      case "switch":
        node = { type: "Switch", props: { label: el.text, name: el.id, checked: { $bindState: `/form/${el.id}` }, checks: null, validateOn: null } };
        break;
      case "badge":
        node = { type: "Badge", props: { text: el.text, variant: badgeVariant(el.variant) } };
        break;
      case "alert":
        node = { type: "Alert", props: { title: el.text, message: null, type: alertType(el.variant) } };
        break;
      case "separator":
        node = { type: "Separator", props: { orientation: "horizontal" } };
        break;
      case "table":
        node = {
          type: "DataTable",
          props: { caption: el.text || null, columns: el.columns ?? [], rows: el.rows ?? [], avatars: !!el.avatars },
        };
        break;
      case "header":
        node = { type: "AppHeader", props: { title: el.text, items: el.items ?? [] } };
        break;
      case "sidenav":
        node = { type: "SideNav", props: { title: el.text || null, items: el.items ?? [] } };
        break;
      case "avatar":
        node = { type: "Avatar", props: { src: null, name: el.text, size: el.size === "sm" ? "sm" : el.size === "lg" || el.size === "full" ? "lg" : "md" } };
        break;
    }
    elements[key] = node;
    elements[slotKey] = { type: "Slot", props: { id: el.id, kind: el.kind, size: el.size ?? "md", color: el.color ?? null }, children: [key] };
    return slotKey;
  };

  // App shell: header on top, side navigation on the left, everything else in the content area.
  const header = design.elements.find((e) => e.kind === "header");
  const sidenav = design.elements.find((e) => e.kind === "sidenav");
  const content = design.elements.filter((e) => e.kind !== "header" && e.kind !== "sidenav");

  elements.content = {
    type: "Stack",
    props: {
      direction: design.direction === "row" ? "horizontal" : "vertical",
      gap: GAP[design.gap],
      align: design.direction === "row" ? "start" : "stretch",
      justify: null,
      className: (design.direction === "row" ? "flex-wrap " : "") + (header || sidenav ? "flex-1 min-w-0 p-6" : ""),
    },
    children: content.map(emit),
  };

  if (!header && !sidenav) {
    elements.root = elements.content;
    delete elements.content;
    return { root: "root", elements, state: { form: {} } } as unknown as Spec;
  }

  elements.body = {
    type: "Stack",
    props: { direction: "horizontal", gap: "none", align: "stretch", justify: null, className: "min-h-[60vh]" },
    children: [...(sidenav ? [emit(sidenav)] : []), "content"],
  };
  elements.root = {
    type: "Stack",
    props: { direction: "vertical", gap: "none", align: "stretch", justify: null, className: "overflow-hidden rounded-xl border bg-background shadow-sm" },
    children: [...(header ? [emit(header)] : []), "body"],
  };

  return { root: "root", elements, state: { form: {} } } as unknown as Spec;
}
