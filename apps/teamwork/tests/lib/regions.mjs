// The region rule of the page files (ticket 1, point 4). site/teamwork.js and site/teamwork.css are laid out in
// banner-delimited regions, one or more per slice, so that parallel slices edit different regions only and their
// changes merge without a conflict.
//
//   script banner     // ==== region: <name> ====           and   // ==== end region: <name> ====
//   stylesheet banner /* ==== region: <name> ==== */        and   /* ==== end region: <name> ==== */
//
// Every banner appears once, in the order below. A region starts with one comment line that names the slice that fills
// it ("Slice 7 ...") and ends with one empty line before its closing banner. In the script, region `boot` calls one
// function `initX(page)` per later region, in the order of the regions, and each of those functions is defined in its
// own region (an empty body where that slice has not arrived), so a later slice replaces a body and never touches the
// call list.
export const SCRIPT_REGIONS = ['texts', 'contract', 'state', 'render', 'layout', 'place', 'canvas', 'motion', 'interact', 'refresh', 'boot'];
export const STYLE_REGIONS = ['tokens', 'page', 'tiles', 'states', 'phone', 'constellation', 'canvas', 'motion', 'interact', 'refresh', 'notice'];
// The functions that boot calls, each with the region that defines it.
export const BOOT_CALLS = [
  ['initContract', 'contract'], ['initState', 'state'], ['initRender', 'render'], ['initLayout', 'layout'], ['initPlace', 'place'],
  ['initCanvas', 'canvas'], ['initMotion', 'motion'], ['initInteract', 'interact'], ['initRefresh', 'refresh'],
];

const REGIONS = { script: SCRIPT_REGIONS, style: STYLE_REGIONS };
const BANNERS = {
  script: (name, end) => `// ==== ${end ? 'end region' : 'region'}: ${name} ====`,
  style: (name, end) => `/* ==== ${end ? 'end region' : 'region'}: ${name} ==== */`,
};
const COMMENT_LINE = {
  script: /^\/\/.*\bSlice \d+/,
  style: /^\/\*.*\bSlice \d+.*\*\/$/,
};
// Anything that looks like a banner, however it is mangled.
const LOOKS_LIKE_A_BANNER = /={3,}\s*(?:end\s+)?region\b/i;

// Reads the banners of a text: [{ line, name, end }] for each exact banner and a problem for each mangled one.
function readBanners(lines, kind) {
  const exact = new Map();
  for (const name of REGIONS[kind]) {
    exact.set(BANNERS[kind](name, false), { name, end: false });
    exact.set(BANNERS[kind](name, true), { name, end: true });
  }
  const banners = [];
  const problems = [];
  lines.forEach((text, index) => {
    if (exact.has(text)) banners.push({ line: index, ...exact.get(text) });
    else if (LOOKS_LIKE_A_BANNER.test(text)) problems.push(`line ${index + 1} looks like a banner but is not one of the expected form: ${JSON.stringify(text.slice(0, 70))}`);
  });
  return { banners, problems };
}

// The problems of a text, as a list of sentences (an empty list is a text that keeps the rule). kind: 'script' or 'style'.
export function regionProblems(text, kind) {
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  const { banners, problems } = readBanners(lines, kind);
  const names = REGIONS[kind];

  // Every banner once, in order.
  const wanted = names.flatMap((name) => [`region: ${name}`, `end region: ${name}`]);
  const found = banners.map((banner) => `${banner.end ? 'end region' : 'region'}: ${banner.name}`);
  for (const banner of wanted) {
    const count = found.filter((item) => item === banner).length;
    if (count !== 1) problems.push(`the banner "${banner}" appears ${count} times, expected once`);
  }
  const inOrder = found.filter((item) => wanted.includes(item));
  const orderOk = inOrder.length === wanted.length && inOrder.every((item, index) => item === wanted[index]);
  if (!orderOk && problems.length === 0) problems.push(`the banners are not in the expected order: ${inOrder.join(', ')}`);
  if (problems.length > 0) return problems;

  // Inside each region: one comment line that names the slice at the top, one empty line before the closing banner.
  const where = new Map();
  for (const name of names) {
    const open = banners.find((banner) => banner.name === name && !banner.end).line;
    const close = banners.find((banner) => banner.name === name && banner.end).line;
    where.set(name, { open, close });
    const body = lines.slice(open + 1, close);
    if (body.length < 2) {
      problems.push(`region ${name} is too short: it needs a comment line and an empty line`);
      continue;
    }
    if (!COMMENT_LINE[kind].test(body[0])) problems.push(`region ${name} does not start with one comment line that names the slice ("Slice N"): ${JSON.stringify(body[0].slice(0, 70))}`);
    if (body[body.length - 1] !== '') problems.push(`region ${name} does not end with an empty line before its closing banner`);
    else if (body.length >= 3 && body[body.length - 2] === '') problems.push(`region ${name} ends with more than one empty line before its closing banner`);
  }

  // The script's boot region calls one function per later region, in order, and each function is defined in its own region.
  if (kind === 'script') {
    const inside = (name) => lines.slice(where.get(name).open + 1, where.get(name).close).join('\n');
    const boot = inside('boot');
    const positions = BOOT_CALLS.map(([fn]) => {
      const matches = [...boot.matchAll(new RegExp(`\\b${fn}\\(page\\)\\s*;`, 'g'))];
      if (matches.length !== 1) problems.push(`region boot calls ${fn}(page) ${matches.length} times, expected once`);
      return matches.length === 1 ? matches[0].index : -1;
    });
    if (positions.every((position) => position >= 0) && positions.some((position, index) => index > 0 && position < positions[index - 1])) {
      problems.push(`region boot calls the functions out of order, expected ${BOOT_CALLS.map(([fn]) => fn).join(', ')}`);
    }
    for (const [fn, region] of BOOT_CALLS) {
      const definition = new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s+${fn}\\s*\\(`);
      const definitions = lines.flatMap((line, index) => (definition.test(line) ? [index] : []));
      if (definitions.length !== 1) problems.push(`${fn} is defined ${definitions.length} times, expected once in region ${region}`);
      else if (definitions[0] < where.get(region).open || definitions[0] > where.get(region).close) problems.push(`${fn} is defined outside region ${region}`);
    }
  }
  return problems;
}

// A text that keeps the rule, for the checks that prove the rule on made-up input.
export function sampleText(kind) {
  const lines = [];
  for (const name of REGIONS[kind]) {
    lines.push(BANNERS[kind](name, false));
    lines.push(kind === 'script' ? `// Slice 1 fills ${name}.` : `/* Slice 1 fills ${name}. */`);
    if (kind === 'script' && name === 'boot') {
      lines.push('function boot(page) {');
      for (const [fn] of BOOT_CALLS) lines.push(`  ${fn}(page);`);
      lines.push('}');
    } else if (kind === 'script') {
      const call = BOOT_CALLS.find(([, region]) => region === name);
      lines.push(call ? `function ${call[0]}(page) {}` : `const ${name}Value = 1;`);
    } else {
      lines.push(`.${name} { margin: 0; }`);
    }
    lines.push('');
    lines.push(BANNERS[kind](name, true));
  }
  return `${lines.join('\n')}\n`;
}

// The text between the banners of one region (without the banners), or null when the region is not there.
export function regionBody(text, kind, name) {
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  const open = lines.indexOf(BANNERS[kind](name, false));
  const close = lines.indexOf(BANNERS[kind](name, true));
  return open === -1 || close === -1 || close < open ? null : lines.slice(open + 1, close).join('\n');
}
