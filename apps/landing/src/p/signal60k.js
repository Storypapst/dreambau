// Signal (production "signal60k"), from the theme "Jagged Intelligence": capability has jagged edges, the
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

// Signal: unreliable lanes braid into a checked route; a separate amber branch handles uncertain packets.
production('signal60k', 630000, /*glsl*/`
const vec3 teal=vec3(.32,.93,.84), copper=vec3(1.,.61,.29), violet=vec3(.45,.48,.95);
float zig(float x){return 1.-abs(fract(x)*2.-1.);}
float board(vec2 p,vec2 h){vec2 d=abs(p)-h;return length(max(d,0.))+min(max(d.x,d.y),0.);}
float gateGlow(vec2 p,float a,float tick){
  float edge=board(p,vec2(.087,.13));
  float led=length(p-vec2(.051,.089));
  float pins=ink(abs(p.x)-.10,.011)*step(abs(p.y),.098)*ink((fract(p.y*28.+.5)-.5)/28.,.002);
  return a*(ink(edge,.003)*.62+ink(led,.009)*(.24+.62*tick)+pins*.36+.16*exp(-abs(edge)*37.));
}
float faults(float x,float i){
  float dip=(x+.15*i-.43)*6.;
  return (.14+.028*i)*zig(x*(2.7+i*.42)+i*.271)+.074*zig(x*19.+i*.4)
     -.28*exp(-dip*dip);
}
float path(float x,float i,float t,float settle,float lift){
  float ch=sin(x*7.4+i*.43+t*.6);
  float raw=(i-3.)*.074+faults(x,i)+.035*ch;
  float center=.018*ch+.077*pow(abs(x),1.55)+lift;
  float join=smoothstep(-.90,-.18,x)*settle;
  return mix(raw+lift,center,join);
}
void main(){
  vec2 p=pixel(),q=world(p);
  float t=min(T,61.),settle=phase(BUILD,16.8),run=phase(CROSS,5.);
  float end=phase(43.,8.),lift=.39*end;
  vec3 c=vec3(.019,.039,.058)+vec3(.016,.057,.065)*exp(-length(q)*1.8);
  vec2 u=fract(q*16.+.5)-.5;
  c+=teal*exp(-dot(u,u)*83.)*.12;
  float ring=length((q-vec2(.23,.05+lift))*vec2(1.,1.45));
  c+=teal*ink(fract(ring*8.)/8.,.0003)*exp(-ring*1.9)*run*.105;

  for(int i=0;i<7;i+=1){
    float j=float(i);
    float y=path(q.x,j,t,settle,lift);
    float d=abs(q.y-y);
    vec3 color=mix(violet,teal,.18+j*.096);
    float k=fract(q.x*2.2-t*(.51+j*.025)+j*.317);
    float boxIn=smoothstep(-.96,-.84,q.x)*(1.-smoothstep(.82,.98,q.x));
    float disappear=1.-.85*settle*smoothstep(-.25,.46,q.x);
    c+=boxIn*color*(.10*exp(-d*42.)+ink(d,.001)*(.14+.48*pow(k,14.)))*disappear;
  }

  // Shared lane, then three inspection gates, with an alternate path around the middle gate.
  float route=lift+.023+.077*pow(abs(q.x),1.55);
  float on=step(abs(q.x),.89)*phase(BUILD+7.,6.);
  float hot=fract(q.x*3.2-t*.76);
  c+=on*teal*(.18*exp(-abs(q.y-route)*37.)+.40*ink(q.y-route,.006));
  c+=on*vec3(.84,1.,.92)*ink(q.y-route,.0015)*run*(.45+.55*pow(hot,14.));
  float loop=route-.28*sin(clamp((q.x+.48)/.96,0.,1.)*PI);
  float branch=step(abs(q.x),.48)*run;
  float check=ink(q.y-loop,.004)*branch;
  c+=copper*(check*(.46+.51*pow(fract(q.x*3.5-t*.39),10.))+.16*branch*exp(-abs(q.y-loop)*24.));

  for(int i=0;i<3;i+=1){
    float j=float(i),x=(j-1.)*.45;
    float y=lift+.023+.077*pow(abs(x),1.55);
    vec2 g=q-vec2(x,y);
    float a=phase(BUILD+2.4*j,3.6);
    float pip=pow(.5+.5*cos((t-CROSS)*TAU/2.4-1.1*j),7.)*run;
    float fill=(1.-smoothstep(-.006,.006,board(g,vec2(.087,.13))))*a;
    c=mix(c,c*.48+vec3(.016,.081,.083),fill*.7);
    c+=mix(teal,copper,j*.3)*gateGlow(g,a,pip*.7+E.z*.3);
    c+=teal*on*ink(g.y,.003)*step(abs(g.x),.087)*(.7+.28*pip);
  }
  float x=fract((t-CROSS)*.24)*1.7-.85;
  float y=lift+.023+.077*pow(abs(x),1.55);
  c+=run*vec3(.8,1.,.93)*exp(-length((q-vec2(x,y))*vec2(.68,1.))*71.)*(1.-.72*end);
  c*=1.-.40*smoothstep(.7,1.41,length(q));
  O=vec4(closeUp(c*phase(0.,2.4),p),1.);
}
`, K => {
  const send = room(K, 1.75, 2.7, .22, .25);
  const echoes = K.dly(.45, .27, .17, send, 2150);
  const taps = K.c.createGain();
  taps.connect(send); taps.connect(echoes);
  const left = K.bus(.78, -.52, taps), right = K.bus(.78, .52, taps);
  const roots = [44, 47, 42, 39];
  const pattern = [0, 12, 7, 19, 3, 15, 10, 22];
  for (let i = 7; i < 75; i++) {
    const t = i * beat, base = roots[Math.floor(i / 8) % 4];
    const f = K.hz(base + pattern[i % pattern.length] + 12);
    if (i < 28) {
      K.o('sine', t + (i % 3) * .09, .14, f * 1.9, f * 1.1, .073, i % 2 ? left : right, .05);
      if (i % 4 === 3) K.n(t + .19, .083, 3100, 580, 2.1, .11, send);
    } else {
      K.p('triangle', t, .21, f, .12, .013, .34, i % 2 ? left : right, 1740);
      if (i % 2 === 0) K.o('sine', t, .28, 122, 39, .245, K.out, .09);
      if (i % 4 === 1) K.n(t, .09, 2600, 1480, 1.4, .11, echoes);
      if (i >= 56 && i % 4 === 0) {
        for (const n of [0, 7, 12]) K.p('sine', t + n * .006, 1.64, K.hz(base + n), .09, .13, .65, send);
      }
    }
  }
  signOff(K, send, 47);
});
