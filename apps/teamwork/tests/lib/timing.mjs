// The timing factor of gap G8: 1 on the reference machine, larger on a slower one (for example a CI runner).
// Checks that measure time multiply their limits by it; the runner writes it into verification/report.json.
// It is read from the environment variable TEAMWORK_TIMING_FACTOR, which must be a positive number when set.
export function timingFactor(env = process.env) {
  const raw = env.TEAMWORK_TIMING_FACTOR;
  if (raw === undefined || raw === '') return 1;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`TEAMWORK_TIMING_FACTOR must be a positive number, got "${raw}"`);
  }
  return value;
}
