import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve("scripts/ops/storage-box-backup.py");
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "storage-box-backup-test-"));
  roots.push(root);
  const source = join(root, "source"); const state = join(root, "state");
  mkdirSync(source); mkdirSync(join(root, "private"), { mode: 0o700 });
  writeFileSync(join(source, "settings.txt"), "synthetic application settings\n");
  writeFileSync(join(source, "live.db"), "must not copy the live database\n");
  const privateFile = (name: string, value: string) => { const p = join(root, "private", name); writeFileSync(p, value, { mode: 0o600 }); return p; };
  const log = join(root, "commands.jsonl"); const remote = join(root, "fake-remote");
  const restic = join(root, "restic");
  writeFileSync(restic, `#!/usr/bin/env python3
import os,sys,json,pathlib,shutil
root=pathlib.Path(${JSON.stringify(remote)});root.mkdir(exist_ok=True)
a=sys.argv[1:]
with open(${JSON.stringify(log)},'a') as f:f.write(json.dumps({'args':a,'envKeys':list(os.environ),'hasPasswordFile':'RESTIC_PASSWORD_FILE' in os.environ})+'\\n')
command=next((x for x in a if x in ['cat','init','backup','dump','check','tag']),None)
i=a.index(command) if command else -1
if command=='backup':
 sid=('%064x'% (len(list(root.glob('snapshot-*')))+1));dest=root/('snapshot-'+sid);dest.mkdir()
 if '--stdin' in a:
  name=a[a.index('--stdin-filename')+1];p=dest/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(sys.stdin.buffer.read())
 else:
  paths=a[a.index('--')+1:]
  excludes=[a[n+1] for n,x in enumerate(a) if x=='--exclude']
  for item in paths:
   src=pathlib.Path(item);dst=dest/str(src).lstrip('/')
   if src.is_file():dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
   else:
    for p in src.rglob('*'):
     if p.is_file() and p.suffix not in ['.db','.sqlite']:
      q=dest/str(p).lstrip('/');q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
 print(json.dumps({'message_type':'summary','snapshot_id':sid}))
 if pathlib.Path(sys.argv[0]).name.endswith('warn'):sys.exit(3)
elif command=='dump':
 p=root/('snapshot-'+a[i+1])/a[i+2].lstrip('/');sys.stdout.buffer.write(p.read_bytes())
elif command=='cat':print('{}')
`, { mode: 0o700 });
  const config: any = {
    version: 1, hostLabel: "synthetic-host", stateDirectory: state,
    binaries: { restic, ssh: "/usr/bin/ssh", docker: "/usr/bin/true", mc: "/usr/bin/true" },
    storageBox: { host: "u123456.your-storagebox.de", user: "u123456-sub1", repositoryPath: "encrypted/application",
      identityFile: privateFile("ssh-key", "synthetic-not-a-key"), knownHostsFile: privateFile("known_hosts", "synthetic-pinned-host-key"),
      passwordFile: privateFile("repository-password", "synthetic-repository-password") },
    fileSources: [source], sqlite: [], databaseDumps: [], objectMirrors: [],
    excludedPaths: [join(root, "archive")], liveDatabasePaths: [join(source, "live.db")],
    maxStagingBytes: 1024 * 1024, minFreeBytes: 0, verificationPercent: 100,
    coverage: { included: ["synthetic application configs"], omitted: ["mail", "MongoDB", "Redis", "full OS"] }
  };
  const configPath = join(root, "backup.json");
  const save = () => writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 }); save();
  const run = (command = "backup", extra: string[] = []) => {
    save(); return spawnSync("python3", [script, command, "--config", configPath, ...extra], { encoding: "utf8",
      env: { ...process.env, RESTIC_PASSWORD: "poison-must-not-leak", AWS_SECRET_ACCESS_KEY: "poison-must-not-leak" } });
  };
  const commands = () => existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map(x => JSON.parse(x)) : [];
  return { root, source, state, restic, config, configPath, run, commands, remote };
}

describe("Storage Box encrypted offhost backup operator", () => {
  it("provisions only the shared lock file at boot and permits it through the read-only service sandbox", () => {
    const unit = readFileSync(resolve("scripts/ops/storage-box-backup.service.example"), "utf8");
    const writable = [...unit.matchAll(/^ReadWritePaths=(.+)$/gm)].flatMap(match => match[1].split(/\s+/));
    const lock = "/run/lock/dreambau-evidence-data.lock";
    expect(writable).toContain(lock);
    expect(writable).not.toContain("/run/lock");
    expect(unit).toContain("After=network-online.target docker.service systemd-tmpfiles-setup.service");
    const tmpfiles = readFileSync(resolve("scripts/ops/storage-box-backup.tmpfiles.example"), "utf8");
    expect(tmpfiles.split("\n").filter(line => line.startsWith("f "))).toEqual([`f ${lock} 0600 root root - -`]);
  });
  it("plans without contacting storage or exposing credentials and names incomplete coverage", () => {
    const f = fixture(); const r = f.run("plan");
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ status: "planned", fullSystemBackup: false, coverage: { omitted: ["mail", "MongoDB", "Redis", "full OS"] } });
    expect(f.commands()).toEqual([]);
    expect(r.stdout + r.stderr).not.toContain("synthetic-repository-password");
  });
  it("backs up explicit files with pinned SFTP, excludes live DBs, verifies restore and isolates the environment", () => {
    const f = fixture(); const r = f.run();
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ status: "healthy", restoreVerified: true, fullSystemBackup: false });
    const calls = f.commands(); const backup = calls.find(c => c.args.includes("backup"));
    expect(backup.args).toContain("--no-cache");
    expect(backup.args.join(" ")).toContain("StrictHostKeyChecking=yes");
    expect(backup.args.join(" ")).toContain("IdentitiesOnly=yes");
    expect(backup.args).toContain(join(f.source, "live.db"));
    expect(backup.envKeys).not.toContain("RESTIC_PASSWORD");
    expect(backup.envKeys).not.toContain("AWS_SECRET_ACCESS_KEY");
    expect(calls.some(c => c.args.includes("dump"))).toBe(true);
    expect(calls.some(c => c.args.includes("storage-box-accepted"))).toBe(true);
    expect(r.stdout + r.stderr).not.toContain("synthetic-repository-password");
  });
  it("includes committed WAL-only writes in the online SQLite backup and restored database", async () => {
    const f = fixture(); const db = join(f.source, "state.sqlite");
    const live = spawn("python3", ["-u", "-c", "import sqlite3,sys,time;c=sqlite3.connect(sys.argv[1]);c.execute('pragma journal_mode=WAL');c.execute('pragma wal_autocheckpoint=0');c.execute('create table proof(value text)');c.commit();c.execute('pragma wal_checkpoint(TRUNCATE)');c.execute(\"insert into proof values ('committed-wal-only')\");c.commit();print('ready',flush=True);time.sleep(60)", db]);
    try {
      await new Promise<void>((done, reject) => { live.stdout.once("data", () => done()); live.once("error", reject); });
      expect(existsSync(db + "-wal")).toBe(true);
      f.config.sqlite = [{ name: "application", path: db }];
      const r = f.run(); expect(r.status, r.stderr).toBe(0);
      expect(JSON.parse(r.stdout)).toMatchObject({ sqliteValidated: 1, restoreVerified: true });
      const snapshots = readdirSync(f.remote).filter(x => x.startsWith("snapshot-"));
      const restored = join(f.remote, snapshots[0], f.state.replace(/^\//, ""), "staging/sqlite/application.snapshot");
      expect(execFileSync("python3", ["-c", "import sqlite3,sys;print(sqlite3.connect(sys.argv[1]).execute('select value from proof').fetchone()[0])", restored], { encoding: "utf8" }).trim()).toBe("committed-wal-only");
    } finally { live.kill("SIGTERM"); }
  });
  it("fails the receipt on restic live-file warnings rather than publishing a healthy snapshot", () => {
    const f = fixture(); const warn = f.restic + "-warn"; writeFileSync(warn, readFileSync(f.restic), { mode: 0o700 }); f.config.binaries.restic = warn;
    const r = f.run(); expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout)).toMatchObject({ status: "failed", errorCode: "restic_failed" });
    expect(f.commands().some(c => c.args.includes("tag"))).toBe(false);
  });
  it("refuses unsafe credentials before any remote action", () => {
    const f = fixture(); chmodSync(f.config.storageBox.passwordFile, 0o644);
    const r = f.run(); expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).errorCode).toBe("private_file_required"); expect(f.commands()).toEqual([]);
  });
  it("refuses to capture its own state or a remote repository path traversal", () => {
    const f = fixture(); f.config.fileSources = [f.root];
    let r = f.run(); expect(r.status).toBe(1); expect(f.commands()).toEqual([]);
    f.config.fileSources = [f.source]; f.config.storageBox.repositoryPath = "../other";
    r = f.run(); expect(r.status).toBe(1); expect(f.commands()).toEqual([]);
  });
  it("honors the free-space reserve without creating a remote snapshot", () => {
    const f = fixture(); f.config.minFreeBytes = Number.MAX_SAFE_INTEGER;
    const r = f.run(); expect(r.status).toBe(1); expect(JSON.parse(r.stdout).errorCode).toBe("disk_reserve");
    expect(f.commands().some(c => c.args.includes("backup"))).toBe(false);
  });

  it.each(["../escape", "runs/test/file"])("rejects unsafe or oversized object replicas before copying (%s)", (key) => {
    const f = fixture(); const mc = join(f.root, "mc"); const dir = join(f.root, "private/mc"); mkdirSync(dir, { mode: 0o700 });
    writeFileSync(join(dir, "config.json"), "{}", { mode: 0o600 });
    writeFileSync(mc, `#!/usr/bin/env python3\nimport json\nprint(json.dumps({'status':'success','type':'file','key':${JSON.stringify(key)},'size':2097152}))\n`, { mode: 0o700 });
    f.config.binaries.mc = mc; f.config.objectMirrors = [{ name: "evidence", alias: "private", bucket: "evidence", mcConfigDirectory: dir }];
    const r = f.run(); expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).errorCode).toBe(key.startsWith("..") ? "unsafe_object_key" : "staging_limit");
    expect(f.commands().some(c => c.args.includes("backup"))).toBe(false);
  });

  it("fails a logical dump producer without marking its partial remote snapshot accepted", () => {
    const f = fixture(); const docker = join(f.root, "docker");
    writeFileSync(docker, "#!/bin/sh\nprintf 'incomplete synthetic dump'\nexit 5\n", { mode: 0o700 });
    f.config.binaries.docker = docker;
    const dataPath = join(f.root, "postgres-live"); f.config.liveDatabasePaths.push(dataPath);
    f.config.databaseDumps = [{ name: "app", engine: "postgres", container: "synthetic", database: "app", user: "backup", dataPath,
      transactionalOnly: true, passwordFile: f.config.storageBox.passwordFile }];
    const r = f.run(); expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).errorCode).toBe("database_dump_failed");
    expect(f.commands().some(c => c.args.includes("storage-box-accepted"))).toBe(false);
    expect(r.stdout + r.stderr).not.toContain("incomplete synthetic dump");
  });

  it("streams and reads back a logical database dump without staging it", () => {
    const f = fixture(); const docker = join(f.root, "docker");
    writeFileSync(docker, "#!/bin/sh\nprintf 'PGDMP-synthetic-consistent-dump'\n", { mode: 0o700 });
    f.config.binaries.docker = docker;
    const dataPath = join(f.root, "postgres-live"); f.config.liveDatabasePaths.push(dataPath);
    f.config.databaseDumps = [{ name: "app", engine: "postgres", container: "synthetic", database: "app", user: "backup", dataPath,
      transactionalOnly: true, passwordFile: f.config.storageBox.passwordFile }];
    const r = f.run(); expect(r.status, r.stdout).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ status: "healthy", restoreVerified: true });
    const calls = f.commands();
    expect(calls.some(c => c.args.includes("database-app.pgdump") && c.args.includes("--stdin"))).toBe(true);
    expect(calls.every(c => !c.envKeys.includes("PGPASSWORD"))).toBe(true);
  });

  it("replicates logical object bytes and metadata without S3 key/file-directory collisions", () => {
    const f = fixture(); const mc = join(f.root, "mc"); const dir = join(f.root, "private/mc"); mkdirSync(dir, { mode: 0o700 });
    writeFileSync(join(dir, "config.json"), "{}", { mode: 0o600 });
    writeFileSync(mc, `#!/usr/bin/env python3
import sys,json
objects={'private/evidence/key':b'first','private/evidence/key/child':b'second'}
a=sys.argv[1:]
if 'ls' in a:
 for k,v in objects.items():print(json.dumps({'status':'success','type':'file','key':k.removeprefix('private/evidence/'),'size':len(v),'etag':'stable'}))
elif 'stat' in a:print(json.dumps({'status':'success','size':len(objects[a[-1]]),'etag':'stable','metadata':{'Content-Type':'text/plain'}}))
elif 'cat' in a:sys.stdout.buffer.write(objects[a[-1]])
`, { mode: 0o700 });
    f.config.binaries.mc = mc; f.config.objectMirrors = [{ name: "evidence", alias: "private", bucket: "evidence", mcConfigDirectory: dir }];
    const r = f.run(); expect(r.status, r.stdout).toBe(0);
    const snapshots = readdirSync(f.remote).filter(x => x.startsWith("snapshot-"));
    const manifest = JSON.parse(readFileSync(join(f.remote, snapshots[0], f.state.replace(/^\//, ""), "staging/object-metadata/evidence.json"), "utf8"));
    expect(manifest.objects.map((x: any) => x.key)).toEqual(["key", "key/child"]);
    expect(new Set(manifest.objects.map((x: any) => x.replicaPath)).size).toBe(2);
    expect(manifest.objects.every((x: any) => x.contentType === "text/plain" && /^[0-9a-f]{64}$/.test(x.sha256))).toBe(true);
  });

  it.each(["added", "resized", "replaced", "deleted"])("validates baseline objects when the final inventory has an object %s", (change) => {
    const f = fixture(); const mc = join(f.root, "mc"); const dir = join(f.root, "private/mc"); mkdirSync(dir, { mode: 0o700 });
    writeFileSync(join(dir, "config.json"), "{}", { mode: 0o600 });
    const inventoryCalls = join(f.root, "inventory-calls");
    writeFileSync(mc, `#!/usr/bin/env python3
import sys,json,pathlib
a=sys.argv[1:];counter=pathlib.Path(${JSON.stringify(inventoryCalls)})
if 'ls' in a:
 n=int(counter.read_text())+1 if counter.exists() else 1;counter.write_text(str(n))
 rows=[{'status':'success','type':'file','key':'baseline','size':5,'etag':'stable'}]
 if n>1:
  change=${JSON.stringify(change)}
  if change=='added':rows.append({'status':'success','type':'file','key':'new-upload','size':3,'etag':'new'})
  elif change=='resized':rows[0]['size']=6
  elif change=='replaced':rows[0]['etag']='changed'
  elif change=='deleted':rows=[]
 for row in rows:print(json.dumps(row))
elif 'stat' in a:print(json.dumps({'status':'success','size':5,'etag':'stable','metadata':{'Content-Type':'text/plain'}}))
elif 'cat' in a:sys.stdout.buffer.write(b'first')
`, { mode: 0o700 });
    f.config.binaries.mc = mc; f.config.objectMirrors = [{ name: "evidence", alias: "private", bucket: "evidence", mcConfigDirectory: dir }];
    const r = f.run();
    expect(readFileSync(inventoryCalls, "utf8")).toBe("2");
    if (change === "added") {
      expect(r.status, r.stdout).toBe(0);
      const snapshots = readdirSync(f.remote).filter(x => x.startsWith("snapshot-"));
      const manifest = JSON.parse(readFileSync(join(f.remote, snapshots[0], f.state.replace(/^\//, ""), "staging/object-metadata/evidence.json"), "utf8"));
      expect(manifest.objects.map((x: any) => x.key)).toEqual(["baseline"]);
      expect(manifest.objects[0]).toMatchObject({ size: 5, etag: "stable", contentType: "text/plain" });
      expect(manifest.objects[0].sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.parse(r.stdout)).toMatchObject({ status: "healthy", restoreVerified: true });
    } else {
      expect(r.status).toBe(1);
      expect(JSON.parse(r.stdout)).toMatchObject({ status: "failed", errorCode: "object_inventory_changed" });
      expect(f.commands().some(c => c.args.includes("storage-box-accepted"))).toBe(false);
    }
  });

  it.each(["own", "shared"])("does not overlap an active %s lock or overwrite previous health", async (kind) => {
    const f = fixture(); mkdirSync(f.state, { mode: 0o700 });
    const health = '{"status":"healthy","proof":"preserve"}\n'; writeFileSync(join(f.state, "health.json"), health, { mode: 0o600 });
    const lockPath = kind === "own" ? join(f.state, "backup.lock") : join(f.root, "evidence-data.lock");
    if (kind === "shared") f.config.coordinationLocks = [lockPath];
    const locked = spawn("python3", ["-u", "-c", "import fcntl,sys,time;f=open(sys.argv[1],'w');fcntl.flock(f,fcntl.LOCK_EX);print('ready',flush=True);time.sleep(60)", lockPath]);
    try {
      await new Promise<void>((done, reject) => { locked.stdout.once("data", () => done()); locked.once("error", reject); });
      const r = f.run(); expect(r.status).toBe(1); expect(JSON.parse(r.stdout).errorCode).toBe("backup_locked");
      expect(f.commands()).toEqual([]); expect(readFileSync(join(f.state, "health.json"), "utf8")).toBe(health);
    } finally { locked.kill("SIGTERM"); }
  });
});
