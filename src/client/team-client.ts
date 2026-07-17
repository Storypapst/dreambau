import { api as defaultApi } from "@/api";
import type { HumanUser } from "@/types";

type Api = (path: string, init?: RequestInit) => Promise<any>;

export function loadTeamMembers(api: Api = defaultApi) {
  return api("/auth/users") as Promise<HumanUser[]>;
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
