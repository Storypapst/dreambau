// A minimal SMTP server for tests: records MAIL FROM, RCPT TO and DATA of each message. No TLS, no auth, loopback only.
import net from 'node:net';

export function startFakeSmtp({ refuse = false } = {}) {
  const messages = [];
  const server = net.createServer(sock => {
    let mode = 'cmd', buf = '', cur = null;
    const say = l => sock.write(l + '\r\n');
    say('220 fake.example.test ESMTP');
    sock.on('data', d => {
      buf += d.toString('utf8');
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (mode === 'data') {
          if (line === '.') { messages.push(cur); cur = null; mode = 'cmd'; say(refuse ? '554 refused' : '250 queued'); }
          else cur.data += (line.startsWith('..') ? line.slice(1) : line) + '\r\n';
          continue;
        }
        const up = line.toUpperCase();
        if (up.startsWith('EHLO') || up.startsWith('HELO')) { sock.write('250-fake.example.test\r\n250 8BITMIME\r\n'); }
        else if (up.startsWith('MAIL FROM:')) { cur = { from: line.slice(10).trim(), to: [], data: '' }; say('250 ok'); }
        else if (up.startsWith('RCPT TO:')) { cur.to.push(line.slice(8).trim()); say('250 ok'); }
        else if (up === 'DATA') { mode = 'data'; say('354 go'); }
        else if (up === 'QUIT') { say('221 bye'); sock.end(); }
        else if (up === 'RSET' || up === 'NOOP') say('250 ok');
        else say('502 not implemented');
      }
    });
    sock.on('error', () => {});
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, messages, close: () => new Promise(r => server.close(r)) })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await startFakeSmtp();
  console.log(`fake smtp on 127.0.0.1:${s.port}`);
}
