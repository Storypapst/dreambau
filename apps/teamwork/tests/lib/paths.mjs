// Where things live, so that no check repeats a relative path.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'); // apps/teamwork
export const REPO = path.resolve(ROOT, '..', '..');                                       // the monorepo root
export const SITE = path.join(ROOT, 'site');
export const OPS = path.join(ROOT, 'ops');
export const TESTS = path.join(ROOT, 'tests');
export const EXAMPLE_LIST = path.join(ROOT, 'programs.example.json');
export const WORKFLOW = path.join(REPO, '.github', 'workflows', 'teamwork.yml');
export const ROOT_WORKFLOW = path.join(REPO, '.github', 'workflows', 'ci.yml');
