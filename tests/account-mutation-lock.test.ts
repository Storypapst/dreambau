import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { acquireAccountMutationLock } from "../src/server/account-mutation-lock.js";
import { createHash } from "node:crypto";
import express from "express";
import request from "supertest";
import { vi } from "vitest";
import { createTestAccessRouter } from "../src/server/test-access.js";
import { createDatabase } from "../src/server/db.js";
import type { TestAccessRecord } from "../src/server/infisical-provider.js";

it("excludes independent process owners on the same data volume until release", async () => {
  const directory = await mkdtemp(join(tmpdir(), "testmails-lock-"));
  const databasePath = join(directory, "registry.sqlite");
  try {
    const release = await acquireAccountMutationLock(databasePath, "dev:fixture@example.invalid");
    expect(release).not.toBeNull();
    await expect(acquireAccountMutationLock(databasePath, "dev:fixture@example.invalid")).resolves.toBeNull();
    const other = await acquireAccountMutationLock(databasePath, "dev:another@example.invalid");
    expect(other).not.toBeNull();
    const child = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", `
      import {mkdir} from 'node:fs/promises';import {createHash} from 'node:crypto';
      const lock=process.argv[1]+'.account-locks/'+createHash('sha256').update(process.argv[2]).digest('hex');
      try{await mkdir(lock);process.exitCode=1;}catch(e){if(e.code!=='EEXIST')throw e;}
    `, databasePath, "dev:fixture@example.invalid"]);
    expect(child.stderr).toBe("");
    await release!(); await other!();
    const next = await acquireAccountMutationLock(databasePath, "dev:fixture@example.invalid");
    expect(next).not.toBeNull(); await next!();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it("blocks the real machine TOTP route while an operator owns its account lock", async () => {
  const directory=await mkdtemp(join(tmpdir(),"testmails-route-lock-"));
  const databasePath=join(directory,"registry.sqlite");
  const database=createDatabase(databasePath);
  const token="synthetic-machine-token";
  const record:TestAccessRecord={id:"oriso/dev/marge-fixture",project:"oriso",environment:"dev",kind:"app-user",displayName:"Marge fixture",email:"marge.simpson@trail.ist",username:"marge-fixture",roles:["consultant"],secret:"synthetic-only",permissionsDescription:"Synthetic",loginUrl:"https://dev.oriso.org",responsiblePerson:"qa",createdAt:"2026-10-09T00:00:00.000Z",updatedAt:"2026-10-09T00:00:00.000Z",expiresAt:null,shared:true,rotationStatus:"current",documentationUrl:"https://example.invalid"};
  const enrollTotp=vi.fn(async()=>({recordId:record.id,updatedAt:record.updatedAt}));
  const app=express();app.use(express.json());app.use(createTestAccessRouter({
    identities:()=>[{id:"synthetic-operator",tokenHash:createHash("sha256").update(token).digest("hex"),projects:["oriso"],environments:["dev"],actions:["accounts:totp:write"],expiresAt:"2099-01-01T00:00:00.000Z",revokedAt:null}],
    registryProvider:{list:async()=>[record],get:async()=>record},registryWriter:{enrollTotp},
    database,databasePath,accounts:()=>[],mailReader:{latest:async()=>null,otp:async()=>null}
  }));
  const release=await acquireAccountMutationLock(databasePath,"dev:marge.simpson@trail.ist");
  try{
    const response=await request(app).post(`/accounts/${encodeURIComponent(record.id)}/totp`).set("Authorization",`Bearer ${token}`).send({totpSecret:"GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"});
    expect(response.status).toBe(409);expect(response.body).toEqual({error:"oriso_account_mutation_in_progress"});expect(enrollTotp).not.toHaveBeenCalled();
  } finally {await release!();database.close();await rm(directory,{recursive:true,force:true});}
});
