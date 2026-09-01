import { describe, expect, it, vi } from "vitest";
import { createTeamMember, loadTeamMembers, setTeamMemberStatus } from "../src/client/team-client.js";

describe("team browser client", () => {
  it("uses only the protected human-user endpoints", async () => {
    const member = {
      id: "user-id", email: "employee@dreambau.com", name: "Employee", projects: ["oriso"],
      role: "member", status: "active", createdAt: "2026-09-01T10:00:00.000Z"
    };
    const api = vi.fn(async (path: string) => path === "/auth/users"
      ? (api.mock.calls.length === 1
        ? { users: [], sourceStatus: { infisical: "available" } }
        : { ...member, enrollmentCode: "enrollment-code" })
      : member);
    await loadTeamMembers(api);
    await createTeamMember({ email: "employee@dreambau.com", name: "Employee", projects: ["oriso"] }, api);
    await setTeamMemberStatus("user-id", "disabled", api);
    expect(api.mock.calls.map((call) => call[0])).toEqual([
      "/auth/users", "/auth/users", "/auth/users/user-id/status"
    ]);
    expect(api.mock.calls[1][1]?.method).toBe("POST");
    expect(JSON.parse(String(api.mock.calls[1][1]?.body))).toEqual({ email: "employee@dreambau.com", name: "Employee", projects: ["oriso"] });
    expect(api.mock.calls[2][1]?.method).toBe("PATCH");
    expect(JSON.parse(String(api.mock.calls[2][1]?.body))).toEqual({ status: "disabled" });
  });

  it("rejects the legacy raw employee array instead of treating it as a valid response", async () => {
    await expect(loadTeamMembers(async () => [])).rejects.toThrow("invalid_team_members_response");
  });

  it("rejects malformed employee entries before the UI renders them", async () => {
    await expect(loadTeamMembers(async () => ({
      users: [{ id: "member-id", email: "member@dreambau.com", name: "Member", role: "member", status: "active", createdAt: "2026-09-01T10:00:00.000Z" }],
      sourceStatus: { infisical: "available" }
    }))).rejects.toThrow("invalid_team_members_response");
  });

  it("rejects malformed create responses before the UI stores them", async () => {
    await expect(createTeamMember(
      { email: "employee@dreambau.com", name: "Employee", projects: ["oriso"] },
      async () => ({ id: "user-id", enrollmentCode: "code" })
    )).rejects.toThrow("invalid_team_member_response");
  });

  it("rejects malformed status responses before the UI replaces a member", async () => {
    await expect(setTeamMemberStatus(
      "user-id",
      "disabled",
      async () => ({ id: "user-id", projects: ["oriso"] })
    )).rejects.toThrow("invalid_team_member_response");
  });
});
