import { mkdirSync, readFileSync, existsSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const [root, bin, node, revision, mode, project] = process.argv.slice(2);
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const assets = dirname(fileURLToPath(import.meta.url));
const instructions = join(root, 'instructions');
mkdirSync(instructions, { recursive: true, mode: 0o700 });
for (const name of ['OPERATING_RULES.md', 'FIRST_RUN.md', 'REVIEWER_PROMPT.md']) copyFileSync(join(assets, name), join(instructions, name));
const defaults = {
 TEST_ACCESS_IDENTITY: 'claude-cloud-oriso-dev', EVIDENCE_IDENTITY: 'claude-cloud-oriso-evidence-dev',
 TEST_ACCESS_AUTH_MODE: mode, EVIDENCE_AUTH_MODE: mode,
 TEST_ACCESS_URL: 'https://dreambau.com/testmails/api/v1', EVIDENCE_URL: 'https://evidence.dreambau.com/api/v1', EVIDENCE_PUBLIC_URL: 'https://evidence.dreambau.com',
 DREAMBAU_BROWSER_PROXY: mode === 'network-proxy' ? 'network-proxy' : 'direct',
 PLAYWRIGHT_BROWSERS_PATH: join(root, 'browsers'), DREAMBAU_CLOUD_ROOT: root,
 DREAMBAU_NODE_BINARY: node, DREAMBAU_SOURCE_REVISION: revision
};
const exports = Object.entries(defaults).map(([key, value]) => `if [ "\${${key}+x}" != x ]; then ${key}=${quote(value)}; fi\nexport ${key}`).join('\n');
writeFileSync(join(root, 'profile.sh'), `# Generated locally; contains no credentials. Safe in noninteractive shells.\n${exports}\nexport PATH=${quote(`${dirname(node)}:${bin}`)}:"$PATH"\nexport DREAMBAU_PROJECT_ROOT="\${CLAUDE_PROJECT_DIR:-$PWD}"\n`, { mode: 0o600 });
writeFileSync(join(root, 'routing.json'), JSON.stringify({ sourceRevision: revision, toolSource: join(root, 'sources', revision), projectRoot: 'runtime: CLAUDE_PROJECT_DIR or current working directory', instructions, onlineGraphManifest: 'https://understand.oriso.org/ua/current/manifest.json', privateCore: 'unavailable in cloud; do not invent contents' }, null, 2) + '\n', { mode: 0o600 });
writeFileSync(join(bin, 'dreambau-cloud-doctor'), `#!/bin/sh\nset -eu\n. ${quote(join(root, 'profile.sh'))}\nexec ${quote(node)} ${quote(join(root, 'doctor.mjs'))} "$@"\n`, { mode: 0o755 });
// A bounded managed block keeps all unrelated project instructions verbatim.
const target = join(project, 'CLAUDE.md');
const begin = '<!-- dreambau-cloud:begin -->'; const end = '<!-- dreambau-cloud:end -->';
const block = `${begin}\nRead ${join(instructions, 'OPERATING_RULES.md')} before project work.\nRuntime check: ${join(bin, 'dreambau-cloud-doctor')} --browser\nRouting: ${join(root, 'routing.json')}. Tools are separate from the current product checkout.\n${end}`;
const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
const first = current.indexOf(begin); const last = current.indexOf(end);
if ((first < 0) !== (last < 0) || (first >= 0 && last < first)) throw new Error('Incomplete existing managed CLAUDE.md block; preserve and repair it manually');
writeFileSync(target, first < 0 ? current + (current.endsWith('\n') || !current ? '' : '\n') + block + '\n' : current.slice(0, first) + block + current.slice(last + end.length));
