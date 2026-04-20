import type { Agent } from "@paperclipai/shared";

export type AgentDepartmentKey =
  | "executive"
  | "productEngineering"
  | "platformRuntime"
  | "dataDatabase"
  | "qaTesting"
  | "finance"
  | "peopleHr"
  | "customerRevenue"
  | "assetsProcurement"
  | "realEstate"
  | "governanceLegal"
  | "operations"
  | "general";

export interface AgentDepartmentDefinition {
  key: AgentDepartmentKey;
  label: string;
  shortLabel: string;
  description: string;
}

export interface AgentDepartmentGroup<TAgent extends AgentDepartmentAgentLike> extends AgentDepartmentDefinition {
  agents: TAgent[];
}

export interface AgentDepartmentAgentLike
  extends Pick<Agent, "id" | "name" | "title"> {
  role?: string | null;
}

const DEPARTMENT_DEFINITIONS: readonly AgentDepartmentDefinition[] = [
  {
    key: "executive",
    label: "Executive Leadership",
    shortLabel: "EX",
    description: "Presidents, chiefs, and top-level company direction.",
  },
  {
    key: "productEngineering",
    label: "Product & Engineering",
    shortLabel: "DEV",
    description: "Apps, software delivery, product design, and AI engineering.",
  },
  {
    key: "platformRuntime",
    label: "Platform & Runtime",
    shortLabel: "PLT",
    description: "Deployment control, runtime platforms, infra coordination, and container operations.",
  },
  {
    key: "dataDatabase",
    label: "Data & Database",
    shortLabel: "DB",
    description: "Database engineering, data platforms, search, and migration standards.",
  },
  {
    key: "qaTesting",
    label: "QA & Testing",
    shortLabel: "QA",
    description: "Quality control, regression, validation, and release readiness.",
  },
  {
    key: "finance",
    label: "Finance",
    shortLabel: "FIN",
    description: "Accounting, budget, billing, capital, pricing, and tax operations.",
  },
  {
    key: "peopleHr",
    label: "People & HR",
    shortLabel: "HR",
    description: "Hiring, people operations, payroll, benefits, and employee lifecycle work.",
  },
  {
    key: "customerRevenue",
    label: "Customer & Growth",
    shortLabel: "CX",
    description: "Client delivery, customer success, sales, marketing, retail, and commerce.",
  },
  {
    key: "assetsProcurement",
    label: "Assets & Procurement",
    shortLabel: "AST",
    description: "Hardware, licenses, inventory, procurement, and equipment allocation.",
  },
  {
    key: "realEstate",
    label: "Real Estate",
    shortLabel: "RE",
    description: "Property, lease, facility, warehouse, and space allocation work.",
  },
  {
    key: "governanceLegal",
    label: "Governance & Legal",
    shortLabel: "GOV",
    description: "Legal, compliance, audit, risk, policy, privacy, and security governance.",
  },
  {
    key: "operations",
    label: "Operations",
    shortLabel: "OPS",
    description: "General coordination, workflow management, PMO, and operational execution.",
  },
  {
    key: "general",
    label: "General",
    shortLabel: "GEN",
    description: "Specialized roles that do not map cleanly to another department yet.",
  },
] as const;

const DEPARTMENT_BY_KEY = new Map(
  DEPARTMENT_DEFINITIONS.map((definition) => [definition.key, definition]),
);

const DEPARTMENT_MATCH_ORDER: ReadonlyArray<{
  key: AgentDepartmentKey;
  patterns: ReadonlyArray<RegExp>;
}> = [
  {
    key: "executive",
    patterns: [
      /\b(president|chief|ceo|owner|founder|chair|trustee|executive)\b/i,
    ],
  },
  {
    key: "governanceLegal",
    patterns: [
      /\b(governance|board|audit|compliance|legal|privacy|policy|risk|security|control|insurance|regulatory|resolution)\b/i,
    ],
  },
  {
    key: "finance",
    patterns: [
      /\b(finance|financial|accounting|accounts?\b|treasury|tax|budget|billing|capital|revenue|cost|cash|pricing|withholding)\b/i,
    ],
  },
  {
    key: "peopleHr",
    patterns: [
      /\b(hr|human resources|people|talent|recruit|recruiting|payroll|benefits|employee|hiring|onboarding|offboarding)\b/i,
    ],
  },
  {
    key: "dataDatabase",
    patterns: [
      /\b(database|postgres(?:ql)?|mysql|mariadb|mongo(?:db)?|elasticsearch|schema|migration|query|index|search|dba|data platform)\b/i,
    ],
  },
  {
    key: "qaTesting",
    patterns: [
      /\b(qa|quality|testing|test\b|validation|defect|acceptance|regression)\b/i,
    ],
  },
  {
    key: "realEstate",
    patterns: [
      /\b(real estate|property|facility|facilities|lease|leasing|occupancy|warehouse|space)\b/i,
    ],
  },
  {
    key: "assetsProcurement",
    patterns: [
      /\b(asset|inventory|license|licensing|hardware|device|procurement|vendor|allocation|equipment|workstation)\b/i,
    ],
  },
  {
    key: "customerRevenue",
    patterns: [
      /\b(customer|client|commerce|e-commerce|retail|sales|marketing|growth|success|support|store)\b/i,
    ],
  },
  {
    key: "productEngineering",
    patterns: [
      /\b(paperclip|agentchattr|product|engineering|engineer|developer|development|software|app\b|template|verticalization|adapter|ai|llm|source sync|orchestration)\b/i,
    ],
  },
  {
    key: "platformRuntime",
    patterns: [
      /\b(portainer|docker|kubernetes|k8s|kub|runtime|deployment|infrastructure|infra|platform|service discovery|stack|endpoint|container|vm|server|cloud)\b/i,
    ],
  },
  {
    key: "operations",
    patterns: [
      /\b(operations|coordinator|coordination|administrator|administration|workflow|dispatch|program|pmo|service desk)\b/i,
    ],
  },
];

function getDepartmentDefinition(key: AgentDepartmentKey): AgentDepartmentDefinition {
  return DEPARTMENT_BY_KEY.get(key) ?? DEPARTMENT_BY_KEY.get("general")!;
}

function buildAgentSearchText(agent: AgentDepartmentAgentLike): string {
  return [agent.title, agent.name, agent.role].filter(Boolean).join(" ");
}

export function inferAgentDepartment(agent: AgentDepartmentAgentLike): AgentDepartmentDefinition {
  const haystack = buildAgentSearchText(agent);

  for (const matcher of DEPARTMENT_MATCH_ORDER) {
    if (matcher.patterns.some((pattern) => pattern.test(haystack))) {
      return getDepartmentDefinition(matcher.key);
    }
  }

  return getDepartmentDefinition("general");
}

export function groupAgentsByDepartment<TAgent extends AgentDepartmentAgentLike>(
  agents: readonly TAgent[],
): Array<AgentDepartmentGroup<TAgent>> {
  const grouped = new Map<AgentDepartmentKey, TAgent[]>();

  for (const agent of agents) {
    const department = inferAgentDepartment(agent);
    const currentGroup = grouped.get(department.key);
    if (currentGroup) {
      currentGroup.push(agent);
    } else {
      grouped.set(department.key, [agent]);
    }
  }

  return DEPARTMENT_DEFINITIONS.flatMap((definition) => {
    const departmentAgents = grouped.get(definition.key);
    if (!departmentAgents || departmentAgents.length === 0) {
      return [];
    }

    return [
      {
        ...definition,
        agents: departmentAgents,
      },
    ];
  });
}
