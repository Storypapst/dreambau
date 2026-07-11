#!/usr/bin/env node
import { spawnSync } from "node:child_process";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const emails = input.trim().startsWith("[") ? JSON.parse(input) : input.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
const allowedDomains = new Set(["dreambau.com", "dreambau.de", "getme.global", "openresilience.cc", "oriso.org", "trail.ist"]);
const title = (email) => email.split("@")[0].split(".").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
const records = emails.map((email) => {
  const domain = email.split("@")[1];
  if (!allowedDomains.has(domain)) throw new Error(`Unexpected domain for ${email}`);
  const result = spawnSync("security", ["find-generic-password", "-s", "dreambau-test-mailbox", "-a", email, "-w"], { encoding: "utf8" });
  if (result.status !== 0 || !result.stdout.trim()) throw new Error(`Missing Keychain password for ${email}`);
  const encoded = encodeURIComponent(email);
  return {
    displayName: title(email), email, password: result.stdout.trim(), domain,
    imap: "mail.dreambau.com:993", smtp: "mail.dreambau.com:465", jmap: "https://box.dreambau.com/.well-known/jmap",
    caldav: `https://box.dreambau.com/dav/cal/${encoded}/`, carddav: `https://box.dreambau.com/dav/card/${encoded}/`,
    encryption: domain === "oriso.org" ? { state: "disabled" } : { state: "encrypted", format: "S/MIME", symmetricMode: "AES-256", encryptOnAppend: true, allowSpamTraining: false }
  };
});
if (records.length !== 180 || new Set(records.map((record) => record.email)).size !== 180) throw new Error("Expected exactly 180 unique accounts");
process.stdout.write(JSON.stringify(records));
