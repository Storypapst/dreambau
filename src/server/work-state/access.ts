import type Database from "better-sqlite3";
import { scopeSchema, WorkStateError, type RepoScope } from "./model.js";

/** Only stored grants authorize access, including when a caller supplies repositoryIds. */
export function createWorkStateAccess(sqlite: Database.Database) {
  function repositoryAllowed(scope: RepoScope, repositoryId: string) {
    return Boolean(sqlite.prepare(`SELECT 1 FROM repositories r JOIN repository_grants g ON g.repository_id=r.id
      WHERE r.id=? AND r.project=? AND r.active=1 AND g.project=r.project AND g.actor_id=?`).get(repositoryId, scope.project, scope.actorId));
  }
  function assertRepositories(scopeInput: RepoScope, repositoryIds: string[]) {
    const result = scopeSchema.safeParse(scopeInput);
    if (!result.success) throw new WorkStateError(403, "scope_denied");
    const scope = result.data;
    if (!repositoryIds.length) {
      if (!sqlite.prepare("SELECT 1 FROM internal_task_grants WHERE project=? AND actor_id=?").get(scope.project, scope.actorId)) throw new WorkStateError(403, "scope_denied");
    } else if (repositoryIds.some((id) => !repositoryAllowed(scope, id))) throw new WorkStateError(403, "scope_denied");
    return scope;
  }
  function itemAllowed(scope: RepoScope, itemId: string) {
    const item = sqlite.prepare("SELECT project FROM work_items WHERE id=?").get(itemId) as { project: string } | undefined;
    if (!item || item.project !== scope.project) return false;
    const required = sqlite.prepare("SELECT repository_id FROM work_item_required_repositories WHERE item_id=?").all(itemId) as Array<{ repository_id: string }>;
    if (required.some((link) => !repositoryAllowed(scope, link.repository_id))) return false;
    const needsInternal = !required.length || Boolean(sqlite.prepare("SELECT 1 FROM work_item_required_internal WHERE item_id=?").get(itemId));
    return !needsInternal || Boolean(sqlite.prepare("SELECT 1 FROM internal_task_grants WHERE project=? AND actor_id=?").get(scope.project, scope.actorId));
  }
  function assertItem(scopeInput: RepoScope, itemId: string) {
    const result = scopeSchema.safeParse(scopeInput);
    if (!result.success) throw new WorkStateError(403, "scope_denied");
    const scope = result.data;
    // Unknown and denied IDs share a response; no existence oracle.
    if (!itemAllowed(scope, itemId)) throw new WorkStateError(403, "scope_denied");
    return scope;
  }
  return { repositoryAllowed, assertRepositories, itemAllowed, assertItem };
}
