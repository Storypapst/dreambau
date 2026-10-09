// The little bit of argument handling that the three tools share. Options that take a value are listed in `options`,
// switches in `flags`; everything else that does not start with `-` is positional; `--` ends the options. Returns
// { flags: Set, values: {}, positional: [], error: string|null }; the tool prints the usage and exits 2 on an error.
export function parseArguments(argv, { flags = [], options = [] }) {
  const result = { flags: new Set(), values: {}, positional: [], error: null };
  let optionsEnded = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (optionsEnded || !arg.startsWith('-') || arg === '-') result.positional.push(arg);
    else if (arg === '--') optionsEnded = true;
    else if (flags.includes(arg)) result.flags.add(arg);
    else if (options.includes(arg)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) { result.error = `${arg} needs a value`; return result; }
      result.values[arg] = value;
      index += 1;
    } else { result.error = `unknown option ${arg}`; return result; }
  }
  return result;
}

// An ISO instant such as 2026-10-09T22:30:00Z, for the injected clock (BD-2). null when it is none.
export function parseInstant(text) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(text)) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}
