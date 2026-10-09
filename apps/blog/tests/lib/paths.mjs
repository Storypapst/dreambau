// Where things live, so that no check repeats a relative path.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'); // apps/blog
export const REPO = path.resolve(ROOT, '..', '..');                                       // the monorepo root
export const TESTS = path.join(ROOT, 'tests');
export const FIXTURES = path.join(TESTS, 'fixtures');
export const FIXTURE_POST = path.join(FIXTURES, '2026', 'ein-film-der-in-eine-mail-passt.md');
export const WORKFLOW = path.join(REPO, '.github', 'workflows', 'blog.yml');
export const TEAMWORK_WORKFLOW = path.join(REPO, '.github', 'workflows', 'teamwork.yml');
