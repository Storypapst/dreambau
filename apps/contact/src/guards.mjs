// Spam and abuse guards (spec 5.5): per-client budget, global cap, nonce table. Memory only (H11, X7).
import crypto from 'node:crypto';

// S7: the Nth entry from the right of X-Forwarded-For (N = trusted proxies), else the socket address
export function clientAddress(req, trustedProxies) {
  const socket = req.socket && req.socket.remoteAddress || '';
  if (!trustedProxies) return socket;
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  return xff.length >= trustedProxies ? xff[xff.length - trustedProxies] : socket;
}

export function createGuards(cfg, nowS) {
  const keySecret = crypto.randomBytes(32);           // made at start, kept in memory only
  const clients = new Map();                           // key -> [post times]
  const nonces = new Map();                            // nonce -> { state: 'flight'|'sent', until }
  let sentTimes = [];                                  // send times within the last hour
  let lastCapLog = -Infinity;

  const keyOf = address => crypto.createHmac('sha256', keySecret).update(String(address)).digest('hex').slice(0, 16);

  function sweep() {
    const now = nowS();
    for (const [k, times] of clients) {
      const live = times.filter(t => t > now - cfg.rateWindow);
      if (!live.length && times.length && times[times.length - 1] <= now - cfg.rateWindow - 60) clients.delete(k);
      else if (live.length !== times.length && live.length) clients.set(k, live);
    }
    for (const [n, e] of nonces) if (e.until <= now) nonces.delete(n);
    sentTimes = sentTimes.filter(t => t > now - 3600);
  }

  // S5: count every post; { ok } or { ok: false, retryAfter } or { ok: false, full: true }
  function countPost(address) {
    const now = nowS(), k = keyOf(address);
    let times = clients.get(k);
    if (!times) {
      if (clients.size >= cfg.maxEntries) { sweep(); if (clients.size >= cfg.maxEntries) return { ok: false, retryAfter: cfg.rateWindow }; }
      times = []; clients.set(k, times);
    }
    const live = times.filter(t => t > now - cfg.rateWindow);
    live.push(now);
    clients.set(k, live);
    if (live.length > cfg.rateKeyMax) return { ok: false, retryAfter: Math.max(1, Math.ceil(live[0] + cfg.rateWindow - now)) };
    return { ok: true };
  }

  return {
    keyOf,
    countPost,
    nonceState: n => { const e = nonces.get(n); return e && e.until > nowS() ? e.state : null; },
    nonceTableFull: () => { if (nonces.size >= cfg.maxEntries) sweep(); return nonces.size >= cfg.maxEntries; },
    markInFlight: (n, until) => nonces.set(n, { state: 'flight', until }),
    markSent: (n, until) => { nonces.set(n, { state: 'sent', until }); sentTimes.push(nowS()); },
    release: n => nonces.delete(n),
    globalCapReached: () => { const now = nowS(); sentTimes = sentTimes.filter(t => t > now - 3600); return sentTimes.length >= cfg.globalPerHour; },
    shouldLogCap: () => { const now = nowS(); if (now - lastCapLog >= 600) { lastCapLog = now; return true; } return false; },
    sweep,
    sizes: () => ({ clients: clients.size, nonces: nonces.size }),
  };
}
