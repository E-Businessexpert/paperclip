#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname, "..");
const defaultExportRoot = path.resolve(repoRoot, "..", "..", "paperclip-live-export");

const COMPANY_PROJECT_SEEDS = {
  FAM: [
    ["Trust Ownership and Beneficiary Governance", "Maintain trust ownership records, beneficiary visibility, trustee routing, and the formal trust manager lane."],
    ["Owner Compensation and Trust Distribution Oversight", "Track owner-pay distribution flow from Cornerstone treasury through the trust lane and named members."],
    ["Enterprise Stewardship and Upward Reporting", "Keep trust-level decisions aligned with Cornerstone and downstream company reporting."],
  ],
  COR: [
    ["Holding Treasury and Sweep Control", "Coordinate holding deposits, sweep controls, treasury governance, and cash movement oversight."],
    ["Owner Compensation Lane", "Operate the Owner Compensation Coordinator lane that routes owner-pay from COR toward the trust."],
    ["Intercompany Agreements and Governance", "Maintain governance, board packets, resolutions, and company-to-company control records."],
    ["Subsidiary Performance Review", "Review performance, risk, and reporting for all same-level companies under Cornerstone."],
    ["Audit Tax Insurance and Control Readiness", "Keep audit, tax, insurance, claims, and internal control evidence ready for the holding layer."],
  ],
  EBUAA: [
    ["Group Management and Operating Control", "Govern the group management layer and keep EBUA, EBU, and ECO routing coherent."],
    ["Company Generation and Routing Governance", "Own company creation, activation, hierarchy repair, and manager assignment standards."],
    ["Cross Company Capability and Skill Stewardship", "Maintain skills, capability manifests, and reusable company operating patterns."],
  ],
  EBUA: [
    ["AI Runtime Adapter and Environment Control", "Manage adapters, runtime targets, environment selection, model access, and execution policy."],
    ["Paperclip Control Plane Operations", "Operate the universal Paperclip control plane as a productized company management system."],
    ["Service Discovery and Software Access Registry", "Maintain the software/service inventory showing tool name, category, endpoint, and responsible agent."],
  ],
  EBUAAA: [
    ["Upstream Merge and Release Governance", "Track original Paperclip updates, preserve local enterprise customizations, and verify releases before deploy."],
    ["Dual-Layer Memory Platform", "Operate Hindsight operational memory plus Mem0/local personalization memory for Paperclip agents."],
    ["Knowledge Base and Skills Library", "Maintain company, agent, project, and skill knowledge packages used by the enterprise."],
    ["Dev Test Deployment Infrastructure", "Own CI, build, smoke, regression, Portainer, and recovery evidence for Paperclip deployments."],
  ],
  EBU: [
    ["Business Operations and Client Delivery", "Coordinate operating delivery, client-facing work, and service execution for E-Business Expert LLC."],
    ["Marketing Sales and Revenue Operations", "Run commercial funnel, marketing execution, offers, and revenue operations."],
    ["Delivery QA and Reporting", "Keep delivery quality, reporting cadence, and escalation paths visible to management."],
  ],
  ECO: [
    ["E-Commerce Operations", "Run e-commerce operating rhythm, retail workflows, launch readiness, and daily store operations."],
    ["Catalog Storefront and Marketplace", "Manage catalog standards, storefront changes, marketplace integrations, and merchandising controls."],
    ["Customer Order and Inventory Flow", "Coordinate customer support, orders, fulfillment, inventory status, and retail reporting."],
  ],
  MSG: [
    ["Shared Infrastructure Service Discovery", "Maintain infrastructure discovery, network/service ownership, and endpoint truth across the enterprise."],
    ["Networking Servers and Cloud Operations", "Operate network, server, DNS, WHM, backup, and monitoring lanes."],
    ["Endpoint and Software Inventory Governance", "Track software names, categories, endpoints, responsible agents, and access ownership."],
  ],
  OPS: [
    ["Asset Procurement and Inventory Control", "Own procurement, asset logs, inventory movement, warranty, and device accountability."],
    ["Device Allocation and Recovery", "Coordinate endpoint assignment, recovery, lifecycle movement, and access handoff."],
    ["Facilities Insurance and Claims", "Manage facilities equipment, incident evidence, insurance coordination, and claim readiness."],
  ],
  REA: [
    ["Property Leaseback and Site Operations", "Maintain property operating records, leaseback workflows, and site coordination."],
    ["Real Estate Compliance and Records", "Keep permits, inspections, compliance evidence, property files, and vendor records current."],
    ["Capital Improvements and Maintenance Planning", "Coordinate property projects, improvement planning, contractors, and maintenance programs."],
  ],
};

function parseArgs(argv) {
  const args = { liveJson: null, exportRoot: defaultExportRoot, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--live-json") args.liveJson = argv[++index] ?? null;
    else if (arg === "--export-root") args.exportRoot = argv[++index] ?? args.exportRoot;
    else if (arg === "--dry-run") args.dryRun = true;
  }
  if (!args.liveJson) {
    throw new Error("Usage: node scripts/enterprise/repair-enterprise-knowledge.mjs --live-json <sanitized-live.json> [--export-root <path>] [--dry-run]");
  }
  return args;
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function yamlQuote(value) {
  if (value === null || value === undefined || value === "") return "null";
  return JSON.stringify(String(value));
}

function ensureDir(dir, dryRun, changes) {
  if (fs.existsSync(dir)) return;
  changes.push({ action: "mkdir", path: dir });
  if (!dryRun) fs.mkdirSync(dir, { recursive: true });
}

function writeFileIfChanged(filePath, content, dryRun, changes) {
  const normalized = content.endsWith("\n") ? content : `${content}\n`;
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, "utf8") === normalized) return;
  changes.push({ action: fs.existsSync(filePath) ? "update" : "create", path: filePath });
  if (!dryRun) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, normalized, "utf8");
  }
}

function writeFileIfMissing(filePath, content, dryRun, changes) {
  if (fs.existsSync(filePath)) return;
  writeFileIfChanged(filePath, content, dryRun, changes);
}

function shouldNormalizeAgentMarkdown(markdown) {
  if (!markdown) return true;
  const markerCount = [...markdown.matchAll(/^---\s*$/gm)].length;
  if (markerCount > 2) return true;
  return /^reportsTo:\s*(none|Not assigned)\s*$/m.test(markdown);
}

function extractSkills(markdown) {
  const skills = [];
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return skills;
  const lines = match[1].split(/\r?\n/);
  let inSkills = false;
  for (const line of lines) {
    if (/^\S/.test(line)) inSkills = /^skills:\s*$/.test(line);
    if (inSkills) {
      const skill = line.match(/^\s*-\s*["']?([^"'\r\n]+)["']?\s*$/);
      if (skill) skills.push(skill[1].trim());
    }
  }
  return Array.from(new Set(skills));
}

function bodyAfterFrontmatter(markdown) {
  if (!markdown.startsWith("---")) return markdown.trimStart();
  const markers = [...markdown.matchAll(/^---\s*$/gm)];
  if (markers.length < 2) return markdown.trimStart();
  const end = markers.length >= 4 ? markers[3].index + markers[3][0].length : markers[1].index + markers[1][0].length;
  return markdown.slice(end).trimStart();
}

function buildAgentMarkdown(agent, reportsToSlug, existingMarkdown) {
  const skills = existingMarkdown ? extractSkills(existingMarkdown) : [];
  const frontmatter = [
    "---",
    `name: ${yamlQuote(agent.name)}`,
    `title: ${yamlQuote(agent.title)}`,
    `reportsTo: ${reportsToSlug ? yamlQuote(reportsToSlug) : "null"}`,
    "skills:",
    ...(skills.length ? skills.map((skill) => `  - ${yamlQuote(skill)}`) : ["  - doc-maintenance", "  - internal-comms", "  - pr-report"]),
    "---",
    "",
  ].join("\n");
  const existingBody = existingMarkdown ? bodyAfterFrontmatter(existingMarkdown) : "";
  if (existingBody.trim()) return `${frontmatter}${existingBody.trim()}\n`;
  return `${frontmatter}# Identity\n\nYou are ${agent.name}, ${agent.title ?? agent.role ?? "enterprise agent"} for ${agent.companyPrefix}.\n\n# Mission\n\nOperate within your company scope, keep your manager path current, and use the enterprise relationship workspace for cross-company dependencies.\n\n# Always Instructions\n\n- Keep work aligned to your company and manager lane.\n- Use AgentChatTR for working-room communication.\n- Keep service discovery, permissions, skills, and metadata current before handoff.\n`;
}

function buildChatroom(agent) {
  const dashboard = slugify(agent.companyPrefix || agent.companyName || "company");
  const primaryRoom = `#${dashboard}-${slugify(agent.role || "team")}`;
  const executiveRoom = `#${dashboard}-executive`;
  const relayRoom = `#${dashboard}-relay`;
  return `---\nagent: ${yamlQuote(agent.name)}\ntitle: ${yamlQuote(agent.title ?? agent.name)}\nteam: ${yamlQuote(agent.role ?? "enterprise")}\ncompany: ${yamlQuote(agent.companyPrefix)}\ndashboard: ${yamlQuote(dashboard)}\nreportsTo: ${yamlQuote(agent.reportsToName ?? "Not assigned")}\nprimaryRoom: ${yamlQuote(primaryRoom)}\n---\n\n# ${agent.name} Chatroom Board\n\n## Room Access\n\n- ${primaryRoom}\n- ${executiveRoom}\n- ${relayRoom}\n\n## Current Working Board\n\nStatus: ${agent.status ?? "idle"}\nCurrent Task:\nLast Completed:\nWorking On:\nWaiting On:\nConcerns / Risks:\nHelp Requested:\nWorkflow Mode In Use:\nNeeds Decision By:\nNext Upward Report: ${agent.reportsToName ?? "Not assigned"}\nLast Handoff:\nLast Updated:\n\n## Routing Rules\n\n- Use the primary room for normal team execution.\n- Use the executive room for upward reports and manager decisions.\n- Use the relay room for cross-company handoffs and dependencies.\n`;
}

function buildKnowledge(agent) {
  return `---\nkind: agent-knowledge\nagent: ${yamlQuote(agent.name)}\ncompany: ${yamlQuote(agent.companyPrefix)}\nstatus: ${yamlQuote(agent.status ?? "idle")}\n---\n\n# ${agent.name} Knowledge Base\n\n## Identity\n\n- Name: ${agent.name}\n- Title: ${agent.title ?? "Not set"}\n- Role: ${agent.role ?? "Not set"}\n- Company: ${agent.companyPrefix}\n- Reports to: ${agent.reportsToName ?? "Not assigned"}${agent.reportsToCompanyPrefix ? ` (${agent.reportsToCompanyPrefix})` : ""}\n- Adapter: ${agent.adapterType ?? "Not set"}\n\n## Restored Enterprise Context\n\n- Preserve adapter type, runtime config, permissions, access metadata, relationship workspace, service discovery cache, deployment awareness, and multi-skill metadata.\n- Keep company-level work routed through formal reporting before cross-company execution.\n- Keep software discovery entries explicit: software/tool name, category, endpoint or machine, responsible agent, and access owner.\n- Use AgentChatTR for live coordination and keep CHATROOM.md current.\n\n## Navigation\n\n- Open this agent from the company dashboard for detailed permissions, relationships, service discovery, runtime, and metadata.\n- Open AgentChatTR for live room communication.\n- Open Full Org Chart for cross-company hierarchy and reporting context.\n\n## Handoff Notes\n\n- Do not erase local enterprise metadata during upstream Paperclip merges.\n- If a manager/reporting path changes, update AGENTS.md, RELATIONSHIPS.md, CHATROOM.md, and the live DB together.\n`;
}

function buildRelationships(agent, reportsToSlug) {
  return `---\nkind: agent-relationships\nagent: ${yamlQuote(agent.name)}\ncompany: ${yamlQuote(agent.companyPrefix)}\n---\n\n# ${agent.name} Relationship Workspace\n\n## Formal Reporting\n\n- Reports to: ${agent.reportsToName ?? "Not assigned"}\n- Reports-to package ref: ${reportsToSlug ?? "Not assigned"}\n- Reports-to company: ${agent.reportsToCompanyPrefix ?? agent.companyPrefix ?? "Not assigned"}\n\n## Relationship Links To Preserve\n\n- budgetFundedBy\n- mustInform\n- statusReportedTo\n- governanceDependency\n- serviceDependency\n- matrixDependency\n\n## Cross-Company Rule\n\nCross-company work must remain visible in the relationship workspace and must not be hidden inside a chatroom-only workflow.\n`;
}

function buildProjectMarkdown(company, project) {
  return `---\nschema: agentcompanies/v1\nkind: project\nslug: ${yamlQuote(slugify(project.name))}\nname: ${yamlQuote(project.name)}\ndescription: ${yamlQuote(project.description)}\nstatus: ${yamlQuote(project.status ?? "planned")}\nowner: ${yamlQuote(project.leadAgent ?? null)}\nmetadata:\n  companyPrefix: ${yamlQuote(company.prefix)}\n  restoreSource: ${yamlQuote("enterprise-knowledge-repair")}\n---\n\n# ${project.name}\n\n${project.description}\n\n## Operating Rules\n\n- Keep project work company-scoped unless a relationship link explicitly routes the handoff.\n- Link responsible agents through their AGENTS.md, KNOWLEDGE.md, CHATROOM.md, and RELATIONSHIPS.md files.\n- Preserve this project package during upstream Paperclip merges.\n`;
}

function buildCompanyMarkdown(company) {
  return `---\nname: ${yamlQuote(company.name)}\ndescription: ${yamlQuote(company.description ?? `${company.name} enterprise company package.`)}\nschema: ${yamlQuote("agentcompanies/v1")}\nslug: ${yamlQuote(slugify(company.name))}\nmetadata:\n  issuePrefix: ${yamlQuote(company.prefix)}\n  parentIssuePrefix: ${yamlQuote(company.parent_prefix ?? null)}\n---\n\n# ${company.name}\n\nRecovered from live Paperclip enterprise hierarchy. This package must stay aligned with the live DB, the full organization chart, AgentChatTR, and the Paperclip upstream merge handover.\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const live = JSON.parse(fs.readFileSync(args.liveJson, "utf8"));
  const exportRoot = path.resolve(args.exportRoot);
  const changes = [];
  const agentSlugByCompanyAndName = new Map();
  const agentSlugByName = new Map();

  for (const agent of live.agents) {
    const slug = slugify(agent.name);
    agent.slug = slug;
    agentSlugByName.set(agent.name, slug);
    agentSlugByCompanyAndName.set(`${agent.companyPrefix}:${agent.name}`, slug);
  }

  for (const company of live.companies) {
    const companyDir = path.join(exportRoot, company.prefix);
    ensureDir(companyDir, args.dryRun, changes);
    writeFileIfMissing(path.join(companyDir, "COMPANY.md"), buildCompanyMarkdown(company), args.dryRun, changes);
    ensureDir(path.join(companyDir, "agents"), args.dryRun, changes);
    ensureDir(path.join(companyDir, "projects"), args.dryRun, changes);

    const companyAgents = live.agents.filter((agent) => agent.companyPrefix === company.prefix);
    for (const agent of companyAgents) {
      const agentDir = path.join(companyDir, "agents", agent.slug);
      ensureDir(agentDir, args.dryRun, changes);
      let reportsToSlug = null;
      if (agent.reportsToName) {
        const parentSlug = agentSlugByCompanyAndName.get(`${agent.reportsToCompanyPrefix ?? agent.companyPrefix}:${agent.reportsToName}`) ?? agentSlugByName.get(agent.reportsToName);
        reportsToSlug = parentSlug && agent.reportsToCompanyPrefix && agent.reportsToCompanyPrefix !== agent.companyPrefix
          ? `${agent.reportsToCompanyPrefix}/${parentSlug}`
          : parentSlug;
      }
      const agentsPath = path.join(agentDir, "AGENTS.md");
      const existing = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, "utf8") : "";
      if (shouldNormalizeAgentMarkdown(existing)) {
        writeFileIfChanged(agentsPath, buildAgentMarkdown(agent, reportsToSlug, existing), args.dryRun, changes);
      }
      writeFileIfMissing(path.join(agentDir, "CHATROOM.md"), buildChatroom(agent), args.dryRun, changes);
      writeFileIfMissing(path.join(agentDir, "KNOWLEDGE.md"), buildKnowledge(agent), args.dryRun, changes);
      writeFileIfMissing(path.join(agentDir, "RELATIONSHIPS.md"), buildRelationships(agent, reportsToSlug), args.dryRun, changes);
    }

    const liveProjects = live.projects
      .filter((project) => project.company_prefix === company.prefix)
      .map((project) => ({
        name: project.name,
        description: project.description || `${project.name} project package restored from live Paperclip.`,
        status: project.status ?? "planned",
        leadAgent: project.lead_agent ?? null,
      }));
    const seededProjects = (COMPANY_PROJECT_SEEDS[company.prefix] ?? []).map(([name, description]) => ({
      name,
      description,
      status: "planned",
      leadAgent: null,
    }));
    const projectsBySlug = new Map();
    for (const project of [...liveProjects, ...seededProjects]) {
      projectsBySlug.set(slugify(project.name), project);
    }
    for (const [projectSlug, project] of projectsBySlug) {
      const projectDir = path.join(companyDir, "projects", projectSlug);
      ensureDir(projectDir, args.dryRun, changes);
      writeFileIfChanged(path.join(projectDir, "PROJECT.md"), buildProjectMarkdown(company, project), args.dryRun, changes);
    }
  }

  const summary = {
    exportRoot,
    dryRun: args.dryRun,
    companyCount: live.companies.length,
    agentCount: live.agents.length,
    projectPackageCount: live.companies.reduce((count, company) => {
      return count + new Set([
        ...live.projects.filter((project) => project.company_prefix === company.prefix).map((project) => slugify(project.name)),
        ...(COMPANY_PROJECT_SEEDS[company.prefix] ?? []).map(([name]) => slugify(name)),
      ]).size;
    }, 0),
    changeCount: changes.length,
    changes,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main();
