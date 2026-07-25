/**
 * Fail-closed secret detection for everything that reaches a public evidence
 * URL. A hit never produces a redacted file: it quarantines the run so a human
 * decides what happens next. False positives are the cheaper mistake here.
 */

export interface SecretFinding {
  /** Stable rule name. Reported to the uploader; never accompanied by the match. */
  rule: string;
  /** 1-based line number inside the scanned text. */
  line: number;
  /** Path inside an archive, when the finding came from an archive entry. */
  entry?: string;
}

interface LineRule {
  rule: string;
  pattern: RegExp;
  /** When set, group `valueGroup` must survive the redaction allowlist. */
  valueGroup?: number;
}

const secretKeys = "password|passwd|pwd|passphrase|secret|client_secret|session_secret|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|auth[_-]?token|bearer[_-]?token|totp[_-]?secret|recovery[_-]?code|private[_-]?key";

const lineRules: LineRule[] = [
  { rule: "private_key_block", pattern: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/ },
  { rule: "certificate_bundle_key", pattern: /-----BEGIN (?:ENCRYPTED|RSA|OPENSSH) PRIVATE KEY-----/ },
  { rule: "aws_access_key_id", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { rule: "github_token", pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { rule: "github_fine_grained_token", pattern: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/ },
  { rule: "slack_token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { rule: "infisical_service_token", pattern: /\bst\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/ },
  { rule: "json_web_token", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  { rule: "authorization_bearer", pattern: /authorization["'\s]*[:=]["'\s]*(?:bearer|basic)\s+(\S{8,})/i, valueGroup: 1 },
  { rule: "set_cookie_header", pattern: /\bset-cookie\b\s*[:=]/i },
  { rule: "cookie_header", pattern: /\bcookie\b\s*[:=]\s*["']?[A-Za-z0-9_.-]+=(\S{8,})/i, valueGroup: 1 },
  { rule: "basic_auth_url", pattern: /\bhttps?:\/\/[^\s/:@]+:([^\s/@]{4,})@/i, valueGroup: 1 },
  { rule: "secret_assignment", pattern: new RegExp(`\\b(?:${secretKeys})\\b["'\\s]*[:=]\\s*(?:"([^"]{8,})"|'([^']{8,})'|([^\\s,;"']{8,}))`, "i"), valueGroup: 1 },
  { rule: "secret_flag", pattern: new RegExp(`--(?:${secretKeys})(?:[= ])\\s*["']?([^\\s"'-][^\\s"']{7,})`, "i"), valueGroup: 1 },
  { rule: "one_time_code", pattern: /\b(?:otp|one[_-]?time[_-]?code|verification[_-]?code|mfa[_-]?code|totp)\b["'\s]*[:=]\s*["']?(\d{4,10})\b/i, valueGroup: 1 }
];

/** Document-level rules need more than one line to be conclusive. */
const documentRules: Array<{ rule: string; test: (text: string) => boolean }> = [
  {
    rule: "browser_storage_state",
    test: (text) => /"cookies"\s*:\s*\[/.test(text)
      && (/"origins"\s*:\s*\[/.test(text) || /"localStorage"\s*:\s*\[/.test(text))
  }
];

const redactedValues = new Set([
  "null", "undefined", "none", "empty", "hidden", "redacted", "removed", "omitted",
  "changeme", "example", "placeholder", "yourpassword", "notasecret", "unused"
]);

/** `***`, `xxxxxxxx`, `<redacted>`, `${SECRET}` and `process.env.X` are not secrets. */
export function isRedactedValue(rawValue: string): boolean {
  const value = rawValue.trim().replace(/^["']|["']$/g, "").trim();
  if (value.length === 0) return true;
  if (/^[*x.•…<>[\]{}()_-]+$/i.test(value)) return true;
  if (/^\$\{[^}]*\}$/.test(value)) return true;
  if (/^process\.env\./.test(value)) return true;
  if (/^<[^>]*>$/.test(value)) return true;
  return redactedValues.has(value.toLowerCase().replace(/[^a-z]/g, ""));
}

function matchedValue(match: RegExpMatchArray, valueGroup: number): string {
  for (let index = valueGroup; index < match.length; index += 1) {
    if (typeof match[index] === "string") return match[index];
  }
  return "";
}

export interface ScanOptions {
  /** Archive-relative path, echoed into every finding from this text. */
  entry?: string;
  /** Stops the scan once this many findings exist. */
  limit?: number;
}

export function scanTextForSecrets(text: string, options: ScanOptions = {}): SecretFinding[] {
  const limit = options.limit ?? 50;
  const findings: SecretFinding[] = [];
  const push = (rule: string, line: number) => {
    if (findings.length < limit) findings.push({ rule, line, ...(options.entry ? { entry: options.entry } : {}) });
  };
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length && findings.length < limit; index += 1) {
    const line = lines[index];
    if (line.length > 8_000) continue;
    for (const rule of lineRules) {
      const match = line.match(rule.pattern);
      if (!match) continue;
      if (rule.valueGroup !== undefined && isRedactedValue(matchedValue(match, rule.valueGroup))) continue;
      push(rule.rule, index + 1);
    }
  }
  for (const rule of documentRules) {
    if (rule.test(text)) push(rule.rule, 1);
  }
  return findings;
}

const textLikeContentTypes = [/^text\//, /^application\/json/, /^application\/x-ndjson/, /^application\/xml/];

export function isScannableContentType(contentType: string): boolean {
  const value = contentType.split(";")[0].trim().toLowerCase();
  return textLikeContentTypes.some((pattern) => pattern.test(value));
}
