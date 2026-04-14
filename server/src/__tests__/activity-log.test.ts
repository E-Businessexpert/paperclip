import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPublishLiveEvent = vi.hoisted(() => vi.fn());
const mockGetGeneral = vi.hoisted(() => vi.fn());

vi.mock("../services/live-events.js", () => ({
  publishLiveEvent: mockPublishLiveEvent,
}));

vi.mock("../services/instance-settings.js", () => ({
  instanceSettingsService: () => ({
    getGeneral: mockGetGeneral,
  }),
}));

import { logActivity } from "../services/activity-log.js";

function createDbStub(projectId: string | null = null) {
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const selectThen = vi.fn((onFulfilled?: (rows: Array<{ projectId: string | null }>) => unknown) =>
    Promise.resolve([{ projectId }]).then((rows) => (onFulfilled ? onFulfilled(rows) : rows)),
  );
  const where = vi.fn().mockReturnValue({ then: selectThen });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  const insert = vi.fn().mockReturnValue({ values: insertValues });

  return {
    db: {
      insert,
      select,
    } as any,
    insertValues,
    select,
    from,
    where,
  };
}

describe("logActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGeneral.mockResolvedValue({ censorUsernameInLogs: false });
  });

  it("infers projectId from issue entities when callers omit it", async () => {
    const { db, insertValues, select } = createDbStub("project-1");

    await logActivity(db, {
      companyId: "company-1",
      actorType: "system",
      actorId: "system",
      action: "issue.updated",
      entityType: "issue",
      entityId: "issue-1",
    });

    expect(select).toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-1",
        projectId: "project-1",
        entityType: "issue",
        entityId: "issue-1",
      }),
    );
    expect(mockPublishLiveEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          projectId: "project-1",
        }),
      }),
    );
  });

  it("uses project entities directly without an issue lookup", async () => {
    const { db, insertValues, select } = createDbStub("ignored");

    await logActivity(db, {
      companyId: "company-1",
      actorType: "system",
      actorId: "system",
      action: "project.updated",
      entityType: "project",
      entityId: "project-9",
    });

    expect(select).not.toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-1",
        projectId: "project-9",
        entityType: "project",
        entityId: "project-9",
      }),
    );
  });
});
