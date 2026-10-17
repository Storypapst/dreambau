// Source links (spec 5.2 PF-7, PF-8, 5.13 PR-6). A source link is a link and nothing else: `https:` only, no user
// information, a host with a dot that is no IP address and no localhost, within the limit, no whitespace or control
// character. The build never requests it. A publish build also refuses the hosts that mark invented text.
import { LIMITS, codePoints } from './post-rules.mjs';

const RESERVED_SUFFIXES = ['test', 'example', 'invalid', 'localhost'];
const RESERVED_DOMAINS = ['example.com', 'example.org', 'example.net'];

const problem = (what) => ({ rule: 'PF-7', what });

export function linkProblems(value, { publish = false } = {}) {
  if (typeof value !== 'string' || value === '') return [problem('the source link is empty')];
  const found = [];
  const length = codePoints(value);
  if (length > LIMITS.sourceLink.max) found.push(problem(`the source link has ${length} characters; at most ${LIMITS.sourceLink.max}`));
  if (/[\s\u0000-\u001f\u007f-\u009f]/u.test(value)) found.push(problem('the source link contains whitespace or a control character'));
  if (!/^https:\/\//i.test(value)) return [...found, problem('the source link must start with https:// (no http:, no other scheme)')];
  const authority = value.slice('https://'.length).split(/[/?#]/)[0];
  if (authority === '') return [...found, problem('the source link has no host')];
  if (authority.includes('@')) found.push(problem('the source link must not contain user information (name:password@)'));
  let url;
  try {
    url = new URL(value);
  } catch {
    return [...found, problem('the source link is not a valid web address')];
  }
  const host = url.hostname;
  if (host.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) found.push(problem(`the host ${host} is an IP address; a source link needs a host name`));
  else if (host === 'localhost' || host.endsWith('.localhost')) {
    if (!publish) found.push(problem(`the host ${host} is localhost`)); // in a publish build the reserved-name line below says it
  } else if (!host.includes('.')) found.push(problem(`the host ${host} has no dot`));
  if (publish) {
    const reserved = RESERVED_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`)) || RESERVED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
    if (reserved) found.push(problem(`the host ${host} marks invented text (.test, .example, .invalid, .localhost, example.com, example.org, example.net); a publish build refuses it`));
  }
  return found;
}

// The host as it is shown to a visitor: the punycode form, lower case, without a port. '' for anything that is no address.
export function displayHost(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

// PR-6: the check at render time. It runs again for a post that a validator has passed, and it throws for a link that is
// not a valid https address, so that no other scheme can reach an href.
export function httpsLink(value, where) {
  const problems = linkProblems(value);
  if (problems.length > 0) throw new Error(`${where}: sourceLink must be an https: address (${problems[0].what})`);
  return value;
}
