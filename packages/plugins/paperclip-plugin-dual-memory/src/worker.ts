import { createHash, randomUUID } from "node:crypto";
import {
  definePlugin,
  runWorker,
  type PluginContext,
  type PluginEntityRecord,
  type ToolResult,
  type ToolRunContext,
} from "@paperclipai/plugin-sdk";
import { ACTION_KEYS, DATA_KEYS, PLUGIN_ID, TOOL_NAMES } from "./manifest.js";

const PERSONALIZATION_ENTITY = "personalization-memory";
const OPERATIONAL_ENTITY = "operational-run-memory";
const DEFAULT_USER_ID = "paperclip-owner";
const DEFAULT_PROVIDER: MemoryProvider = "local";
const DEFAULT_SCOPE: MemoryScope = "user-company-agent";

type MemoryProvider = "local" | "mem0" | "hybrid";
type MemoryScope = "user" | "user-company" | "user-company-agent";

type DualMemoryConfig = {
  personalizationProvider: MemoryProvider;
  mem0ApiKeyRef?: string;
  mem0Host?: string;
  paperclipUserId: string;
  enableLocalFallback: boolean;
  hindsightPluginKey: string;
  memoryScope: MemoryScope;
};

type MemoryRecord = {
  id: string;
  fact: string;
  category: string;
  provider: string;
  score?: number;
  userId: string;
  companyId?: string;
  agentId?: string;
  runId?: string;
  createdAt: string;
  updatedAt?: string;
};

type RunLifecyclePayload = {
  runId?: string;
  agentId?: string;
  status?: string;
  issueId?: string;
  issueIdentifier?: string;
  issueTitle?: string;
  issueDescription?: string | null;
  projectId?: string | null;
  taskId?: string;
  taskKey?: string | null;
  output?: string | null;
  result?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

function normalizeConfig(raw: Record<string, unknown>): DualMemoryConfig {
  const provider = raw.personalizationProvider === "mem0" || raw.personalizationProvider === "hybrid"
    ? raw.personalizationProvider
    : DEFAULT_PROVIDER;
  const scope = raw.memoryScope === "user" || raw.memoryScope === "user-company"
    ? raw.memoryScope
    : DEFAULT_SCOPE;
  const envUserId = typeof process.env.PAPERCLIP_USER_ID === "string" && process.env.PAPERCLIP_USER_ID.trim()
    ? process.env.PAPERCLIP_USER_ID.trim()
    : DEFAULT_USER_ID;
  return {
    personalizationProvider: provider,
    mem0ApiKeyRef: typeof raw.mem0ApiKeyRef === "string" && raw.mem0ApiKeyRef.trim()
      ? raw.mem0ApiKeyRef.trim()
      : undefined,
    mem0Host: typeof raw.mem0Host === "string" && raw.mem0Host.trim() ? raw.mem0Host.trim() : undefined,
    paperclipUserId: typeof raw.paperclipUserId === "string" && raw.paperclipUserId.trim()
      ? raw.paperclipUserId.trim()
      : envUserId,
    enableLocalFallback: raw.enableLocalFallback !== false,
    hindsightPluginKey: typeof raw.hindsightPluginKey === "string" && raw.hindsightPluginKey.trim()
      ? raw.hindsightPluginKey.trim()
      : "@vectorize-io/hindsight-paperclip",
    memoryScope: scope,
  };
}

async function getConfig(ctx: PluginContext): Promise<DualMemoryConfig> {
  return normalizeConfig(await ctx.config.get());
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function textParam(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value.trim() : "";
}

function numberParam(params: Record<string, unknown>, key: string, fallback: number, max = 50): number {
  const value = typeof params[key] === "number" ? params[key] : Number(params[key] ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value)));
}

function stableHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function memoryScope(config: DualMemoryConfig, runCtx: ToolRunContext) {
  if (config.memoryScope === "user") {
    return { scopeKind: "instance" as const, scopeId: undefined };
  }
  if (config.memoryScope === "user-company") {
    return { scopeKind: "company" as const, scopeId: runCtx.companyId };
  }
  return { scopeKind: "agent" as const, scopeId: runCtx.agentId };
}

function entityToMemory(record: PluginEntityRecord): MemoryRecord | null {
  if (record.status === "deleted") return null;
  const data = record.data;
  const fact = typeof data.fact === "string" ? data.fact : "";
  if (!fact.trim()) return null;
  return {
    id: record.externalId ?? record.id,
    fact,
    category: typeof data.category === "string" ? data.category : "general",
    provider: typeof data.provider === "string" ? data.provider : "local",
    userId: typeof data.userId === "string" ? data.userId : DEFAULT_USER_ID,
    companyId: typeof data.companyId === "string" ? data.companyId : undefined,
    agentId: typeof data.agentId === "string" ? data.agentId : undefined,
    runId: typeof data.runId === "string" ? data.runId : undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function tokenize(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length > 1));
}

function scoreMemory(query: string, memory: MemoryRecord): number {
  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) return 0;
  const haystack = tokenize(`${memory.fact} ${memory.category}`);
  let score = 0;
  for (const token of queryTokens) {
    if (haystack.has(token)) score += 2;
    if (memory.fact.toLowerCase().includes(token)) score += 1;
  }
  return score;
}

async function listLocalMemories(
  ctx: PluginContext,
  config: DualMemoryConfig,
  runCtx?: Partial<ToolRunContext>,
  limit = 50,
): Promise<MemoryRecord[]> {
  const candidates: Array<{ scopeKind: "instance" | "company" | "agent"; scopeId?: string }> = [
    { scopeKind: "instance" },
  ];
  if (runCtx?.companyId) candidates.push({ scopeKind: "company", scopeId: runCtx.companyId });
  if (runCtx?.agentId) candidates.push({ scopeKind: "agent", scopeId: runCtx.agentId });

  const records = await Promise.all(candidates.map((scope) => ctx.entities.list({
    entityType: PERSONALIZATION_ENTITY,
    scopeKind: scope.scopeKind,
    scopeId: scope.scopeId,
    limit,
    offset: 0,
  })));

  const seen = new Set<string>();
  return records
    .flat()
    .map(entityToMemory)
    .filter((entry): entry is MemoryRecord => Boolean(entry))
    .filter((entry) => entry.userId === config.paperclipUserId)
    .filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .sort((a, b) => String(b.updatedAt ?? b.createdAt).localeCompare(String(a.updatedAt ?? a.createdAt)))
    .slice(0, limit);
}

async function saveLocalMemory(
  ctx: PluginContext,
  config: DualMemoryConfig,
  runCtx: ToolRunContext,
  fact: string,
  category: string,
): Promise<MemoryRecord> {
  const scope = memoryScope(config, runCtx);
  const externalId = `local:${config.paperclipUserId}:${stableHash(`${runCtx.companyId}:${runCtx.agentId}:${fact}:${Date.now()}:${randomUUID()}`)}`;
  const record = await ctx.entities.upsert({
    entityType: PERSONALIZATION_ENTITY,
    scopeKind: scope.scopeKind,
    scopeId: scope.scopeId,
    externalId,
    title: fact.slice(0, 120),
    status: "active",
    data: {
      fact,
      category,
      provider: "local",
      userId: config.paperclipUserId,
      companyId: runCtx.companyId,
      agentId: runCtx.agentId,
      runId: runCtx.runId,
      savedAt: new Date().toISOString(),
    },
  });
  return entityToMemory(record)!;
}

async function resolveMem0ApiKey(ctx: PluginContext, config: DualMemoryConfig): Promise<string | null> {
  if (config.mem0ApiKeyRef) return await ctx.secrets.resolve(config.mem0ApiKeyRef);
  return typeof process.env.MEM0_API_KEY === "string" && process.env.MEM0_API_KEY.trim()
    ? process.env.MEM0_API_KEY.trim()
    : null;
}

async function mem0Request(
  ctx: PluginContext,
  config: DualMemoryConfig,
  path: string,
  init: RequestInit,
): Promise<unknown | null> {
  const apiKey = await resolveMem0ApiKey(ctx, config);
  if (!apiKey) return null;
  const host = (config.mem0Host ?? "https://api.mem0.ai").replace(/\/+$/, "");
  const response = await ctx.http.fetch(`${host}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${apiKey}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Mem0 request failed (${response.status}): ${await response.text()}`);
  }
  if (response.status === 204) return { ok: true };
  return await response.json();
}

function normalizeRemoteMemory(value: unknown): MemoryRecord[] {
  const objectValue = asObject(value);
  const raw = Array.isArray(value)
    ? value
    : Array.isArray(objectValue.results)
      ? objectValue.results
      : Array.isArray(objectValue.memories)
        ? objectValue.memories
        : Array.isArray(objectValue.data)
          ? objectValue.data
          : [value];
  return raw
    .map((entry) => asObject(entry))
    .map((entry) => ({
      id: String(entry.id ?? entry.memory_id ?? entry.uuid ?? randomUUID()),
      fact: String(entry.memory ?? entry.text ?? entry.fact ?? entry.content ?? ""),
      category: "remote",
      provider: "mem0",
      userId: String(entry.user_id ?? DEFAULT_USER_ID),
      createdAt: String(entry.created_at ?? new Date().toISOString()),
      updatedAt: typeof entry.updated_at === "string" ? entry.updated_at : undefined,
    }))
    .filter((entry) => entry.fact.trim().length > 0);
}

async function saveRemoteMemory(
  ctx: PluginContext,
  config: DualMemoryConfig,
  runCtx: ToolRunContext,
  fact: string,
  category: string,
): Promise<MemoryRecord | null> {
  const response = await mem0Request(ctx, config, "/v3/memories/add/", {
    method: "POST",
    body: JSON.stringify({
      messages: [{ role: "user", content: fact }],
      user_id: config.paperclipUserId,
      agent_id: runCtx.agentId,
      app_id: "paperclip",
      run_id: runCtx.runId,
      metadata: {
        category,
        companyId: runCtx.companyId,
        projectId: runCtx.projectId,
        source: PLUGIN_ID,
      },
    }),
  });
  if (!response) return null;
  return normalizeRemoteMemory(response)[0] ?? {
    id: `mem0:${stableHash(`${fact}:${Date.now()}`)}`,
    fact,
    category,
    provider: "mem0",
    userId: config.paperclipUserId,
    companyId: runCtx.companyId,
    agentId: runCtx.agentId,
    runId: runCtx.runId,
    createdAt: new Date().toISOString(),
  };
}

async function searchRemoteMemory(
  ctx: PluginContext,
  config: DualMemoryConfig,
  query: string,
  limit: number,
): Promise<MemoryRecord[]> {
  const response = await mem0Request(ctx, config, "/v3/memories/search/", {
    method: "POST",
    body: JSON.stringify({
      query,
      output_format: "v1.1",
      filters: { user_id: config.paperclipUserId },
      top_k: limit,
    }),
  });
  if (!response) return [];
  return normalizeRemoteMemory(response).slice(0, limit);
}

async function deleteRemoteMemory(
  ctx: PluginContext,
  config: DualMemoryConfig,
  memoryId: string,
): Promise<boolean> {
  const response = await mem0Request(ctx, config, `/v1/memories/${encodeURIComponent(memoryId)}/`, {
    method: "DELETE",
  });
  return Boolean(response);
}

async function deleteLocalMemory(ctx: PluginContext, memoryId: string): Promise<boolean> {
  const scopes = await Promise.all([
    ctx.entities.list({ entityType: PERSONALIZATION_ENTITY, scopeKind: "instance", limit: 200, offset: 0 }),
    ctx.entities.list({ entityType: PERSONALIZATION_ENTITY, scopeKind: "company", limit: 200, offset: 0 }),
    ctx.entities.list({ entityType: PERSONALIZATION_ENTITY, scopeKind: "agent", limit: 200, offset: 0 }),
  ]);
  const record = scopes.flat().find((entry) => entry.externalId === memoryId || entry.id === memoryId);
  if (!record) return false;
  await ctx.entities.upsert({
    entityType: PERSONALIZATION_ENTITY,
    scopeKind: record.scopeKind,
    scopeId: record.scopeId ?? undefined,
    externalId: record.externalId ?? record.id,
    title: record.title ?? memoryId,
    status: "deleted",
    data: { ...record.data, deletedAt: new Date().toISOString() },
  });
  return true;
}

async function registerPersonalizationTools(ctx: PluginContext): Promise<void> {
  ctx.tools.register(TOOL_NAMES.saveUserMemory, {
    displayName: "Save User Memory",
    description: "Save a durable user preference, style instruction, permanent fact, or personalization rule.",
    parametersSchema: {
      type: "object",
      required: ["fact"],
      properties: {
        fact: { type: "string" },
        category: { type: "string" },
      },
    },
  }, async (params, runCtx): Promise<ToolResult> => {
    const input = asObject(params);
    const fact = textParam(input, "fact");
    if (!fact) return { error: "fact is required" };
    const category = textParam(input, "category") || "general";
    const config = await getConfig(ctx);
    const saved: MemoryRecord[] = [];
    const errors: string[] = [];

    if (config.personalizationProvider === "local" || config.personalizationProvider === "hybrid" || config.enableLocalFallback) {
      saved.push(await saveLocalMemory(ctx, config, runCtx, fact, category));
    }
    if (config.personalizationProvider === "mem0" || config.personalizationProvider === "hybrid") {
      try {
        const remote = await saveRemoteMemory(ctx, config, runCtx, fact, category);
        if (remote) saved.push(remote);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    await ctx.metrics.write("dual_memory.save", 1, { provider: config.personalizationProvider });
    await ctx.activity.log({
      companyId: runCtx.companyId,
      entityType: PERSONALIZATION_ENTITY,
      entityId: saved[0]?.id,
      message: "Dual Memory saved a personalization memory.",
      metadata: { plugin: PLUGIN_ID, category, providers: saved.map((entry) => entry.provider) },
    });
    return {
      content: saved.length > 0
        ? `Saved ${saved.length} memory record(s).`
        : `No memory was saved. ${errors.join("; ")}`.trim(),
      data: { saved, errors },
      ...(saved.length === 0 ? { error: "memory_save_failed" } : {}),
    };
  });

  ctx.tools.register(TOOL_NAMES.searchUserMemory, {
    displayName: "Search User Memory",
    description: "Search durable user preferences and style guides.",
    parametersSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
    },
  }, async (params, runCtx): Promise<ToolResult> => {
    const input = asObject(params);
    const query = textParam(input, "query");
    if (!query) return { error: "query is required" };
    const limit = numberParam(input, "limit", 5, 20);
    const config = await getConfig(ctx);
    const local = config.enableLocalFallback
      ? (await listLocalMemories(ctx, config, runCtx, 100))
        .map((entry) => ({ ...entry, score: scoreMemory(query, entry) }))
        .filter((entry) => (entry.score ?? 0) > 0)
      : [];
    let remote: MemoryRecord[] = [];
    const errors: string[] = [];
    if (config.personalizationProvider === "mem0" || config.personalizationProvider === "hybrid") {
      try {
        remote = await searchRemoteMemory(ctx, config, query, limit);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    const results = [...remote, ...local]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, limit);
    return {
      content: results.length
        ? results.map((entry) => `- [${entry.provider}] ${entry.fact}`).join("\n")
        : "No matching long-term user memory found.",
      data: { results, errors },
    };
  });

  ctx.tools.register(TOOL_NAMES.listUserMemory, {
    displayName: "List User Memory",
    description: "List recent personalization memories available to this agent.",
    parametersSchema: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
  }, async (params, runCtx): Promise<ToolResult> => {
    const input = asObject(params);
    const config = await getConfig(ctx);
    const limit = numberParam(input, "limit", 20, 100);
    const memories = await listLocalMemories(ctx, config, runCtx, limit);
    return {
      content: memories.length
        ? memories.map((entry) => `- ${entry.fact}`).join("\n")
        : "No local personalization memories found.",
      data: { memories },
    };
  });

  ctx.tools.register(TOOL_NAMES.deleteUserMemory, {
    displayName: "Delete User Memory",
    description: "Mark a local personalization memory as deleted.",
    parametersSchema: {
      type: "object",
      required: ["memoryId"],
      properties: { memoryId: { type: "string" } },
    },
  }, async (params): Promise<ToolResult> => {
    const memoryId = textParam(asObject(params), "memoryId");
    if (!memoryId) return { error: "memoryId is required" };
    const config = await getConfig(ctx);
    const deleted = await deleteLocalMemory(ctx, memoryId);
    let remoteDeleted = false;
    let remoteError: string | undefined;
    if (!deleted && (config.personalizationProvider === "mem0" || config.personalizationProvider === "hybrid")) {
      try {
        remoteDeleted = await deleteRemoteMemory(ctx, config, memoryId);
      } catch (error) {
        remoteError = error instanceof Error ? error.message : String(error);
      }
    }
    const ok = deleted || remoteDeleted;
    return {
      content: ok ? `Deleted memory ${memoryId}.` : `Memory ${memoryId} was not found.`,
      data: { deleted, remoteDeleted, remoteError, memoryId },
      ...(!ok ? { error: remoteError ?? "memory_not_found" } : {}),
    };
  });
}

async function rememberRunLifecycle(ctx: PluginContext, payload: RunLifecyclePayload, companyId: string): Promise<void> {
  const runId = payload.runId;
  if (!runId) return;
  const title = payload.issueTitle || payload.issueIdentifier || `Run ${runId}`;
  await ctx.entities.upsert({
    entityType: OPERATIONAL_ENTITY,
    scopeKind: "company",
    scopeId: companyId,
    externalId: runId,
    title,
    status: payload.status ?? "unknown",
    data: {
      ...payload,
      operationalLayer: "local-hindsight-fallback",
      updatedAt: new Date().toISOString(),
    },
  });
}

async function registerDataAndActions(ctx: PluginContext): Promise<void> {
  ctx.data.register(DATA_KEYS.health, async (params) => {
    const companyId = typeof params.companyId === "string" ? params.companyId : undefined;
    const agentId = typeof params.agentId === "string" ? params.agentId : undefined;
    const config = await getConfig(ctx);
    const memories = await listLocalMemories(ctx, config, { companyId, agentId }, 25);
    const operational = companyId
      ? await ctx.entities.list({
        entityType: OPERATIONAL_ENTITY,
        scopeKind: "company",
        scopeId: companyId,
        limit: 10,
        offset: 0,
      })
      : [];
    const hasMem0Credentials = Boolean(await resolveMem0ApiKey(ctx, config).catch(() => null));
    return {
      pluginId: PLUGIN_ID,
      status: "ready",
      config: {
        personalizationProvider: config.personalizationProvider,
        memoryScope: config.memoryScope,
        localFallbackEnabled: config.enableLocalFallback,
        hasMem0Credentials,
        paperclipUserId: config.paperclipUserId,
        hindsightPluginKey: config.hindsightPluginKey,
      },
      counts: {
        localPersonalizationMemories: memories.length,
        recentOperationalRuns: operational.length,
      },
      memories,
      operationalRuns: operational.map((entry) => ({
        id: entry.externalId ?? entry.id,
        title: entry.title,
        status: entry.status,
        updatedAt: entry.updatedAt,
      })),
      requiredExternalLayer: {
        hindsight: {
          package: config.hindsightPluginKey,
          expectedEvents: ["agent.run.started", "agent.run.finished"],
          payloadReady: true,
        },
        mem0: {
          package: "mem0ai",
          providerEnabled: config.personalizationProvider !== "local",
          credentialConfigured: hasMem0Credentials,
        },
      },
    };
  });

  ctx.actions.register(ACTION_KEYS.selfTest, async (params) => {
    const companyId = typeof params.companyId === "string" && params.companyId ? params.companyId : "company-self-test";
    const agentId = typeof params.agentId === "string" && params.agentId ? params.agentId : "agent-self-test";
    const runCtx: ToolRunContext = {
      companyId,
      agentId,
      projectId: typeof params.projectId === "string" && params.projectId ? params.projectId : "project-self-test",
      runId: `self-test-${randomUUID()}`,
    };
    const marker = `dual-memory-self-test-${randomUUID()}`;
    const config = await getConfig(ctx);
    const saved = await saveLocalMemory(
      ctx,
      { ...config, enableLocalFallback: true },
      runCtx,
      `Remember that ${marker} proves save and search are wired.`,
      "self-test",
    );
    const results = (await listLocalMemories(ctx, config, runCtx, 25))
      .map((entry) => ({ ...entry, score: scoreMemory(marker, entry) }))
      .filter((entry) => (entry.score ?? 0) > 0);
    const ok = results.some((entry) => entry.fact.includes(marker));
    return { ok, marker, saved, results };
  });
}

async function registerRunLifecycleFallback(ctx: PluginContext): Promise<void> {
  ctx.events.on("agent.run.started", async (event) => {
    await rememberRunLifecycle(ctx, asObject(event.payload) as RunLifecyclePayload, event.companyId);
  });
  ctx.events.on("agent.run.finished", async (event) => {
    await rememberRunLifecycle(ctx, asObject(event.payload) as RunLifecyclePayload, event.companyId);
  });
}

const plugin = definePlugin({
  async setup(ctx) {
    await registerPersonalizationTools(ctx);
    await registerDataAndActions(ctx);
    await registerRunLifecycleFallback(ctx);
    ctx.logger.info("Dual Memory plugin ready");
  },

  async onHealth() {
    return {
      status: "ok",
      message: "Dual Memory plugin tools, local fallback, Hindsight lifecycle capture, and Mem0 bridge are ready.",
    };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
