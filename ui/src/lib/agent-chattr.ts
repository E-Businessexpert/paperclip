import type { AgentInstructionsBundle } from "@paperclipai/shared";

export type AgentChatroomFrontmatter = Record<string, string | string[]>;

export interface AgentChatroomKeyValue {
  label: string;
  value: string;
}

export interface ParsedAgentChatroom {
  frontmatter: AgentChatroomFrontmatter;
  body: string;
  roomAccess: string[];
  currentBoard: AgentChatroomKeyValue[];
}

const COMPANY_DASHBOARD_BY_NAME: Record<string, string> = {
  "Cornerstone Capital Holding LLC": "cornerstone-holding",
  "1ms Group LLC": "one-ms-infra-shield",
  "Ops & Assets LLC": "ops-assets-shield",
  "Real Estate LLC": "real-estate-shield",
  "E-Business Expert Labs LLC": "ebe-labs-assets",
  "E-Business Expert Group LLC": "group-operations-control",
  "E-Commerce Expert LLC": "ecommerce-retail-manager",
  "E-Business Expert LLC": "ebe-llc-frontline",
};

function escapeHeadingPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseFrontmatter(content: string): { data: AgentChatroomFrontmatter; body: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;

  const data: AgentChatroomFrontmatter = {};
  const rawYaml = match[1];
  const body = match[2];

  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (const line of rawYaml.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("- ") && currentKey) {
      if (!currentList) currentList = [];
      currentList.push(trimmed.slice(2).trim().replace(/^["']|["']$/g, ""));
      continue;
    }

    if (currentKey && currentList) {
      data[currentKey] = currentList;
      currentList = null;
      currentKey = null;
    }

    const kvMatch = trimmed.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1];
    const value = kvMatch[2].trim().replace(/^["']|["']$/g, "");
    if (value === "null") {
      currentKey = null;
      continue;
    }
    if (value) {
      data[key] = value;
      currentKey = null;
    } else {
      currentKey = key;
    }
  }

  if (currentKey && currentList) {
    data[currentKey] = currentList;
  }

  return { data, body };
}

function extractSection(body: string, heading: string) {
  const escapedHeading = escapeHeadingPattern(heading);
  const regex = new RegExp(
    `^##\\s+${escapedHeading}\\s*$([\\s\\S]*?)(?=^##\\s+|\\Z)`,
    "im",
  );
  const match = body.match(regex);
  return match?.[1]?.trim() ?? "";
}

function extractBulletValues(body: string, heading: string) {
  const section = extractSection(body, heading);
  if (!section) return [];
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function extractKeyValueBullets(body: string, heading: string): AgentChatroomKeyValue[] {
  return extractBulletValues(body, heading)
    .map((line) => {
      const [label, ...rest] = line.split(":");
      return {
        label: label?.trim() ?? "",
        value: rest.join(":").trim(),
      };
    })
    .filter((entry) => entry.label);
}

export function resolveCompanyDashboard(companyName?: string | null, explicitDashboard?: string | null) {
  if (explicitDashboard?.trim()) return explicitDashboard.trim();
  if (companyName && COMPANY_DASHBOARD_BY_NAME[companyName]) {
    return COMPANY_DASHBOARD_BY_NAME[companyName];
  }
  return companyName ? slugify(companyName) : "company-dashboard";
}

export function executiveRoomForDashboard(dashboard: string) {
  return `#${dashboard}-executive`;
}

export function relayRoomForDashboard(dashboard: string) {
  return `#${dashboard}-relay`;
}

export function teamRoomForName(teamName?: string | null) {
  return teamName?.trim() ? `#${slugify(teamName)}` : "#team-room";
}

export function findChatroomPath(bundle?: AgentInstructionsBundle | null) {
  if (!bundle) return null;
  const exactMatch = bundle.files.find((file) => file.path === "CHATROOM.md");
  if (exactMatch) return exactMatch.path;
  const nestedMatch = bundle.files.find((file) => /(^|\/)CHATROOM\.md$/i.test(file.path));
  return nestedMatch?.path ?? null;
}

export function parseAgentChatroom(content: string): ParsedAgentChatroom | null {
  const parsed = parseFrontmatter(content);
  if (!parsed) return null;
  return {
    frontmatter: parsed.data,
    body: parsed.body,
    roomAccess: extractBulletValues(parsed.body, "Room Access"),
    currentBoard: extractKeyValueBullets(parsed.body, "Current Working Board"),
  };
}

export function buildFallbackAgentChatroom(params: {
  agentName: string;
  companyName?: string | null;
  teamName?: string | null;
  reportsToName?: string | null;
  dashboard: string;
}) {
  const teamRoom = teamRoomForName(params.teamName);
  const executiveRoom = executiveRoomForDashboard(params.dashboard);
  const relayRoom = relayRoomForDashboard(params.dashboard);

  return `---
agent: ${params.agentName}
title: ${params.agentName}
team: ${params.teamName ?? "Unassigned Team"}
company: ${params.companyName ?? "Unknown Company"}
dashboard: ${params.dashboard}
reportsTo: ${params.reportsToName ?? "Not assigned"}
primaryRoom: ${teamRoom}
---

# ${params.agentName} Chatroom Board

## Identity

- Agent: ${params.agentName}
- Team: ${params.teamName ?? "Unassigned Team"}
- Company: ${params.companyName ?? "Unknown Company"}
- Dashboard: ${params.dashboard}
- Reports to: ${params.reportsToName ?? "Not assigned"}
- Escalation path: ${teamRoom} -> ${executiveRoom} -> ${relayRoom}

## Room Access

- ${teamRoom}
- ${executiveRoom}
- ${relayRoom}

## Current Working Board

- Status:
- Current Task:
- Last Completed:
- Working On:
- Waiting On:
- Concerns / Risks:
- Help Requested:
- Workflow Mode In Use:
- Needs Decision By:
- Next Upward Report:
- Last Handoff:
- Last Updated:
`;
}
