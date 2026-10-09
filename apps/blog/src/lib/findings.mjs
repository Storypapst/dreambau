// One line per finding, the same for every validator (spec 5.12 BD-4):  FAIL <rule> <where>: <what>  or  WARN ...
// Exit code: 0 when there is no FAIL (a WARN never changes it), 1 when there is one. Usage errors exit 2, in the tools.
export const fail = (rule, where, what) => ({ level: 'FAIL', rule, where, what });
export const warn = (rule, where, what) => ({ level: 'WARN', rule, where, what });

export const format = (finding) => `${finding.level} ${finding.rule} ${finding.where}: ${finding.what}`;
export const hasFailure = (findings) => findings.some((finding) => finding.level === 'FAIL');
export const exitCodeOf = (findings) => (hasFailure(findings) ? 1 : 0);

// "file:line", or only "file" when there is no line.
export const at = (file, line) => (line === undefined ? file : `${file}:${line}`);
