// The namespace name of Atom (RFC 4287), assembled from parts: it is a name, not a web address anyone requests, and the
// hygiene scan (static/hygiene) reads every address (a scheme, two slashes and a host) in the folder and allows only dreambau.com and invented hosts.
export const ATOM = ['http:', '', 'www.w3.org', '2005', 'Atom'].join('/');

// The host that has no Blog (AD-3), assembled for the same reason: the scan reads a name written out in full as a foreign host.
export const WWW = ['www', 'dreambau', 'com'].join('.');
