import { api as defaultApi } from "@/api";
import {
  humanAccessSources,
  teamProjects,
  type TeamMember,
  type TeamMembersResponse,
  type TeamProject
} from "@/types";

type Api = (path: string, init?: RequestInit) => Promise<any>;

const projects = new Set<string>(teamProjects);
const sources = new Set<string>(humanAccessSources);

function isTeamMember(entry: unknown): entry is TeamMember {
  if (!entry || typeof entry !== "object") return false;
  const user = entry as Record<string, unknown>;
  return typeof user.id === "string"
    && typeof user.email === "string"
    && typeof user.name === "string"
    && Array.isArray(user.projects)
    && user.projects.every((project) => typeof project === "string" && projects.has(project))
    && (user.role === "admin" || user.role === "member")
    && (user.status === "active" || user.status === "disabled")
    && typeof user.createdAt === "string"
    && (user.accessSources === undefined || (Array.isArray(user.accessSources)
      && user.accessSources.every((source) => typeof source === "string" && sources.has(source))));
}

function isTeamMembersResponse(value: unknown): value is TeamMembersResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { users?: unknown; sourceStatus?: { infisical?: unknown; correlationId?: unknown } };
  if (!Array.isArray(candidate.users) || !candidate.users.every(isTeamMember)) return false;
  if (candidate.sourceStatus?.infisical === "available") return true;
  return candidate.sourceStatus?.infisical === "degraded" && typeof candidate.sourceStatus.correlationId === "string";
}

export async function loadTeamMembers(api: Api = defaultApi) {
  const response: unknown = await api("/auth/users");
  if (!isTeamMembersResponse(response)) throw new Error("invalid_team_members_response");
  return response;
}

export async function createTeamMember(
  input: { email: string; name: string; projects: TeamProject[] },
  api: Api = defaultApi
) {
  const response: unknown = await api("/auth/users", { method: "POST", body: JSON.stringify(input) });
  if (!isTeamMember(response) || typeof (response as { enrollmentCode?: unknown }).enrollmentCode !== "string") {
    throw new Error("invalid_team_member_response");
  }
  return response as TeamMember & { enrollmentCode: string };
}

export async function setTeamMemberStatus(id: string, status: "active" | "disabled", api: Api = defaultApi) {
  const response: unknown = await api(`/auth/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
  if (!isTeamMember(response)) throw new Error("invalid_team_member_response");
  return response;
}
