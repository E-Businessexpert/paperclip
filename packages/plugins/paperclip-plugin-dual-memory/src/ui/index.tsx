import { useState } from "react";
import type { PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";
import { useHostNavigation, usePluginAction, usePluginData } from "@paperclipai/plugin-sdk/ui";
import { ACTION_KEYS, DATA_KEYS } from "../manifest.js";

type MemoryHealth = {
  status: string;
  config: {
    personalizationProvider: string;
    memoryScope: string;
    localFallbackEnabled: boolean;
    hasMem0Credentials: boolean;
    paperclipUserId: string;
    hindsightPluginKey: string;
  };
  counts: {
    localPersonalizationMemories: number;
    recentOperationalRuns: number;
  };
  requiredExternalLayer: {
    hindsight: { package: string; payloadReady: boolean; expectedEvents: string[] };
    mem0: { package: string; providerEnabled: boolean; credentialConfigured: boolean };
  };
};

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section style={{
      border: "1px solid rgba(148, 163, 184, 0.25)",
      borderRadius: 16,
      padding: 16,
      background: "linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.82))",
      color: "#e5eefb",
      boxShadow: "0 18px 40px rgba(2, 6, 23, 0.22)",
    }}>
      {children}
    </section>
  );
}

function StatusPill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 10px",
      borderRadius: 999,
      border: `1px solid ${ok ? "rgba(52, 211, 153, 0.5)" : "rgba(251, 191, 36, 0.55)"}`,
      background: ok ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.12)",
      color: ok ? "#a7f3d0" : "#fde68a",
      fontSize: 12,
      fontWeight: 700,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: ok ? "#34d399" : "#fbbf24" }} />
      {children}
    </span>
  );
}

function MemorySummary({ context, compact = false }: PluginWidgetProps & { compact?: boolean }) {
  const { data, loading, error, refresh } = usePluginData<MemoryHealth>(DATA_KEYS.health, {
    companyId: context.companyId,
    agentId: context.entityType === "agent" ? context.entityId : undefined,
  });
  const runSelfTest = usePluginAction(ACTION_KEYS.selfTest);
  const [selfTest, setSelfTest] = useState<string | null>(null);

  async function handleSelfTest() {
    setSelfTest("Running save/search test...");
    try {
      const result = await runSelfTest({
        companyId: context.companyId,
        agentId: context.entityType === "agent" ? context.entityId : undefined,
        projectId: context.projectId,
      }) as { ok?: boolean; marker?: string };
      setSelfTest(result.ok ? `Passed: ${result.marker}` : "Failed: memory was not found after save.");
      refresh();
    } catch (err) {
      setSelfTest(err instanceof Error ? err.message : String(err));
    }
  }

  if (loading) return <Panel>Loading memory status...</Panel>;
  if (error) return <Panel>Memory plugin error: {error.message}</Panel>;
  if (!data) return <Panel>No memory status returned.</Panel>;

  return (
    <Panel>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ letterSpacing: "0.14em", textTransform: "uppercase", color: "#93c5fd", fontSize: 11, fontWeight: 800 }}>
            Dual Memory
          </div>
          <h2 style={{ margin: "6px 0 8px", fontSize: compact ? 18 : 28 }}>Operational + personalization memory</h2>
          <p style={{ margin: 0, maxWidth: 780, color: "#cbd5e1", lineHeight: 1.55 }}>
            Hindsight captures run progress and setbacks. Mem0/local tools keep long-term user preferences,
            style rules, and permanent facts available to agents.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSelfTest}
          style={{
            border: "1px solid rgba(96, 165, 250, 0.5)",
            background: "linear-gradient(135deg, #2563eb, #0f766e)",
            color: "white",
            borderRadius: 12,
            padding: "10px 14px",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Run memory self-test
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
        <StatusPill ok={data.requiredExternalLayer.hindsight.payloadReady}>
          Hindsight payload ready
        </StatusPill>
        <StatusPill ok={data.config.localFallbackEnabled}>
          Local fallback {data.config.localFallbackEnabled ? "on" : "off"}
        </StatusPill>
        <StatusPill ok={!data.requiredExternalLayer.mem0.providerEnabled || data.requiredExternalLayer.mem0.credentialConfigured}>
          Mem0 {data.requiredExternalLayer.mem0.providerEnabled ? "enabled" : "optional"}
        </StatusPill>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
        marginTop: 16,
      }}>
        <Metric label="Provider" value={data.config.personalizationProvider} />
        <Metric label="Scope" value={data.config.memoryScope} />
        <Metric label="Local memories" value={String(data.counts.localPersonalizationMemories)} />
        <Metric label="Run memories" value={String(data.counts.recentOperationalRuns)} />
      </div>

      {selfTest ? (
        <div style={{ marginTop: 14, color: selfTest.startsWith("Passed") ? "#a7f3d0" : "#fde68a", fontWeight: 700 }}>
          {selfTest}
        </div>
      ) : null}
    </Panel>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      border: "1px solid rgba(148, 163, 184, 0.18)",
      borderRadius: 14,
      padding: 12,
      background: "rgba(15, 23, 42, 0.62)",
    }}>
      <div style={{ fontSize: 11, letterSpacing: "0.11em", textTransform: "uppercase", color: "#94a3b8", fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

export function DualMemoryPage(props: PluginWidgetProps) {
  return (
    <main style={{ padding: 24 }}>
      <MemorySummary {...props} />
    </main>
  );
}

export function DualMemoryDashboardWidget(props: PluginWidgetProps) {
  return <MemorySummary {...props} compact />;
}

export function DualMemorySidebarLink({ context }: PluginWidgetProps) {
  const nav = useHostNavigation();
  const prefix = context.companyPrefix ? `/${context.companyPrefix}` : "";
  return (
    <a
      {...nav.linkProps(`${prefix}/plugins/memory`)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        borderRadius: 10,
        color: "inherit",
        textDecoration: "none",
        fontWeight: 750,
      }}
    >
      <span aria-hidden="true">MEM</span>
      <span>Dual Memory</span>
    </a>
  );
}
