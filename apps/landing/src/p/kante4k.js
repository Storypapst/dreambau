// Kante (production "kante4k"), from the theme "Jagged Intelligence": capability has jagged edges, the
// bridge is built from context, tests and judgement. Full screen; the only text is the runtime's tagline.
// The shared clock and drawing code below is the same in all four Jagged productions and counts against
// each one's budget.

// Shared clock and drawing primitives. This source is included in every production's byte budget.
const beat = 60 / 100;
const build = 28 * beat;
const cross = 56 * beat;
const copy = [76, 80, 84].map(n => n * beat);
const glslTimes = 'const float BUILD=' + build.toFixed(2) + ',CROSS=' + cross.toFixed(2) +
  ';const vec3 CUES=vec3(' + copy.map(t => t.toFixed(2)).join(',') + ');\n';

const common = /*glsl*/`
float phase(float t,float w){return smoothstep(t,t+w,T);}
vec2 pixel(){return (2.*gl_FragCoord.xy-R)/R.y;}
vec2 world(vec2 p){return vec2(p.x/min(R.x/R.y,1.42),p.y);}
float ink(float d,float w){return 1.-smoothstep(w,w+max(1.9/R.y,.0015),abs(d));}
float seg(vec2 p,vec2 a,vec2 b){
  vec2 u=p-a,v=b-a;
  return length(u-v*clamp(dot(u,v)/dot(v,v),0.,1.));
}
// A light that wanders over the drawing, coloured by the act (plan, build, crossing) and breathing with the
// bass. It keeps the picture moving between the structural events and leaves before the closing lines.
vec3 grade(vec3 c,vec2 p){
  float a=phase(1.,6.),b=phase(BUILD-1.,6.),x=phase(CROSS-1.,6.),z=1.-phase(CUES.x-4.,4.);
  vec2 m=vec2(1.1*sin(T*.23),.2+.3*sin(T*.31+1.));
  vec3 tint=mix(mix(vec3(.10,.13,.32),vec3(.03,.30,.27),b),vec3(.34,.18,.07),x);
  float lift=a*z*smoothstep(-.8,-.55,p.y)*(.35*exp(-dot(p-m,p-m)*.9)+.3);
  return c*(1.+.35*(E.x-.4)*b*z)+tint*lift*(.75+.6*E.x*b);
}
vec3 closeUp(vec3 c,vec2 p){
  c=grade(c,p);
  vec3 a=smoothstep(CUES,CUES+1.05,vec3(T));
  float mask=1.-smoothstep(.78,1.33,length(p/(TT.zw*vec2(1.03,1.26))));
  c*=1.-a.x*.74*mask;
  vec3 d=1.-smoothstep(vec3(-.0018),vec3(.0025),tdist(p));
  c=mix(c,vec3(.85,.86,1.),a.x*d.x);
  c=mix(c,vec3(1.,.78,.56),a.y*d.y);
  return mix(c,vec3(.99,.96,.91),a.z*d.z);
}
`;

function production(id, px, picture, music) {
  Dream.add({ id, dur: 60, fin: 53, cta: 54.5, build, cross, px, frag: glslTimes + common + picture, music });
}

function room(K, seconds, decay, wet, damping) {
  const bus = K.c.createGain();
  bus.connect(K.bus(.74));
  bus.connect(K.rev(seconds, decay, wet, K.out, damping));
  K.p('sine', 2.85, .85, 98, .014, .21, .74, bus);
  return bus;
}

// Each line in the closing composition enters with an audible note or chord.
function signOff(K, send, root) {
  copy.forEach((t, i) => {
    const notes = i === 2 ? [0, 4, 7, 12] : [i ? 7 : 2, 12 + (i ? 4 : 2)];
    for (const n of notes) K.p('sine', t, i === 2 ? 4.15 : .32, K.hz(root + n), .12, .018, 2.8, send);
  });
}

// Kante: a single irregular trace becomes the section drawing for a crossing.
production('kante4k', 510000, /*glsl*/`
float height(float x){
  return -.02+.23*sin(x*9.)+.075*sin(x*32.)+.065*sin(x*72.)-.63*exp(-16.*x*x);
}
void main(){
  vec2 p=pixel(),q=world(p);
  float lit=phase(0.,2.),draw=phase(1.,9.),b=phase(BUILD,16.8),run=phase(CROSS,5.),end=phase(44.,6.);
  vec3 cold=vec3(.42,.49,.91),gold=vec3(1.,.62,.33);
  vec3 c=vec3(.022,.027,.066)+vec3(.03,.035,.075)*exp(-dot(q,q)*1.4);
  vec2 g=abs(fract(q*10.+.5)-.5);
  c+=.10*cold*ink(min(g.x,g.y)/10.,0.)*lit;
  float jitter=.028*sin(T*2.+q.x*45.)*(1.-b);
  float y=height(q.x)+jitter;
  float edge=max(1.,(R.x/R.y)/1.42);
  float sweep=mix(-edge-.08,edge+.08,draw);
  float range=1.-smoothstep(sweep-.08,sweep,q.x);
  c+=cold*range*(.17*exp(-abs(q.y-y)*32.)+.60*ink(q.y-y,.004)+.10*step(q.y,y));
  vec2 node=vec2(sweep,height(sweep));
  c+=cold*exp(-length(q-node)*39.)*(.35+.4*E.y)*(1.-draw);
  float d=.14+end*.32;
  float deck=step(abs(q.x),.87)*smoothstep(q.x-.07,q.x+.015,-.89+1.82*b);
  float rail=ink(q.y-d,.009)+.25*ink(q.y-d+.035,.002);
  float x=fract(q.x*9.+.5)-.5;
  float post=ink(x/9.,.002)*step(d-.062,q.y)*step(q.y,d);
  float truss=ink(q.y-d+.066*abs(x*2.)+.009,.003)*step(d-.081,q.y);
  float footing=ink(abs(q.x)-.48,.007)*step(y-.045,q.y)*step(q.y,d);
  c+=gold*deck*(rail+post*.54+truss*.73+footing*.56+.19*exp(-abs(q.y-d)*29.))*(.76+.2*E.x);
  float car=fract((T-CROSS)*.18)*1.62-.81;
  c+=vec3(1.,.9,.70)*run*exp(-length((q-vec2(car,d+.012))*vec2(.7,1.))*57.)*(1.-end*.78);
  float gap=ink(length(q-vec2(0.,-.5+.023*sin(T*2.)))-.073,.002);
  c+=gap*vec3(.96,.35,.21)*phase(7.,3.)*(1.-b)*.78;
  c*=1.-.38*smoothstep(.65,1.42,length(q));
  O=vec4(closeUp(c*lit,p),1.);
}
`, K => {
  const send = room(K, 1.45, 2.7, .18, .21);
  for (let i = 7; i < 75; i++) {
    const t = i * beat;
    const n = [45, 45, 48, 43][Math.floor(i / 8) % 4];
    if (i % 2 === 0) K.o('sine', t, .24, 110, 43, i < 28 ? .12 : .29);
    if (i % 4 === 1 || i > 56) K.p('triangle', t + .018, .16, K.hz(n + [12, 19, 24][i % 3]), .094, .014, .45, send, 1400);
    if (i >= 28 && i % 2 === 1) K.n(t, .074, 3600, 1550, 1.5, .082, send);
  }
  signOff(K, send, 48);
});
