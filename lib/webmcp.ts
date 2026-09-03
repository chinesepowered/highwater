/**
 * WebMCP tool registry.
 *
 * Every tool is registered with the browser via `document.modelContext.registerTool`
 * (the WebMCP imperative API) when the API is available, and also tracked locally so
 * the in-page agent panel and the activity log can see the same tools.
 */

export type JsonSchema = Record<string, unknown>;

export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  execute: (args: Record<string, unknown>) => unknown | Promise<unknown>;
};

export type ToolCallEntry = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  result?: string;
  error?: string;
  ts: number;
  ms: number;
};

type ModelContext = {
  registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => Promise<void> | void;
  getTools?: () => Promise<{ name: string }[]>;
  executeTool?: (tool: unknown, args: unknown) => Promise<ToolResult>;
};

const listeners = new Set<() => void>();
const registry = new Map<string, ToolDef>();
let log: ToolCallEntry[] = [];
let toolsCache: ToolDef[] = [];
let supportedCache: boolean | null = null;

function emit() {
  toolsCache = [...registry.values()];
  for (const l of listeners) l();
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getLog() {
  return log;
}

export function listTools(): ToolDef[] {
  return toolsCache;
}

export function getModelContext(): ModelContext | null {
  if (typeof document === "undefined") return null;
  const mc = (document as unknown as { modelContext?: ModelContext }).modelContext;
  return mc ?? null;
}

export function webmcpSupported() {
  if (supportedCache === null) supportedCache = getModelContext() !== null;
  return supportedCache;
}

function parseArgs(args: unknown): Record<string, unknown> {
  if (typeof args === "string") {
    try {
      return JSON.parse(args) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (args as Record<string, unknown>) ?? {};
}

function normalize(value: unknown): ToolResult {
  if (value && typeof value === "object" && Array.isArray((value as ToolResult).content)) {
    return value as ToolResult;
  }
  if (value === undefined || value === null) return { content: [] };
  if (typeof value === "string") return { content: [{ type: "text", text: value }] };
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

/** Run a tool by name, record it in the activity log, return an MCP-shaped result. */
export async function callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const tool = registry.get(name);
  const entry: ToolCallEntry = { id: crypto.randomUUID(), tool: name, args, ts: Date.now(), ms: 0 };
  const started = performance.now();
  if (!tool) {
    entry.error = `Unknown tool "${name}"`;
    log = [entry, ...log].slice(0, 200);
    emit();
    return { content: [{ type: "text", text: entry.error }], isError: true };
  }
  try {
    const result = normalize(await tool.execute(args));
    entry.ms = Math.round(performance.now() - started);
    entry.result = result.content.map((c) => c.text).join("\n");
    if (result.isError) entry.error = entry.result;
    log = [entry, ...log].slice(0, 200);
    emit();
    return result;
  } catch (err) {
    entry.ms = Math.round(performance.now() - started);
    entry.error = err instanceof Error ? err.message : String(err);
    log = [entry, ...log].slice(0, 200);
    emit();
    return { content: [{ type: "text", text: entry.error }], isError: true };
  }
}

/**
 * Register a set of tools. Returns a cleanup function that unregisters them
 * (via AbortController for the native API).
 */
export function registerTools(tools: ToolDef[]): () => void {
  const controller = new AbortController();
  const mc = getModelContext();
  for (const tool of tools) {
    registry.set(tool.name, tool);
    if (mc) {
      try {
        const maybe = mc.registerTool(
          {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: tool.annotations,
            // The browser agent calls this directly; route through callTool so it's logged too.
            execute: (args: unknown) => callTool(tool.name, parseArgs(args)),
          },
          { signal: controller.signal },
        );
        if (maybe && typeof (maybe as Promise<void>).catch === "function") {
          (maybe as Promise<void>).catch((e) => {
            if (!(e instanceof DOMException && e.name === "AbortError")) console.warn("[webmcp] registerTool failed", tool.name, e);
          });
        }
      } catch (e) {
        console.warn("[webmcp] registerTool threw", tool.name, e);
      }
    }
  }
  emit();
  return () => {
    controller.abort();
    for (const tool of tools) registry.delete(tool.name);
    emit();
  };
}

/** Gemini-compatible function declarations for the in-page agent. */
export function toolDeclarations() {
  return listTools().map((t) => ({
    name: t.name,
    description: t.description,
    parametersJsonSchema: t.inputSchema,
  }));
}
