import express from "express";
import {generateKeyPairSync,sign} from "node:crypto";
import {canonicalReceipt} from "../../src/server/work-state/sources.js";
import path from "node:path";
import {
  workStateFixture,
  fixturePull,
  seedPulls,
} from "./work-state-fixture.js";
const raw = process.env.WORK_STATE_BASE_URL;
if (!raw) throw new Error("Explicit WORK_STATE_BASE_URL required");
const url = new URL(raw);
if (
  url.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(url.hostname)
)
  throw new Error("Fixture is loopback only");
const fixture = workStateFixture();
const waiting = fixturePull(2);
waiting.title = "Review needed";
waiting.facets.checks!.value = [];
waiting.facets.reviewDecision!.value = "REVIEW_REQUIRED";
const stale = fixturePull(3, 76);
stale.title = "Source needs refreshing";
const merged = fixturePull(4);
merged.title = "Merged change";
merged.lifecycle = "merged";
merged.headSha="a".repeat(40);
merged.mergedAt = new Date().toISOString();
const partial = fixturePull(5);
partial.title = "Partial review evidence";
partial.facets.reviewThreads = {
  ...partial.facets.reviewThreads!,
  coverage: "partial",
  errorCode: "graphql_partial",
};
const failing = fixturePull(1);
failing.title = "Check needs attention";
seedPulls(fixture.store, [failing, waiting, stale, merged, partial]);
const privatePull = fixturePull(666);
privatePull.title = "Private repository record";
privatePull.url = "https://github.com/OpenResilienceInitiative/repoB/pull/666";
seedPulls(fixture.store, [privatePull], "B");
const item = fixture.store.createWorkItem(fixture.scope, {
  goal: "Verify the failing check",
  owner: "Lisa Fixture",
  priority: "P1",
  links: [{ repositoryId: "A", kind: "pull", number: 1 },{repositoryId:"A",kind:"issue",number:9}],
});
fixture.store.writeCheckpoint(fixture.scope, item.id, {
  expectedVersion: 1,
  goal: "Verify the failing check",
  lastVerifiedAction: "Observed a failing current-head check",
  nextAction: "Inspect the failing job and repeat verification",
  branch: "feature",
  commit: "head",
  blockers: ["Check still failing"],
  evidenceLinks: ["https://example.test/work-state-evidence"],
});
fixture.store.recordBoard("A",9,{status:"In review",priority:"P0",url:"https://github.com/OpenResilienceInitiative/repoA/issues/9",observedAt:new Date().toISOString(),coverage:"complete"});
const {privateKey,publicKey}=generateKeyPairSync("ed25519");
const policy={producer:"local-synthetic-proof",publicKey:publicKey.export({format:"pem",type:"spki"}).toString(),repositoryIds:["A"],environments:["dev"]};
fixture.store.configureReceiptPolicies([policy]);
const proof={producer:policy.producer,repositoryId:"A",pullNumber:4,environment:"dev",targetHeadSha:merged.headSha,sourceCommit:"b".repeat(40),imageDigest:"sha256:"+"c".repeat(64),observedAt:new Date().toISOString(),evidenceLinks:["https://example.test/local-synthetic-proof"]};
for(const payload of [{...proof,receiptId:"local-deploy",kind:"deployment",ready:true},{...proof,receiptId:"local-acceptance",kind:"acceptance",result:"PASS",criterion:"Synthetic browser fixture"}])fixture.store.ingestReceipt({payload,signature:sign(null,Buffer.from(canonicalReceipt(payload)),privateKey).toString("base64")},[policy]);
const app = express();
app.use("/testmails", express.static(path.resolve("dist/client")));
app.use(fixture.app);
const server = app.listen(Number(url.port) || 80, url.hostname);
let closing = false;
function close() {
  if (closing) return;
  closing = true;
  server.close(() => {
    fixture.close();
    process.exit(0);
  });
  server.closeIdleConnections();
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
