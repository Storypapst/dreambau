import { readFileSync } from 'node:fs';
import { createIntake } from './server.mjs';
import { instructions, schema } from './interview-model.mjs';
import { interviewInput } from './project-context.mjs';

const { OPENROUTER_API_KEY_FILE, OPENROUTER_MODEL, TESTMAILS_ME_URL, INTAKE_DATABASE } = process.env;
if (!TESTMAILS_ME_URL || !INTAKE_DATABASE) throw new Error('Testmails URL and persistent database are required');

async function resolveIdentity(cookies = '') {
  const session = cookies.match(/(?:^|;\s*)(dreambau_testmails_session=[^;\s]+)/)?.[1];
  if (!session) return null;
  const response = await fetch(TESTMAILS_ME_URL, {
    headers: { Cookie: session }, signal: AbortSignal.timeout(5_000), redirect: 'error',
  });
  if (!response.ok) return null;
  const user = await response.json();
  if (user.status !== 'active' || !user.projects?.includes('oriso')
    || typeof user.email !== 'string' || typeof user.name !== 'string') return null;
  return { identity: { email: user.email, name: user.name }, reviewer: user.role === 'admin' };
}

async function interview(proposal) {
  const answer = proposal.turns.at(-1)?.answer.trim();
  const confirmed = proposal.interview?.confirmation === true && !proposal.continueInterview
    && /^(yes|ja)[.!]?$/i.test(answer ?? '');
  return requestInterview(proposal, confirmed);
}

async function requestInterview(proposal, confirmed, retry = true) {
  const step = confirmed
    ? 'The user confirmed the previous scope summary. Write only the agreed proposal and relevant stories. Do not add new rules or decisions.'
    : 'Return one question. If the decision tree is clear, ask the final scope confirmation question. A preview is forbidden.';
  const responseSchema = confirmed
    ? { ...schema, properties: { de: schema.properties.de, en: schema.properties.en, stories: schema.properties.stories },
        required: ['de', 'en', 'stories'] }
    : schema;
  const key = OPENROUTER_API_KEY_FILE && readFileSync(OPENROUTER_API_KEY_FILE, 'utf8').trim();
  if (!key || !OPENROUTER_MODEL) throw new Error('OpenRouter is not configured');
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(60_000),
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENROUTER_MODEL, max_tokens: 2400,
      messages: [{ role: 'system', content: instructions + '\nCurrent round: ' + step }, { role: 'user', content: JSON.stringify(interviewInput(proposal)) }],
      response_format: { type: 'json_schema', json_schema: { name: 'oriso_interview', strict: true, schema: responseSchema } },
      provider: { require_parameters: true },
    }),
  });
  if (!response.ok) throw new Error('OpenRouter returned ' + response.status);
  const result = await response.json();
  const output = JSON.parse(result.choices[0].message.content);
  if (confirmed) {
    const otherLocale = proposal.locale === 'de' ? 'en' : 'de';
    return { ...output, phase: 'preview', question: null, decisions: [], assumptions: [],
      [otherLocale]: '', stories: proposal.stakeholders?.length
        ? output.stories.map(story => ({ ...story, [otherLocale]: '' })) : [] };
  }
  if (output.question?.trim() && output.question.length <= 280) {
    return { ...output, de: '', en: '', stories: [] };
  }
  if (retry) return requestInterview(proposal, false, false);
  throw new Error('OpenRouter did not return the required interview question');
}

createIntake({ database: INTAKE_DATABASE, resolveIdentity, interview })
  .listen(Number(process.env.PORT ?? 18124), process.env.HOST ?? '127.0.0.1');
