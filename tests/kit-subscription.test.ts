import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
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
