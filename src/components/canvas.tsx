"use client";
import React, { createContext, useContext, useMemo } from "react";
import { Renderer, defineRegistry, JSONUIProvider } from "@json-render/react";
import { shadcnComponents as s } from "@json-render/shadcn";
import type { Spec } from "@json-render/core";
import { catalog } from "@/lib/catalog";
import { COLORS, LIGHT_FILLS, type Color, type Design } from "@/lib/design";
import { toSpec } from "@/lib/spec";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Bell, Boxes, LayoutDashboard, FolderKanban, Users, CreditCard, Settings, Circle } from "lucide-react";

const SelectionCtx = createContext<{ selection: string | null; onSelect: (id: string | null) => void }>({
  selection: null,
  onSelect: () => {},
});

const SIZE_CLASS: Record<string, string> = {
  sm: "w-full max-w-[220px]",
  md: "w-full max-w-md",
  lg: "w-full max-w-2xl",
  full: "w-full",
};

const NAV_ICONS: Record<string, typeof Circle> = {
  dashboard: LayoutDashboard, home: LayoutDashboard, overview: LayoutDashboard,
  projects: FolderKanban, reports: FolderKanban,
  team: Users, users: Users, people: Users, members: Users,
  billing: CreditCard, payments: CreditCard,
  settings: Settings, preferences: Settings,
};

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

const { registry } = defineRegistry(catalog, {
  components: {
    Stack: s.Stack,
    Card: s.Card,
    Heading: s.Heading,
    Text: s.Text,
    Button: s.Button,
    Input: s.Input,
    Textarea: s.Textarea,
    Select: s.Select,
    Checkbox: s.Checkbox,
    Switch: s.Switch,
    Badge: s.Badge,
    Alert: s.Alert,
    Separator: s.Separator,
    Avatar: s.Avatar,
    DataTable: ({ props }) => {
      const { caption, columns, rows, avatars } = props;
      return (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            {caption && <TableCaption>{caption}</TableCaption>}
            <TableHeader>
              <TableRow>
                {columns.map((c, i) => <TableHead key={i}>{c}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  {r.map((cell, j) => (
                    <TableCell key={j} className={j === 0 ? "font-medium" : undefined}>
                      {j === 0 && avatars ? (
                        <span className="flex items-center gap-2">
                          <Avatar className="size-7">
                            <AvatarImage src={`https://i.pravatar.cc/64?img=${(i * 7 + 3) % 70}`} alt="" />
                            <AvatarFallback className="text-[10px]">{initials(cell)}</AvatarFallback>
                          </Avatar>
                          {cell}
                        </span>
                      ) : (
                        cell
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
    },
    AppHeader: ({ props }) => (
      <header className="flex h-14 items-center gap-6 border-b bg-background px-5">
        <span className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground"><Boxes className="size-4" /></span>
          {props.title}
        </span>
        <nav className="flex items-center gap-1 text-sm">
          {props.items.map((it, i) => (
            <span key={i} className={cn("rounded-md px-3 py-1.5", i === 0 ? "bg-accent font-medium" : "text-muted-foreground")}>{it}</span>
          ))}
        </nav>
        <span className="ml-auto flex items-center gap-3 text-muted-foreground">
          <Search className="size-4" />
          <Bell className="size-4" />
          <Avatar className="size-7"><AvatarImage src="https://i.pravatar.cc/64?img=12" alt="" /><AvatarFallback className="text-[10px]">AK</AvatarFallback></Avatar>
        </span>
      </header>
    ),
    SideNav: ({ props }) => (
      <nav className="flex h-full w-56 shrink-0 flex-col gap-1 border-r bg-muted/40 p-3 text-sm">
        {props.title && <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{props.title}</p>}
        {props.items.map((it, i) => {
          const Icon = NAV_ICONS[it.toLowerCase()] ?? Circle;
          return (
            <span key={i} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5", i === 0 ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>
              <Icon className="size-4" />
              {it}
            </span>
          );
        })}
      </nav>
    ),
    Slot: ({ props, children }) => {
      const { id, kind, size, color } = props;
      const { selection, onSelect } = useContext(SelectionCtx);
      const fill = color && color in COLORS ? COLORS[color as Color] : null;
      const colorStyle = fill
        ? ({ "--el": fill, "--el-fg": LIGHT_FILLS.includes(color as Color) ? "#171717" : "#ffffff" } as React.CSSProperties)
        : undefined;
      const selected = selection === id;
      const inline = kind === "button" || kind === "badge" || kind === "avatar";
      const shell = kind === "header" || kind === "sidenav";
      return (
        <div
          data-el={id}
          data-kind={kind}
          style={colorStyle}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(selected ? null : id);
          }}
          className={cn(
            "relative transition-shadow cursor-pointer",
            fill && "el-color",
            shell ? (kind === "header" ? "w-full" : "shrink-0 self-stretch") : "rounded-md",
            !shell && (inline ? "w-fit max-w-full" : SIZE_CLASS[size] ?? SIZE_CLASS.md),
            selected ? "ring-2 ring-sky-500 ring-offset-2 ring-offset-background" : "hover:ring-1 hover:ring-sky-300/70",
          )}
        >
          {selected && (
            <span className="absolute -top-2.5 left-2 z-10 whitespace-nowrap rounded bg-sky-500 px-1.5 py-px font-mono text-[10px] leading-4 text-white">
              {id}
            </span>
          )}
          <div className="el-body">{children}</div>
        </div>
      );
    },
  },
});

export function Canvas({
  design,
  selection,
  onSelect,
}: {
  design: Design;
  selection: string | null;
  onSelect: (id: string | null) => void;
}) {
  const spec = useMemo(() => toSpec(design), [design]);
  const ctx = useMemo(() => ({ selection, onSelect }), [selection, onSelect]);
  return (
    <SelectionCtx.Provider value={ctx}>
      <div className="min-h-full p-8" onClick={() => onSelect(null)}>
        {design.elements.length === 0 ? (
          <div className="flex h-full min-h-[50vh] items-center justify-center text-center text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground">Empty canvas</p>
              <p className="mt-1">Try: “a settings card”, “add a save button”, “put it beside the title”, “change it to say Done”.</p>
            </div>
          </div>
        ) : (
          <JSONUIProvider registry={registry} initialState={{ form: {} }} handlers={{}}>
            <Renderer spec={spec as Spec} registry={registry} />
          </JSONUIProvider>
        )}
      </div>
    </SelectionCtx.Provider>
  );
}

export { toSpec };
