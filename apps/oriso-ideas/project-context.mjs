import { readFileSync } from 'node:fs';

const glossaryPath = '../understand-anything/glossary/catalog.json';
const coreTerms = [
  'provider', 'counselling-centre', 'help-seeker', 'counsellor',
  'counselling-centre-administrator', 'staging-environment', 'deliverable', 'work-package',
];

export function loadProjectContext() {
  const glossary = JSON.parse(readFileSync(new URL(glossaryPath, import.meta.url), 'utf8'));
  const vocabulary = coreTerms.map(id => {
    const { de, en, editorialState } = glossary.concepts.find(concept => concept.id === id);
    return `- ${id} (${editorialState}): ${de.term} — ${de.definition} | ${en.term} — ${en.definition}`;
  });

  return `ORISO project context, maintained with the server.

Workflow and policy:
- ORISO is a multi-repository counselling platform. Preserve the distinction between a proposal, a product review, an approved architecture decision, a spec, built code, client acceptance and a published release. GitHub is authoritative for engineering issues and delivery status.
- Follow the method from mattpocock/skills at 4ae2317ddb22b046e26455e4f9c9b3aaaf62212d: ask one question per round, check the glossary and clarify concrete scenarios. Keep product intake in the user's language and plain language. The later PM-led grill-with-docs session handles technical decisions; to-spec synthesizes its conclusions, to-tickets slices work and implement-spec implements it. Do not create or approve an ADR, spec, ticket or release during this interview.
- In the later delivery phase, to-spec keeps the whole feature and its cross-role acceptance criteria together. Reuse the existing ORISO Epic and Roadmap structure. Split larger features into separately reviewable outcome-based epics when useful, including design or QA outcomes where independently verifiable. Map stories and acceptance criteria to epics, and put small vertical issues with explicit dependencies and test evidence under the appropriate epic. Preserve one lead epic link for the ideas map and list additional epics in the spec.
- For the later technical session: ORISO investigates ticket → graph and authoritative ADRs → Storybook where applicable → code. Use approved project and repo rules before implementation. Engineering issues, PRs and ADRs use English. Separate board status, code revision, environment and human acceptance.

Domain language:
- Source: ORISO-Docs/tools/understand-anything/glossary/catalog.json, reviewed ${glossary.reviewedAt}. This selection provides terminology rather than proof of runtime behavior. Keep established DE/EN terms and flag conflicts or unconfirmed new terms.
${vocabulary.join('\n')}

Graph-to-code lookup for the later technical session:
- Start from the validated online Understand Anything repo and ORISO-Platform graphs at understand.oriso.org/ua. Verify generation, revision and freshness before using knowledge-graph.json. Read metadata.sources for the revisions and metadata.semanticClaim for the review status of a claim where present.
- Find nodes by name or summary; follow exact IDs and the relevant edges. For example, inspect calls → exposes → owns to find an endpoint, service and table. Treat calls_unconfirmed as a lead. For governs, read the actual accepted ADR and check its scope. Open the referenced file and source range at the matching revision to confirm the claim.
- This intake model receives no graph or repository tools. Leave technical checks open for the PM session when evidence is unavailable. A graph node or tested_by edge is a pointer, not a test result.

Test and evidence map:
- tools/planning-map/test/board.test.mjs checks the board contract and fixture behavior. Unit and contract tests at this seam do not prove the live board or its release status.
- tools/understand-anything/site/hub/test/board-agg.test.mjs checks aggregation; publication and glossary suites cover artifacts and source contracts. Read the individual test before claiming coverage.
- ORISO-E2E covers real browser flows. A passing browser or deployed-environment test needs an actual run, with environment, revision, relevant scenario and evidence. Dev verification, testing on Staging and client acceptance are distinct.
`;
}

export function interviewInput({ answers, locale, turns, review, stakeholders, storyNotes, userStories, continueInterview }) {
  return {
    answers, locale, turns, stakeholders, storyNotes, userStories, continueInterview,
    review: review ? { action: review.action, reason: review.reason } : null,
  };
}
