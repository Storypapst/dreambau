import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { check, same, run } from '../lib/check.mjs';
import { ROOT } from '../lib/paths.mjs';

const execute = promisify(execFile);
await run(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teamwork-status-'));
  const file = path.join(dir, 'programs.json'), out = path.join(dir, 'data'), history = path.join(dir, 'history');
  fs.mkdirSync(out); fs.mkdirSync(history);
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ path: req.url, headers: req.headers });
    const code = Number(req.url.slice(1));
    res.writeHead(code, { Location: 'https://never-follow.example.test/' });
    res.flushHeaders();
    // A header-only answer must count, even though its body never finishes.
    if (code !== 200) res.end();
  });
  const sockets = new Set();
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const slow = net.createServer((socket) => {
    sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket));
    let index = 0;
    const response = 'HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n';
    const interval = setInterval(() => { if (index < response.length) socket.write(response[index++]); }, 100);
    socket.on('close', () => clearInterval(interval));
  });
  await new Promise((resolve) => slow.listen(0, '127.0.0.1', resolve));
  function list(programs) {
    return { format: 1, zones: [{ id: 'zone', name: 'Testzone', color: 'cyan' }], programs };
  }
  function program(id, probe) {
    return { id, name: id, purpose: 'Ein erfundenes Testprogramm', zone: 'zone', url: 'https://' + id + '.example.test/', probe, operatorNote: 'never public' };
  }
  async function cli(extra = []) {
    try {
      const result = await execute('python3', [path.join(ROOT, 'status/teamwork_status.py'), '--list', file, '--out', out, '--history', history, '--retry-delay', '0.01', ...extra], { timeout: 15000 });
      return { ...result, status: 0 };
    } catch (error) { return { status: error.code, stdout: error.stdout || '', stderr: error.stderr || '' }; }
  }
  try {
    const codes = [200, 301, 401, 403, 503];
    fs.writeFileSync(file, JSON.stringify(list(codes.map((code) => program('p' + code, 'http://127.0.0.1:' + port + '/' + code)))));
    const result = await cli();
    check('C11 C12 checks HTTP status headers without following redirects or reading bodies', result.status === 0, result.stderr);
    if (result.status === 0) {
      const catalogue = JSON.parse(fs.readFileSync(path.join(out, 'programs.json')));
      const status = JSON.parse(fs.readFileSync(path.join(out, 'status.json')));
      if (!same('C11 200, redirects and login-required answers are reachable', status.reachable, ['p200', 'p301', 'p401', 'p403'])) console.log(result.stdout);
      const counts = codes.map((code) => requests.filter((r) => r.path === '/' + code).length);
      if (!same('C12 only the failing program receives one retry', counts, [1, 1, 1, 1, 2])) console.log(result.stdout);
      check('C11 probes use their own User-Agent, no cookies or authorization', requests.every((r) => r.headers['user-agent'] === 'dreambau-teamwork-status/1' && !r.headers.cookie && !r.headers.authorization));
      check('C18 public catalogue is projected field by field', catalogue.programs.length === 5 && !JSON.stringify(catalogue).includes('probe') && !JSON.stringify(catalogue).includes('operatorNote'));
      same('C18 public status has only format, checkedAt and reachable', Object.keys(status).sort(), ['checkedAt', 'format', 'reachable']);
      check('C18 outputs are compact newline-terminated UTF-8 with readable file modes', ['programs.json', 'status.json'].every((name) => fs.readFileSync(path.join(out, name), 'utf8').endsWith('\n') && (fs.statSync(path.join(out, name)).mode & 0o777) === 0o644));
      check('C19 private history is dated, 0600 and copied once for an unchanged list', fs.readdirSync(history).length === 1 && (fs.statSync(path.join(history, fs.readdirSync(history)[0])).mode & 0o777) === 0o600);
      const requestCount = requests.length;
      const again = await cli(['--validate']);
      check('C10 validate performs no probes or writes', again.status === 0 && fs.readdirSync(history).length === 1 && requests.length === requestCount);
      check('C11 output contains no address, probe or body', !result.stdout.includes('127.0.0.1') && !result.stdout.includes('https://') && result.stdout.includes('attempt=2'));
    }
    fs.writeFileSync(file, JSON.stringify(list([program('slow', 'http://127.0.0.1:' + slow.address().port + '/')])));
    const before = Date.now();
    const timeout = await cli(['--timeout', '0.4']);
    check('C13 byte-by-byte status lines cannot stretch the hard timeout', timeout.status === 0 && Date.now() - before < 4000 && timeout.stdout.includes('reason=timeout'));
    const previous = ['programs.json', 'status.json'].map((name) => fs.existsSync(path.join(out, name)) ? fs.readFileSync(path.join(out, name), 'utf8') : null);
    const capped = await cli(['--max-run', '0.1']);
    check('C15 run time cap exits 4 and preserves public outputs', capped.status === 4 && ['programs.json', 'status.json'].every((name, i) => (fs.existsSync(path.join(out, name)) ? fs.readFileSync(path.join(out, name), 'utf8') : null) === previous[i]));
    const only = await cli(['--check-only', '--timeout', '0.4']);
    check('C11 check-only runs probes without publishing', only.status === 0 && ['programs.json', 'status.json'].every((name, i) => fs.readFileSync(path.join(out, name), 'utf8') === previous[i]));
    fs.writeFileSync(file, JSON.stringify({ format: 1, zones: [{ id: 'verwaltung', name: 'Verwaltung', color: 'lime', ring: 'inner' }], programs: [] }));
    const empty = await cli();
    check('C18 empty operator input projects truthful empty public data', empty.status === 0 && JSON.parse(fs.readFileSync(path.join(out, 'programs.json'))).programs.length === 0);
  } finally {
    for (const socket of sockets) socket.destroy();
    await Promise.all([new Promise((resolve) => server.close(resolve)), new Promise((resolve) => slow.close(resolve))]);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
