import { describe, expect, it, vi } from "vitest";
import { createTeamMember, loadTeamMembers, setTeamMemberStatus } from "../src/client/team-client.js";

describe("team browser client", () => {
  it("uses only the protected human-user endpoints", async () => {
    const api = vi.fn(async () => []);
    await loadTeamMembers(api);
    await createTeamMember({ email: "employee@dreambau.com", name: "Employee", projects: ["oriso"] }, api);
    await setTeamMemberStatus("user-id", "disabled", api);
    expect(api.mock.calls.map((call) => call[0])).toEqual([
      "/auth/users", "/auth/users", "/auth/users/user-id/status"
    ]);
    expect(JSON.parse(String(api.mock.calls[1][1]?.body))).toEqual({ email: "employee@dreambau.com", name: "Employee", projects: ["oriso"] });
  });
});
