import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclip.dual-memory";
export const PLUGIN_VERSION = "0.1.0";

export const TOOL_NAMES = {
  searchUserMemory: "mem0_search_user_memory",
  saveUserMemory: "mem0_save_user_memory",
  listUserMemory: "mem0_list_user_memory",
  deleteUserMemory: "mem0_delete_user_memory",
} as const;

export const DATA_KEYS = {
  health: "memory-health",
} as const;

export const ACTION_KEYS = {
  selfTest: "memory-self-test",
} as const;

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Dual Memory Control",
  description:
    "Operational Hindsight memory guidance plus Mem0-compatible personalization tools for long-term user preferences, style guides, and permanent facts.",
  author: "E-Business Expert Labs",
  categories: ["automation", "connector", "ui"],
  capabilities: [
    "events.subscribe",
    "agent.tools.register",
    "plugin.state.read",
    "plugin.state.write",
    "http.outbound",
    "secrets.read-ref",
    "companies.read",
    "agents.read",
    "activity.log.write",
    "metrics.write",
    "ui.page.register",
    "ui.sidebar.register",
    "ui.dashboardWidget.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      personalizationProvider: {
        type: "string",
        title: "Personalization Provider",
        enum: ["local", "mem0", "hybrid"],
        default: "local",
        description:
          "local stores personalization memories in Paperclip plugin entities; mem0 sends them to Mem0; hybrid writes both.",
      },
      mem0ApiKeyRef: {
        type: "string",
        title: "Mem0 API key secret ref",
        description: "Name of the Paperclip secret containing MEM0_API_KEY. Leave blank to use local fallback.",
      },
      mem0Host: {
        type: "string",
        title: "Mem0 API host",
        default: "https://api.mem0.ai",
      },
      paperclipUserId: {
        type: "string",
        title: "Paperclip user memory ID",
        description:
          "Stable global identifier for the human user. If blank, PAPERCLIP_USER_ID or 'paperclip-owner' is used.",
      },
      enableLocalFallback: {
        type: "boolean",
        title: "Enable local fallback",
        default: true,
        description: "Keep memory tools functional inside Paperclip when Mem0 credentials are not configured.",
      },
      hindsightPluginKey: {
        type: "string",
        title: "Hindsight plugin package",
        default: "@vectorize-io/hindsight-paperclip",
        description:
          "Operational memory plugin to install/configure separately. This plugin checks that the lifecycle payload supports it.",
      },
      memoryScope: {
        type: "string",
        title: "Personalization scope",
        enum: ["user", "user-company", "user-company-agent"],
        default: "user-company-agent",
      },
    },
  },
  tools: [
    {
      name: TOOL_NAMES.searchUserMemory,
      displayName: "Search User Memory",
      description:
        "Search long-term user preferences, permanent facts, style guides, company-specific personalization, and prior handoff preferences.",
      parametersSchema: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", description: "What the agent needs to know about the user or preferences." },
          limit: { type: "number", description: "Maximum memories to return." },
        },
      },
    },
    {
      name: TOOL_NAMES.saveUserMemory,
      displayName: "Save User Memory",
      description:
        "Save a durable user preference, style instruction, permanent fact, or cross-agent personalization rule.",
      parametersSchema: {
        type: "object",
        required: ["fact"],
        properties: {
          fact: { type: "string", description: "The specific user fact or preference to remember." },
          category: { type: "string", description: "Optional category such as style, access, workflow, or policy." },
        },
      },
    },
    {
      name: TOOL_NAMES.listUserMemory,
      displayName: "List User Memory",
      description: "List recent personalization memories available to the current agent and company scope.",
      parametersSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Maximum memories to list." },
        },
      },
    },
    {
      name: TOOL_NAMES.deleteUserMemory,
      displayName: "Delete User Memory",
      description: "Delete a personalization memory by memory ID.",
      parametersSchema: {
        type: "object",
        required: ["memoryId"],
        properties: {
          memoryId: { type: "string", description: "Memory ID returned by list or search." },
        },
      },
    },
  ],
  ui: {
    slots: [
      {
        type: "page",
        id: "dual-memory-page",
        displayName: "Dual Memory",
        exportName: "DualMemoryPage",
        routePath: "memory",
      },
      {
        type: "sidebar",
        id: "dual-memory-sidebar",
        displayName: "Memory",
        exportName: "DualMemorySidebarLink",
      },
      {
        type: "dashboardWidget",
        id: "dual-memory-dashboard-widget",
        displayName: "Memory",
        exportName: "DualMemoryDashboardWidget",
      },
    ],
  },
};

export default manifest;
