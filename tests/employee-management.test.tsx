// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { loadTeamMembers } from "@/team-client";
import type { TeamMembersResponse } from "@/types";
import { EmployeeManagement } from "../src/client/components/employee-management.js";

vi.mock("@/team-client", () => ({
  loadTeamMembers: vi.fn(),
  createTeamMember: vi.fn(),
  setTeamMemberStatus: vi.fn()
}));

describe("EmployeeManagement failures", () => {
  it("renders a load-specific error instead of leaking a rejected promise", async () => {
    vi.mocked(loadTeamMembers).mockRejectedValue(new Error("offline"));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<EmployeeManagement locale="de" />));
    const trigger = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Mitarbeiter"));
    await act(async () => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await vi.waitFor(() => expect(document.body.textContent).toContain("Mitarbeiter konnten nicht geladen werden"));
    expect(document.body.textContent).not.toContain("offline");
    await act(async () => root.unmount());
    container.remove();
  });

  it("shows locally stored employees with an explicit degraded Infisical notice", async () => {
    vi.mocked(loadTeamMembers).mockResolvedValue({
      users: [{
        id: "member-id",
        email: "member@dreambau.com",
        name: "Stored Member",
        projects: ["oriso"],
        role: "member",
        status: "active",
        createdAt: "2026-08-30T12:00:00.000Z",
        accessSources: ["local"],
        entitlements: { orisoProvisioning: { environments: [] } }
      }],
      sourceStatus: { infisical: "degraded", correlationId: "d8412b72-c4ad-49f3-9bd5-9d441c3ca2db" }
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<EmployeeManagement locale="de" />));
    const trigger = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Mitarbeiter"));
    await act(async () => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    await vi.waitFor(() => expect(document.body.textContent).toContain("Stored Member"));
    expect(document.body.textContent).toContain("Lokal gespeicherte Mitarbeiterzugänge werden angezeigt");
    expect(document.body.textContent).toContain("d8412b72-c4ad-49f3-9bd5-9d441c3ca2db");
    expect(document.body.textContent).not.toContain("Mitarbeiter konnten nicht geladen werden");
    const createButton = Array.from(document.body.querySelectorAll("button")).find((button) => button.textContent?.includes("Mitarbeiter anlegen"));
    const disableButton = Array.from(document.body.querySelectorAll("button")).find((button) => button.textContent?.includes("Sperren"));
    expect(createButton?.disabled).toBe(true);
    expect(disableButton?.disabled).toBe(true);
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps mutations disabled until the latest overlapping refresh succeeds", async () => {
    const degradedResponse: TeamMembersResponse = {
      users: [{
        id: "member-id",
        email: "member@dreambau.com",
        name: "Stored Member",
        projects: ["oriso"],
        role: "member",
        status: "active",
        createdAt: "2026-08-30T12:00:00.000Z",
        accessSources: ["local"],
        entitlements: { orisoProvisioning: { environments: [] } }
      }],
      sourceStatus: { infisical: "degraded", correlationId: "d8412b72-c4ad-49f3-9bd5-9d441c3ca2db" }
    };
    const refreshResolvers: Array<(value: TeamMembersResponse) => void> = [];
    vi.mocked(loadTeamMembers)
      .mockResolvedValueOnce(degradedResponse)
      .mockImplementation(() => new Promise((resolve) => { refreshResolvers.push(resolve); }));

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<EmployeeManagement locale="de" />));
    const trigger = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Mitarbeiter"));
    await act(async () => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await vi.waitFor(() => expect(document.body.textContent).toContain("Stored Member"));

    const closeButton = document.body.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]');
    await act(async () => closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await vi.waitFor(() => expect(document.body.querySelector('[data-slot="dialog-content"]')).toBeNull());
    await act(async () => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await vi.waitFor(() => expect(refreshResolvers).toHaveLength(1));

    const secondCloseButton = document.body.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]');
    await act(async () => secondCloseButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await vi.waitFor(() => expect(document.body.querySelector('[data-slot="dialog-content"]')).toBeNull());
    await act(async () => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await vi.waitFor(() => expect(refreshResolvers).toHaveLength(2));

    await act(async () => refreshResolvers[0]({
      ...degradedResponse,
      sourceStatus: { infisical: "available" }
    }));
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Infisical-Abgleich vorübergehend eingeschränkt");
      expect(document.body.textContent).toContain("d8412b72-c4ad-49f3-9bd5-9d441c3ca2db");
      const disableButton = Array.from(document.body.querySelectorAll("button")).find((button) => button.textContent?.includes("Sperren"));
      expect(disableButton?.disabled).toBe(true);
    });

    await act(async () => refreshResolvers[1]({
      ...degradedResponse,
      sourceStatus: { infisical: "available" }
    }));
    await vi.waitFor(() => {
      const disableButton = Array.from(document.body.querySelectorAll("button")).find((button) => button.textContent?.includes("Sperren"));
      expect(disableButton?.disabled).toBe(false);
    });
    await act(async () => root.unmount());
    container.remove();
  });
});
