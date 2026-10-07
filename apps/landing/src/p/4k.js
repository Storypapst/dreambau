// Rohbau (production "4k"): an isometric city that builds itself out of TV static.
//
// Picture: one fragment shader. Per pixel a short cell walk steps down through an isometric (2:1) field of
// building columns and stops at the first face it meets; top, left and right faces get three shades,
// windows are a hash pattern on the side faces. Sound: compact minimal techno in A minor.
//
// Picture and sound share one tempo, 122 BPM (shader: a = T*122/60 beats, music: b = 60/122 s).
// Sync points (bar n starts at beat 4n = n * 1.967 s):
//   bars 0-6   0.0-13.8 s  static: TV snow fades in, ghost columns flicker | Geiger clicks, noise swell
//   bar 7      13.77 s     plan: kick enters; the cyan grid draws in as a radial wave, one ring per beat
//   bar 8      15.74 s     columns rise one floor per beat (small overshoot), centre first | hammer on beat 4
//   bar 9      17.70 s     bass enters (Am Am F G)
//   bar 15     29.51 s     city: dawn sky, windows light up in a wave | arpeggio with dark delay, ducked pad
//   every kick             window lights breathe with the low-band energy E.x (at most 15 %)
//   bar 21     41.31 s     breakdown, the city dims to a silhouette; "Jeht nich…" on bell A (Am pad)
//   bar 23     45.25 s     "jibs nich…" on bell C (F pad); riser starts
//   bar 25     49.18 s     "dreambau.com" on bell E with the A-major chord (final hit); rings out by 58 s
Dream.add({
  id: '4k', dur: 60, fin: 53,
  frag: /*glsl*/`
float a; // story clock in beats

// Height in floors of the column on cell c at beat b. Final height: hash with a radial envelope,
// streets on every 4th row and column. It rises from beat 32+1.5r one floor per beat, each step
// eased with a 10 % overshoot. Before the plan (b<28) only ghosts of the final columns flicker,
// more of them as the plan approaches.
float H(vec2 c,float b){
  float r=length(c),
  f=floor((h2(c)*.8+.2)*24.*exp(-r*r*.02))*step(1.,mod(c.x+2.,4.))*step(1.,mod(c.y+2.,4.)),
  t=clamp(b-32.-r*1.5,0.,f*=step(2.,f)),
  x=min(fract(t)*3.,1.)-1.;
  return b<28.?f*step(.95-b*.005,h2(c+floor(T*3.))):floor(t)+1.+x*x*(2.7*x+1.7);
}

void main(){
  vec2 p=(2.*gl_FragCoord.xy-R)/R.y,g,c,f,u;
  a=min(T,57.)*2.0333;
  // camera: zoom (world units per p-unit, portrait fits the width) and drift towards the final framing
  float m=1.-smoothstep(9.,53.,T),
  Z=(11.-5.*m*m)*max(1.,1.5*R.y/R.x),
  s=.41, // screen height of one floor (cell = 1 unit, three floors per cell width)
  z=25.,h,n=0.,e,d;
  u=p*Z+vec2(8.*m*(1.-m),1.5+m);
  // ground position of this pixel's ray at height z; walk down cell by cell (the ray moves along +x+y)
  g=vec2(u.x*.5+u.y,u.y-u.x*.5)-z*s;
  for(int i=0;i<26;i+=1){
    c=floor(g);f=g-c;h=H(c,a);
    d=min(1.-f.x,1.-f.y)+1e-4;
    e=z-d/s;
    if(e<=h){if(z>h){g+=(z-h)*s;z=h;n=0.;}break;}
    n=f.x>f.y?1.:2.;g+=d;z=e;
  }
  // n: 0 top (roof or ground), 1 left face, 2 right face; z: hit height; f: position inside the cell
  f=g-c;
  float r=length(c),w=f.x+f.y,q=2.*Z/R.y,
  k=smoothstep(60.,68.,a),
  l=smoothstep(84.,88.,a),
  y=floor(a-27.)-r,
  L=smoothstep(q*1.5,q*.3,n>0.?min(min(w,1.-w),(h-z)*s):min(min(f.x,f.y),min(1.-f.x,1.-f.y))),
  v=h2(c*9.+floor(vec2(w*3.,z))+n),
  P=smoothstep(13.,9.,length(g));
  vec3 C=vec3(.012,.018,.035),K=vec3(.25,.75,1.),A=vec3(1.,.5,.15),
  // background: ink; the dawn sky comes up with the city (amber horizon, deep blue above) and
  // brightens from the riser (bar 23) until the composition is final (bar 27, fin)
  o=mix(C,mix(A*(.4+.2*smoothstep(92.,108.,a)),p.y>.2?vec3(.04,.07,.18):C,smoothstep(0.,.7,abs(p.y-.2))),k),
  // surfaces: dark blueprint, then three shades (top/left/right), darker towards the street,
  // dimmed to a silhouette for the words
  F=z>0.?mix(C,vec3(.1,.16,.21)*(1.-n*.3)*(.4+.6*min(z*.15,1.)),k*(1.-l*.75)):C+vec3(.01,.03,.035)*k;
  // the far side of the city sinks into the dawn haze
  vec3 col=mix(o,F,P*(1.-.35*k*smoothstep(-8.,20.,g.x+g.y)));
  // cyan lines once drawn (the newest ring flashes on its beat); faint flickering ghosts in the static
  col+=K*L*P*(a<28.?.25*step(.01,z)*smoothstep(2.,9.,T):step(0.,y)*(1.+3.*exp(-y*2.-fract(a)*4.))*(1.-.8*k)*(1.-l));
  // amber roof edges in the city; they flash with the hammer on beat 4 of every bar (bars 8-20)
  col+=A*L*step(.01,z)*step(n,.5)*(k+step(.75,fract(a*.25))*exp(-fract(a)*5.)*step(abs(a-58.),26.))*(1.-l);
  // windows: a wave from the centre from bar 15, few stay lit for the words, slow twinkle
  vec2 j=abs(fract(vec2(w*3.,z))-.5);
  col+=mix(A,vec3(1.,.9,.7),v)*(.85+.15*E.x)*step(.5,n)*step(j.x,.3)*step(j.y,.22)*step(fract(v*7.+T*.04),clamp((a-60.-r)/6.,0.,.5)*(1.-l*.85));
  // TV snow (cold grain, bright specks, slow roll): fades in from black (visible within a second), recedes with the ring wave
  float N=h2(floor(p*150.)+floor(T*24.)*.37);
  col+=(.35*smoothstep(0.,1.5,T)+.65*smoothstep(0.,9.,T))*(1.-clamp((a-28.)/16.,0.,1.))*step(y,0.)*(N*N*.35*(.55+.45*sin(p.y*2.-T*1.2))+step(.998,N)*.5)*vec3(.85,.92,1.);
  // tagline (distances in units of the block half width; the field reaches 0.027 outside the glyphs):
  // on its note each line grows from the stroke spine to full weight within a 16th, with an amber flare
  // that settles to a soft glow, and a dark ring keeps the city away from the glyph edges
  vec3 D=tdist(p)/TT.z,x=a-vec3(84,92,100),b=clamp(x*4.,0.,1.);
  col=mix(col*(1.-.9*dot(b,clamp((.027-D)*50.,0.,1.)))+A*.25*dot(b+3.*b*exp(-abs(x)),exp(-max(D,0.)*150.)),vec3(1.,.92,.8),min(1.,dot(b*clamp(.5-(D+.02*(1.-b))*TT.z*R.y*.5,0.,1.),vec3(1))));
  // calm dark bottom band for the closing line, soft vignette
  col*=smoothstep(-1.15,-.6,p.y)*(1.-.06*dot(p,p));
  O=vec4(col+(h2(gl_FragCoord.xy)-.5)/128.,1);
}`,
  music(K) {
    const b = 60 / 122, o = K.out, hz = K.hz,
      rv = K.rev(3, 3, .5), ar = K.bus(1, -.3), dl = K.dly(b * .75, .45, .5, K.bus(1, .4), 1400),
      pd = K.bus(1), bl = K.bus(1), hb = K.bus(1, .3), hm = K.bus(.7, -.25), kk = [],
      // chords per bar of the loop: Am Am F G
      CH = [[57, 60, 64], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
    ar.connect(dl); pd.connect(rv); bl.connect(rv); bl.connect(dl); hm.connect(rv);
    let s = 3;
    const r = () => (s = s * 16807 % 2147483647) / 2147483647,
      // noise swell with a rising envelope (re-automates the burst's gain)
      sw = (t, d, f1, f2, v, y) => { const g = K.n(t, d, f1, f2, 1.5, v, o, y).gain; g.cancelScheduledValues(t); g.setValueAtTime(v / 20, t); g.exponentialRampToValueAtTime(v, t + d); },
      // pad chord (midi notes) at beat t for d beats, attack at, release rl
      ch = (ns, t, d, v, rl, at = 1.5) => ns.forEach(n => K.p('sawtooth', t * b, d * b, hz(n), v, at, rl, pd, 900, 9));
    // emergence: Geiger clicks with rising density, filtered noise swell into bar 7
    for (let t = .3; t < 13.6; t += .02 + r() * (1.3 - t / 11)) K.n(t, .006, 2e3 + r() * 3e3, 0, 1, .04 + t * .012);
    sw(1.5, 12.25, 150, 2500, .5, 'lowpass');
    // beat i from bar 7: kick, off-beat hat, hammer on beat 4, bass from bar 9, arpeggio and pad from bar 15
    for (let i = 28; i < 84; i++) {
      const t = i * b, C = CH[(i >> 2) % 4], R = C[0] - 24, q = i % 4;
      kk.push(t);
      K.o('sine', t, .32, 220, 46, .8, o, .06); K.n(t, .015, 3e3, 0, 1, .2);
      K.n(t + b / 2, .05, 7e3, 0, 1, .35, hb);
      if (i > 43) K.n(t + b * .75, .02, 8e3, 0, 1, .1, hb);
      if (i > 31 && q == 3) { K.n(t, .03, 2600, 0, 4, .4, hm); K.o('triangle', t, .4, 1310, 0, .1, hm); K.o('triangle', t, .3, 1930, 0, .06, hm); }
      if (i > 35) { K.p('sawtooth', t + b / 2, b * .3, hz(R), .25, .005, .08, o, 700); K.p('sawtooth', t + b * .75, b * .15, hz(R), .16, .005, .06, o, 700); }
      if (i > 59) {
        for (let k = 0; k < 4; k++) if (0xB6D >> (i * 4 + k) % 12 & 1) K.p('square', t + k * b / 4, .02, hz(C[(i * 4 + k) % 3] + 12), .1, .003, .14, ar, 1800);
        if (!q) ch(C, i, 4, .05, .3);
      }
    }
    K.duck(pd.gain, kk, .3, .15);
    // breakdown: one bell per word (A, C, E), pads Am -> F -> A major, riser into the last word
    [[84, 81, [45, 52, 57, 60, 64]], [92, 84, [41, 48, 57, 60, 65]], [100, 88, [45, 52, 57, 61, 64]]].forEach(([w, n, v], k) => {
      const t = w * b, f = hz(n);
      K.o('sine', t, 4, f, 0, .2, bl); K.o('sine', t, 1.5, f * 2.76, 0, .05, bl);
      ch(v, w, k < 2 ? 7.5 : 8, .05, k < 2 ? .5 : 5, k < 2 ? 1.5 : .03);
    });
    sw(92 * b, 8 * b, 300, 5000, .15);
    K.o('sine', 100 * b, 2.5, 110, 50, .5, o, .3);
  },
});
