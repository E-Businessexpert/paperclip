export interface AgentChatTRPathOptions {
  agentId: string;
  companyPrefix?: string | null;
  scope?: "company" | "global";
}

export function buildAgentChatTRPath({
  agentId,
  companyPrefix,
  scope = "company",
}: AgentChatTRPathOptions): string {
  const params = new URLSearchParams({ agentId });
  if (scope === "global" || !companyPrefix) {
    return `/chatrooms?${params.toString()}`;
  }
  return `/${companyPrefix.trim().toUpperCase()}/chatrooms?${params.toString()}`;
}
