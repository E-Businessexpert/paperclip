import { describe, expect, it } from "vitest";
import { groupAgentsByDepartment, inferAgentDepartment } from "./agent-departments";

describe("agent departments", () => {
  it("classifies representative enterprise roles into the expected departments", () => {
    expect(
      inferAgentDepartment({
        id: "cornerstone-president",
        name: "Cornerstone President",
        title: "Cornerstone President",
        role: "executive",
      }).key,
    ).toBe("executive");

    expect(
      inferAgentDepartment({
        id: "paperclip-project-manager",
        name: "Paperclip Project Manager",
        title: "Paperclip Project Manager",
        role: "manager",
      }).key,
    ).toBe("productEngineering");

    expect(
      inferAgentDepartment({
        id: "portainer-project-manager",
        name: "Portainer Project Manager",
        title: "Portainer Project Manager",
        role: "manager",
      }).key,
    ).toBe("platformRuntime");

    expect(
      inferAgentDepartment({
        id: "postgresql-specialist",
        name: "PostgreSQL Specialist",
        title: "PostgreSQL Specialist",
        role: "specialist",
      }).key,
    ).toBe("dataDatabase");

    expect(
      inferAgentDepartment({
        id: "functional-testing-lead",
        name: "Functional Testing Lead",
        title: "Functional Testing Lead",
        role: "lead",
      }).key,
    ).toBe("qaTesting");
  });

  it("groups agents into ordered collapsible departments without changing the input order", () => {
    const grouped = groupAgentsByDepartment([
      {
        id: "paperclip-project-manager",
        name: "Paperclip Project Manager",
        title: "Paperclip Project Manager",
        role: "manager",
      },
      {
        id: "postgre-sql-specialist",
        name: "PostgreSQL Specialist",
        title: "PostgreSQL Specialist",
        role: "specialist",
      },
      {
        id: "portainer-project-manager",
        name: "Portainer Project Manager",
        title: "Portainer Project Manager",
        role: "manager",
      },
    ]);

    expect(grouped.map((group) => group.key)).toEqual([
      "productEngineering",
      "platformRuntime",
      "dataDatabase",
    ]);
    expect(grouped[0]?.agents.map((agent) => agent.name)).toEqual(["Paperclip Project Manager"]);
    expect(grouped[1]?.agents.map((agent) => agent.name)).toEqual(["Portainer Project Manager"]);
    expect(grouped[2]?.agents.map((agent) => agent.name)).toEqual(["PostgreSQL Specialist"]);
  });
});

