import { describe, expect, it } from 'vitest';
import { directoryRoute, workspaceProject } from '../src/client/directory-route.js';

describe('Testmails workspace navigation', () => {
  it('keeps account filter URLs apart from shareable workspace routes', () => {
    expect(directoryRoute('/testmails/runs')).toBe('runs');
    expect(directoryRoute('/testmails/runs/')).toBe('runs');
    expect(directoryRoute('/testmails/releases')).toBe('releases');
    expect(directoryRoute('/testmails/runsecrets')).toBe('accounts');
    expect(directoryRoute('/testmails/')).toBe('accounts');
  });
  it('restores a permitted project and falls back when it was revoked', () => {
    expect(workspaceProject('?project=ORIMO', ['oriso','orimo'])).toBe('orimo');
    expect(workspaceProject('?project=DREAMBAU', ['oriso','orimo'])).toBe('oriso');
    expect(workspaceProject('?project=anything', ['orimo'])).toBe('orimo');
    expect(workspaceProject('?project=ORISO', [])).toBeUndefined();
  });
});
