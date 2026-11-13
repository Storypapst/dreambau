// Size budgets of the productions in bytes: the minified, uncompressed file site/p/<id>.js (shaders and music included).
// The runtime (site/shell.js, shader prelude, music kit) does not count, like system libraries for a native executable.
export const BUDGET = { '4k': 4096, '16k': 16384, '64k': 65536, 'kante4k': 4096, 'tragwerk16k': 16384, 'schlucht64k': 65536, 'signal60k': 60000, 'blickwinkel64k': 65536 };
export const IDS = Object.keys(BUDGET);
