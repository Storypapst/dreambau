import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AccountRecord } from "./accounts.js";
import type { AccountMetadata } from "./metadata.js";
import type { Taxonomies } from "./taxonomies.js";

type AccountView = AccountRecord & { metadata: AccountMetadata };
const escape = (value: unknown) => String(value ?? "").replaceAll("\\", "\\\\").replaceAll("|", "\\|").replace(/\r?\n/g, "<br>");

export function generateMarkdown(accounts: AccountView[], taxonomies: Taxonomies) {
  const lines = ["# Dreambau Testkonten", "", `Generiert: ${new Date().toISOString()}`, "", "## Verbindungsdaten", "", "- IMAP: `mail.dreambau.com:993` (TLS)", "- SMTP: `mail.dreambau.com:465` (TLS)", "- JMAP: `https://box.dreambau.com/.well-known/jmap`", "- CalDAV/CardDAV: `https://box.dreambau.com/dav/`", "", "Verschlüsselte Konten verwenden S/MIME / AES-256. Die privaten Identitäten liegen extern im Operator-Mac-Keychain. oriso.org ist für Vergleichstests absichtlich unverschlüsselt.", "", `Taxonomien: Rollen ${taxonomies.roles.join(", ") || "—"}; Themen ${taxonomies.topics.join(", ") || "—"}; Konversationen ${taxonomies.conversationTypes.join(", ") || "—"}.`, ""];
  const domains = [...new Set(accounts.map((account) => account.domain))].sort();
  for (const domain of domains) {
    lines.push(`## ${domain}`, "", "| Name | E-Mail | Passwort | Verschlüsselung | Version | Status | Rollen | Themen | Konversationen | Testdaten | Dateien | Notizen |", "|---|---|---|---|---|---|---|---|---|---|---:|---|");
    for (const account of accounts.filter((item) => item.domain === domain).sort((a,b) => a.email.localeCompare(b.email))) {
      const encryption = account.encryption.state === "encrypted" ? "S/MIME / AES-256" : "deaktiviert";
      const m = account.metadata;
      lines.push(`| ${escape(account.displayName)} | ${escape(account.email)} | ${escape(account.password)} | ${encryption} | ${escape(m.shippedVersion)} | ${m.lifecycleStatus} | ${escape(m.roles.join(", "))} | ${escape(m.topics.join(", "))} | ${escape(m.conversationTypes.join(", "))} | ${m.fixtureQuality} | ${m.sampleFileCount} | ${escape(m.notes)} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export async function writeMarkdownAtomically(filePath: string, contents: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, contents, { mode: 0o600 }); await rename(temporary, filePath);
}
