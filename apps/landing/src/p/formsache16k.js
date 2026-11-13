// Formsache: production "formsache16k" for the dreambau.com landing page.
// Theme: the same question, a different answer every time. A lump of clay on a workbench is asked the same thing
// twenty times (three rings of light, one motif). It answers with a star, a ring, a snail, a fried egg ... until
// four wooden bars close into a brick mould around it and the answer comes out the same: three bricks, one for
// each line of the tagline. Seen from above, lit by one lamp, moved in twelve poses a second like stop motion.
//
// One beat grid for picture and music: 108 BPM, beat 0.556 s, bar 2.222 s, 27 bars = 60 s, swung eighths.
// Sync points (beat = seconds):
//   8, 16 (4.4, 8.9)        the question C D G, slowly, twice   <-> three rings of light; answers on beats 12 and 20
//   24 (13.3)               bass and brushes enter              <-> the lamp turns up; one question and answer in every bar
//   32, 40, 48 (17.8, 22.2, 26.7)  a wooden knock               <-> the first three bars of the mould slide in
//   48 (26.7)               walking bass, soft chords           <-> the clay is pressed into the open mould, more light
//   56 to 67 (31.1 ...)     question and answer twice a bar     <-> the tongue that still sticks out shrinks; the last
//                           note of the answer closes in on the right one (+6 -5 +4 -3 +2 -2 +1 -1 semitones)
//   70 (38.9)               a fanfare that lands a semitone too high, then nothing  <-> the one answer in twenty that
//                           goes astray: the clay leaves the mould as a sausage and walks off
//   72 (40.0)               knock                               <-> the fourth bar closes the mould, it moves aside
//   74 (41.1)               the right answer A F and a bell     <-> brick one, "Jeht nich..."
//   82 (45.6)               the same answer                     <-> brick two, "jibs nich..."
//   90 (50.0)               the same answer, final chord        <-> brick three, "dreambau.com"
//   100 (55.6)              a very quiet echo of the fanfare    <-> the sausage wriggles once more
//   every lump that falls in lands with a plop, every brick is laid down with a knock
//   every bass note (E.x)                                       <-> the lamp breathes
const BPM = 108, BT = 60 / BPM, PI = Math.PI;
// form of each of the twenty answers (see form() in the shader); 9 is the one that goes astray, 10 the brick
const FORM = [1, 2, 3, 8, 5, 4, 7, 6, 1, 4, 7, 3, 1, 4, 0, 0, 9, 10, 10, 10];
const BLOCK = [32, 40, 48, 72];                    // beats on which the four bars of the mould arrive
const QA = [], START = [];                         // [question beat, answer beat]; beat on which the lump for an answer falls in
for (let i = 0; i < 20; i++) {
  const q = i < 2 ? 8 + 8 * i : i < 10 ? 16 + 4 * i : i < 16 ? 36 + 2 * i : i < 17 ? 68 : 8 * i - 64;
  QA.push([q, q + (i < 2 ? 4 : i < 10 || i > 15 ? 2 : 1)]);
}
const leave = i => QA[i][1] + (i < 2 ? 2 : 1);     // a free answer is carried to the side as a keepsake
for (let i = 0; i < 21; i++) START.push(!i ? 4.5 : i < 9 ? leave(i - 1) + .15 : i < 17 ? QA[i][0] : i < 18 ? 71.1 : QA[i - 1][1] + 1.8);

const sat = x => Math.min(1, Math.max(0, x));
const ss = (a, b, x) => (x = sat((x - a) / (b - a)), x * x * (3 - 2 * x));
const mix = (a, b, u) => a + (b - a) * u;
const pop = u => u <= 0 ? 0 : 1 - Math.exp(-6 * u) * Math.cos(10 * u);          // springs past 1 and settles
const hsh = n => ((Math.imul(n + 3, 2654435761) >>> 9) & 4095) / 4096;
const home = i => i < 4 || i > 7 ? [0, 0] : i < 6 ? [0, -.04] : [-.19, -.04];   // where the lump rests, in mould units

const FS = /*glsl*/`
uniform vec4 L,G,Q,X,A[16],B[16],C[16],H[4];
// L lamp: xy, brightness, radius of its pool   G mould: xy centre, scale, number of the pose
// Q question: xy, beats since it was asked, beats between its rings   X reveal of the three lines, ambient light
// A,B,C the things on the table, each (xy, scale, lift) (form, colour, cos, sin of its turn) (form parameters):
//   0..3 the bars of the mould, 4..12 the keepsakes, 13..15 the bricks; C.xy is the half size of a bar or brick
// H the clay that answers: (xy in mould units, scale, form) (morph, body from, body to, lift)
//                          (colour, flush, form parameters xy) (parameter z, bevel, cos, sin of its turn)
const vec3 PAL[12]=vec3[](
  vec3(1.,.86,.64),vec3(1.,.69,.15),vec3(1.,.13,.55),vec3(.5,.85,.06),vec3(.84,.8,.68),vec3(.05,.62,.95),
  vec3(.42,.28,1.),vec3(1.,.42,.05),vec3(.55,.62,.74),vec3(1.,.17,.09),vec3(.55,.34,.17),vec3(1.,.5,.04));
float bx(vec2 p,vec2 h){vec2 d=abs(p)-h;return length(max(d,0.))+min(max(d.x,d.y),0.);}
float smn(float a,float b,float k){float h=max(k-abs(a-b),0.)/k;return min(a,b)-h*h*k*.25;}
// the answers, each about two units across: 0 lump, 1 star, 2 ring, 3 snail, 4 flower, 5 bone, 6 moon, 7 twins,
// 8 fried egg, 9 sausage (k.x length, k.z wriggle)
float form(vec2 p,float t,vec3 k){
  float r=length(p),a=atan(p.x,p.y+1e-6)/TAU,w=.36,f=abs(fract(a*7.+.5)-.5)*2.;
  if(t<.5)return r-.68;
  if(t<1.5)return r-mix(1.05,.45,abs(fract(a*5.+.5)-.5)*2.);
  if(t<2.5)return abs(r-.66)-.3;
  if(t<3.5)return max(abs(mod(r-a*w+w*.5,w)-w*.5)-.14,r-1.);
  if(t<4.5)return r-mix(1.,.62,f*f*(3.-2.*f));
  if(t<5.5)return min(length(vec2(max(abs(p.x)-.62,0.),p.y))-.2,length(abs(p)-vec2(.78,.2))-.27);
  if(t<6.5)return max(r-1.,.82-length(p+vec2(.5,.3)));
  if(t<7.5)return min(length(p+vec2(.55,.1))-.55,length(p-vec2(.6,.15))-.47);
  if(t<8.5)return r-.93-.09*sin(a*TAU*3.+1.)-.05*sin(a*TAU*5.);
  p.y+=.2*k.x*sin(p.x*2.5+k.z);
  return length(vec2(max(abs(p.x)-1.25*k.x,0.),p.y))-.27;
}
vec3 glow(vec2 p){
  vec2 v=(p-L.xy)/L.w;
  v.x/=1.4;
  float k=dot(v,v);
  return X.w*vec3(.5,.56,.8)+L.z*(1.+.14*E.x)/(1.+k*k)*vec3(1.,.83,.6);
}
void main(){
  vec2 p=(2.*gl_FragCoord.xy-R)/R.y,q,g,gy=vec2(0),gq=p,o;
  // D distance to the nearest thing (for shadows and the rounded edges), dt and the rest: the thing on top here
  float aa=1.5/R.y,d,D=9.,dt=9.,lf=0.,w=1.,wb=9.,wd=0.,v,m=0.,s=0.,bo=0.;
  vec3 al=PAL[0],gw=glow(p),c;
  vec4 a,b,k;
  for(int i=0;i<4;i+=1){
    a=A[i];k=C[i];
    d=(bx((p-a.xy)/a.z,k.xy-.015)-.015)*a.z;
    wb=min(wb,d);
    if(d<D){D=d;lf=0.;}
    if(d<aa){dt=d;al=PAL[10];w=.014*a.z;wd=1.;gq=(k.x<k.y?p.yx:p)/a.z*vec2(7.,110.)+float(i)*9.;}
  }
  for(int i=4;i<13;i+=1){
    a=A[i];b=B[i];k=C[i];
    q=mat2(b.z,-b.w,b.w,b.z)*(p-a.xy)/a.z;
    d=form(q,b.x,k.xyz);
    if(b.x<7.5)d=max(d,max(-q.x-k.x,-q.y-k.y));       // a keepsake keeps the flat sides the bars pressed into it
    d*=a.z;
    if(d<D){D=d;lf=a.w;}
    if(d<aa){dt=d;al=PAL[int(b.y)];w=.34*a.z;wd=0.;gy=vec2(0);}
    q-=vec2(.12,.06);                                  // the yolk of the fried egg
    d=(length(q)-.4)*a.z;
    if(b.x>7.5&&b.x<8.5&&d<aa){dt=d;al=PAL[11];w=.4*a.z;gy=q*mat2(b.z,-b.w,b.w,b.z);}
  }
  for(int i=13;i<16;i+=1){
    a=A[i];
    d=(bx((p-a.xy)/a.z,C[i].xy-.015)-.015)*a.z;
    if(d<D){D=d;lf=a.w;}
    if(d<aa){dt=d;al=PAL[0];w=.035*a.z;wd=0.;gy=vec2(0);}
  }
  // the clay that answers: a lump that turns into a form, pressed against the bars
  a=H[0];b=H[1];k=H[2];
  o=(p-G.xy)/G.z;
  q=mat2(H[3].z,-H[3].w,H[3].w,H[3].z)*(o-a.xy)/a.z;
  d=mix(length(q)-.68,a.w>9.5?bx(q,k.zw-.06)-.06:form(q,a.w,vec3(k.zw,H[3].x)),b.x)*a.z;
  if(b.z>b.y)d=smn(d,bx(o-vec2((b.y+b.z)*.5,0.),vec2((b.z-b.y)*.5,.18)),.1);
  d*=G.z;
  if(b.w<.05)d=-smn(-d,wb,.03*G.z);                    // clay cannot be where wood is
  if(d<D){D=d;lf=b.w;}
  if(d<aa){dt=d;al=mix(PAL[0],PAL[int(k.x)],k.y*(b.z>b.y?smoothstep(.2,.42,o.x):1.));w=H[3].y*G.z;wd=0.;gy=vec2(0);bo=G.w;}
  q-=vec2(.12,.06);
  d=(length(q)-.4)*a.z*G.z;
  if(a.w>7.5&&a.w<8.5&&b.x>.6&&d<aa){dt=d;al=PAL[11];w=.4*a.z*G.z;gy=q*mat2(H[3].z,-H[3].w,H[3].w,H[3].z);}

  // the table: dark wood under one lamp
  q=p*vec2(1.3,17.)+3.;
  c=mix(vec3(.07,.036,.02),vec3(.17,.095,.052),vn(q)*.5+vn(q*2.03+17.)*.3+vn(q*4.1)*.2)*(.8+.4*vn(p*vec2(5.,170.)))*gw;
  // the question: three rings of light run out from the clay
  for(int j=0;j<3;j+=1){
    v=(Q.z-float(j)*Q.w)/1.5;
    d=(length(p-Q.xy)-(.2+.8*v)*G.z)/.014;
    if(Q.z>0.&&v>0.&&v<1.)c+=vec3(1.,.8,.5)*.22*(1.-v)*(1.-v)*exp(-d*d)*gw;
  }
  // shadows fall away from the lamp, further and softer under a thing that is lifted
  g=vec2(dFdx(D),dFdy(D));
  g/=max(length(g),1e-6);
  o=((p-L.xy)*.04+vec2(.008,-.014))*(.6+4.*lf);
  c*=1.-.5*(1.-smoothstep(-.01,.025+.07*lf,D-dot(o,g)))*(1.-.4*lf);
  c*=1.-.3*exp(-max(D,0.)/.02)*step(lf,.05);
  // the thing on top: a soft rounded edge of width w, a little kneaded, lit from the lamp
  if(wd>.5)al*=.65+.7*vn(gq);
  if(dot(gy,gy)>0.)g=normalize(gy);
  v=clamp(-(dot(gy,gy)>0.?dt:min(D,dt))/w,0.,1.);
  vec3 n=normalize(vec3(g*(1.-v)+.2*(vec2(vn(p*130.+bo),vn(p*130.-bo))-.5)+.12*(vec2(vn(p*31.+bo),vn(p*31.-bo))-.5),sqrt(v*(2.-v))+.06)),
       l=normalize(vec3(L.xy-p,.7));
  c=mix(c,(al*(.25+.75*max(dot(n,l),0.))+.12*pow(max(dot(n,normalize(l+vec3(0,0,1))),0.),24.))*gw,1.-smoothstep(-aa,aa,dt));
  // the tagline lies on the table like cut-out letters: it swells into place and throws a small shadow
  vec3 td=tdist(p),ts=tdist(p-vec2(.007,-.011));
  c*=1.-.17*min(X.x+X.y+X.z,3.)*(1.-smoothstep(.5,1.5,length((p-TT.xy)/(TT.zw*vec2(1.1,1.5)))));
  for(int j=0;j<3;j+=1){
    v=X[j];w=.016*(1.-v);
    if(v>0.){m=max(m,(1.-smoothstep(-aa,aa,td[j]+w))*min(v*3.,1.));s=max(s,(1.-smoothstep(-.005,.02,ts[j]+w))*min(v*3.,1.));}
  }
  c=mix(c*(1.-.6*s),PAL[0],m);
  O=vec4(pow(c,vec3(.4545))+(h2(gl_FragCoord.xy+G.w)-.5)/200.,1.);
}`;

let prog, loc;
const A = new Float32Array(64), B = new Float32Array(64), C = new Float32Array(64), H = new Float32Array(16);
const put = (i, a, b, c) => { A.set(a, i * 4); B.set(b, i * 4); C.set(c, i * 4); };

Dream.add({
  id: 'formsache16k', dur: 60, fin: 53, cta: 54.5,
  init(gl, D) {
    prog = D.prog(null, FS);
    loc = {};
    for (const n of 'LGQXABCH') loc[n] = gl.getUniformLocation(prog, n);
  },
  draw(gl, T, D) {
    const [w, h] = D.size(), asp = w / h, tall = asp < .7,
      bc = T / BT, b = Math.floor(T * 12) / 12 / BT;                 // beats; the clay moves in twelve poses a second
    // the mould: in the middle while it is built, then moved aside so that the tagline has the table
    const X1 = tall ? -.16 : -.12, Y1 = tall ? .2 : .02, S1 = Math.min(1.2, (asp + (tall ? .12 : -.3)) / 1.05), S3 = tall ? .6 : .66 * Math.min(1, asp / 1.1),
      P3 = tall ? [-.2025, .64] : [-1.0125 * S3, .545],
      g = ss(72, 73.6, b), S = mix(S1, S3, g), sx = mix(X1, P3[0], g), sy = mix(Y1, P3[1], g),
      brickAt = k => tall ? (k ? [(k * 2 - 3) * .2025, .388] : [.2445, .64]) : [P3[0] + (.745 + .675 * k) * S3, .545],
      slot = i => tall
        ? [((i < 5 ? i - 2 : i - 6.6 + (i > 7) * .3) * .39 + (hsh(i) - .5) * .06) * asp, i < 5 ? -.4 : -.58, .075 * Math.min(1.4, asp / .46)]
        : [(i & 1 ? -1 : 1) * (Math.min(asp, 1.95) - .25 - .2 * hsh(i) * sat((asp - 1.34) / .44)), .27 - .23 * (i >> 1) + (hsh(i + 9) - .5) * .05, .11 * Math.min(1, asp / 1.3)];
    A.fill(99); B.fill(1); C.fill(0);                                // what is not on the table yet waits far away

    // the four bars of the mould slide in during the beat before their downbeat and knock into place
    for (let i = 0; i < 4; i++) {
      const u = (b - BLOCK[i]) / 1.1 + 1, s = i > 1 ? 1 : -1;
      if (u <= 0) continue;
      // bottom, left and top come from their own side; the last one comes down from above, past the runaway
      const e = u < 1 ? 2.6 * (1 - u ** 1.7) : .02 * Math.exp((1 - u) * 9) * Math.abs(Math.sin((u - 1) * 14));
      put(i, [sx + (i & 1 ? s * (.335 + (i < 3 ? e : 0)) : 0) * S, sy + (i & 1 ? (i < 3 ? 0 : e) : s * (.185 + e)) * S, S, 0], [0, 0, 0, 0], i & 1 ? [.035, .15, 0, 0] : [.37, .035, 0, 0]);
    }

    // keepsakes: the first eight answers and the one that went astray
    for (let i = 0; i < 9; i++) {
      const lb = i < 8 ? leave(i) : 70.9;
      if (b < lb) continue;
      const [tx, ty, ts] = slot(i), u = i < 8 ? sat((b - lb) / .8) : ss(71.5, 76, b), e = u * u * (3 - 2 * u),
        hp = home(i), gag = Math.sin(PI * sat((b - 100) / 2.4)),
        lift = i < 8 ? .6 * Math.sin(PI * u) : .15 * gag, s = mix(.25 * S1, ts, e), r = e * (hsh(i + 20) - .5) * 1.4;
      // the runaway walks down first and then across, around the other keepsakes
      put(4 + i, [mix(X1 + (i < 8 ? hp[0] : .72) * S1, tx, i < 8 ? e : e ** 3), mix(Y1 + hp[1] * S1, ty, i < 8 ? e : 1 - (1 - e) ** 2), s * (1 + .12 * lift), lift],
        [FORM[i < 8 ? i : 16], i + 1, Math.cos(r), Math.sin(r)],
        i < 8 ? [i > 5 ? .44 : 9, i > 3 ? .44 : 9, 0, 0] : [1, 0, 5 * Math.min(b, 76) + 3 * gag * Math.sin(b * 5), 0]);
    }

    // the three bricks are lifted out of the mould and laid in a row
    for (let k = 0; k < 3; k++) {
      const lo = QA[17 + k][1] + 1.4, u = sat((b - lo) / 1.3), e = u * u * (3 - 2 * u), [rx, ry] = brickAt(k), lift = .7 * Math.sin(PI * u);
      if (b >= lo) put(13 + k, [mix(sx, rx, e), mix(sy, ry, e), S * (1 + .1 * lift), lift], [0, 0, 0, 0], [.3, .15, 0, 0]);
    }

    // the clay that answers
    let i = 20; while (i && b < START[i]) i--;
    const q = i < 20 ? QA[i][0] : 1e3, a = i < 20 ? QA[i][1] : 1e3, nq = i < 19 ? QA[i + 1][0] : 1e3, p = pop((b - a) / .45);
    let [hx, hy] = home(i), us = .25, form = FORM[i] || 0, m = 0, lift = 0, x0 = 0, x1 = 0, col = 0, flush = 0,
      kx = 1, ky = 0, kz = 0, bev = .17, ang = 0, on = b >= START[0];
    if (i < 9 || i > 16) {                                           // it falls in from above and lands with a wobble
      const u = (b - START[i]) / .6;
      lift = u < 1 ? 1 - u * u : 0;
      us *= 1 + .3 * lift + (u > 1 ? .1 * Math.exp((1 - u) * 5) * Math.cos((u - 1) * 13) : 0);
    }
    if (b >= q && b < a) us *= 1 + .035 * Math.sin(b * 19) - .1 * ss(a - .35, a, b);   // it quivers while it is asked
    if (i < 8) {                                                     // free: any form it likes, then off to the side
      m = p; flush = sat(p); col = i + 1; bev = mix(.17, .085, flush);
      ang = b > a ? .15 * Math.sin((b - a) * 5) * Math.exp((a - b) * .8) : 0;
      on = on && b < leave(i);
    } else if (i < 17) {                                             // in the open mould: only a tongue still sticks out
      const sq = i > 8 ? 1 : ss(48, 48.9, b), sz = [1, .9, .8, .68, .56, .44, .32, .2, 0][i - 8],
        out = Math.max(p, 0) * (1 - ss(nq - .4 * (nq - a), nq - .05, b)), ts = .18 + (sz - .18) * out;
      x0 = -.33; x1 = sq ? mix(-.18, .28, sq) : x0;
      hx = mix(hx, .29 + .12 * ts, sq); hy = mix(hy, 0, sq); us *= mix(1, ts, sq);
      m = sq * sat(out); col = i % 8 + 1; flush = sat(out) * sz; bev = mix(.17, .06, sq);
      if (i > 15 && b >= a) {                                        // the seventeenth answer leaves through the open end
        const u = sat((b - a) / .9);
        x0 = mix(-.33, .3, u * u); form = 9; m = 1; us = .25; hx = .3 + mix(-.05, .42, u); kx = mix(.15, 1, u); kz = b * 5;
        flush = u; col = 9; bev = .07; on = u < 1;
      }
    } else if (i < 20) {                                             // in the closed mould: a brick, every time
      m = sat(p); form = 10; us *= .84; kx = 1.5; ky = .8; bev = mix(.143, .045, m); on = b < a + 1.4;
    } else { us *= .84 + .017 * Math.sin(T * 1.7); bev = .143; }
    H.set([on ? hx : 99, hy, us, form, m, x0, x1, lift, col, flush, kx, ky, kz, bev, Math.cos(ang), Math.sin(ang)]);

    const gc = ss(72, 75, bc);
    D.bind(prog);
    gl.uniform4fv(loc.A, A); gl.uniform4fv(loc.B, B); gl.uniform4fv(loc.C, C); gl.uniform4fv(loc.H, H);
    gl.uniform4f(loc.L, mix(X1, 0, gc) + .05 * Math.sin(T * .83), mix(Y1 + .03, .5, gc) + .035 * Math.sin(T * .61 + 1),
      .52 * ss(.3, 5, T) + .3 * ss(13.2, 14.2, T) + .2 * ss(26.5, 27.5, T) - .08 * ss(40, 44, T) - .1 * ss(45, 52, T),
      .52 + .1 * ss(13.2, 14.2, T) + .18 * ss(26.5, 27.5, T));
    gl.uniform4f(loc.G, sx, sy, S, Math.floor(T * 12));
    gl.uniform4f(loc.Q, sx + (i < 8 ? hx : 0) * S, sy + (i < 8 ? hy : 0) * S, bc >= q && bc < q + 2.4 ? bc - q + .001 : 0, i > 9 && i < 16 ? .25 : .5);
    gl.uniform4f(loc.X, ...[74, 82, 90].map(x => { const u = sat((bc - x) * BT / .55) - 1; return 1 + 2.2 * u ** 3 + 1.2 * u * u; }),
      .03 * ss(0, 4, T) + .03 * ss(13.2, 14.2, T) + .04 * ss(26.5, 27.6, T) - .05 * ss(39.6, 42, T));
    D.tri();
  },
  music(K) {
    const hz = K.hz, c = K.c, at = x => x * BT, ROOT = [41, 38, 43, 36], rev = K.rev(1.9, 2.3, .24, K.out, .3),
      room = K.bus(.85), lft = K.bus(1, -.3, room), rgt = K.bus(1, .35, room), low = K.bus(.9);
    room.connect(rev);                                                 // a small ensemble in one small room
    const mar = (t, n, v = .34, to = lft) => { K.o('sine', t, .8, hz(n), 0, v, to); K.o('sine', t, .1, hz(n) * 4, 0, v * .3, to); },   // marimba
      box = (t, n, v = .1) => { K.o('sine', t, 2, hz(n), 0, v, rgt); K.o('sine', t, .2, hz(n) * 5.4, 0, v * .15, rgt); },               // musical box
      bass = (t, n, v = .36) => { K.o('triangle', t, .45, hz(n) * 1.04, hz(n), v * .8, low, .03); K.o('sine', t, .9, hz(n), 0, v * .55, low); K.o('sine', t, .3, hz(n) * 2, 0, v * .4, low); }, // plucked double bass
      brush = (t, v, d = .05) => K.n(t, d, 4800, 3200, .6, v, rgt),
      wood = (t, v = .3, f = 1000) => { K.o('sine', t, .06, f, f * .7, v, room, .04); K.n(t, .04, f * 2, f, 3, v * .5, room); },
      kaz = (t, n, d, v = .12) => K.p('sawtooth', t, d, hz(n), v, .02, .1, room, 1500, 12),                                              // kazoo
      plop = (t, v = .1) => K.o('sine', t, .13, 180, 85, v, room, .1);
    if (K.mine()) {                                                    // the room before anything happens
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = K.noise; s.loop = true; f.type = 'lowpass'; f.frequency.value = 420;
      g.gain.setValueAtTime(0, 1.2); g.gain.linearRampToValueAtTime(.05, 4); g.gain.linearRampToValueAtTime(.09, 10); g.gain.linearRampToValueAtTime(0, 14.5);
      s.connect(f).connect(g).connect(K.out); s.start(1.2); s.stop(14.6);
    }
    QA.forEach(([q, a], i) => {
      const t = at(a), z = i > 9 && i < 16 ? .5 : 1, pick = t - (z < 1 ? .3 : .36) * BT;
      // the question: always the same three notes, C D G, left open
      [0, .64, 1].forEach((x, j) => { const tq = at(q + x * z), n = [72, 74, 79][j]; i && mar(tq, n, i < 2 ? .22 : .3); box(tq, n + 12, i < 2 ? .13 : .08); });
      // the answer: something else every time
      if (!i) { K.o('sine', t, .5, 400, 1500, .2, room, .3); [89, 93, 96].forEach((n, j) => box(t + .33 + j * .08, n, .09)); }   // star: a whoop and a sparkle
      if (i == 1) { K.o('sine', t, .55, 520, 140, .26, room, .45); K.o('sine', t + .28, .4, 330, 120, .16, room, .3); }            // ring: boing
      if (i == 2) for (let j = 0; j < 7; j++) mar(t + j * .085, 83 - j, .22);                                                     // snail: winds down
      if (i == 3) { K.o('sine', t, .16, 200, 70, .45, room, .12); kaz(t + .1, 70, .25); }                                         // fried egg: plop, wah
      if (i == 4) { mar(t, 96, .2); mar(t + .16, 96, .2); bass(t + .32, 34, .4); }                                                // bone
      if (i == 5) [81, 84, 88, 91].forEach((n, j) => box(t + j * .1, n, .13));                                                    // flower: up and away
      if (i == 6) for (const x of [0, .25]) { mar(t + x, 76); mar(t + x, 77); }                                                   // twins: two answers at once
      if (i == 7) K.o('sine', t, .8, 1150, 380, .16, room, .7);                                                                   // moon
      if (i > 7 && i < 16) { mar(pick, 81); mar(t, 77 + [6, -5, 4, -3, 2, -2, 1, -1][i - 8]); }                                   // closing in on A, F
      if (i == 16) {                                                                                                             // the proud wrong one
        [77, 81, 84].forEach((n, j) => { mar(t + (j - 3) * BT / 6, n); kaz(t + (j - 3) * BT / 6, n, .06); });
        kaz(t, 78, .3, .22);
        for (let j = 0; j < 4; j++) mar(t + j * .09, 90, .2);
        wood(at(71.5), .22, 700);                                      // nobody says anything
      }
      if (i > 16) {                                                                                                              // A, F: right, three times
        mar(pick, 81, .34); mar(t, 77, .4); box(t, 89, .16); box(t + .07, 93, .08); bass(t, 41, .5);
        for (const n of [65, 69, 72]) K.p('sine', t, i > 18 ? 1.5 : .2, hz(n), i > 18 ? .06 : .05, .02, i > 18 ? 5 : 1.6, room);
        if (i > 18) { bass(t, 29, .4); [96, 101, 105].forEach((n, j) => box(t + .15 + j * .09, n, .07)); }
        wood(at(a + 2.7), .16, 600);                                   // the brick is laid down
      }
    });
    START.forEach((s, i) => (i < 9 || i > 16) && plop(at(s + .6), i ? .1 : .14));   // every lump lands with a small plop
    for (let i = 0; i < 8; i++) brush(at(22 + i / 4), .02 + i * .01, .12);          // a swirl into the first bar with a beat
    for (let b = 24; b < 90; b++) {
      const bar = b >> 2, x = b & 3, ch = bar + 2 & 3, r = ROOT[ch], t = at(b), late = b > 71;       // F, D minor, G minor, C
      if (b < 48) { x || bass(t, r); x == 2 && bass(t, r + 7, .4); }                 // two in a bar
      else if (b < 68) bass(t, [r, r + (ch % 3 ? 3 : 4), r + 7, ROOT[ch + 1 & 3] - 1][x], .48);   // walking
      else if (b < 70) bass(t, 36, .4);                                              // the dominant waits under question seventeen
      else if (late && !x) bass(t, bar & 1 ? 36 : 41, .45);
      else if (late && bar & 1 && x == 2) bass(t, 36, .35);
      if (b > 47 && b < 68 && x & 1) for (const n of [[57, 62], [53, 60], [58, 65], [52, 58]][ch]) mar(t, n, .08, rgt);   // soft chords on two and four
      if (b < 70 || late) { brush(t, (x & 1 ? .11 : .07) * (late ? .7 : 1), x & 1 ? .09 : .04); brush(t + .64 * BT, late ? .03 : .045); }
    }
    for (let i = 0; i < 12; i++) brush(at(68 + i / 6), .03 + i * .012);              // a roll under question seventeen
    for (const b of BLOCK) { K.o('sine', at(b), .3, 160, 60, .55, K.out, .11); K.n(at(b), .1, 600, 200, 1.2, .5, room); wood(at(b), .42, 520); }
    [[94, 84], [96, 81], [98, 77]].forEach(([b, n]) => { box(at(b), n, .08); K.o('sine', at(b), 3, hz(n), 0, .03, rev); });   // it rings out: C, A, F
    K.o('sine', at(100), .3, 500, 900, .05, room, .25); kaz(at(100.4), 78, .2, .04); box(at(102), 89, .07);   // a last quiet echo
  },
});
