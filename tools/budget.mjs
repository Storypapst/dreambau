// Size budgets of the productions in bytes: the minified, uncompressed file site/p/<id>.js (shaders and music included).
// The runtime (site/shell.js, shader prelude, music kit) does not count, like system libraries for a native executable.
export const BUDGET = { '4k': 4096, '16k': 16384 };   // '64k': 65536 follows with the Skyline production
export const IDS = Object.keys(BUDGET);
