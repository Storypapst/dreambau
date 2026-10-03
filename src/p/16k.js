// Traumhaus: production 16k for the dreambau.com landing page.
// 262 144 GPU particles: a cloud of light crystallises into a lattice, the lattice is built into a house storey by storey,
// the house dreams in warm light, and dissolves in three waves into the tagline. Dream-pop score, C# minor to E major.
//
// One beat grid for picture and music: BPM 100, beat 0.6 s, bar 2.4 s. The shaders count in bars (uniform Q = bar length).
// Sync points (bar = seconds):
//   1.25 2 2.75 3.5 4.25 (3.0 ... 10.2 s) distant glass pings          <-> particle glints in the dust
//   4..5 (9.6 ... 12.0) noise riser                                     <-> the cloud is pulled in
//   5    (12.0)  heartbeat kick, bass and pad enter                     <-> the lattice crystallises from its centre, orbit starts
//   7..10 (16.8 ... 24.0) one mallet note per bar (E F# G# C#)          <-> ground floor, upper floor, roof, chimney rise on the bar
//   11   (26.4)  glass shimmer                                          <-> windows and door light up
//   12   (28.8)  pads open                                              <-> walls fill with warm light
//   13   (31.2)  melody, snare, kick on every beat                      <-> house floats, orbit widens; bars 14..17 bricks levitate
//   17   (40.8)  bell G#4                                               <-> wave 1 flies into "Jeht nich…"
//   18.5 (44.4)  bell C#5                                               <-> wave 2 flies into "jibs nich…"
//   19   (45.6)  swell, the kick breathes out on beat 4                 <-> camera settles into the frontal view
//   20   (48.0)  bell E5 + E major chord                                <-> wave 3 (everything left) flies into "dreambau.com"
//   22   (52.8)  last glass ping                                        <-> final composition complete (fin 53 s), music rings out
//   kick "lub" (beats 1 and 3 from bar 5, every beat from bar 13 to 19.75) <-> particle sparkle (size and brightness)
const BPM = 100, BT = 60 / BPM, BAR = 4 * BT, N = 1 << 18;
let gl, pp, pb, pc, A, B, C, w0, h0, uX, uM;

const VS = /*glsl*/`
uniform float Q;
out vec4 C;
uint sd;
float r(){sd=pcg(sd);return float(sd)*2.3283064e-10;}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
#define SS smoothstep
// house elements: origin, edge a, edge b (mirrored in x and z at random), and (divisions a, divisions b, cumulative weight)
const vec3 HO[6]=vec3[](vec3(-1.5,0,1),vec3(1.5,0,-1),vec3(-1.5,2,1),vec3(0,3.3,-1.2),vec3(-.175,2.4,.175),vec3(.175,2.4,-.175));
const vec3 HA[6]=vec3[](vec3(3,0,0),vec3(0,0,2),vec3(3,0,0),vec3(0,0,2.4),vec3(.35,0,0),vec3(0,0,.35));
const vec3 HB[6]=vec3[](vec3(0,2,0),vec3(0,2,0),vec3(0,1.3,0),vec3(1.75,-1.45,0),vec3(0,1.1,0),vec3(0,1.1,0));
const vec3 HD[6]=vec3[](vec3(6,2,.33),vec3(4,2,.55),vec3(0,0,.66),vec3(4,3,.96),vec3(1,1,.98),vec3(1,1,1));
void main(){
  int i=gl_VertexID;
  sd=uint(i)*2654435761u+7u;
  float x=T/Q,a=r(),h=r(),e=r(),g=r();
  vec4 tp=tpt(i);

  // house: a point on one element (P, surface) and the same point snapped to the scaffold (Ps)
  int k=0;
  for(;k<5;k+=1)if(g<HD[k].z)break;
  vec3 o=HO[k],ea=HA[k],eb=HB[k],D=HD[k];
  vec2 u=vec2(r(),r()),s;
  float L=length(ea),w=9.;
  if(D.x<.5){
    if(u.x+u.y>1.)u=1.-u;
    float m=min(u.y,min(u.x,1.-u.x-u.y));
    s=m==u.y?vec2(u.x,0):m==u.x?vec2(0,u.y):u/(u.x+u.y);
    u.x+=u.y*.5;s.x+=s.y*.5;
  }else{
    vec2 G=u*D.xy,t=abs(G-round(G))*vec2(L/D.x,length(eb)/D.y);
    s=t.x<t.y?vec2(round(G.x)/D.x,u.y):vec2(u.x,round(G.y)/D.y);
    if(k<2){
      // windows and door: the scaffold snaps to their frames, the surface lights up inside
      float U=u.x*L-L*.5,V=u.y*2.,cl=L>2.5?clamp(round(U),-1.,1.):0.;
      bool dr=L>2.5&&cl==0.&&V<1.1;
      vec2 hs=vec2(.27,dr?.5:.22),cn=vec2(cl,dr?.5:V<1.1?.6:1.55),dd=vec2(U,V)-cn,ad=abs(dd)/hs;
      w=max(ad.x,ad.y);
      if(w<1.3){
        if(ad.x>ad.y)dd.x=sign(dd.x)*hs.x;else dd.y=sign(dd.y)*hs.y;
        s=vec2((cn.x+dd.x)/L+.5,(cn.y+dd.y)*.5);
      }
    }
  }
  vec3 P=o+ea*u.x+eb*u.y,Ps=o+ea*s.x+eb*s.y;
  vec2 sg=sign(vec2(r(),r())-.5);
  P.xz*=sg;Ps.xz*=sg;
  if(k>3){P+=vec3(.775,0,-.525);Ps+=vec3(.775,0,-.525);}

  // lattice: a point at about the height of the particle's house target, snapped to the nearest edge (or node)
  vec3 l=vec3(r()*4.-2.,clamp(Ps.y*.83+r()-.5,0.,3.),r()*4.-2.),f=l-round(l),dl=vec3(length(f.yz),length(f.xz),length(f.xy));
  l-=dl.x<min(dl.y,dl.z)?vec3(0,f.yz):dl.y<dl.z?vec3(f.x,0,f.z):vec3(f.xy,0);
  if(e<.1)l=round(l)+(vec3(r(),r(),r())-.5)*.07;

  // dust: a big turbulent volume, domain-warped flow
  // dust: most particles are pulled onto the folded sheets of a gyroid (one Newton step), the rest is haze
  vec3 n=(vec3(r(),r(),r())-.5)*vec3(30,12,30)+vec3(0,1.5,0),sn=sin(n*.33),cs=cos(n*.33),gr=cs*cs.yzx-sn.zxy*sn;
  float gf=dot(sn,cs.yzx),nb=r();
  if(nb<.8)n-=gr*(gf/max(dot(gr,gr),.3)/.33+(r()-.5)*.25);
  vec3 d=n;
  float q=T*.09;
  d+=1.6*sin(d.yzx*.37+q*vec3(1,1.3,.7)+vec3(0,2,4));
  d+=.7*sin(d.zxy*.83-q*vec3(1.4,.9,1.2)+vec3(1,3,5));
  d.xz*=rot(.01*T);

  // timing: the lattice crystallises outwards from its centre so that the centre lands on bar 5;
  // the house rises one element per bar from bar 7; the walls fill at bar 12; the house floats from bar 13
  float y=Ps.y,lv=k<2?min(floor(y),1.):k<4?2.:3.,fr=k<2?y-lv:k<4?(y-1.85)/1.45:(y-2.4)/1.1,
  tl=4.55+length(l-vec3(0,1.5,0))*.25+h*.2,
  tb=7.+lv+clamp(fr,0.,1.)*.45+h*.08,
  hp=step(.08,a),
  wl=hp*SS(tl,tl+.45,x),
  wh=hp*SS(tb,tb+.4,x),
  fl=step(e,.6)*SS(12.+h*.7,13.+h*.7,x),
  fz=SS(13.,16.5,x);
  vec3 H=mix(Ps,P,fl);
  H.y+=.3*fz;
  // bricks: cells of the surface that levitate together
  vec2 bi=floor(u*vec2(L/.33,length(eb)/.17));
  float bh=h1(bi.x+bi.y*57.+float(k)*997.+sg.x*131.+sg.y*313.),
  lb=step(bh,.22)*step(e,.6)*SS(14.+bh*9.,16.+bh*9.,x);
  H+=((normalize(H-vec3(0,1.5,0))*.3+vec3(0,.5,0))*(.5+bh*4.)+.05*sin(T*1.3+bh*50.))*lb;

  vec3 W=mix(mix(d,l,wl),H,wh);
  W.y+=.4*sin(PI*wh)*(h-.4);

  // camera: drift, one slow orbit that eases into the frontal view; close in the dream, wider later;
  // for the words it lifts its aim so the house sinks below the first two lines
  float th=3.085-.05*min(x,20.)-3.*SS(4.5,16.5,x)+.915*SS(16.,20.,x),
  el=.05+.25*SS(4.,8.,x)-.3*SS(15.,19.5,x),
  ds=12.-2.*SS(0.,5.,x)-SS(5.,8.,x)-1.5*SS(9.,12.5,x)+2.*SS(13.5,16.5,x)+2.*SS(16.5,19.,x),
  fo=2.5*min(1.,R.x/R.y*1.2);
  vec3 v=W-vec3(0,1.7+.3*fz+2.4*SS(16.5,19.,x),0);
  v.xz*=rot(th);v.yz*=rot(el);
  float z=max(ds-v.z,.2);
  vec2 sp=v.xy*fo/z;

  // words: the particles of line k leave on word k, left to right
  float tw=17.+tp.z*1.5,st=tw+(tp.x*.5+.5)*.5+h*.25,wt=SS(st,st+.7,x)*step(.015,a);
  vec2 tg=TT.xy+tp.xy*TT.z,pp=mix(sp,tg,wt)+(vec2(h,g)-.5)*.5*sin(PI*wt);
  // a few embers rise slowly from the finished text
  float em=fract(T*.04+h)*step(tp.w,.0006)*SS(21.5,22.,x);
  pp+=vec2(.03*sin(em*9.+h*30.),.35)*em;

  // colour and energy per phase
  float kp=exp(-fract(x*(x>13.?4.:2.))*Q*(x>13.?2.:4.))*SS(4.9,5.,x)*step(x,19.75)*step(.8,h),
  pn=floor((x-1.25)/.75),
  id=max(.5*SS(0.,.6,x),SS(0.,4.,x))*(nb<.8?.08:.004)*(1.+20.*pow(g,12.))*(1.-.8*SS(9.,16.,x)),
  gl=pn>=0.&&pn<5.&&h1(float(i)+pn*1e6)<.0008?exp(-fract((x-1.25)/.75)*5.):0.;
  id+=6.*gl;
  vec3 cd=h>.9?vec3(.4,.8,1.):mix(vec3(.35,.25,.9),vec3(.2,.3,.85),e),
  ch=mix(vec3(.35,.75,1.),mix(vec3(1.,.45,.42),vec3(1.,.72,.36),h),SS(11.,14.,x+h*.6));
  float ih=mix(.08,.16,fl)*(1.-.5*SS(16.8,17.5,x));
  if(w<1.){float lw=SS(11.,11.3,x);ch=mix(ch,vec3(1.,.6,.25),lw);ih*=1.+2.*lw;}
  vec3 col=mix(mix(cd*id,vec3(.35,.7,1.)*(e<.1?.3:.1)*(1.-.5*SS(6.8,7.5,x)),wl),ch*ih,wh);
  col=mix(col,mix(vec3(1.,.55,.24),vec3(1.,.72,.42),tp.w)*.5*(1.+.3*sin(T*2.+h*40.))*(1.-.6*sin(PI*wt))*(em>0.?sin(PI*em)*3.:1.),wt);
  float sz=mix(R.y*.0045*mix(9.,7.,wl)/z,R.y*TT.z*.003,wt);
  col*=min(1.,pow(R.y*.0045/sz,2.))*(1.+.6*kp);
  sz*=(1.+.5*kp)*(1.+2.*gl);
  gl_Position=z<.3&&wt<.01?vec4(2,2,2,1):vec4(pp.x*R.y/R.x,pp.y,0,1);
  gl_PointSize=clamp(sz,1.,R.y*.03);
  C=vec4(col,0);
}`;

const FP = /*glsl*/`
in vec4 C;
void main(){vec2 d=gl_PointCoord-.5;O=C*exp(-dot(d,d)*16.);}`;

// separable gaussian blur at quarter resolution: M = (step x, step y, source level)
const FB = /*glsl*/`
uniform sampler2D X;uniform vec3 M;
void main(){
  vec2 u=gl_FragCoord.xy/vec2(textureSize(X,int(M.z)));
  vec3 c=vec3(0);float n=0.;
  for(int k=-6;k<7;k+=1){float w=exp(-float(k*k)/18.);c+=textureLod(X,u+M.xy*float(k),M.z).rgb*w;n+=w;}
  O=vec4(c/n,1);
}`;

// composite: night sky, particles + bloom, tone map, grain
const FC = /*glsl*/`
uniform float Q;uniform sampler2D X,Y;
void main(){
  vec2 u=gl_FragCoord.xy/R,p=(2.*gl_FragCoord.xy-R)/R.y;
  float x=T/Q;
  vec3 a=texelFetch(X,ivec2(gl_FragCoord.xy),0).rgb+texture(Y,u).rgb*(.35-.2*smoothstep(16.5,17.5,x)-.11*smoothstep(20.,22.,x)),
  bg=mix(vec3(.004,.004,.012),vec3(.02,.018,.055),smoothstep(-1.,1.,p.y))*smoothstep(0.,3.,x);
  bg+=vec3(.05,.025,.06)*exp(-dot(p,p)*1.8)*smoothstep(4.,10.,x)*(1.-.7*smoothstep(17.,21.,x));
  O=vec4(sqrt(1.-exp(-a))+bg+(h2(gl_FragCoord.xy+fract(T*7.))-.5)/128.,1);
}`;

Dream.add({
  id: '16k', dur: 60, fin: 53, cta: 54.5, pts: N,

  init(g, D) {
    gl = g;
    pp = D.prog(D.preVS() + VS, FP);
    pb = D.prog(null, FB);
    pc = D.prog(null, FC);
    for (const p of [pp, pc]) { gl.useProgram(p); gl.uniform1f(gl.getUniformLocation(p, 'Q'), BAR); }
    gl.uniform1i(gl.getUniformLocation(pc, 'X'), 2); gl.uniform1i(gl.getUniformLocation(pc, 'Y'), 4);
    uX = gl.getUniformLocation(pb, 'X'); uM = gl.getUniformLocation(pb, 'M');
  },

  draw(gl, T, D) {
    const [w, h] = D.size(), q = w >> 2, r = h >> 2, fb = gl.FRAMEBUFFER,
      tx = (u, t) => { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, t); };
    if (w != w0 || h != h0) {
      w0 = w; h0 = h;
      [A, B, C].map(t => t && (gl.deleteTexture(t.tex), gl.deleteFramebuffer(t.fb)));
      A = D.rt(w, h, 1); B = D.rt(q, r, 1); C = D.rt(q, r, 1);
      tx(2, A.tex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
      tx(3, B.tex); tx(4, C.tex); tx(0, D.text.tex);
    }
    // particles, additive, into a float target
    gl.bindFramebuffer(fb, A.fb);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    D.bind(pp); gl.drawArrays(gl.POINTS, 0, N);
    gl.disable(gl.BLEND);
    // bloom: level 2 of the mip chain, blurred horizontally then vertically
    gl.bindFramebuffer(fb, B.fb);
    tx(2, A.tex); gl.generateMipmap(gl.TEXTURE_2D); gl.activeTexture(gl.TEXTURE0);
    gl.viewport(0, 0, q, r);
    D.bind(pb); gl.uniform1i(uX, 2); gl.uniform3f(uM, h / 540 / q, 0, 2); D.tri();
    gl.bindFramebuffer(fb, C.fb); gl.uniform1i(uX, 3); gl.uniform3f(uM, 0, h / 540 / r, 0); D.tri();
    gl.bindFramebuffer(fb, null); gl.viewport(0, 0, w, h);
    D.bind(pc); D.tri();
  },

  music(K) {
    const c = K.c, H = K.hz, O = K.out, t = b => b * BAR, kt = [];
    const G = (v, ...to) => { const g = c.createGain(); g.gain.value = v; to.map(n => g.connect(n)); return g; };
    const F = (f, to, ty = 'lowpass', q = .7) => { const n = c.createBiquadFilter(); n.type = ty; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; };
    const rv = K.rev(4.5, 2.4, .5);
    // ping-pong delay, dotted eighth, alternating left and right, darker on every repeat
    const pi = G(1), dl = c.createDelay(2), dr = c.createDelay(2), mg = c.createChannelMerger(2);
    dl.delayTime.value = dr.delayTime.value = BT * .75;
    pi.connect(dl); dl.connect(dr); dr.connect(F(2200, G(.45, dl)));
    dl.connect(mg, 0, 0); dr.connect(mg, 0, 1); mg.connect(G(.5, O, rv));
    // buses
    const kd = F(200, G(.45, O));                                   // heartbeat kick, low-passed
    const bd = G(1, G(.16, O)), bb = F(300, bd);                    // bass, ducked
    const pd = G(1, G(.4, O, rv)), pf = F(600, pd);                 // pads, ducked, opening filter
    const pL = K.bus(1, -.7, pf), pR = K.bus(1, .7, pf);
    const ab = G(.3, O, rv, pi), mb = G(.4, O, rv, pi), bl = G(.45, O, rv, pi), gb = G(.2, rv, pi), sn = G(.2, O, rv);
    const kick = (s, v) => { K.o('sine', s, .45, 140, 45, v, kd, .1); kt.push(s); };
    const bell = (s, n, v, to = bl) => [[1, 1, 3.5], [2, .3, 2], [3, .12, 1], [4.2, .05, .5]].map(([m, a, d]) => K.o('sine', s, d, H(n) * m, 0, v * a, to));
    const sw = (a, b, f0, f1, v, q, rel, pan = 0, ty = 'bandpass', v0 = 1e-3) => {   // noise swell a→b, then release
      if (!K.mine()) return;
      const s = c.createBufferSource(), g = G(0, K.bus(1, pan, O), rv), f = F(f0, g, ty, q);
      s.buffer = K.noise; s.loop = true; s.connect(f);
      f.frequency.setValueAtTime(f0, a); f.frequency.exponentialRampToValueAtTime(f1, b);
      g.gain.setValueAtTime(v * v0, a); g.gain.exponentialRampToValueAtTime(v, b); g.gain.setTargetAtTime(0, b, rel);
      s.start(a, (a + pan + 1) % 1.9); s.stop(b + rel * 8);
    };

    // intro: wind from silence, a soft low pad, distant glass
    for (const p of [-.7, .7]) sw(0, t(4.6), 300 + p * 40, 1600, .12, .6, 2.5, p, 'lowpass', .003);
    [49, 56, 63].map((n, k) => K.p('triangle', t(1.5 + k * .5), t(3.2 - k * .5), H(n), .08, t(2), t(1), k % 2 ? pR : pL));
    [80, 88, 83, 85, 92].map((n, k) => bell(t(1.25 + .75 * k), n, .5 + .1 * k, gb));
    sw(t(4), t(5), 400, 2400, .05, 1.2, .1);

    // bars 5..19: C#m7 Amaj7 Eadd9 B, heartbeat, bass, pads; arpeggio from bar 7
    const CH = { c: [37, [56, 61, 64, 71], [61, 64, 68, 71, 73]], a: [33, [57, 61, 64, 68], [57, 61, 64, 69, 73]],
      e: [40, [56, 59, 64, 66], [64, 68, 71, 73, 76]], b: [35, [54, 59, 63, 66], [59, 63, 66, 71, 75]] };
    [...'caebcaebcaebcab'].map((ch, j) => {
      const b = j + 5, s = t(b), [bn, pv, ar] = CH[ch];
      for (const k of b > 18 ? [0, .25, 1, 2] : b > 12 ? [0, .25, 1, 2, 2.25, 3] : [0, .25, 2, 2.25]) kick(s + k * BT, k % 1 ? .4 : k % 2 ? .5 : .8);
      if (b < 19) K.p('sawtooth', s, BAR - .15, H(bn), .5, .02, .2, bb);
      else for (let m = 0; m < 8; m++) K.p('sawtooth', s + m * BT / 2, BT / 2 - .08, H(bn), .25 + m * .05, .01, .06, bb);
      pv.map((n, m) => K.p('sawtooth', s, BAR - .1, H(n), b > 12 && b < 17 ? .085 : .1, .4, .6, m % 2 ? pR : pL, 0, 9));
      if (b > 18) pv.map((n, m) => K.p('sawtooth', s, BAR - .02, H(n + 12), .1, BAR, .02, m % 2 ? pL : pR, 0, 14));
      if (b > 6) for (let m = 0; m < 8; m++) K.o('triangle', s + m * BT / 2, .6, H(ar[[0, 1, 2, 3, 4, 3, 2, 1][m]]), 0, (m % 2 ? .35 : .5) * (b > 16 ? 1.3 : 1), ab);
    });
    // storeys: a mallet note per bar; windows: glass shimmer
    [64, 66, 68, 73].map((n, k) => bell(t(7 + k), n, .5));
    [88, 92, 95, 100].map((n, k) => bell(t(11) + k * BT / 4, n, .5, gb));
    // dream: melody, soft snare, shaker
    [[0, 68, 1.5], [1.5, 71, 2.5], [4, 73, 3], [7, 71, 1], [8, 68, 4], [12, 66, 3.5]].map(([b, n, d]) => K.p('triangle', t(13) + b * BT, d * BT, H(n), .5, .06, .5, mb, 2600, 6));
    for (let b = 13; b < 19; b++) for (const k of [1, 3]) K.n(t(b) + k * BT, .35, 1600, 900, .9, .3, sn);
    for (let k = 0; k < 16; k++) K.n(t(19) + k * BT / 4, .15, 1400, 1100, .9, .04 + k * k * .0016, sn);
    for (let s = t(9) + BT / 2; s < t(19); s += BT) K.n(s, .06, 6500, 6500, 2, .04);
    // words: one rising bell per word, a swell into each, the big one into dreambau.com
    [[17, 68], [18.5, 73], [20, 76]].map(([b, n], k) => { bell(t(b), n, .6 + .15 * k); bell(t(b), n + 12, .2); });
    sw(t(16.5), t(17), 600, 3000, .04, 1.5, .05); sw(t(18), t(18.5), 600, 3000, .04, 1.5, .05);
    sw(t(19), t(20), 300, 5000, .22, 1.2, .05);
    // arrival: E major, soft boom, decaying arpeggio, last glass ping, fade
    const E = t(20);
    K.p('sawtooth', E, 3, H(40), .5, .02, 5, bb);
    [52, 56, 59, 64, 68, 71, 76].map((n, m) => K.p('sawtooth', E, 2.4, H(n), .16, .05, 7, m % 2 ? pR : pL, 0, 9));
    K.o('sine', E, 2.5, 90, 41, .5, kd, .3);
    K.n(E, 3, 2600, 900, .7, .25, rv);
    [[0, 71, 2], [2, 68, 2], [4, 64, 6]].map(([b, n, d]) => K.p('triangle', t(21) + b * BT, d * BT, H(n), .35, .06, 1.2, mb, 2600, 6));
    for (let m = 0; m < 20; m++) K.o('triangle', E + m * BT / 2, .8, H([64, 68, 71, 76, 80, 76, 71, 68][m % 8]), 0, .55 * Math.min(1, (20 - m) / 10), ab);
    bell(t(22), 88, .6, gb);
    const f = pf.frequency;
    f.setValueAtTime(600, t(5)); f.exponentialRampToValueAtTime(1000, t(12)); f.exponentialRampToValueAtTime(3000, t(14));
    f.setValueAtTime(3000, t(19)); f.exponentialRampToValueAtTime(4500, t(20));
    f.exponentialRampToValueAtTime(800, t(25));
    K.duck(bd.gain, kt, .45, .18); K.duck(pd.gain, kt, .6, .25);
    O.gain.setValueAtTime(1, t(22.5)); O.gain.linearRampToValueAtTime(0, 59.4);
  },
});
