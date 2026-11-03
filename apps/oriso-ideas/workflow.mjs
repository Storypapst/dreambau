export const stakeholderRoles = ['help-seekers', 'counsellors', 'centre-admins', 'management', 'legal', 'provider-admins', 'qa'];
const fields = ['role', 'situation', 'problem', 'solution', 'benefit'];
const statuses = {
  accept: 'accepted-for-specification',
  reject: 'rejected',
  revise: 'draft',
};

function readText(value, max, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw new TypeError('Invalid text field');
  }
  return value.trim();
}

function requireState(proposal, status, version) {
  if (proposal.status !== status || proposal.version !== version) {
    throw new Error('Proposal state or revision has changed');
  }
}

function readList(values) {
  if (!Array.isArray(values) || values.length > 10) {
    throw new TypeError('Invalid interview list');
  }
  return values.map(value => readText(value, 400));
}

export function start(form, locale) {
  if (locale !== 'de' && locale !== 'en') throw new TypeError('Unsupported locale');
  const answers = Object.fromEntries(fields.map(field => [
    field, readText(form[field], 1000, field !== 'solution'),
  ]));
  const stakeholders = form.stakeholders ?? [];
  if (!Array.isArray(stakeholders) || new Set(stakeholders).size !== stakeholders.length
    || stakeholders.some(role => !stakeholderRoles.includes(role))) {
    throw new TypeError('Invalid stakeholders');
  }
  const stories = form.userStories ?? [];
  if (!Array.isArray(stories) || stories.length > 20) throw new TypeError('Invalid user stories');
  const userStories = stories.map(story => {
    if (!stakeholderRoles.includes(story?.role)) throw new TypeError('Invalid user story role');
    return { role: story.role, text: readText(story.text, 800) };
  });
  return {
    answers,
    userStories,
    stakeholders,
    storyNotes: readText(form.storyNotes ?? '', 1500, false),
    locale,
    status: 'draft',
    version: 1,
    interview: null,
    preview: null,
    review: null,
    history: [],
  };
}

export function advance(proposal, output) {
  requireState(proposal, 'draft', proposal.version);
  const question = output.question === null ? null : readText(output.question, 280);
  const assumptions = readList(output.assumptions);
  const decisions = readList(output.decisions);
  if (question === null && decisions.length) throw new Error('Decisions are still open');
  const preview = question === null
    ? { de: readText(output.de, 4000, proposal.locale === 'de'), en: readText(output.en, 4000, proposal.locale === 'en') }
    : null;
  if (preview && proposal.stakeholders?.length) {
    const stories = output.stories;
    if (!Array.isArray(stories) || stories.length !== proposal.stakeholders.length
      || proposal.stakeholders.some(role => !stories.some(story => story?.role === role))) {
      throw new TypeError('Stories must cover the selected stakeholders');
    }
    preview.stories = stories.map(({ role, de, en }) => ({
      role, de: readText(de, 800, proposal.locale === 'de'), en: readText(en, 800, proposal.locale === 'en'),
    }));
  }
  return {
    ...proposal,
    version: proposal.version + 1,
    interview: { question, assumptions, decisions, ...(output.phase === 'confirmation' && { confirmation: true }) },
    preview,
  };
}

export function confirm(proposal, version) {
  requireState(proposal, 'draft', version);
  if (!proposal.preview) throw new Error('Interview and proposal preview required');
  return { ...proposal, status: 'submitted', version: version + 1, revision: String(version + 1) };
}

export function rate(proposal, version, { clarity, importance }, reviewer) {
  requireState(proposal, 'submitted', version);
  if (![clarity, importance].every(value => Number.isInteger(value) && value >= 1 && value <= 5)) {
    throw new TypeError('Each rating must be an integer between 1 and 5');
  }
  const ratings = (proposal.ratings ?? []).filter(item => item.reviewer.email !== reviewer.email);
  ratings.push({ clarity, importance, reviewer, at: new Date().toISOString() });
  return { ...proposal, ratings, version: proposal.version + 1 };
}

export function review(proposal, version, action, reason, reviewer) {
  requireState(proposal, 'submitted', version);
  if (!Object.hasOwn(statuses, action)) throw new TypeError('Unsupported review action');
  const decision = { action, reason: readText(reason, 1000, action !== 'accept'), reviewer, at: new Date().toISOString() };
  const reviewed = { ...proposal, status: statuses[action], review: decision, version: version + 1 };
  if (action !== 'revise') return reviewed;
  const history = [...proposal.history, {
    version, revision: proposal.revision ?? proposal.submittedAt, submittedAt: proposal.submittedAt,
    preview: proposal.preview, userStories: proposal.userStories, technical: proposal.technical, interview: proposal.interview, turns: proposal.turns ?? [],
    ratings: proposal.ratings ?? [], review: decision,
  }];
  return { ...reviewed, history, interview: null, preview: null, turns: [], ratings: [], technical: null };
}

export function listDocuments(proposal) {
  const past = proposal.history.map(item => String(item.revision ?? item.version));
  const active = proposal.revision ?? proposal.submittedAt;
  return proposal.status === 'draft' || !active ? past : [...past, active];
}

export function getDocument(proposal, revision) {
  const past = proposal.history.find(item => String(item.revision ?? item.version) === revision);
  if (past) return { ...past, revision, status: past.status ?? 'returned' };
  if (proposal.status !== 'draft' && revision === (proposal.revision ?? proposal.submittedAt)) {
    return { ...proposal, revision };
  }
  return null;
}

export function documentMarkdown(document) {
  const escape = value => value.replace(/[<>&]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[char]);
  const lines = ['# Feature proposal / Feature-Vorschlag', '', 'Revision: ' + document.revision];
  for (const [locale, title] of [['de', 'Deutsch'], ['en', 'English']]) {
    if (!document.preview[locale]) continue;
    lines.push('', '## ' + title, '', escape(document.preview[locale]));
    if (document.preview.stories?.length) lines.push('', '### User Stories', '');
    for (const story of document.preview.stories ?? []) {
      if (!story[locale]) continue;
      lines.push('- **' + story.role + '** · ' + escape(story[locale]));
    }
  }
  for (const [key, title] of [['assumptions', 'Annahmen / Assumptions'], ['decisions', 'Offene Punkte / Open decisions']]) {
    const entries = document.interview?.[key];
    if (entries?.length) lines.push('', '## ' + title, '', ...entries.map(item => '- ' + escape(item)));
  }
  return lines.join('\n') + '\n';
}

export function reviseFromFeedback(proposal, version, { suggestion, de, en }, reviewer) {
  requireState(proposal, proposal.status, version);
  if (!['submitted', 'accepted-for-specification'].includes(proposal.status)) throw new Error('Revision unavailable');
  const revision = proposal.revision ?? proposal.submittedAt;
  const history = [...proposal.history, { ...getDocument(proposal, revision), history: undefined, status: 'superseded' }];
  const change = { suggestion: readText(suggestion, 1000), reviewer };
  const preview = { de: readText(de ?? '', 4000, false), en: readText(en ?? '', 4000, false) };
  if (!preview.de && !preview.en) throw new TypeError('A revised proposal is required');
  if (proposal.preview.stories) {
    preview.stories = proposal.preview.stories.map(story => ({
      role: story.role, de: preview.de ? story.de : '', en: preview.en ? story.en : '',
    }));
  }
  return {
    ...proposal, history, preview, change, revision: String(version + 1),
    version: version + 1, submittedAt: new Date().toISOString(), status: 'submitted',
    interview: null, turns: [], ratings: [], review: null, technical: null,
  };
}

export function saveTechnicalReview(proposal, version, input, reviewer) {
  requireState(proposal, proposal.status, version);
  if (!['submitted', 'accepted-for-specification'].includes(proposal.status)) throw new Error('Revision unavailable');
  const notes = Object.fromEntries(['findings', 'decisions', 'tests', 'open', 'story'].map(key => [
    key, readText(input[key] ?? '', 2500, !['open'].includes(key)),
  ]));
  const revision = proposal.revision ?? proposal.submittedAt;
  const spec = [
    '# Feature specification draft', 'Feature revision: ' + revision,
    '## Problem and proposed outcome\n' + (proposal.preview.en || proposal.preview.de),
    '## User Stories\n' + notes.story,
    '## Technical findings and sources\n' + notes.findings,
    '## Implementation decisions\n' + notes.decisions,
    '## Acceptance and testing\n' + notes.tests,
    '## Open decisions\n' + (notes.open || 'None recorded.'),
  ].join('\n\n') + '\n';
  return { ...proposal, version: version + 1, technical: { revision, notes, spec, reviewer, at: new Date().toISOString() } };
}
