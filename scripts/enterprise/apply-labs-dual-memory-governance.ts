import fs from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { agents, companies, createDb, projects } from "@paperclipai/db";

type AgentRow = typeof agents.$inferSelect;
type CompanyRow = typeof companies.$inferSelect;

type GovernanceAgentSpec = {
  name: string;
  role: string;
  title: string;
  responsibilities: string[];
  skills: string[];
  managedApplications: string[];
  ownedProjects: string[];
};

const LABS_PREFIX = "EBUAAA";
const SECTION_START = "<!-- paperclip-dual-memory:start -->";
const SECTION_END = "<!-- paperclip-dual-memory:end -->";

const GOVERNANCE_AGENTS: GovernanceAgentSpec[] = [
  {
    name: "Paperclip Source Sync Lead",
    role: "platform-governance",
    title: "Paperclip Upstream Source Sync and Merge Lead",
    responsibilities: [
      "Track upstream Paperclip commits before every local deployment.",
      "Merge upstream without erasing enterprise full-org, AgentChatTR, permissions, relationships, service discovery, and metadata customizations.",
      "Own the upstream merge checklist and handoff notes for the next update.",
    ],
    skills: ["git-source-sync", "upstream-merge", "release-governance", "paperclip-customization-preservation"],
    managedApplications: ["Paperclip"],
    ownedProjects: ["Upstream Merge and Release Governance"],
  },
  {
    name: "Paperclip Runtime and Adapter Configuration Lead",
    role: "runtime-architecture",
    title: "Paperclip Runtime, Adapter, Plugin, and Memory Configuration Lead",
    responsibilities: [
      "Own Paperclip adapter configuration, environment targets, plugin runtime, and agent execution settings.",
      "Maintain the Dual Memory plugin, Hindsight lifecycle payload readiness, and Mem0/local personalization memory tool wiring.",
      "Verify real save/search/lifecycle memory functions before release, not only UI links or HTTP 200 checks.",
    ],
    skills: ["adapter-configuration", "plugin-development", "memory-systems", "agent-tool-builder", "runtime-verification"],
    managedApplications: ["Paperclip", "Dual Memory", "Hindsight", "Mem0"],
    ownedProjects: ["Dual-Layer Memory Platform"],
  },
  {
    name: "Paperclip Project Manager",
    role: "product-operations",
    title: "Paperclip Product Portfolio and Delivery Manager",
    responsibilities: [
      "Keep Paperclip project folders, release records, QA evidence, and owner decisions synchronized.",
      "Coordinate handoff between source sync, runtime configuration, QA, and deployment lanes.",
    ],
    skills: ["product-ops", "release-coordination", "project-governance", "handoff-documentation"],
    managedApplications: ["Paperclip"],
    ownedProjects: ["Paperclip App Portfolio"],
  },
  {
    name: "AgentChatTR Project Manager",
    role: "communication-platform",
    title: "AgentChatTR Product and Chatroom Operations Manager",
    responsibilities: [
      "Keep global and per-company AgentChatTR routes separate from the full organization chart.",
      "Verify chatroom UI exposes usable communication rooms, linked contacts, and company scoped context.",
    ],
    skills: ["agent-chatroom-ops", "agentic-collaboration", "ui-navigation", "cross-company-routing"],
    managedApplications: ["AgentChatTR"],
    ownedProjects: ["AgentChatTR App Portfolio"],
  },
  {
    name: "Dual Memory Steward",
    role: "memory-governance",
    title: "Dual-Layer Memory Steward for Paperclip Agents",
    responsibilities: [
      "Own operational memory through Hindsight lifecycle hooks and local run-memory fallback.",
      "Own personalization memory through Mem0-compatible HTTP tools and local Paperclip fallback.",
      "Audit user preference memory, deletion behavior, and provider configuration before production rollout.",
    ],
    skills: ["hindsight-memory", "mem0-personalization", "memory-governance", "privacy-review", "plugin-tool-verification"],
    managedApplications: ["Dual Memory", "Hindsight", "Mem0", "Paperclip"],
    ownedProjects: ["Dual-Layer Memory Platform"],
  },
];

const PROJECTS = [
  {
    name: "Upstream Merge and Release Governance",
    description:
      "Track original Paperclip updates, preserve enterprise customizations, merge upstream safely, and verify releases before deployment.",
    status: "in_progress",
    leadAgentName: "Paperclip Source Sync Lead",
    color: "#38bdf8",
  },
  {
    name: "Dual-Layer Memory Platform",
    description:
      "Implement and operate Hindsight operational memory plus Mem0/local personalization memory for Paperclip agents.",
    status: "in_progress",
    leadAgentName: "Paperclip Runtime and Adapter Configuration Lead",
    color: "#34d399",
  },
  {
    name: "Paperclip App Portfolio",
    description:
      "Manage Paperclip as the universal control-plane application, including upstream releases, enterprise org chart, agent dashboard, and deployment evidence.",
    status: "in_progress",
    leadAgentName: "Paperclip Project Manager",
    color: "#f59e0b",
  },
  {
    name: "AgentChatTR App Portfolio",
    description:
      "Manage global and per-company AgentChatTR communication surfaces, chatroom files, and cross-company routing visibility.",
    status: "in_progress",
    leadAgentName: "AgentChatTR Project Manager",
    color: "#ec4899",
  },
];

function parseArgs(argv: string[]) {
  return {
    apply: argv.includes("--apply"),
    paperclipHome: readArg(argv, "--paperclip-home") ?? process.env.PAPERCLIP_HOME ?? "/paperclip",
  };
}

function readArg(argv: string[], name: string) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function mergeUnique(existing: unknown, additions: string[]) {
  const current = Array.isArray(existing) ? existing.filter((entry): entry is string => typeof entry === "string") : [];
  return Array.from(new Set([...current, ...additions]));
}

function upsertManagedSection(existing: string, content: string) {
  const block = `${SECTION_START}\n${content.trim()}\n${SECTION_END}`;
  const expression = new RegExp(`${SECTION_START}[\\s\\S]*?${SECTION_END}`);
  if (expression.test(existing)) return existing.replace(expression, block);
  return `${existing.trimEnd()}\n\n${block}\n`;
}

function managedInstructionsRoot(paperclipHome: string, companyId: string, agentId: string) {
  return path.resolve(paperclipHome, "instances", "default", "companies", companyId, "agents", agentId, "instructions");
}

async function readExisting(filePath: string) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function writeManagedFile(filePath: string, content: string, apply: boolean, changes: string[]) {
  const existing = await readExisting(filePath);
  const next = upsertManagedSection(existing, content);
  if (existing === next) return;
  changes.push(`write ${filePath}`);
  if (!apply) return;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, next, "utf8");
}

function instructionsFor(agent: GovernanceAgentSpec, labs: CompanyRow) {
  return `# Dual Memory And Paperclip Update Ownership

Company: ${labs.name} (${LABS_PREFIX})
Agent: ${agent.name}
Title: ${agent.title}

## Responsibilities

${agent.responsibilities.map((entry) => `- ${entry}`).join("\n")}

## Run Policies

- Before upstream updates: fetch origin and fork, record commit delta, back up live DB, and export current enterprise packages.
- During merge: preserve Full Org Chart, AgentChatTR routes, agent dashboard permissions, relationships, service discovery, metadata, managed instruction files, and company hierarchy.
- For memory releases: run Dual Memory plugin tests, typecheck, build, self-test action, and one live save/search verification.
- After deployment: verify live plugin status, UI page, tool registration, local fallback memory, Hindsight lifecycle payloads, and Mem0 credential state.

## Skills

${agent.skills.map((entry) => `- ${entry}`).join("\n")}

## Managed Applications

${agent.managedApplications.map((entry) => `- ${entry}`).join("\n")}
`;
}

function knowledgeFor(agent: GovernanceAgentSpec) {
  return `# Dual-Layer Memory Knowledge

## Architecture

- Hindsight is the operational layer. It receives \`agent.run.started\` and \`agent.run.finished\` lifecycle context with run, issue, task, output, and status fields.
- Dual Memory is the Paperclip plugin layer. It registers Mem0-compatible personalization tools and stores a local fallback in Paperclip plugin entities.
- Mem0 is the personalization provider. The plugin calls Mem0-compatible HTTP endpoints directly to avoid native SQLite dependency failures from the JS SDK on Windows build hosts.

## Functional Checks

- \`pnpm --filter @paperclipai/plugin-dual-memory test\` must prove save/search, self-test, and lifecycle capture.
- \`pnpm --filter @paperclipai/plugin-dual-memory typecheck\` must pass.
- \`pnpm --filter @paperclipai/plugin-dual-memory build\` must pass.
- Live verification must run the plugin \`memory-self-test\` action or equivalent save/search through the plugin worker.

## Known Update Pitfalls

- Do not install a dependency that forces native SQLite compilation on the Windows build host.
- Do not treat a visible UI link as a working memory feature. Verify tool execution and persisted local fallback records.
- Do not let upstream merges erase enterprise relationship, permission, service discovery, or instruction metadata.
`;
}

function relationshipsFor(agent: GovernanceAgentSpec) {
  return `# Paperclip Governance Relationships

## Owned Projects

${agent.ownedProjects.map((entry) => `- ${entry}`).join("\n")}

## Cross-Agent Dependencies

- Paperclip Source Sync Lead informs Paperclip Project Manager before and after every upstream merge.
- Paperclip Runtime and Adapter Configuration Lead coordinates with Dual Memory Steward before memory/plugin deployment.
- AgentChatTR Project Manager verifies chatroom routing separately from Full Org Chart routing.
- Dual Memory Steward reports functional memory verification results back to Paperclip Project Manager.
`;
}

function chatroomFor(agent: GovernanceAgentSpec) {
  return `# ${agent.name} AgentChatTR Rooms

## Rooms

- #paperclip-upstream-merge
- #paperclip-runtime-memory
- #paperclip-release-verification
- #agentchattr-routing

## Working Board

Status: idle
Current Task: Maintain Paperclip update and Dual Memory readiness.
Working On:
Waiting On:
Concerns / Risks:
Next Upward Report: Paperclip Project Manager
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is required");

  const changes: string[] = [];
  const db = createDb(dbUrl);
  const [labs] = await db.select().from(companies).where(eq(companies.issuePrefix, LABS_PREFIX)).limit(1);
  if (!labs) throw new Error(`Company ${LABS_PREFIX} was not found`);

  const agentByName = new Map<string, AgentRow>();

  for (const spec of GOVERNANCE_AGENTS) {
    const [existing] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.companyId, labs.id), eq(agents.name, spec.name)))
      .limit(1);

    let agent = existing;
    if (!agent) {
      changes.push(`create agent ${spec.name}`);
      if (args.apply) {
        [agent] = await db.insert(agents).values({
          companyId: labs.id,
          name: spec.name,
          role: spec.role,
          title: spec.title,
          status: "idle",
          adapterType: "claude_local",
          adapterConfig: { cwd: "/app" },
          runtimeConfig: { memoryAware: true },
          permissions: {},
          metadata: {},
        }).returning();
      }
    }
    if (!agent) continue;

    const rootPath = managedInstructionsRoot(args.paperclipHome, labs.id, agent.id);
    const existingMetadata = asRecord(agent.metadata);
    const existingPermissions = asRecord(agent.permissions);
    const adapterConfig = asRecord(agent.adapterConfig);
    const runtimeConfig = asRecord(agent.runtimeConfig);
    const metadata = {
      ...existingMetadata,
      platformGovernance: {
        ...(asRecord(existingMetadata.platformGovernance)),
        source: "scripts/enterprise/apply-labs-dual-memory-governance.ts",
        labsPrefix: LABS_PREFIX,
        ownsDualMemory: spec.name === "Dual Memory Steward" || spec.name === "Paperclip Runtime and Adapter Configuration Lead",
        ownsUpstreamMerge: spec.name === "Paperclip Source Sync Lead",
        managedApplications: spec.managedApplications,
        ownedProjects: spec.ownedProjects,
      },
      memoryLayers: {
        hindsight: "operational-run-memory",
        mem0: "personalization-memory-provider",
        localFallback: "paperclip-plugin-entities",
      },
      skills: mergeUnique(existingMetadata.skills, spec.skills),
      responsibilities: mergeUnique(existingMetadata.responsibilities, spec.responsibilities),
    };
    const permissions = {
      ...existingPermissions,
      canManagePlugins: true,
      canManageMemoryProviders: true,
      canManageDeploymentAssignments: true,
      canManageRelationshipTypes: true,
      canManageServiceDiscovery: true,
      canEditAgentInstructions: true,
      canRunReleaseVerification: true,
    };
    const nextAdapterConfig = {
      ...adapterConfig,
      cwd: typeof adapterConfig.cwd === "string" && adapterConfig.cwd ? adapterConfig.cwd : "/app",
      instructionsBundleMode: "managed",
      instructionsRootPath: rootPath,
      instructionsEntryFile: "AGENTS.md",
      instructionsFilePath: path.join(rootPath, "AGENTS.md"),
    };
    const nextRuntimeConfig = {
      ...runtimeConfig,
      memory: {
        ...(asRecord(runtimeConfig.memory)),
        dualMemoryPlugin: "paperclip.dual-memory",
        hindsightEvents: ["agent.run.started", "agent.run.finished"],
        personalizationTools: [
          "mem0_search_user_memory",
          "mem0_save_user_memory",
          "mem0_list_user_memory",
          "mem0_delete_user_memory",
        ],
      },
    };

    changes.push(`update agent ${spec.name} metadata/permissions/instructions`);
    if (args.apply) {
      await db.update(agents)
        .set({
          role: spec.role,
          title: spec.title,
          status: agent.status === "error" ? "idle" : agent.status,
          adapterType: agent.adapterType === "process" ? "claude_local" : agent.adapterType,
          adapterConfig: nextAdapterConfig,
          runtimeConfig: nextRuntimeConfig,
          permissions,
          metadata,
          updatedAt: new Date(),
        })
        .where(eq(agents.id, agent.id));
    }

    await writeManagedFile(path.join(rootPath, "AGENTS.md"), instructionsFor(spec, labs), args.apply, changes);
    await writeManagedFile(path.join(rootPath, "KNOWLEDGE.md"), knowledgeFor(spec), args.apply, changes);
    await writeManagedFile(path.join(rootPath, "RELATIONSHIPS.md"), relationshipsFor(spec), args.apply, changes);
    await writeManagedFile(path.join(rootPath, "CHATROOM.md"), chatroomFor(spec), args.apply, changes);
    agentByName.set(spec.name, { ...agent, adapterConfig: nextAdapterConfig, runtimeConfig: nextRuntimeConfig, permissions, metadata });
  }

  for (const project of PROJECTS) {
    const lead = agentByName.get(project.leadAgentName);
    const [existing] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.companyId, labs.id), eq(projects.name, project.name)))
      .limit(1);
    if (existing) {
      changes.push(`update project ${project.name}`);
      if (args.apply) {
        await db.update(projects)
          .set({
            description: project.description,
            status: project.status,
            leadAgentId: lead?.id ?? existing.leadAgentId,
            color: project.color,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, existing.id));
      }
    } else {
      changes.push(`create project ${project.name}`);
      if (args.apply) {
        await db.insert(projects).values({
          companyId: labs.id,
          name: project.name,
          description: project.description,
          status: project.status,
          leadAgentId: lead?.id,
          color: project.color,
        });
      }
    }
  }

  console.log(JSON.stringify({
    apply: args.apply,
    labsCompanyId: labs.id,
    paperclipHome: args.paperclipHome,
    changed: changes.length,
    changes,
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
