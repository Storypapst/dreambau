import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";

it("authenticates both downloads without putting the token in curl arguments and preserves personal files", async () => {
  const root = await mkdtemp(join(tmpdir(), "kit-subscription-test-"));
  const token = "synthetic-test-token-not-a-credential";
  const kit = join(root, "kit");
  const payload = join(root, "payload");
  const bin = join(root, "bin");
  const audit = join(root, "audit");
  const readme = "Synthetic verified kit\n";
  const manifest = { version: "1.0.0", files: [{ path: "README.md", sha256: createHash("sha256").update(readme).digest("hex") }] };
  const authSeen: boolean[] = [];
  let bundle: Buffer;
  const server = createServer((req, res) => {
    authSeen.push(req.headers.authorization === `Bearer ${token}`);
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end(); return; }
    if (req.url === "/manifest") res.end(JSON.stringify(manifest));
    else if (req.url === "/bundle") res.end(bundle);
    else res.writeHead(404).end();
  });
  try {
    await mkdir(bin);
    await mkdir(payload);
    await mkdir(join(kit, "local"), { recursive: true });
    await writeFile(join(kit, "local", "personal.md"), "keep me");
    await writeFile(join(payload, "README.md"), readme);
    await writeFile(join(payload, "manifest.json"), JSON.stringify(manifest));
    execFileSync("tar", ["-czf", join(root, "bundle.tgz"), "-C", payload, "."]);
    bundle = await readFile(join(root, "bundle.tgz"));
    const realCurl = execFileSync("which", ["curl"], { encoding: "utf8" }).trim();
    // Observe the real curl invocation, then forward stdin and arguments unchanged.
    await writeFile(join(bin, "curl"), `#!${process.execPath}\nconst fs=require('fs'),cp=require('child_process');
const args=process.argv.slice(2);fs.appendFileSync(process.env.KIT_TEST_AUDIT,JSON.stringify({tokenInArgs:args.some(x=>x.includes(process.env.ORISO_KIT_TOKEN))})+'\\n');
const input=args.includes('@-')?fs.readFileSync(0):undefined;
const r=cp.spawnSync(${JSON.stringify(realCurl)},args,{input});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);\n`, { mode: 0o700 });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server not listening");
    const run = () => new Promise<{ code: number | null; output: string }>((done) => {
      const child = spawn("bash", [resolve("understand-kit/install.sh"), "--subscribe"], {
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ORISO_KIT_TOKEN: token,
          ORISO_TEST_ACCESS_IDENTITY: "synthetic-oriso", ORISO_KIT_HOME: kit,
          ORISO_KIT_BASE: `http://127.0.0.1:${address.port}`, KIT_TEST_AUDIT: audit }
      });
      let output = "";
      child.stdout.on("data", (chunk) => { output += chunk; });
      child.stderr.on("data", (chunk) => { output += chunk; });
      child.on("close", (code) => done({ code, output }));
    });
    const first = await run();
    expect(first.code, first.output).toBe(0);
    expect(await readFile(join(kit, "README.md"), "utf8")).toBe(readme);
    const second = await run();
    expect(second.code, second.output).toBe(0);
    expect(second.output).toContain("kit current");
    expect(await readFile(join(kit, "local", "personal.md"), "utf8")).toBe("keep me");
    expect(authSeen).toEqual([true, true, true]);
    expect((first.output + second.output).includes(token)).toBe(false);
    const observations = (await readFile(audit, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(observations.map((item) => item.tokenInArgs)).toEqual([false, false, false]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);

async function migrationFixture(options: { localVersion: string; helper?: boolean; advertised?: boolean; corrupt?: boolean }) {
  const root = await mkdtemp(join(tmpdir(), "kit-migration-test-"));
  const kit = join(root, "kit");
  const payload = join(root, "payload");
  const token = "synthetic-migration-bearer";
  const marker = join(root, "cli-invocations");
  const helper = 'printf "invoked\\n" >> "$KIT_TEST_CLI_MARKER"\n';
  const installer = await readFile(resolve("understand-kit/install.sh"), "utf8");
  const files: Record<string, string> = { "install.sh": installer, "README.md": "verified payload\n" };
  if (options.advertised !== false) files["test-access-install.sh"] = helper;
  const manifest = { version: "0.5.1", files: Object.entries(files).map(([path, content]) => ({
    path, sha256: createHash("sha256").update(content).digest("hex")
  })) };
  const requests: string[] = [];
  let bundle: Buffer;
  const server = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end(); return; }
    requests.push(req.url ?? "");
    if (req.url === "/manifest") res.end(JSON.stringify(manifest));
    else if (req.url === "/bundle") res.end(bundle);
    else res.writeHead(404).end();
  });
  try {
    await mkdir(join(kit, "local"), { recursive: true });
    await mkdir(payload);
    await writeFile(join(kit, "local/personal.md"), "personal canary\n");
    await writeFile(join(kit, "manifest.json"), JSON.stringify({ version: options.localVersion }));
    await writeFile(join(kit, "install.sh"), installer);
    if (options.helper) await writeFile(join(kit, "test-access-install.sh"), helper);
    for (const [name, content] of Object.entries(files)) await writeFile(join(payload, name), content);
    if (options.corrupt) await writeFile(join(payload, "test-access-install.sh"), "unverified helper\n");
    await writeFile(join(payload, "manifest.json"), JSON.stringify(manifest));
    execFileSync("tar", ["-czf", join(root, "bundle.tgz"), "-C", payload, "."]);
    bundle = await readFile(join(root, "bundle.tgz"));
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server not listening");
    return {
      kit, requests, marker,
      run: () => new Promise<{ code: number | null; output: string }>((done) => {
        const child = spawn("bash", [join(kit, "install.sh"), "--subscribe"], { env: {
          ...process.env, ORISO_KIT_TOKEN: token, ORISO_TEST_ACCESS_IDENTITY: "synthetic-oriso",
          ORISO_KIT_HOME: kit, ORISO_KIT_BASE: `http://127.0.0.1:${address.port}`, KIT_TEST_CLI_MARKER: marker
        } });
        let output = "";
        child.stdout.on("data", (chunk) => { output += chunk; });
        child.stderr.on("data", (chunk) => { output += chunk; });
        child.on("close", (code) => done({ code, output }));
      }),
      close: async () => {
        server.closeAllConnections();
        await new Promise<void>((done) => server.close(() => done()));
        await rm(root, { recursive: true, force: true });
      }
    };
  } catch (error) {
    server.close();
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

it("repairs a real 0.4.4 subscriber's missing new CLI helper on its next subscription", async () => {
  const f = await migrationFixture({ localVersion: "0.4.4" });
  try {
    // Verbatim first 278 lines of the released 0.4.4 installer, ending after --subscribe.
    // Full SHA256: 00bf9750e5ed99e28d1b2dedc97b08e864b3732ea97369e3333d22377caef4a8.
    // Prefix SHA256: 6e3cd78d5dfe4af91eb23c268c018e4a62017a2faca3a492a334789177861c89.
    // Omit unrelated full-install steps; retain the actual old payload allowlist.
    await copyFile(resolve("tests/fixtures/kit-0.4.4-install.sh"), join(f.kit, "install.sh"));
    const first = await f.run();
    expect(first.code, first.output).toBe(0);
    await expect(readFile(join(f.kit, "test-access-install.sh"))).rejects.toMatchObject({ code: "ENOENT" });
    const second = await f.run();
    expect(second.code, second.output).toBe(0);
    expect(await readFile(f.marker, "utf8")).toBe("invoked\n");
    expect(f.requests).toEqual(["/manifest", "/bundle", "/manifest", "/bundle"]);
    expect(await readFile(join(f.kit, "local/personal.md"), "utf8")).toBe("personal canary\n");
  } finally { await f.close(); }
}, 20_000);

it("repairs an equal-version kit missing its advertised helper in one subscription", async () => {
  const f = await migrationFixture({ localVersion: "0.5.1" });
  try {
    const result = await f.run();
    expect(result.code, result.output).toBe(0);
    expect(await readFile(f.marker, "utf8")).toBe("invoked\n");
    expect(f.requests).toEqual(["/manifest", "/bundle"]);
  } finally { await f.close(); }
}, 20_000);

it("does not redownload an intact current kit", async () => {
  const f = await migrationFixture({ localVersion: "0.5.1", helper: true });
  try {
    const result = await f.run();
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain("kit current");
    expect(f.requests).toEqual(["/manifest"]);
  } finally { await f.close(); }
}, 20_000);

it("does not repeatedly download an old server's kit without a CLI helper", async () => {
  const f = await migrationFixture({ localVersion: "0.5.1", advertised: false });
  try {
    const result = await f.run();
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain("kit current");
    expect(f.requests).toEqual(["/manifest"]);
  } finally { await f.close(); }
}, 20_000);

it("does not repair from an older remote release", async () => {
  const f = await migrationFixture({ localVersion: "0.6.0" });
  try {
    const result = await f.run();
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain("kit current");
    expect(f.requests).toEqual(["/manifest"]);
  } finally { await f.close(); }
}, 20_000);

it("rejects a repair with a mismatched helper checksum and preserves personal files", async () => {
  const f = await migrationFixture({ localVersion: "0.5.1", corrupt: true });
  try {
    const result = await f.run();
    expect(result.code, result.output).toBe(1);
    expect(result.output).toContain("bundle does not match its manifest");
    await expect(readFile(f.marker)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(f.kit, "local/personal.md"), "utf8")).toBe("personal canary\n");
  } finally { await f.close(); }
}, 20_000);
