const testmails = document.body.dataset.testmails === 'true';
const intake = document.querySelector('#intake');
const proposalView = document.querySelector('#proposal');
const notice = document.querySelector('#notice');
const storyList = document.querySelector('#user-stories');
const inbox = document.querySelector('#inbox');
const communityView = document.querySelector('#community-documents');
const communityNotice = document.querySelector('#community-notice');
const accessForm = document.querySelector('#access-start');
const verifyForm = document.querySelector('#access-verify');
const identityView = document.querySelector('#identity');
const domainForm = document.querySelector('#domains');
const accessNotice = document.querySelector('#access-notice');
const reviewNotice = document.querySelector('#review-notice');
const key = 'oriso-feature-intake';
const themeKey = key + '-theme';
const themeSwitch = document.querySelector('#theme-switch');
const copy = {
  themeLabel: ['Farbschema', 'Color scheme'],
  themeSystem: ['System', 'System'],
  themeLight: ['Hell', 'Light'],
  themeDark: ['Dunkel', 'Dark'],
  testmailsLogin: ['In Testmails anmelden', 'Sign in to Testmails'],
  testmailsHint: ['Melde dich in Testmails an und lade diese Seite danach neu.', 'Sign in to Testmails, then reload this page.'],
  accessTitle: ['Zugang mit E-Mail bestätigen', 'Verify your email to sign in'],
  accessHint: ['Verwende das gemeinsame Passwort und eine E-Mail-Adresse aus einer freigegebenen Domain. Name und bestätigte Adresse sind im geschützten Ideen-Board für Rückfragen sichtbar.', 'Use the shared password and an email address from an approved domain. Your name and verified address appear on the protected idea board so reviewers can contact you.'],
  name: ['Dein Name', 'Your name'],
  email: ['Deine E-Mail-Adresse', 'Your email address'],
  accessPassword: ['Gemeinsames Passwort', 'Shared password'],
  sendCode: ['E-Mail-Code anfordern', 'Request email code'],
  emailCode: ['Sechsstelliger E-Mail-Code', 'Six-digit email code'],
  verifyCode: ['Code bestätigen', 'Verify code'],
  newCode: ['Neuen Code anfordern', 'Request a new code'],
  logout: ['Abmelden', 'Sign out'],
  codeSent: ['Der Code wurde angefordert. Prüfe deinen Posteingang.', 'The code was requested. Check your inbox.'],
  codeDenied: ['Prüfe das Passwort und die E-Mail-Domain.', 'Check the password and email domain.'],
  codeInvalid: ['Der Code ist ungültig oder abgelaufen.', 'The code is invalid or has expired.'],
  codeLimit: ['Bitte warte, bevor du einen weiteren Code anforderst.', 'Please wait before requesting another code.'],
  mailFailed: ['Der E-Mail-Code konnte gerade nicht gesendet werden.', 'The email code could not be sent right now.'],
  boardTitle: ['Ideen-Board', 'Idea board'],
  domains: ['Erlaubte E-Mail-Domains', 'Allowed email domains'],
  domainsHint: ['Eine Domain pro Zeile. Entfernte Domains verlieren sofort den Zugang, auch zu bestehenden Sitzungen.', 'One domain per line. Removing a domain also revokes its existing sessions.'],
  saveDomains: ['Domainliste speichern', 'Save allowed domains'],
  savedDomains: ['Domainliste gespeichert.', 'Allowed domains saved.'],
  replyByEmail: ['Per E-Mail antworten', 'Reply by email'],
  badge: ['Feature-Idee', 'Feature idea'],
  eyebrow: ['Features · Von der Idee zum Vorschlag', 'Features · From idea to proposal'],
  title: ['Eine Idee für ORISO einreichen', 'Submit an idea for ORISO'],
  lead: ['Beschreibe, was jemand in ORISO besser machen können soll. Im anschließenden Chat klären wir offene Fragen. Danach siehst du den Vorschlag in deiner Sprache.', 'Describe what someone should be able to do better in ORISO. We’ll clarify open questions in a chat, then show you the proposal in your chosen language.'],
  private: ['Entwürfe sind geschützt', 'Drafts are protected'],
  livePreview: ['Lokale Vorschau · echtes Modell', 'Local preview · live model'],
  fixture: ['Lokale Vorschau · vorbereitete Antworten', 'Local preview · prepared responses'],
  idea: ['Idee', 'Idea'],
  chat: ['Rückfragen', 'Follow-up questions'],
  formTitle: ['Die Idee aus Nutzersicht', 'The idea from the user’s perspective'],
  privacy: ['Bitte gib keine Namen, Kontaktdaten oder Beratungsinhalte ein.', 'Please leave out names, contact information and counselling details.'],
  role: ['Wer braucht die Änderung?', 'Who needs the change?'],
  situation: ['In welcher Situation ist die Person?', 'What situation are they in?'],
  problem: ['Was kann sie heute nicht tun oder erkennen?', 'What can they not do or see today?'],
  solution: ['Was könnte ihr helfen? (optional)', 'What might help them? (optional)'],
  benefit: ['Woran würde sie merken, dass die Änderung hilft?', 'How would they know the change helps?'],
  technical: ['Stakeholder & User Stories (optional)', 'Stakeholders & user stories (optional)'],
  stakeholders: ['Welche weiteren Rollen betrifft die Idee?', 'Which other roles does the idea affect?'],
  'help-seekers': ['Ratsuchende', 'Help-seekers'],
  counsellors: ['Beratende', 'Counsellors'],
  'centre-admins': ['Beratungsstellen-Admins', 'Counselling centre admins'],
  management: ['Management', 'Management'],
  legal: ['Legal', 'Legal'],
  storyHint: ['Für jede ausgewählte Rolle erscheint eine vorgeschlagene User Story in der Vorschau.', 'The preview will include a draft user story for each selected role.'],
  storyNotes: ['Technische Hinweise (optional)', 'Technical notes (optional)'],
  addStory: ['User Story hinzufügen', 'Add user story'],
  removeStory: ['Story entfernen', 'Remove story'],
  storyRole: ['Perspektive', 'Perspective'],
  storyText: ['User Story', 'User story'],
  authoredStories: ['Deine User Stories', 'Your user stories'],
  'provider-admins': ['Träger-Admins', 'Provider admins'],
  qa: ['Qualitätssicherung', 'Quality assurance'],
  storyExample: ['Als Beratende möchte ich …, damit ich …', 'As a counsellor, I want to … so that I can …'],
  start: ['Rückfragen starten', 'Start follow-up questions'],
  chatEmpty: ['Sobald du den Chat startest, erscheint hier die erste Rückfrage.', 'The first question will appear here when you start the chat.'],
  reviewAccess: ['Review mit Passwort öffnen', 'Open review with password'],
  password: ['Review-Passwort', 'Review password'],
  loadInbox: ['Einreichungen laden', 'Load submissions'],
  draft: ['Entwurf', 'Draft'],
  submitted: ['Eingereicht · wartet auf High-Level Review', 'Submitted · awaiting High-Level Review'],
  'accepted-for-specification': ['Zur Spezifikation angenommen', 'Accepted for specification'],
  rejected: ['Abgelehnt', 'Rejected'],
  loading: ['Die nächste Rückfrage oder Vorschau wird vorbereitet …', 'Preparing the next question or preview …'],
  yourIdea: ['Deine Idee', 'Your idea'],
  you: ['Du', 'You'],
  guide: ['ORISO fragt nach', 'ORISO asks'],
  reply: ['Deine Antwort', 'Your answer'],
  send: ['Antwort senden', 'Send answer'],
  assumptions: ['Annahmen', 'Assumptions'],
  decisions: ['Offene Entscheidungen', 'Open decisions'],
  preview: ['Vorschau des Vorschlags', 'Proposal preview'],
  submit: ['Vorschlag einreichen', 'Submit proposal'],
  empty: ['Keine Einreichungen', 'No submissions'],
  returned: ['Zur Überarbeitung', 'Revision requested'],
  revisionFeedback: ['Was du verbessern kannst', 'What to improve'],
  clarity: ['Wie klar ist der Vorschlag?', 'How clear is the proposal?'],
  importance: ['Wie wichtig ist das Problem?', 'How important is the problem?'],
  clarityScale: ['1 = unklar · 5 = sehr klar', '1 = unclear · 5 = very clear'],
  importanceScale: ['1 = wenig wichtig · 5 = sehr wichtig', '1 = low importance · 5 = very important'],
  ratingTitle: ['Deine Bewertung', 'Your rating'],
  communityVote: ['Deine Stimme', 'Your vote'],
  voteSave: ['Stimme speichern', 'Save vote'],
  voteSaved: ['Deine Stimme ist für diese Fassung gespeichert.', 'Your vote is saved for this revision.'],
  voteMissing: ['Diese Fassung ist nicht mehr freigegeben. Lade die Community-Ansicht erneut.', 'This revision is no longer shared. Reload the community view.'],
  improvement: ['Verbesserungsvorschlag (optional)', 'Suggestion for improvement (optional)'],
  communityFeedback: ['Community-Rückmeldungen', 'Community feedback'],
  voteCount: ['Stimmen', 'Votes'],
  superseded: ['Durch neue Fassung ersetzt', 'Superseded by a new revision'],
  refine: ['Vorschlag in neue Fassung übernehmen', 'Create revision from suggestion'],
  revisionDe: ['Überarbeiteter Text auf Deutsch', 'Revised German text'],
  revisionEn: ['Überarbeiteter Text auf Englisch', 'Revised English text'],
  report: ['Feature-Bericht', 'Feature report'],
  reportTitle: ['Titel', 'Title'],
  reportSummary: ['Kurzfassung', 'Summary'],
  reportGenerate: ['Bericht mit KI entwerfen', 'Draft report with AI'],
  reportEdit: ['Bericht bearbeiten', 'Edit report'],
  reportSave: ['Bericht als Entwurf speichern', 'Save report draft'],
  reportApprove: ['Bericht prüfen und freigeben', 'Approve report'],
  reportDraft: ['Entwurf · zur Prüfung', 'Draft · ready for review'],
  reportApproved: ['Freigegeben · bereit für die technische Spec', 'Approved · ready for the technical spec'],
  technicalTitle: ['Technische PM-Prüfung', 'Technical PM review'],
  findings: ['Technischer Befund und Quellen', 'Technical findings and sources'],
  pmDecisions: ['Vorgeschlagene Umsetzung', 'Proposed implementation'],
  pmStory: ['User Stories (EN)', 'User stories (EN)'],
  pmTests: ['Abnahmekriterien und Tests', 'Acceptance criteria and tests'],
  pmOpen: ['Offene Entscheidungen (optional)', 'Open decisions (optional)'],
  saveSpec: ['Spec-Entwurf speichern', 'Save draft spec'],
  noVotes: ['Für diese Fassung liegen noch keine Stimmen vor.', 'There are no votes for this revision yet.'],
  promptLink: ['System-Prompt ansehen', 'View system prompt'],
  communityIntro: ['Hier stehen die Fassungen, die der Review für die Community freigegeben hat.', 'These are the revisions that reviewers have shared with the community.'],
  loadCommunity: ['Freigegebene Fassungen laden', 'Load shared revisions'],
  emptyCommunity: ['Derzeit sind keine Fassungen freigegeben.', 'No revisions are currently shared.'],
  shareCommunity: ['Für Community freigeben', 'Share with community'],
  withdrawCommunity: ['Community-Freigabe zurückziehen', 'Withdraw from community'],
  communityShared: ['Diese Fassung ist für die Community freigegeben.', 'This revision is shared with the community.'],
  shareCheck: ['Ich habe den Vorschlag und die Stories auf vertrauliche Angaben geprüft.', 'I have checked the proposal and stories for confidential information.'],
  document: ['Feature-Dokument', 'Feature document'],
  revision: ['Fassung', 'Revision'],
  openDocument: ['Fassung öffnen', 'Open revision'],
  exportMarkdown: ['Markdown herunterladen', 'Download Markdown'],
  backToBoard: ['Zurück zum Ideen-Board', 'Back to idea board'],
  ratingsTitle: ['Gespeicherte Bewertungen', 'Saved ratings'],
  saveRating: ['Bewertung speichern', 'Save rating'],
  ratingSaved: ['Bewertung gespeichert. Der Vorschlag bleibt im Review.', 'Rating saved. The proposal stays in review.'],
  clarityShort: ['Klarheit', 'Clarity'],
  importanceShort: ['Wichtigkeit', 'Importance'],
  reason: ['Begründung für Überarbeitung oder Ablehnung', 'Reason for revision or rejection'],
  accept: ['Annehmen', 'Accept'],
  revise: ['Überarbeiten', 'Request revision'],
  reject: ['Ablehnen', 'Reject'],
  retry: ['Erneut laden', 'Reload'],
  lost: ['Dieser Entwurf ist nicht mehr verfügbar. Du kannst eine neue Idee beginnen.', 'This draft is no longer available. You can start a new idea.'],
  newIdea: ['Neue Idee', 'New idea'],
  confirmScope: ['Umfang bestätigen', 'Confirm scope'],
  keepAsking: ['Rückfragen fortsetzen', 'Continue follow-up questions'],
  answerSaved: ['Deine Antwort ist gespeichert. Du kannst die nächste Rückfrage erneut anfordern.', 'Your answer is saved. You can retry the next question.'],
  retryQuestion: ['Nächste Rückfrage erneut anfordern', 'Retry next question'],
  dailyLimit: ['Das Tageslimit für Modellaufrufe ist erreicht. Der Entwurf bleibt gespeichert.', 'The daily model limit has been reached. Your draft remains saved.'],
  unavailable: ['Der Chat ist gerade nicht erreichbar. Dein Entwurf ist gespeichert.', 'The chat is temporarily unavailable. Your draft is saved.'],
  failed: ['Die Aktion war nicht möglich. Bitte prüfe die Eingabe und versuche es erneut.', 'The action could not be completed. Check your input and try again.'],
};
let locale = localStorage.getItem(key + '-locale') === 'en' ? 'en' : 'de';
let session = JSON.parse(localStorage.getItem(key) ?? 'null');
let current;
let identity;
let userStories = [];
const storyRoles = ['help-seekers', 'counsellors', 'centre-admins', 'management', 'legal', 'provider-admins', 'qa'];

function storeStories() {
  if (identity) localStorage.setItem(key + '-stories-' + identity.email, JSON.stringify(userStories));
}

function renderStoryEditor() {
  storyList.replaceChildren();
  document.querySelector('#add-story').disabled = userStories.length >= 20;
  for (const [index, story] of userStories.entries()) {
    const row = element('fieldset', '', 'intake-preview');
    row.append(element('legend', t('storyText') + ' ' + (index + 1)));
    const role = element('label', t('storyRole'), 'field');
    const select = document.createElement('select');
    for (const value of storyRoles) {
      const option = element('option', t(value));
      option.value = value;
      select.append(option);
    }
    select.value = story.role;
    select.addEventListener('change', () => { story.role = select.value; storeStories(); });
    role.append(select);
    const { wrapper, input } = textField('storyText', story.text, 800);
    input.required = true;
    input.placeholder = t('storyExample');
    input.addEventListener('input', () => { story.text = input.value; storeStories(); });
    row.append(role, wrapper, button('removeStory', () => {
      userStories.splice(index, 1);
      storeStories();
      renderStoryEditor();
    }));
    storyList.append(row);
  }
}

document.querySelector('#add-story').addEventListener('click', () => {
  const selected = new FormData(intake).getAll('stakeholders');
  const role = selected.find(value => !userStories.some(story => story.role === value)) ?? selected[0] ?? storyRoles[0];
  userStories.push({ role, text: '' });
  storeStories();
  renderStoryEditor();
  storyList.lastElementChild.querySelector('select').focus();
});
let challenge;
let reviews;
let activeDocument;
let communityDocuments;
const documentQuery = new URLSearchParams(location.search);
const requestedDocument = documentQuery.has('idea') && documentQuery.has('revision')
  ? { id: documentQuery.get('idea'), revision: documentQuery.get('revision') }
  : null;
let reviewPassword;
let pending = false;
let message = '';
let answerDraft = '';

function t(name, language = locale) {
  return copy[name][language === 'en' ? 1 : 0];
}

async function request(path, token, data) {
  const response = await fetch('./api' + path, {
    method: data ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
    body: data && JSON.stringify(data),
  });
  if (!response.ok) {
    const error = new Error('Request failed');
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(label, action, primary = false, status = notice) {
  const node = element('button', t(label), primary ? 'primary' : undefined);
  node.type = 'button';
  node.addEventListener('click', () => run(node, action, status));
  return node;
}

async function run(control, action, status = notice) {
  if (pending) return;
  pending = true;
  control.disabled = true;
  message = '';
  status.textContent = '';
  try {
    await action();
  } catch (error) {
    message = error.status === 502 ? 'unavailable' : error.status === 429 ? 'dailyLimit' : 'failed';
  } finally {
    pending = false;
    control.disabled = false;
    if (message || status === notice) status.textContent = message ? t(message) : '';
  }
}

function preview(proposal) {
  const view = element('div', '', 'intake-preview');
  view.append(element('h3', t('preview')));
  for (const language of [locale, locale === 'de' ? 'en' : 'de']) {
    if (!proposal.preview[language]) continue;
    const section = document.createElement('section');
    section.lang = language;
    section.append(element('h4', language.toUpperCase()), element('p', proposal.preview[language]));
    for (const story of proposal.preview.stories ?? []) {
      if (!story[language]) continue;
      const storyView = document.createElement('article');
      storyView.append(element('strong', t(story.role, language)), element('p', story[language]));
      section.append(storyView);
    }
    view.append(section);
  }
  return view;
}

function bubble(label, text, own = false) {
  const node = element('div', '', 'intake-bubble' + (own ? ' you' : ''));
  node.append(element('strong', t(label)), element('p', text));
  return node;
}

function setProposal(proposal) {
  current = proposal;
  render();
}

async function interview(answer, continueInterview = false) {
  notice.textContent = t('loading');
  const proposal = await request(session.path + '/interview', session.token,
    { version: current.version, answer, locale, continueInterview });
  answerDraft = '';
  setProposal(proposal);
  proposalView.querySelector('textarea, button')?.focus();
}

function render() {
  if (!current) return;
  intake.hidden = true;
  const proposal = current;
  proposalView.replaceChildren(element('h3', t(proposal.status)), bubble('yourIdea', proposal.answers.problem, true));
  if (proposal.userStories?.length) {
    const stories = element('section', '', 'intake-preview');
    stories.append(element('h4', t('authoredStories')));
    for (const story of proposal.userStories) stories.append(element('strong', t(story.role)), element('p', story.text));
    proposalView.append(stories);
  }
  for (const turn of proposal.turns ?? []) {
    proposalView.append(bubble('guide', turn.question), bubble('you', turn.answer, true));
  }
  if (proposal.review?.reason) proposalView.append(bubble(proposal.review.action === 'revise' ? 'revisionFeedback' : 'reviewAccess', proposal.review.reason));
  if (proposal.interview?.question) proposalView.append(bubble('guide', proposal.interview.question));
  for (const [label, values] of [['assumptions', proposal.interview?.assumptions], ['decisions', proposal.interview?.decisions]]) {
    if (values?.length) proposalView.append(bubble(label, values.join('\n')));
  }
  if (proposal.preview) proposalView.append(preview(proposal));
  if (proposal.status !== 'draft') {
    proposalView.append(button('retry', async () => setProposal(await request(session.path, session.token))));
    proposalView.append(button('newIdea', () => {
      localStorage.removeItem(key);
      session = null;
      current = null;
      answerDraft = '';
      intake.reset();
      intake.hidden = false;
      proposalView.replaceChildren();
      intake.querySelector('[name="role"]').focus();
    }));
  } else if (proposal.preview) {
    proposalView.append(button('submit', async () => {
      setProposal(await request(session.path + '/submit', session.token, { version: proposal.version }));
    }, true));
    proposalView.append(button('keepAsking', () => interview(undefined, true)));
  } else if (proposal.interview?.question && proposal.pendingAnswer) {
    proposalView.append(bubble('you', proposal.pendingAnswer, true), element('p', t('answerSaved')),
      button('retryQuestion', () => interview(), true));
  } else if (proposal.interview?.question) {
    const label = element('label', t('reply'), 'field');
    const input = document.createElement('textarea');
    input.maxLength = 1000;
    input.value = answerDraft;
    input.addEventListener('input', () => { answerDraft = input.value; });
    label.append(input);
    proposalView.append(label, button('send', () => interview(input.value), true));
    if (proposal.interview.confirmation) {
      proposalView.append(button('confirmScope', () => interview(locale === 'de' ? 'Ja' : 'Yes')));
    }
  } else {
    proposalView.append(button('start', () => interview(), true));
  }
}

function ratingInput(key, value) {
  const label = element('label', t(key), 'field rating-field');
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '1';
  input.max = '5';
  input.value = value ?? '3';
  const output = element('span', input.value + ' / 5');
  input.addEventListener('input', () => { output.textContent = input.value + ' / 5'; });
  label.append(input);
  const row = element('div', '', 'rating-row');
  row.append(label, output, element('small', t(key + 'Scale')));
  return { row, input };
}

function addRatings(view, id, proposal) {
  const ratings = proposal.status === 'draft'
    ? proposal.history.at(-1)?.ratings ?? []
    : proposal.ratings ?? [];
  if (ratings.length) {
    const list = document.createElement('ul');
    for (const rating of ratings) {
      list.append(element('li', rating.reviewer.name + ' · ' + t('clarityShort') + ' '
        + rating.clarity + '/5 · ' + t('importanceShort') + ' ' + rating.importance + '/5'));
    }
    view.append(element('h4', t('ratingsTitle')), list);
  }
  if (proposal.status !== 'submitted') return;

  const own = ratings.find(rating => rating.reviewer.email === identity?.email);
  const clarity = ratingInput('clarity', own?.clarity);
  const importance = ratingInput('importance', own?.importance);
  const form = document.createElement('fieldset');
  form.append(element('legend', t('ratingTitle')), clarity.row, importance.row);
  form.append(button('saveRating', async () => {
    const updated = await request('/proposals/' + id + '/rating', reviewPassword, {
      version: proposal.version,
      clarity: Number(clarity.input.value),
      importance: Number(importance.input.value),
    });
    refreshDocument(updated);
    reviewNotice.textContent = t('ratingSaved');
  }, false, reviewNotice));
  view.append(form);
}

function refreshDocument(updated) {
  activeDocument = { ...activeDocument, document: { ...updated,
    revision: activeDocument.document.revision,
    status: updated.status === 'draft' ? 'returned' : updated.status,
    preview: activeDocument.document.preview,
    interview: activeDocument.document.interview,
    ratings: updated.status === 'draft' ? updated.history.at(-1)?.ratings : updated.ratings,
  }, proposalVersion: updated.version,
    sharedRevision: updated.status === 'rejected' ? null : activeDocument.sharedRevision };
  renderInbox();
}

function documentHref(id, revision) {
  return '?' + new URLSearchParams({ idea: id, revision }) + '#review-section';
}

function authorLine(author) {
  const contact = element('p', author.name + ' · ' + author.email);
  const reply = element('a', t('replyByEmail'));
  reply.href = 'mailto:' + encodeURIComponent(author.email).replace('%40', '@');
  contact.append(document.createTextNode(' · '), reply);
  return contact;
}

function renderCommunity() {
  communityView.replaceChildren();
  if (!communityDocuments) return;
  if (!communityDocuments.length) communityView.append(element('p', t('emptyCommunity')));
  for (const item of communityDocuments) {
    const view = preview(item);
    view.prepend(element('p', t('revision') + ' ' + item.revision));
    const controls = document.createElement('fieldset');
    const importance = ratingInput('importance', item.vote?.importance);
    const label = element('label', t('improvement'), 'field');
    const suggestion = document.createElement('textarea');
    suggestion.maxLength = 1000;
    suggestion.value = item.vote?.suggestion ?? '';
    label.append(suggestion);
    const saved = element('p', item.vote ? t('voteSaved') : '');
    saved.setAttribute('role', 'status');
    const submit = button('voteSave', async () => {
      try {
        item.vote = await request('/community/' + item.id + '/vote', null, {
          revision: item.revision,
          importance: Number(importance.input.value),
          suggestion: suggestion.value,
        });
        suggestion.value = item.vote.suggestion;
        saved.textContent = t('voteSaved');
      } catch (error) {
        if (error.status !== 409) throw error;
        saved.textContent = t('voteMissing');
      }
    }, true, communityNotice);
    controls.append(element('legend', t('communityVote')), importance.row, label, submit, saved);
    view.append(controls);
    communityView.append(view);
  }
}

function addCommunityControls(view, id, proposal) {
  const isShared = activeDocument.sharedRevision === proposal.revision;
  const canShare = ['submitted', 'accepted-for-specification'].includes(proposal.status);
  if (!isShared && !canShare) return;
  const controls = document.createElement('fieldset');
  controls.append(element('legend', 'Community'));
  if (isShared) controls.append(element('p', t('communityShared')));
  const submit = button(isShared ? 'withdrawCommunity' : 'shareCommunity', async () => {
    const result = await request('/proposals/' + id + '/community', reviewPassword, {
      version: activeDocument.proposalVersion,
      revision: proposal.revision,
      action: isShared ? 'withdraw' : 'share',
    });
    activeDocument.sharedRevision = result.sharedRevision;
    communityDocuments = await request('/community');
    renderCommunity();
    renderInbox();
  }, false, reviewNotice);
  if (!isShared) {
    const label = document.createElement('label');
    const check = document.createElement('input');
    check.type = 'checkbox';
    label.append(check, document.createTextNode(' ' + t('shareCheck')));
    submit.disabled = true;
    check.addEventListener('change', () => { submit.disabled = !check.checked; });
    controls.append(label);
  }
  controls.append(submit);
  view.append(controls);
}

function textField(label, value, maxLength) {
  const wrapper = element('label', t(label), 'field');
  const input = document.createElement('textarea');
  input.value = value ?? '';
  input.maxLength = maxLength;
  wrapper.append(input);
  return { wrapper, input };
}

function addRefinement(container, id, proposal, suggestion) {
  const details = document.createElement('details');
  details.append(element('summary', t('refine')));
  const language = proposal.preview[locale] ? locale : locale === 'de' ? 'en' : 'de';
  const text = textField(language === 'de' ? 'revisionDe' : 'revisionEn', proposal.preview[language], 4000);
  details.append(text.wrapper, button('refine', async () => {
    const updated = await request('/proposals/' + id + '/refine', reviewPassword, {
      version: proposal.version, revision: proposal.revision, suggestion,
      [language]: text.input.value,
    });
    location.href = documentHref(id, updated.revision);
  }, true, reviewNotice));
  container.append(details);
}

function addFeatureReport(view, id, proposal) {
  const editable = ['submitted', 'accepted-for-specification'].includes(proposal.status);
  if (!editable && !proposal.report) return;
  const section = document.createElement('section');
  section.className = 'intake-preview';
  section.append(element('h3', t('report')));
  async function save(mode, text) {
    const updated = await request('/proposals/' + id + '/report', reviewPassword, {
      mode, text, version: proposal.version, revision: proposal.revision,
    });
    refreshDocument(updated);
  }
  if (!proposal.report) {
    section.append(button('reportGenerate', () => save('generate'), true, reviewNotice));
  } else {
    const report = proposal.report;
    section.append(element('p', t(report.approvedAt ? 'reportApproved' : 'reportDraft')));
    section.append(element('h4', report.text.title), element('p', report.text.summary));
    const steps = document.createElement('ol');
    for (const step of ['step1', 'step2', 'step3', 'step4']) steps.append(element('li', report.text[step]));
    section.append(steps);
    if (editable) {
      const details = document.createElement('details');
      details.append(element('summary', t('reportEdit')));
      const fields = Object.entries(report.text).map(([key, value]) => {
        const label = key.startsWith('step') ? (locale === 'de' ? 'Schritt ' : 'Step ') + key.slice(4)
          : t(key === 'title' ? 'reportTitle' : 'reportSummary');
        const wrapper = element('label', label, 'field');
        const input = document.createElement('textarea');
        input.maxLength = 1200;
        input.value = value;
        wrapper.append(input);
        details.append(wrapper);
        return [key, input];
      });
      const text = () => Object.fromEntries(fields.map(([key, input]) => [key, input.value]));
      details.append(button('reportSave', () => save('save', text()), false, reviewNotice),
        button('reportApprove', () => save('approve', text()), true, reviewNotice));
      section.append(details);
    }
  }
  view.append(section);
}

function addTechnicalReview(view, id, proposal) {
  if (!proposal.report?.approvedAt && !proposal.technical) return;
  const editable = ['submitted', 'accepted-for-specification'].includes(proposal.status);
  if (!editable && !proposal.technical) return;
  const details = document.createElement('details');
  details.open = Boolean(proposal.technical);
  details.append(element('summary', t('technicalTitle')));
  if (editable) {
    const inputs = [
      ['findings', 'findings'], ['decisions', 'pmDecisions'], ['story', 'pmStory'],
      ['tests', 'pmTests'], ['open', 'pmOpen'],
    ].map(([key, label]) => [key, textField(label, proposal.technical?.notes[key], 2500)]);
    for (const [, field] of inputs) details.append(field.wrapper);
    details.append(button('saveSpec', async () => {
      const notes = Object.fromEntries(inputs.map(([key, { input }]) => [key, input.value]));
      const updated = await request('/proposals/' + id + '/technical', reviewPassword, {
        version: proposal.version, revision: proposal.revision, ...notes,
      });
      refreshDocument(updated);
    }, true, reviewNotice));
  }
  if (proposal.technical) {
    const spec = element('p', proposal.technical.spec, 'intake-spec');
    spec.lang = 'en';
    details.append(spec);
  }
  view.append(details);
}

function addCommunityFeedback(view, id, proposal, feedback) {
  const section = document.createElement('section');
  section.append(element('h4', t('communityFeedback')));
  if (!feedback.length) {
    section.append(element('p', t('noVotes')));
  } else {
    const average = feedback.reduce((sum, vote) => sum + vote.importance, 0) / feedback.length;
    section.append(element('p', t('voteCount') + ' · ' + feedback.length + ' · '
      + t('importanceShort') + ' ' + average.toLocaleString(locale, { maximumFractionDigits: 1 }) + '/5'));
    const suggestions = feedback.filter(vote => vote.suggestion);
    if (suggestions.length) {
      const list = document.createElement('ul');
      for (const suggestion of new Set(suggestions.map(vote => vote.suggestion))) {
        const item = element('li', suggestion);
        if (['submitted', 'accepted-for-specification'].includes(proposal.status)) addRefinement(item, id, proposal, suggestion);
        list.append(item);
      }
      section.append(list);
    }
  }
  view.append(section);
}

function renderDocument() {
  const { id, document: proposal, author, markdown } = activeDocument;
  const back = element('a', t('backToBoard'));
  back.href = './#review-section';
  inbox.append(back);
  const view = preview(proposal);
  view.prepend(element('h3', t('document') + ' · ' + t('revision') + ' ' + proposal.revision));
  view.append(element('p', t(proposal.status)));
  if (proposal.userStories?.length) {
    const authored = document.createElement('section');
    authored.append(element('h4', t('authoredStories')));
    for (const story of proposal.userStories) authored.append(element('strong', t(story.role)), element('p', story.text));
    view.append(authored);
  }
  if (author) view.append(authorLine(author));
  for (const [label, values] of [['assumptions', proposal.interview?.assumptions], ['decisions', proposal.interview?.decisions]]) {
    if (values?.length) view.append(bubble(label, values.join('\n')));
  }
  view.append(button('exportMarkdown', () => {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'feature-' + id + '-' + proposal.revision.replace(/[^a-z0-9-]/gi, '-') + '.md';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, false, reviewNotice));
  addCommunityControls(view, id, proposal);
  addCommunityFeedback(view, id, proposal, activeDocument.communityFeedback);
  if (proposal.change) view.append(element('p', proposal.change.suggestion));
  addFeatureReport(view, id, proposal);
  addTechnicalReview(view, id, proposal);
  addRatings(view, id, proposal);
  if (proposal.review?.reason) view.append(element('p', proposal.review.reason));
  if (proposal.status === 'submitted') {
    const label = element('label', t('reason'), 'field');
    const reason = document.createElement('textarea');
    reason.maxLength = 1000;
    label.append(reason);
    view.append(label);
    for (const action of ['accept', 'revise', 'reject']) {
      view.append(button(action, async () => {
        const updated = await request('/proposals/' + id + '/review', reviewPassword,
          { version: proposal.version, action, reason: reason.value });
        refreshDocument(updated);
      }, false, reviewNotice));
    }
  }
  inbox.append(view);
}

function renderInbox() {
  if (!reviews) return;
  inbox.replaceChildren();
  if (activeDocument) {
    renderDocument();
    return;
  }
  if (!reviews.length) inbox.append(element('p', t('empty')));
  for (const { id, proposal, revisions } of reviews) {
    const view = element('article', '', 'intake-preview');
    const last = proposal.history.at(-1);
    const boardPreview = proposal.status === 'draft' ? last?.preview : proposal.preview;
    const excerpt = boardPreview?.[locale] || boardPreview?.en || boardPreview?.de;
    view.append(element('h3', t(proposal.status === 'draft' && proposal.review?.action === 'revise'
      ? 'returned' : proposal.status)));
    if (excerpt) view.append(element('p', excerpt));
    if (proposal.author) view.append(authorLine(proposal.author));
    const links = document.createElement('ul');
    for (const revision of [...revisions].reverse()) {
      const link = element('a', t('openDocument') + ' ' + revision);
      link.href = documentHref(id, revision);
      const item = document.createElement('li');
      item.append(link);
      links.append(item);
    }
    view.append(links);
    inbox.append(view);
  }
}

function applyTheme(mode) {
  const theme = mode === 'light' || mode === 'dark' ? mode : 'system';
  if (theme === 'system') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
  themeSwitch.querySelectorAll('[data-color-mode]').forEach(node => {
    node.setAttribute('aria-pressed', String(node.dataset.colorMode === theme));
  });
}

applyTheme(localStorage.getItem(themeKey));
themeSwitch.querySelectorAll('[data-color-mode]').forEach(node => {
  node.addEventListener('click', () => {
    const mode = node.dataset.colorMode;
    localStorage.setItem(themeKey, mode);
    applyTheme(mode);
  });
});

function setLocale(language) {
  locale = language;
  localStorage.setItem(key + '-locale', locale);
  document.documentElement.lang = locale;
  document.title = t('title') + ' — ORISO Understand';
  themeSwitch.setAttribute('aria-label', t('themeLabel'));
  document.querySelectorAll('[data-copy]').forEach(node => { node.textContent = t(node.dataset.copy); });
  document.querySelectorAll('[data-locale]').forEach(node => {
    node.setAttribute('aria-pressed', String(node.dataset.locale === locale));
  });
  notice.textContent = message ? t(message) : '';
  render();
  renderInbox();
  renderCommunity();
  renderStoryEditor();
  if (testmails) document.querySelector('[data-copy="accessHint"]').textContent = t('testmailsHint');
}

document.querySelectorAll('[data-locale]').forEach(node => {
  node.addEventListener('click', () => { if (!pending) setLocale(node.dataset.locale); });
});

intake.addEventListener('submit', event => {
  event.preventDefault();
  run(event.submitter, async () => {
    const data = new FormData(intake);
    const form = Object.fromEntries(data);
    form.stakeholders = data.getAll('stakeholders');
    form.userStories = userStories;
    const { id, token, proposal } = await request('/proposals', null, { locale, form });
    session = { path: '/proposals/' + id, token };
    userStories = [];
    storeStories();
    renderStoryEditor();
    localStorage.setItem(key, JSON.stringify(session));
    setProposal(proposal);
    document.querySelector('#chat-title').focus();
    await interview();
  });
});

document.querySelector('#review').addEventListener('submit', event => {
  event.preventDefault();
  const password = new FormData(event.target).get('token');
  event.target.reset();
  run(event.submitter, async () => {
    const [ideas, { domains }, loaded] = await Promise.all([
      requestedDocument ? [] : request('/review', password),
      testmails ? { domains: [] } : request('/domains', password),
      requestedDocument ? request('/proposals/' + encodeURIComponent(requestedDocument.id)
        + '/document?' + new URLSearchParams({ revision: requestedDocument.revision }), password) : null,
    ]);
    reviews = ideas;
    activeDocument = loaded && { ...loaded, id: requestedDocument.id };
    reviewPassword = password;
    domainForm.elements.domains.value = domains.join('\n');
    domainForm.hidden = testmails;
    renderInbox();
  }, reviewNotice);
});

domainForm.addEventListener('submit', event => {
  event.preventDefault();
  run(event.submitter, async () => {
    const domains = domainForm.elements.domains.value.split(/\s+/).filter(Boolean);
    const saved = await request('/domains', reviewPassword, { domains });
    domainForm.elements.domains.value = saved.domains.join('\n');
    reviewNotice.textContent = t('savedDomains');
    const status = await request('/access');
    if (!status.identity) setIdentity(null);
  }, reviewNotice);
});

function resume() {
  if (!session) return;

  request(session.path, session.token).then(setProposal).catch(error => {
    if (error.status === 404) {
      localStorage.removeItem(key);
      session = null;
      message = 'lost';
    } else {
      message = 'failed';
    }
    notice.textContent = t(message);
  });
}

function setIdentity(value, reviewer) {
  identity = value;
  userStories = identity ? JSON.parse(localStorage.getItem(key + '-stories-' + identity.email) ?? '[]') : [];
  renderStoryEditor();
  identityView.hidden = !identity;
  identityView.querySelector('p').textContent = identity ? identity.name + ' · ' + identity.email : '';
  accessForm.hidden = testmails || Boolean(identity);
  if (testmails) {
    document.querySelector('#testmails-login').hidden = Boolean(identity);
    document.querySelector('#logout').hidden = true;
    document.querySelector('#review [name="token"]').required = false;
    document.querySelector('#review [name="token"]').closest('label').hidden = true;
    document.getElementById('review-section').dataset.reviewer = String(Boolean(reviewer));
  }
  verifyForm.hidden = true;
  for (const id of ['idea', 'conversation', 'review-section', 'community']) document.getElementById(id).hidden = !identity;
  if (testmails && !reviewer) document.getElementById('review-section').hidden = true;
  if (identity) {
    if (requestedDocument && (!testmails || reviewer)) {
      document.querySelector('#review-section details').open = true;
      document.querySelector('#review-section').scrollIntoView();
    }
    resume();
  } else {
    current = null;
    reviews = null;
    activeDocument = null;
    communityDocuments = null;
    renderCommunity();
    reviewPassword = null;
    domainForm.hidden = true;
    inbox.replaceChildren();
    proposalView.replaceChildren(element('p', t('chatEmpty')));
    intake.reset();
    intake.hidden = false;
  }
}

accessForm.addEventListener('submit', event => {
  event.preventDefault();
  run(event.submitter, async () => {
    try {
      const body = Object.fromEntries(new FormData(accessForm));
      accessForm.elements.password.value = '';
      ({ challenge } = await request('/access/code', null, body));
      accessForm.hidden = true;
      verifyForm.hidden = false;
      verifyForm.elements.code.focus();
      accessNotice.textContent = t('codeSent');
    } catch (error) {
      message = error.status === 403 ? 'codeDenied' : error.status === 429 ? 'codeLimit' : 'mailFailed';
    }
  }, accessNotice);
});

verifyForm.addEventListener('submit', event => {
  event.preventDefault();
  run(event.submitter, async () => {
    try {
      const result = await request('/access/verify', null, { challenge, code: verifyForm.elements.code.value });
      challenge = null;
      verifyForm.reset();
      setIdentity(result.identity);
      document.querySelector('#idea h2').scrollIntoView();
    } catch {
      message = 'codeInvalid';
    }
  }, accessNotice);
});

document.querySelector('#access-restart').addEventListener('click', () => {
  verifyForm.reset();
  verifyForm.hidden = true;
  accessForm.hidden = false;
  accessNotice.textContent = '';
  accessForm.elements.password.focus();
});

document.querySelector('#logout').addEventListener('click', event => {
  run(event.currentTarget, async () => {
    await request('/access/logout', null, {});
    accessForm.reset();
    setIdentity(null);
  }, accessNotice);
});

document.querySelector('#load-community').addEventListener('click', event => {
  run(event.currentTarget, async () => {
    communityDocuments = await request('/community');
    renderCommunity();
  }, communityNotice);
});

setLocale(locale);
request('/access').then(result => setIdentity(result.identity, result.reviewer)).catch(() => {
  accessNotice.textContent = t('failed');
});
