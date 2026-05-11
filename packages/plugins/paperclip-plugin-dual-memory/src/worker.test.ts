import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk";
import manifest, { ACTION_KEYS, DATA_KEYS, TOOL_NAMES } from "./manifest.js";
import worker from "./worker.js";

describe("dual memory plugin", () => {
  async function setupHarness() {
    const harness = createTestHarness({
      manifest,
      config: {
        personalizationProvider: "local",
        paperclipUserId: "owner-test",
        enableLocalFallback: true,
      },
    });
    await worker.definition.setup(harness.ctx);
    return harness;
  }

  it("saves and searches personalization memory through the agent tool path", async () => {
    const harness = await setupHarness();
    const runCtx = {
      companyId: "company-a",
      agentId: "agent-a",
      projectId: "project-a",
      runId: "run-a",
    };

    const save = await harness.executeTool(TOOL_NAMES.saveUserMemory, {
      fact: "The owner prefers top filters, compact controls, and no sidebar filter panels.",
      category: "ui-preference",
    }, runCtx);
    expect(save.error).toBeUndefined();

    const search = await harness.executeTool(TOOL_NAMES.searchUserMemory, {
      query: "top filters compact controls",
      limit: 3,
    }, runCtx);
    expect(search.error).toBeUndefined();
    expect(search.content).toContain("top filters");
  });

  it("runs a functional self-test that proves save and search are wired", async () => {
    const harness = await setupHarness();
    const result = await harness.performAction<{ ok: boolean }>(ACTION_KEYS.selfTest, {
      companyId: "company-a",
      agentId: "agent-a",
      projectId: "project-a",
    });

    expect(result.ok).toBe(true);
  });

  it("stores operational run lifecycle payloads for Hindsight fallback visibility", async () => {
    const harness = await setupHarness();
    await harness.emit("agent.run.started", {
      runId: "run-123",
      agentId: "agent-a",
      status: "running",
      issueTitle: "Wire dual memory",
      issueDescription: "Operational memory should receive issue context.",
    }, {
      companyId: "company-a",
      entityId: "run-123",
      entityType: "heartbeat_run",
    });
    await harness.emit("agent.run.finished", {
      runId: "run-123",
      agentId: "agent-a",
      status: "completed",
      issueTitle: "Wire dual memory",
      output: "Memory checks passed.",
    }, {
      companyId: "company-a",
      entityId: "run-123",
      entityType: "heartbeat_run",
    });

    const health = await harness.getData<{
      counts: { recentOperationalRuns: number };
      operationalRuns: Array<{ id: string; status: string | null }>;
    }>(DATA_KEYS.health, { companyId: "company-a", agentId: "agent-a" });
    expect(health.counts.recentOperationalRuns).toBe(1);
    expect(health.operationalRuns[0]).toMatchObject({ id: "run-123", status: "completed" });
  });
});
