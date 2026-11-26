const DAY_MS = 86_400_000;
const RETRY_MS = 10 * 60_000;
const INTERVALS_IN_DAYS = [1, 3, 7, 14, 30, 60];
const RECENT_LIMIT = 6;

// The first 24 words carry recorded audio and predate the pattern field.
const recordedPatterns = {
  Rad: 'Verlängern', Hund: 'Verlängern', Zelt: 'Verlängern', Wald: 'Verlängern',
  bunt: 'Verlängern', Abend: 'Verlängern', mutig: 'Verlängern',
  Wetter: 'Doppelkonsonanten', kommen: 'Doppelkonsonanten', spielen: 'Langes i mit ie',
  fahren: 'Dehnungs-h', nass: 'ss und ß', Fahrrad: 'Wortbausteine', nämlich: 'Merkwörter',
  vielleicht: 'Merkwörter', plötzlich: 'ck und tz', interessant: 'Merkwörter',
  Schlüssel: 'ss und ß', Freundschaft: 'Wortbausteine', Frühstück: 'Wortbausteine',
  Rhythmus: 'Merkwörter', wahrscheinlich: 'Wortbausteine', Straße: 'ss und ß',
  regelmäßig: 'ss und ß',
};

export function taskId(task) {
  return task.id ?? 'de-' + task.text.normalize('NFC').toLowerCase();
}

export function taskPattern(task) {
  return task.pattern ?? recordedPatterns[task.text] ?? 'Merkwörter';
}

function wordTier(task) {
  return task.tier ?? task.level ?? 1;
}

// The profile contains plain JSON. A caller merging independent devices can
// also rebuild it by replaying deduplicated attempts in timestamp order.
export function createProfile(saved) {
  const restored = saved?.version === 1 ? JSON.parse(JSON.stringify(saved)) : {};
  return {
    version: 1,
    tier: [1, 2, 3].includes(restored.tier) ? restored.tier : 1,
    turn: Number.isSafeInteger(restored.turn) ? restored.turn : 0,
    cleanByTier: { 1: 0, 2: 0, 3: 0, ...restored.cleanByTier },
    recentIds: Array.isArray(restored.recentIds) ? restored.recentIds.slice(-RECENT_LIMIT) : [],
    wordStats: restored.wordStats ?? {},
    patternStats: restored.patternStats ?? {},
  };
}

function blankWordStats() {
  return {
    attempts: 0, correct: 0, errors: 0, clean: 0, streak: 0, dueAt: 0,
    lastAttemptAt: 0, lastTurn: 0, lastError: null, errorsByIndex: {},
  };
}

function attemptError(task, attempt, at) {
  const letters = [...task.text];
  let given = attempt.given ?? null;
  let index = attempt.index;
  if (!Number.isInteger(index) && typeof given === 'string' && (given.length > 1 || attempt.expected === task.text)) {
    const answer = [...given.normalize('NFC')];
    const mismatch = letters.findIndex((letter, position) => letter !== answer[position]);
    index = mismatch < 0 ? letters.length : mismatch;
    given = answer[index] ?? '';
  }
  if (!Number.isInteger(index) || index < 0 || index > letters.length) index = null;
  const expected = index === null ? attempt.expected ?? null : letters[index] ?? '';
  return { given, expected, index, at };
}

export function wordStatus(task, profile) {
  const stats = profile.wordStats[taskId(task)];
  if (!stats) return 'new';
  if (!stats.streak) return 'practice';
  return stats.streak < 3 ? 'learning' : 'secure';
}

// Call once per wrong selection and once per independently completed word.
// A corrected or hinted completion leaves the preceding error outstanding.
export function recordAttempt(profile, task, attempt, now = Date.now()) {
  if (attempt.correct && attempt.assisted) return profile;
  const id = taskId(task);
  const pattern = taskPattern(task);
  const stats = profile.wordStats[id] ??= blankWordStats();
  const group = profile.patternStats[pattern] ??= { need: 0, correct: 0, errors: 0 };
  if (profile.recentIds[profile.recentIds.length - 1] !== id) {
    profile.recentIds = [...profile.recentIds.filter(item => item !== id), id].slice(-RECENT_LIMIT);
    profile.turn++;
  }
  stats.attempts++;
  stats.lastAttemptAt = now;
  stats.lastTurn = profile.turn;

  if (!attempt.correct) {
    const error = attemptError(task, attempt, now);
    stats.errors++;
    stats.streak = 0;
    stats.dueAt = now + RETRY_MS;
    stats.lastError = error;
    if (error.index !== null) {
      const previous = stats.errorsByIndex[error.index];
      stats.errorsByIndex[error.index] = { ...error, count: (previous?.count ?? 0) + 1 };
    }
    if (error.index === null || task.traps?.[error.index] !== undefined) {
      group.errors++;
      group.need = Math.min(8, group.need + 2);
    }
    return profile;
  }

  stats.correct++;
  group.correct++;
  group.need = Math.max(0, group.need - 1);
  if (stats.streak === 0 || (!attempt.review && now >= stats.dueAt)) {
    stats.streak = Math.min(stats.streak + 1, INTERVALS_IN_DAYS.length);
    stats.dueAt = now + DAY_MS * INTERVALS_IN_DAYS[stats.streak - 1];
  }
  if (attempt.review) return profile;
  stats.clean++;
  if (stats.clean === 1) {
    profile.cleanByTier[wordTier(task)]++;
    if (profile.cleanByTier[1] >= 8) profile.tier = Math.max(profile.tier, 2);
    if (profile.tier >= 2 && profile.cleanByTier[2] >= 12) profile.tier = 3;
  }
  return profile;
}

function chooseFrom(items, random) {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function oldestDue(tasks, profile) {
  const earliest = Math.min(...tasks.map(task => profile.wordStats[taskId(task)].dueAt));
  return tasks.filter(task => profile.wordStats[taskId(task)].dueAt === earliest);
}

// recentIds is ordered oldest-first and may include unattempted prompts.
// excludeIds is a hard exclusion, useful when building a special round.
export function selectTask(tasks, profile, { now = Date.now(), random = Math.random, recentIds = [], excludeIds = [] } = {}) {
  const excluded = new Set(excludeIds);
  const eligible = tasks.filter(task => !excluded.has(taskId(task)) && wordTier(task) <= profile.tier);
  if (!eligible.length) return undefined;
  const recent = profile.recentIds.filter(id => now - profile.wordStats[id]?.lastAttemptAt < RETRY_MS);
  const protectedIds = [...new Set([...recent, ...recentIds].reverse())].slice(0, RECENT_LIMIT);
  // For a tiny word list, release the oldest protected word first.
  let pool = eligible;
  for (const id of protectedIds) {
    const others = pool.filter(task => taskId(task) !== id);
    if (others.length) pool = others;
  }

  const fresh = [], missed = [], due = [], transfer = [];
  let largestNeed = 0;
  for (const task of pool) {
    const stats = profile.wordStats[taskId(task)];
    const ready = stats && stats.dueAt <= now;
    if (!stats) fresh.push(task);
    if (stats?.streak === 0 && (ready || profile.turn - stats.lastTurn >= RECENT_LIMIT)) missed.push(task);
    if (ready && stats.streak > 0) due.push(task);
    const need = profile.patternStats[taskPattern(task)]?.need ?? 0;
    if (need > 0 && need >= largestNeed && (!stats || (ready && stats.streak > 0))) {
      if (need > largestNeed) transfer.length = 0;
      largestNeed = need;
      transfer.push(task);
    }
  }

  const roll = random();
  if (roll < .34 && missed.length) return chooseFrom(oldestDue(missed, profile), random);
  if (roll < .54 && transfer.length) return chooseFrom(transfer, random);
  if (roll >= .84 && due.length) return chooseFrom(oldestDue(due, profile), random);
  if (fresh.length) {
    const current = fresh.filter(task => wordTier(task) === profile.tier);
    return chooseFrom(current.length && random() < .8 ? current : fresh, random);
  }
  const repeats = missed.length ? missed : due;
  return chooseFrom(repeats.length ? oldestDue(repeats, profile) : oldestDue(pool, profile), random);
}

// If supplied, ids restricts the end review to errors from a particular run.
export function reviewTasks(tasks, profile, { ids, limit = Infinity } = {}) {
  const allowed = ids ? new Set(ids) : null;
  return tasks.filter(task => {
    const id = taskId(task);
    return (!allowed || allowed.has(id)) && profile.wordStats[id]?.lastError;
  }).sort((left, right) => {
    const a = profile.wordStats[taskId(left)], b = profile.wordStats[taskId(right)];
    return Number(b.streak === 0) - Number(a.streak === 0) || b.lastError.at - a.lastError.at;
  }).slice(0, limit);
}
