// json-render catalog: shadcn components + one custom "Slot" wrapper.
// No React here, so it is safe to import on the server.
import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { shadcnComponentDefinitions as s } from "@json-render/shadcn/catalog";
import { z } from "zod";

export const catalog = defineCatalog(schema, {
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
    DataTable: {
      props: z.object({
        caption: z.string().nullable(),
        columns: z.array(z.string()),
        rows: z.array(z.array(z.string())),
        avatars: z.boolean(),
      }),
      description: "Data table; when avatars is true the first column shows an avatar",
    },
    AppHeader: {
      props: z.object({ title: z.string(), items: z.array(z.string()) }),
      description: "App-wide top bar with app name and navigation links",
    },
    SideNav: {
      props: z.object({ title: z.string().nullable(), items: z.array(z.string()) }),
      description: "Vertical side navigation with links",
    },
    Slot: {
      props: z.object({
        id: z.string(),
        kind: z.string(),
        size: z.enum(["sm", "md", "lg", "full"]),
        color: z.string().nullable(),
      }),
      description: "Selectable wrapper around one design element",
    },
  },
  actions: {},
});
