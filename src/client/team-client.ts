import { api as defaultApi } from "@/api";
import type { HumanUser, TeamMembersResponse } from "@/types";

type Api = (path: string, init?: RequestInit) => Promise<any>;

function isTeamMembersResponse(value: unknown): value is TeamMembersResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { users?: unknown; sourceStatus?: { infisical?: unknown; correlationId?: unknown } };
  if (!Array.isArray(candidate.users)) return false;
  if (candidate.sourceStatus?.infisical === "available") return true;
  return candidate.sourceStatus?.infisical === "degraded" && typeof candidate.sourceStatus.correlationId === "string";
}

export async function loadTeamMembers(api: Api = defaultApi) {
  const response: unknown = await api("/auth/users");
  if (!isTeamMembersResponse(response)) throw new Error("invalid_team_members_response");
  return response;
}

export function createTeamMember(
  input: { email: string; name: string; projects: Array<"oriso" | "orimo" | "dreambau"> },
  api: Api = defaultApi
) {
  return api("/auth/users", { method: "POST", body: JSON.stringify(input) }) as Promise<HumanUser & { enrollmentCode: string }>;
}

export function setTeamMemberStatus(id: string, status: "active" | "disabled", api: Api = defaultApi) {
  return api(`/auth/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }) as Promise<HumanUser>;
}
