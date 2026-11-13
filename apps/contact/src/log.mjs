// The only log lines of the handler (spec 7.6, X8). Never a message, a name, an address, a client address, a token or a request line.
export function createLog(write = line => process.stderr.write(line + '\n')) {
  return {
    listening: (port, mailConfigured) => write(`contact: listening on ${port}, mail ${mailConfigured ? 'configured' : 'missing'}`),
    config: (variable, what) => write(`contact: ${variable} ${what}`),
    smtpFailed: (code, response) => write(`contact: smtp failed code=${safe(code)} response=${safe(response)}`),
    globalCap: limit => write(`contact: global cap reached limit=${Number(limit)} per hour`),
    error: code => write(`contact: error ${safe(code)}`),
  };
}
// codes only: letters, digits, underscore, dash; anything else becomes "-"
const safe = v => (v === undefined || v === null || v === '') ? '-' : String(v).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || '-';
