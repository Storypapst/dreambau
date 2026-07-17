// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { loadTeamMembers } from "@/team-client";
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
});
