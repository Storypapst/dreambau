// Skyline: production 64k for the dreambau.com landing page.
//
// A raymarched construction site at blue hour grows, storey by storey and ring by ring, into a skyline; the sun breaks
// over the horizon on the big hit and the tagline appears in the sky. Cinematic score, 90 BPM, D minor lifting to D major.
//
// Picture: clouds at quarter resolution, then one full-screen raymarch (one building per 4x4 grid cell; every step is
// clipped at the cell border, so a single box SDF per step is valid; a stepped hero tower in the centre cell), sparks and
// dust as GL points/lines, then bloom, god rays (radial blur toward the sun) and a composite pass with filmic tone
// mapping, the tagline, vignette and film grain. JS computes camera, light and story parameters from T once per frame
// (uniform block U); the shaders count beats with the same BPM.
//
// One tempo for picture and music: BPM 90, beat 0.667 s, bar 2.667 s. Sync points (bar → seconds):
//   0-5    0.0-13.3  night noise: heavy grain, dust in the floodlight beams, the foundation grid blinks with each clang
//   5      13.3      taiko drums enter, the grid lights up from the centre, the hero tower starts to rise
//   5+r              ring r of the new city starts to grow (one ring per bar), one storey per beat on every beat
//   big drum hits    spark burst from the welding points, work lights flare; the bass energy E.x drives a tiny camera shake
//   10     26.7      rise: brass and strings, buildings top out, scaffolds vanish, glass facades and windows fade in
//   13-15  34.7-40   riser, the sky glows copper, the camera pulls back to the final frame
//   15     40.0      sunrise hit: the hero tower tops out (spire), the sun breaks over the horizon, D major
//   16 / 17.5 / 19   "Jeht nich…" / "jibs nich…" / "dreambau.com" on the bell notes A5, D6, F#6 (the last with the final chord)
//   grain falls from strong (bar 0) over the three phases to nearly none (bar 16)
const BPM = 90, BT = 60 / BPM, BAR = 4 * BT, HIT = 15, WORDS = [16, 17.5, 19];

// Drum hits [bar position, strength], shared by the score and the picture (sparks, flares).
const DRUMS = [];
for (let b = 5; b < 15; b++) {
  const pat = b < 7 ? [[0, 1], [2, .8]] : b < 10 ? [[0, 1], [1.5, .45], [2, .85], [3.5, .4]]
    : b < 14 ? [[0, 1], [.75, .4], [1.5, .55], [2, .9], [3, .6], [3.5, .5]] : [[0, 1], [1, .7], [2, .9], [2.5, .6], [3, .8], [3.25, .6], [3.5, .9], [3.75, 1]];
  for (const [k, v] of pat) DRUMS.push([b + k / 4, v]);
}
for (const b of [HIT, 16, 17, 17.5, 18, 19]) DRUMS.push([b, b == HIT || b == 19 ? 1.2 : .8]);
// Distant metal clangs in the emergence (bar positions); the foundation grid blinks with them.
const CLANG = [1.25, 1.875, 2.5, 3, 3.375, 3.75, 4.125, 4.375, 4.625, 4.875];

// ------------------------------------------------------------------------------------------------------------------
// Shaders
// ------------------------------------------------------------------------------------------------------------------
const COMMON = /*glsl*/`
uniform vec4 U[18];
uniform sampler2D Bt;
#define CS 4.
#define HS .32
#define SD U[4].xyz
// U[0] camera position, focal | U[1] right, lens shift | U[2] up, pixel footprint | U[3] forward, city top
// U[4] sun direction, direct sun | U[5] sun colour, exposure | U[6] zenith, fog | U[7] horizon, grain
// U[8] horizon glow, cloud light | U[9] beat clock, spire, work lights, window lights | U[10] word reveal, final
// U[11] ambient, floodlights | U[12] grid, dust, sun disk, bloom | U[13] since drum, drum strength, rays, shake
// U[14] sun uv, sun in view, clang index | U[15] since clang, since word 1/2/3 | U[16] crane x, z, height, slew | U[17] dawn rays
const vec3 FL[3]=vec3[](vec3(-7.5,2.4,-7.),vec3(8.5,2.4,-4.5),vec3(-2.,2.4,9.5));

// building table (built in JS): half footprint x/z, storeys, start beat | offset x/z, podium storeys, style
vec4 bld(vec2 c){return texelFetch(Bt,ivec2(clamp(c,-16.,15.)+16.),0);}
vec4 bl2(vec2 c){return texelFetch(Bt,ivec2(clamp(c,-16.,15.)+vec2(48,16)),0);}
// current height: whole storeys, the newest one rises on its beat
float bht(vec4 b){float x=clamp(U[9].x-b.w,0.,b.z);return HS*(floor(x)+smoothstep(0.,.3,fract(x)));}
// camera ray for p-space position p (without shake)
vec3 cray(vec2 p){return normalize(p.x*U[1].xyz+(p.y-U[1].w)*U[2].xyz+U[0].w*U[3].xyz);}
// ray-box: entry and exit distance, n = entry normal
vec2 ib(vec3 o,vec3 d,vec3 c,vec3 s,out vec3 n){
  vec3 m=1./d,u=(o-c)*m,k=abs(m)*s,a=-u-k,b=-u+k;
  n=-sign(d)*step(a.yzx,a.xyz)*step(a.zxy,a.xyz);
  return vec2(max(max(a.x,a.y),a.z),min(min(b.x,b.y),b.z));
}
// boxes of cell c (hero: three tiers and the spire; others: tower and podium): nearest entry and its normal
float hitc(vec3 o,vec3 d,vec2 c,vec4 b,vec4 e,float h,out vec3 n){
  vec3 cc=vec3(c.x*CS+e.x,0,c.y*CS+e.y),m;
  float t=1e9;vec2 r;
#define BX(C,S) r=ib(o,d,C,S,m);if(r.x<r.y&&r.x>0.&&r.x<t){t=r.x;n=m;}
  if(b.z>39.){
    float a=min(h,7.04),g=min(h,10.24);
    BX(cc+vec3(0,a*.5,0),vec3(1.75,a*.5,1.75))
    if(h>7.04){BX(cc+vec3(0,(g+7.04)*.5,0),vec3(1.4,(g-7.04)*.5,1.4))}
    if(h>10.24){BX(cc+vec3(0,(h+10.24)*.5,0),vec3(1.05,(h-10.24)*.5,1.05))}
    if(U[9].y>0.){BX(cc+vec3(0,12.8+U[9].y*.5,0),vec3(.05,U[9].y*.5,.05))}
  }else{
    BX(cc+vec3(0,h*.5,0),vec3(b.x,h*.5,b.y))
    if(e.z>0.){float hp=min(h,e.z*HS);BX(cc+vec3(0,hp*.5,0),vec3(b.x+.3,hp*.5,b.y+.3))}
    if(U[9].x-b.w>b.z+1.){vec2 f=(fract(e.w*vec2(13.1,7.7))-.5)*(b.xy-.5);BX(cc+vec3(f.x,h+.13,f.y),vec3(.32,.13,.26))}
  }
  return t;
}
// first building hit along o+d*t before t1 (1e9: none), a grid walk over the cells
float occl(vec3 o,vec3 d,float t1){
  vec3 n;vec2 r=ib(o,d,vec3(0,U[3].w*.5,0),vec3(58,U[3].w*.5,38),n);
  float t=max(r.x,0.);t1=min(t1,r.y);
  if(t>=t1)return 1e9;
  vec2 sg=sign(d.xz),iv=1./d.xz,dl=abs(iv)*CS,c=floor((o.xz+d.xz*t)/CS+.5),tm=((c+sg*.5)*CS-o.xz)*iv;
  for(int i=0;i<44;i+=1){
    vec4 b=bld(c);
    if(b.z>0.){float h=bht(b);if(h>.01){float th=hitc(o,d,c,b,bl2(c),h,n);if(th<t1)return th;}}
    if(min(tm.x,tm.y)>t1)break;
    if(tm.x<tm.y){c.x+=sg.x;tm.x+=dl.x;}else{c.y+=sg.y;tm.y+=dl.y;}
  }
  return 1e9;
}
// scaffold shell around the part under construction: half sizes and base height
vec3 cgs(vec4 b,vec4 e,float h){
  if(b.z>39.)return h>10.24?vec3(1.17,1.17,10.24):h>7.04?vec3(1.52,1.52,7.04):vec3(1.87,1.87,0);
  float hp=e.z*HS;
  return e.z>0.&&h>hp+.01?vec3(b.xy+.12,hp):vec3(b.xy+(e.z>0.?.42:.12),0);
}
// work light of a building site: a corner of the scaffold top
vec3 lpos(vec2 c,vec4 e,vec3 s,float h){vec2 g=step(.5,fract(e.w*vec2(7.31,13.7)))*2.-1.;return vec3(c.x*CS+e.x+s.x*g.x,h+.3,c.y*CS+e.y+s.y*g.y);}
`;

// clouds at quarter resolution: rgb premultiplied colour, a coverage
const CLOUD = /*glsl*/`
void main(){
  vec2 u=gl_FragCoord.xy/floor(R/4.);
  vec3 d=cray((2.*u*R-R)/R.y);
  if(d.y<.02){O=vec4(0);return;}
  vec2 w=(U[0].xz+d.xz*(240.-U[0].y)/d.y)*.004+vec2(T*.0035,T*.0012);
  float n=fbm(w*vec2(1.,1.6)),cv=smoothstep(.54,.8,n)*smoothstep(.04,.2,d.y),m=max(dot(d,SD),0.);
  vec3 c=U[6].rgb*.6+U[8].rgb*U[8].w*(.05+pow(m,10.)*.7)*(1.3-smoothstep(.54,.9,n));
  O=vec4(c*cv,cv*.8);
}`;

const SCENE = /*glsl*/`
uniform sampler2D Q;
vec3 ro,rd;vec4 CG;float pf;

vec3 skyc(vec3 d){
  float y=max(d.y,0.),mu=dot(d,SD),m=max(mu,0.);
  vec3 c=mix(U[7].rgb,U[6].rgb,smoothstep(0.,.36,pow(y,.7)));
  c+=U[8].rgb*(pow(m,16.)*exp(-y*28.)*1.2+pow(max(mu*.5+.5,0.),4.)*exp(-y*7.)*.22+.03*exp(-y*18.));
  float a=max(-mu,0.),yy=(y-.13)/.08;
  c=c*mix(1.,.75,a*smoothstep(.06,0.,y))+vec3(.9,.42,.5)*U[8].w*.07*a*exp(-yy*yy);
  c+=U[5].rgb*U[12].z*(smoothstep(.99985,.9999,mu)*30.+pow(m,3000.)*6.+pow(m,250.)*.8);
  return mix(c,U[11].rgb*.35,smoothstep(0.,-.12,d.y));
}
vec3 fogc(vec3 c,float t){
  float k=.15*rd.y,a=U[6].w*exp(-.15*ro.y),f=a*(abs(k)<1e-4?t:(1.-exp(-k*t))/k),m=max(dot(rd,SD),0.);
  return mix(c,U[7].rgb*.7+U[8].rgb*(pow(m,6.)*.8+.05),1.-exp(-f));
}
float shad(vec3 p,vec3 n){return U[4].w>0.&&dot(n,SD)>0.?step(1e8,occl(p+n*.01,SD,80.)):0.;}
// floodlights on masts around the site (blue hour)
vec3 flood(vec3 p,vec3 n){
  vec3 s=vec3(0);
  if(U[11].w>0.)for(int i=0;i<3;i+=1){vec3 l=FL[i]-p;float d=dot(l,l);s+=max(dot(n,l)*inversesqrt(d),0.)/(1.+d*.1);}
  return s*vec3(1.,.74,.48)*U[11].w*1.2;
}
// scaffold of a site seen through: front and back face of the shell, bars anti-aliased by the pixel footprint
void cage(vec2 c,vec4 b,vec4 e,float h,float th){
  vec3 s=cgs(b,e,h),cc=vec3(c.x*CS+e.x,0,c.y*CS+e.y),n;
  float tp=h+.22;
  vec2 r=ib(ro,rd,cc+vec3(0,(s.z+tp)*.5,0),vec3(s.x,(tp-s.z)*.5,s.y),n);
  if(r.x>=r.y)return;
  for(int k=0;k<2;k+=1){
    float t=k==0?r.x:r.y;
    vec3 q=ro+rd*t-cc;
    if(t<0.||t>th||q.y>tp-.01)continue;
    vec2 a=abs(q.xz)-s.xy;
    float u=a.x>a.y?q.z:q.x,w=.009,f=t*pf,
    gv=abs(fract(u*2.+.5)-.5)*.5,gh=abs(fract(q.y/HS+.5)-.5)*HS,gd=abs(fract(u*.5+q.y*.5+.5)-.5)*1.41,
    cv=max(max(max(smoothstep(w+f,w-f,gv),smoothstep(w+f,w-f,gh)),.6*smoothstep(w+f,w-f,gd))*clamp(2.5*w/f,.2,1.),.03);
    vec3 l=lpos(c,e,s,h)-cc-q;
    vec3 k3=vec3(.45,.46,.48)*(U[11].rgb*2.5+vec3(1.,.5,.2)*U[9].z*(1.+E.x)/(1.+dot(l,l)*1.5)+flood(q+cc,vec3(sign(q.x)*step(a.y,a.x),0,sign(q.z)*step(a.x,a.y)))*.5+U[5].rgb*U[4].w*.4);
    CG+=(1.-CG.a)*vec4(k3*cv,cv)*(k==0?1.:.6);
  }
}
// grid walk from the camera: scaffolds are overlaid (CG), the first building box is the hit
float trace(out vec2 hc,out vec3 hn){
  vec3 n;vec2 r=ib(ro,rd,vec3(0,U[3].w*.5,0),vec3(58,U[3].w*.5,38),n);
  float t=max(r.x,0.),t1=r.y;
  if(t>=t1)return -1.;
  vec2 sg=sign(rd.xz),iv=1./rd.xz,dl=abs(iv)*CS,c=floor((ro.xz+rd.xz*t)/CS+.5),tm=((c+sg*.5)*CS-ro.xz)*iv;
  for(int i=0;i<44;i+=1){
    vec4 b=bld(c);
    if(b.z>0.){
      float h=bht(b);
      if(h>.01){
        vec4 e=bl2(c);
        float th=hitc(ro,rd,c,b,e,h,n),st=U[9].x-b.w;
        if(st>0.&&st<b.z)cage(c,b,e,h,th);
        if(th<1e8){hc=c;hn=n;return th;}
      }
    }
    if(min(tm.x,tm.y)>t1)break;
    if(tm.x<tm.y){c.x+=sg.x;tm.x+=dl.x;}else{c.y+=sg.y;tm.y+=dl.y;}
  }
  return -1.;
}

vec3 shadeB(vec3 P,vec3 n,vec2 c,vec4 b,vec4 e,float h,float t){
  vec3 q=P-vec3(c.x*CS+e.x,0,c.y*CS+e.y);
  float st=U[9].x-b.w,old=step(b.w,-99.),hero=step(39.,b.z),fin=max(old,clamp((st-b.z+hero*1.5)/(4.-hero*2.5),0.,1.)),hk=e.w,ao=.45+.55*smoothstep(0.,2.5,P.y);
  float u=abs(n.x)>.5?q.z*sign(n.x):-q.x*sign(n.z),mw=old>.5?.42:.3+.12*step(.7,hk);
  vec2 g=vec2(u/mw,q.y/HS),gi=floor(g),gf=fract(g);
  float wr=h2(gi+c*17.31+n.xz*3.),glass=old>.5?step(.85,hk):max(step(hk,.6),hero);
  // brick, sandstone, render for the old city; glass, pale concrete or bronze for the new one
  vec3 alb=old>.5?(hk<.3?vec3(.33,.15,.1):hk<.55?vec3(.5,.42,.32):hk<.8?vec3(.45,.43,.38):vec3(.3,.34,.36)):hero>.5?vec3(.42,.32,.2):hk<.6?vec3(.3,.35,.4):hk<.85?vec3(.58,.57,.54):vec3(.3,.22,.15);
  vec3 sun=U[5].rgb*U[4].w*max(dot(n,SD),0.)*shad(P,n);
  vec3 li=U[11].rgb*ao*(.55+.45*n.y)*vec3(1.7,1.9,2.3)+sun+flood(P,n);
  if(st>0.&&st<b.z+2.&&U[9].z>0.){vec3 l=lpos(c,e,cgs(b,e,h),h)-P;float d=dot(l,l);li+=vec3(1.,.45,.15)*U[9].z*max(dot(n,l),0.)*inversesqrt(d)/(1.+d*2.)*2.*(1.+E.x);}
  if(n.y>.5)return mix(vec3(.16,.155,.15),alb,.3)*.6*li;
  // facade: window grid, glass reflects the sky and the sun, warm light inside (whole floors lit)
  float win=glass>.5?step(.08,gf.x)*step(.18,gf.y):step(.2,gf.x)*step(gf.x,.8)*step(.25,gf.y)*step(gf.y,.85);
  if(hero>.5)win=step(.16,gf.x)*step(.1,gf.y);
  float lit=step(h2(vec2(gi.y,dot(c,vec2(7.,13.)))),U[9].w*(old>.5?.5:.7))*step(.3,wr)*step(.5,fin);
  vec3 rf=reflect(rd,n),inl=mix(vec3(1.,.42,.14),vec3(1.,.66,.36),h2(gi.yy*.7+c))*(.22+.2*wr);
  float fr=.1+.9*pow(max(1.-dot(-rd,n),0.),5.);
  vec3 gls=skyc(rf)*fr*(glass>.5?2.:1.)*mix(vec3(1),vec3(1.25,.95,.6),hero)+(1.-fr)*(inl*lit*(.9+.15*E.x)+U[11].rgb*.1)+sun*pow(max(dot(rf,SD),0.),400.)*1.5;
  // windows dissolve into their average when they get smaller than a pixel (no moire)
  float px=t*pf/mw;win=mix(win,glass>.5?.75:.35,smoothstep(.2,.6,px));
  vec3 done=mix(alb*li,gls,win);
  if(fin>.99)return done;
  // concrete frame under construction: slab edges and columns, dark open interior lit by the work lamps
  float sl=max(step(fract(q.y/HS),.16),step(fract(u/1.2+.05),.1));
  vec3 frm=mix(vec3(.004,.0035,.003)+vec3(1.,.42,.13)*U[9].z*.025*(1.+E.x)*h2(gi.yy+c),vec3(.38,.37,.36)*li,sl);
  return mix(frm,done,fin);
}

vec3 shadeG(vec3 P,float t){
  vec2 c=floor(P.xz/CS+.5);vec4 b=bld(c),e=bl2(c);float h=bht(b);
  vec3 q=P-vec3(c.x*CS+e.x,0,c.y*CS+e.y);
  vec2 a=abs(q.xz)-b.xy;
  float fd=length(max(a,0.))+min(max(a.x,a.y),0.),r=max(abs(c.x),abs(c.y)),st=U[9].x-b.w,city=step(abs(c.x),14.5)*step(abs(c.y),9.5);
  // streets and pavements in the old city, packed earth on the site
  vec3 alb=r>6.5&&city>0.?(fd<.3?vec3(.11,.105,.1):vec3(.035,.035,.04)):r<6.5?vec3(.07,.06,.05):vec3(.04,.045,.04);
  float ao=b.z>0.&&h>.01?.45+.55*smoothstep(0.,1.2,fd):1.;
  vec3 li=U[11].rgb*ao*2.+U[5].rgb*U[4].w*SD.y*shad(P,vec3(0,1,0))+flood(P,vec3(0,1,0))*1.5;
  if(st>0.&&st<b.z+2.&&U[9].z>0.){vec3 l=lpos(c,e,cgs(b,e,h),h)-P;float d=dot(l,l);li+=vec3(1.,.45,.15)*U[9].z*l.y*inversesqrt(d)/(1.+d*1.5)*2.;}
  float wet=r<6.5?smoothstep(.62,.7,vn(P.xz*.45+3.)):0.,k=clamp(1.-t*pf*12.,0.,1.);
  vec3 col=alb*li*(1.-.6*wet)*(.8+.4*vn(P.xz*3.)*k);
  // foundation grid of the new city: outline and column grid; blinks with the clangs, lit as a wave from bar 5
  if(r<6.5&&b.z>0.){
    float f=t*pf*1.5,w=.018,gq=min(abs(fract(q.x*2.+.5)-.5),abs(fract(q.z*2.+.5)-.5))*.5;
    float ln=max(smoothstep(w+f,w-f,abs(fd)),.5*step(fd,0.)*smoothstep(w*.6+f,w*.6-f,gq))*clamp(2.*w/f,.2,1.);
    float cid=dot(c,vec2(1.,31.)),bl=U[9].x<20.?.35*U[12].x*step(.9,h1(cid+floor(U[9].x*2.)*.13))+exp(-U[15].x*2.2)*step(.5,h1(cid*1.3+U[14].w))
      :U[12].x*smoothstep(20.+r*.5,20.3+r*.5,U[9].x)*(1.+2.*exp(-max(U[9].x-20.-r*.5,0.)*2.));
    col+=vec3(.2,.7,1.)*ln*bl*(1.-smoothstep(0.,2.,st))*.5;
  }
  return col;
}

// tower crane at the hero site: climbs with the tower and is taken down after it has set the spire
float crane(out vec3 n){
  float H=U[16].z,t=1e9;
  if(H<.05)return t;
  vec2 cs=vec2(cos(U[16].w),sin(U[16].w)),r;
  vec3 o=ro-vec3(U[16].x,0,U[16].y),d=rd,m;
  o.xz=vec2(cs.x*o.x+cs.y*o.z,cs.x*o.z-cs.y*o.x);d.xz=vec2(cs.x*d.x+cs.y*d.z,cs.x*d.z-cs.y*d.x);
  r=ib(o,d,vec3(2.5,H*.5+.8,0),vec3(6.,H*.5+.8,.3),m);
  if(r.x>r.y||r.y<0.)return t;
  BX(vec3(0,H*.5,0),vec3(.12,H*.5,.12))
  BX(vec3(2.75,H+.1,0),vec3(5.75,.1,.09))
  BX(vec3(-2.6,H-.12,0),vec3(.4,.24,.2))
  BX(vec3(.34,H-.2,0),vec3(.2,.16,.16))
  BX(vec3(0,H+.75,0),vec3(.07,.62,.07))
  n.xz=vec2(cs.x*n.x-cs.y*n.z,cs.y*n.x+cs.x*n.z);
  return t;
}

void main(){
  // checkerboard: this target is half as wide, each texel is one of the two pixels of a pair (alternating per row)
  vec2 fc=vec2(floor(gl_FragCoord.x)*2.+mod(floor(gl_FragCoord.y),2.)+.5,gl_FragCoord.y),p=(2.*fc-R)/R.y;
  ro=U[0].xyz+(U[1].xyz*sin(T*41.)+U[2].xyz*sin(T*53.+2.))*E.x*U[13].w;
  rd=cray(p);
  rd+=step(abs(rd),vec3(1e-5))*1e-5;
  pf=U[2].w;CG=vec4(0);
  vec2 hc;vec3 hn,hn2,col;
  float t=trace(hc,hn),ray=0.,tk=crane(hn2);
  if(tk<(t>0.?t:rd.y<0.?-ro.y/rd.y:1e8)){
    // crane: yellow steel, lattice suggested by diagonal stripes
    vec3 P=ro+rd*tk,q=P-vec3(U[16].x,0,U[16].y),m=abs(hn2);
    vec2 cs=vec2(cos(U[16].w),sin(U[16].w));q.xz=vec2(cs.x*q.x+cs.y*q.z,cs.x*q.z-cs.y*q.x);
    // truss: chords along the edges and a zigzag of diagonals between them
    bool ms=abs(q.x)<.13&&q.y<U[16].z-.05;
    float hw=ms?.12:q.y>U[16].z-.02?.09:.1,v=ms?q.y:q.x,u=ms?(abs(dot(hn2.xz,cs))>.5?q.z:q.x):(m.y>.5?q.z:q.y-U[16].z-.1),
    tr=max(step(hw*.62,abs(u)),step(abs(u-(abs(fract(v/(hw*2.4))-.5)*4.-1.)*hw),hw*.24));
    t=tk;col=vec3(.75,.42,.06)*(.2+.8*tr)*(U[11].rgb*(2.+hn2.y)+U[5].rgb*U[4].w*max(dot(hn2,SD),0.)+flood(P,hn2));
  }else if(t>0.){
    vec4 b=bld(hc);
    col=shadeB(ro+rd*t,hn,hc,b,bl2(hc),bht(b),t);
  }else if(rd.y<0.){t=-ro.y/rd.y;col=shadeG(ro+rd*t,t);}
  else{
    t=1e4;col=skyc(rd);
    vec4 k=texture(Q,fc/R);col=col*(1.-k.a)+k.rgb;
    float m=max(dot(rd,SD),0.);ray=(pow(m,40.)*U[12].z+pow(m,5.)*U[17].x*smoothstep(0.,.05,rd.y))*(1.-k.a*.9);
  }
  col=col*(1.-CG.a)+CG.rgb;
  col=fogc(col,t);
  // floodlight halos in the fog (analytic in-scattering up to the hit, fast arctangent)
  if(U[11].w>0.)for(int i=0;i<3;i+=1){vec3 l=FL[i]-ro;float tl=dot(l,rd),dd=max(length(l-rd*tl),.04),x=(t-tl)/dd,y=tl/dd;col+=vec3(1.,.72,.45)*U[11].w*U[6].w*.19*(x/(1.+abs(x))+y/(1.+abs(y)))/dd;}
  // guard: a stray NaN or infinity must not be smeared over the frame by the bloom
  if(!(col.x+col.y+col.z<1e4))col=vec3(0);
  O=vec4(sqrt(col/(1.+col)),ray>=0.?min(ray,4.):0.);
}`;

// particles, added into the scene buffer: dust motes (M 0), sparks (M 1, lines), lamps (M 2: floodlights and work lights)
const HV = /*glsl*/`
float h2(vec2 p){return float(pcg(floatBitsToUint(p.x)^pcg(floatBitsToUint(p.y))))*2.3283064e-10;}
`;
const PVS = /*glsl*/`
out vec4 C;
const vec2 EM[6]=vec2[](vec2(0),vec2(1,0),vec2(-1,1),vec2(0,-1),vec2(2,1),vec2(-2,-1));
void main(){
  int i=gl_VertexID>>(M==1?1:0);
  float fi=float(i),e=float(gl_VertexID&1),sz=1.;
  vec3 r=vec3(h1(fi*1.13+.1),h1(fi*2.71+.3),h1(fi*.37+.7)),P;
  vec4 col=vec4(0);
#if M==0
  // dust drifting through the floodlight beams around the site
  vec3 L=FL[i%3];
  float tt=T*.3+fi;
  P=L+(r-.5)*vec3(9.,4.6,9.)-vec3(0,1.2,0)+vec3(sin(tt*.6)*.4+T*.05,sin(tt*.47)*.2,cos(tt*.53)*.4);
  vec3 d=L-P;
  col=vec4(1.,.8,.6,0)*U[11].w*U[12].y*1.6/(1.+dot(d,d)*.25)*(.5+.5*sin(tt*2.3));sz=.03;
#elif M==1
  // sparks: welding spatter falls along the facade of a site on each big drum hit, white hot to orange
  // (head and tail of a streak share one validity test, so a line is never half culled)
  vec2 c=EM[i%6];vec4 b=bld(c),q=bl2(c);float h=bht(b),st=U[9].x-b.w,lf=.5+.9*r.y,a=U[13].x-r.z*.15;
  if(st>0.&&st<b.z&&a>.06&&a<lf){
    vec3 s=cgs(b,q,h);vec2 g=step(.5,fract(q.w*vec2(7.31,13.7)))*2.-1.;
    vec3 o=vec3(c.x*CS+q.x+s.x*g.x,h-.05,c.y*CS+q.y+s.y*(r.x*2.-1.)*.6),v=vec3(g.x*(.25+.5*r.z),.3+.4*r.y,(r.y-.5)*.5),g3=vec3(0,1.6,0);
    float a1=a-.05,z0=dot(o+v*a-g3*a*a-U[0].xyz,U[3].xyz),z1=dot(o+v*a1-g3*a1*a1-U[0].xyz,U[3].xyz);
    a-=e*.05;P=o+v*a-g3*a*a;
    float k=a/lf;col=vec4(mix(vec3(1.,.9,.6),vec3(1.,.35,.08),k),0)*(1.-k)*U[13].y*2.*step(.25,min(z0,z1));
  }
#else
  // lamps: three floodlights, then one work light per building site; hidden behind buildings
  if(i<3){P=FL[i];col=vec4(1.,.8,.6,0)*U[11].w*.9;sz=.25;}
  else if(i<5){
    // red aviation lights of the crane: mast top and jib tip
    float a=U[16].w,f=float(i-3)*8.5;P=vec3(U[16].x+cos(a)*f,U[16].z+(i<4?1.45:.3),U[16].y+sin(a)*f);
    col=vec4(1.,.06,.02,0)*smoothstep(.1,.5,U[16].z)*(.35+.65*smoothstep(.3,.6,fract(T*.75)))*(1.-.7*U[10].w);sz=.08;
  }else{
    vec2 c=vec2(float((i-5)%29)-14.,float((i-5)/29)-9.);vec4 b=bld(c),q=bl2(c);float h=bht(b),st=U[9].x-b.w;
    if(st>0.&&st<b.z+2.){P=lpos(c,q,cgs(b,q,h),h);col=vec4(1.,.5,.18,0)*U[9].z*(.5+.4*E.x)*(1.-smoothstep(b.z,b.z+2.,st));sz=.09;}
  }
  if(i>=556){
    // traffic in the old city at night: head and tail lights moving along the streets
    float j=float(i-556),ax=step(.5,r.x),ln=step(.5,r.y)*2.-1.,k=floor(r.z*29.)-14.;
    float x=mod(r.x*397.+T*(.9+.5*h1(j))*ln,116.)-58.;
    P=ax>.5?vec3(x,.04,(k+.5)*CS+ln*.13):vec3((k+.5)*CS+ln*.13,.04,x*.65);
    col=(max(abs(P.x)/58.,abs(P.z)/38.)>.42?1.:0.)*vec4(ln>0.?vec3(1.,.85,.6):vec3(1.,.1,.04),0)*U[9].w*.5*(1.-U[10].w);sz=.03;
  }
  vec3 w=P-U[0].xyz;float dv=length(w);
  if(col.r>0.&&occl(U[0].xyz,w/dv,dv-.25)<1e8)col=vec4(0);
#endif
  vec3 v=P-U[0].xyz;float z=dot(v,U[3].xyz);
  gl_Position=z<.2||col.r<.001?vec4(2,2,2,1):vec4(U[0].w*dot(v,U[1].xyz)/z*R.y/R.x,U[0].w*dot(v,U[2].xyz)/z+U[1].w,0,1);
  gl_PointSize=clamp(R.y*sz/z,1.,48.);
  C=col*(M==0?min(1.,R.y*.005/z+.3):1.);
}`;
const PFS = /*glsl*/`
in vec4 C;
void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d);O=C*(exp(-r*40.)+.25*exp(-r*10.));}`;
const LFS = /*glsl*/`
in vec4 C;
void main(){O=C;}`;

// separable gaussian blur at quarter resolution: M = (step x, step y, source level)
const BLUR = /*glsl*/`
uniform sampler2D X;uniform vec3 M;
void main(){
  vec2 u=gl_FragCoord.xy/floor(R/4.);
  vec3 c=vec3(0);float n=0.;
  for(int k=-6;k<7;k+=1){float w=exp(-float(k*k)/18.);c+=textureLod(X,u+M.xy*float(k),M.z).rgb*w;n+=w;}
  O=vec4(c/n,1);
}`;

// god rays: radial blur of the sky around the sun (scene alpha) toward the sun position
const RAYS = /*glsl*/`
uniform sampler2D X;
void main(){
  vec2 u=gl_FragCoord.xy/floor(R/4.),s=(U[14].xy-u)/28.;float a=0.,w=1.;
  for(int i=0;i<28;i+=1){a+=textureLod(X,u,2.).a*w;w*=.94;u+=s;}
  O=vec4(U[5].rgb*a*(U[13].z+U[17].x*2.5)/14.,1);
}`;

const COMP = /*glsl*/`
uniform sampler2D X,Y,Z;
vec3 dec(vec3 e){e*=e;return e/max(1.-e,.001);}
vec3 cb(ivec2 i){return texelFetch(X,ivec2(i.x>>1,i.y),0).rgb;}
void main(){
  vec2 f=gl_FragCoord.xy,u=f/R,p=(2.*f-R)/R.y;
  // rebuild the pixels the scene pass skipped from their four neighbours, along the smoother direction
  ivec2 i=ivec2(f);vec3 e=cb(i);
  if(((i.x+i.y)&1)==1){vec3 a=cb(i-ivec2(1,0)),b=cb(i+ivec2(1,0)),g=cb(i-ivec2(0,1)),h=cb(i+ivec2(0,1));e=dot(abs(a-b),vec3(1))<dot(abs(g-h),vec3(1))?(a+b)*.5:(g+h)*.5;}
  vec3 c=dec(e)+dec(texture(Y,u).rgb)*U[12].w+texture(Z,u).rgb;
  c*=U[5].w;
  c=clamp(c*(2.51*c+.03)/(c*(2.43*c+.59)+.14),0.,1.);
  c=pow(c,vec3(.4545));
  c*=1.-.2*dot(p*vec2(.5,.75),p*vec2(.5,.75));
  // calm dark band at the bottom for the closing line
  c*=mix(1.,.3+.7*smoothstep(-1.02,-.6,p.y),U[10].w);
  // the tagline: each line condenses out of grain into sunlit letters (distances in units of the block half width)
  vec3 rv=U[10].xyz;
  if(rv.x>0.){
    vec3 d=tdist(p)/TT.z,ds=tdist(p+vec2(.005,.007)*TT.z)/TT.z,rr=smoothstep(0.,.6,rv);
    float px=2./R.y/TT.z,nz=vn(p*90./TT.z);
    vec3 m=smoothstep(nz-.15,nz+.15,rv*1.3-.15),cv=clamp(.5-d/px,0.,1.)*m;
    float a=max(cv.x,max(cv.y,cv.z));
    c*=1.-.5*min(dot(rr,smoothstep(.026,0.,d)),1.)-.3*min(dot(rr,smoothstep(.02,-.004,ds)),1.);
    c+=vec3(1.,.6,.28)*.2*dot(rr*exp(-U[15].yzw*2.5),smoothstep(.026,0.,d));
    // a glint of sunlight runs across each line after it appears
    vec3 gq=(p.x-TT.x)/TT.z-(U[15].yzw*1.6-1.2),gx=exp(-gq*gq*30.)*step(U[15].yzw,vec3(1.6));
    c=mix(c,mix(vec3(1.,.9,.74),vec3(1.,.97,.9),smoothstep(-.6,.6,(p.y-TT.y)/TT.w))*(1.+.35*dot(gx,cv)),a);
  }
  // film grain: from noise to order
  float l=dot(c,vec3(.3,.5,.2));
  c+=(h2(f+fract(T*7.31)*vec2(171.,97.))-.5)*U[7].w*(.35+sqrt(l));
  O=vec4(c+(h2(f.yx+3.)-.5)/255.,1);
}`;

// ------------------------------------------------------------------------------------------------------------------
// Story parameters (functions of T)
// ------------------------------------------------------------------------------------------------------------------
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ss = (a, b, x) => { x = cl((x - a) / (b - a)); return x * x * (3 - 2 * x); };
// smooth interpolation of rows [t, v0, v1, ...] at time t
const lerpK = (K, t) => {
  let i = 0;
  while (i < K.length - 2 && t > K[i + 1][0]) i++;
  const a = K[i], b = K[i + 1], x = ss(0, 1, (t - a[0]) / (b[0] - a[0]));
  return a.map((v, n) => v + (b[n] - v) * x).slice(1);
};
// sky palette (linear HDR): t, zenith, horizon, glow, ambient
const PAL = [
  [0, .001, .002, .006, .002, .004, .008, 0, 0, 0, .001, .002, .004],
  [12, .004, .009, .022, .01, .02, .032, .006, .004, .003, .004, .008, .016],
  [27, .007, .016, .04, .02, .038, .055, .05, .022, .01, .008, .014, .028],
  [37, .012, .026, .065, .06, .045, .055, .35, .13, .04, .018, .026, .045],
  [40, .016, .036, .09, .09, .065, .075, .8, .3, .08, .03, .04, .065],
  [43, .02, .048, .125, .13, .09, .095, 1.25, .48, .13, .05, .06, .09],
  [60, .024, .056, .14, .15, .11, .11, 1.2, .52, .17, .06, .07, .1],
];
// t, exposure, fog, grain, floodlights, work lights, windows, grid, dust, rays, bloom
const STORY = [
  [0, 0, .03, .2, 0, 0, .4, .5, 1, 0, .1],
  [4, 2.6, .03, .2, 1, .4, .4, .7, 1, 0, .1],
  [13, 3, .028, .15, 1, 1, .4, 1, 1, 0, .12],
  [28, 3, .02, .06, .8, 1, .5, .3, .4, 0, .12],
  [38, 2.2, .012, .03, .3, .8, .8, 0, 0, .15, .12],
  [41, 1.3, .004, .02, 0, .2, .55, 0, 0, .5, .11],
  [46, 1.2, .0025, .01, 0, 0, .2, 0, 0, .4, .1],
  [60, 1.2, .0025, .008, 0, 0, .15, 0, 0, .35, .1],
];

// camera keys: bar, position, target, focal, lens shift; the last two keys (final frame) are fitted to the aspect ratio
function camKeys(asp, hw) {
  // final frame: level camera with a lens shift; the top of the hero spire ends just below the tagline
  const tw = hw * D0.text.H / D0.text.W, top = -tw * .8, f = 3.2 * cl(1.25 / asp, 1, 1.9), z = -100, y = 3.4,
    sh = top - f * (15.4 - y) / -z;
  return [
    [0, -6, 1.05, -21, 0, .8, 0, 1.9, 0],
    [5, -4.2, 1.35, -15.5, 0, 1.5, 0, 1.9, 0],
    [7.5, -9, 3.4, -10, 0, 2.6, 0, 1.8, 0],
    [10, -12, 7.5, 5, 0, 5, 0, 1.8, 0],
    [12, 4, 19, 21, 0, 4, 0, 1.7, 0],
    [13.4, -34, 20, 4, 0, 3, 2, 1.9, 0],
    [14.75, 0, y, z, 0, y, 0, f, sh],
    [23, 0, y + .3, z + 4, 0, y + .3, 0, f, sh],
  ];
}
function camAt(K, b) {
  let i = 0;
  while (i < K.length - 2 && b > K[i + 1][0]) i++;
  const tan = j => j <= 0 || j >= K.length - 1 ? K[j].map(() => 0) : K[j].map((_, n) => (K[j + 1][n] - K[j - 1][n]) / (K[j + 1][0] - K[j - 1][0]));
  const k0 = K[i], k1 = K[i + 1], dt = k1[0] - k0[0], x = cl((b - k0[0]) / dt), m0 = tan(i), m1 = tan(i + 1),
    x2 = x * x, x3 = x2 * x;
  return k0.map((v, n) => (2 * x3 - 3 * x2 + 1) * v + (x3 - 2 * x2 + x) * dt * m0[n] + (3 * x2 - 2 * x3) * k1[n] + (x3 - x2) * dt * m1[n]);
}
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const Uv = new Float32Array(72);
function story(T, w, h) {
  const b = T / BAR, bt = T / BT, asp = w / h, hw = Math.min(asp * .88, .92);
  const C = camAt(camKeys(asp, hw), Math.min(b, 23)), ro = C.slice(1, 4), fw = norm(C.slice(4, 7).map((v, n) => v - ro[n])),
    rt = norm(cross([0, 1, 0], fw)), up = cross(fw, rt), f = C[7], sh = C[8];
  // sun: below the horizon in the blue hour, breaks over it on the hit, then climbs slowly
  const eld = T < 40 ? -6 + 5.6 * T / 40 : -.4 + 3.4 * ss(40, 43, T) + 4.4 * ss(42, 60, T), el = eld * Math.PI / 180, az = 1.95,
    sd = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  const P = lerpK(PAL, T), S = lerpK(STORY, T), sun = ss(-.5, 1.4, eld), fin = ss(40, 44, T);
  const sunC = [1.3, .62 + .22 * ss(41, 56, T), .3 + .26 * ss(41, 56, T)];
  const top = Math.max(2.9, .32 * cl(bt - 19, 0, 40) + .45) + (T > HIT * BAR ? 2.6 : 0);
  let ld = 99, ls = 0, lc = 99, li = 0;
  for (const [db, v] of DRUMS) { const t0 = db * BAR; if (t0 <= T && v > .7) { ld = T - t0; ls = v; } }
  CLANG.map((cb, k) => { if (cb * BAR <= T) { lc = T - cb * BAR; li = k; } });
  const rv = WORDS.map(wb => ss(0, 1, (T - wb * BAR) / .55)), ws = WORDS.map(wb => T >= wb * BAR ? T - wb * BAR : 99);
  // sun on screen (uv) for the god rays
  const sz = dot(sd, fw), su = sz > .01 ? [(f * dot(sd, rt) / sz * h / w + 1) / 2, (f * dot(sd, up) / sz + sh + 1) / 2] : [.5, -2];
  Uv.set([
    ...ro, f, ...rt, sh, ...up, 2 / (h * f), ...fw, top,
    ...sd, 3 * sun, ...sunC, S[0], P[0], P[1], P[2], S[1], P[3], P[4], P[5], S[2],
    P[6], P[7], P[8], .3 + .9 * ss(36, 44, T), bt, 2.6 * ss(HIT * BAR, HIT * BAR + .6, T), S[4], S[5],
    ...rv, fin, P[9], P[10], P[11], S[3], S[6], S[7], ss(-1, .3, eld), S[9],
    ld, ls, S[8], .03, ...su, sz > 0 ? 1 : 0, li, lc, ...ws,
    -2.15, 2.15, (Math.max(4, .32 * cl(bt - 20, 0, 40) + 1.6)) * (1 - ss(HIT * BAR + 1, HIT * BAR + 6, T)), .6 + .9 * Math.sin(T * .17) + T * .04,
    ss(31, 35, T) * (1 - ss(38.6, 40, T)), 0, 0, 0,
  ]);
  return Uv;
}

// building table: one row per grid cell (deterministic), texture 64x32: params at x+16, extra params at x+48
function table() {
  const d = new Float32Array(64 * 32 * 4);
  let z = 20261003;
  const R = () => (z = Math.imul(z ^ z >>> 15, 2246822507) + 3266489909 >>> 0, z / 4294967296);
  for (let y = -9; y <= 9; y++) for (let x = -14; x <= 14; x++) {
    const r = Math.max(Math.abs(x), Math.abs(y)), i = ((y + 16) * 64 + x + 16) * 4, k = R(), a = R(), b = R(), sty = R();
    let hx = 1.75, hz = 1.75, st = 40, sb = 20, pod = 0;
    if (r > 6) { hx = 1.25 + .4 * a; hz = 1.25 + .4 * b; st = k < .1 ? 0 : k > .95 ? 12 + (8 * a | 0) : 4 + (2 * a + 3 * a * b | 0); sb = -999; }
    else if (r) {
      hx = 1 + .5 * a; hz = 1 + .5 * b; st = k < .12 ? 0 : (.5 + .5 * R()) * (36 - 4.5 * r) | 0; sb = (5 + r) * 4 + (R() * 2 | 0);
      if (st > 13 && sty > .4 && hx < 1.3 && hz < 1.3) pod = 3 + (R() * 3 | 0);
    }
    const m = pod ? .3 : 0, ox = r ? (R() * 2 - 1) * Math.max(0, 1.62 - hx - m) : 0, oz = r ? (R() * 2 - 1) * Math.max(0, 1.62 - hz - m) : 0;
    d.set([hx, hz, st, sb], i); d.set([ox, oz, pod, r ? sty : .3], i + 128);
  }
  return d;
}

let D0, PK, PS, PD, PL, PW, PB, PR, PC, A, B, C2, G, K2, w0, h0;
const LOC = (p, n) => p.u[n] || (p.u[n] = D0.gl().getUniformLocation(p, n));

Dream.add({
  id: '64k', dur: 60, fin: 53, cta: 54.5, px: 1.2e6,

  init(gl, D) {
    D0 = D;
    PK = D.prog(null, COMMON + CLOUD);
    PS = D.prog(null, COMMON + SCENE);
    PD = D.prog(D.preVS() + '#define M 0\n' + HV + COMMON + PVS, PFS);
    PL = D.prog(D.preVS() + '#define M 1\n' + HV + COMMON + PVS, LFS);
    PW = D.prog(D.preVS() + '#define M 2\n' + HV + COMMON + PVS, PFS);
    PB = D.prog(null, BLUR);
    PR = D.prog(null, COMMON + RAYS);
    PC = D.prog(null, COMMON + COMP);
    const s = (p, n, v) => { gl.useProgram(p); gl.uniform1i(LOC(p, n), v); };
    s(PC, 'X', 2); s(PC, 'Y', 4); s(PC, 'Z', 5); s(PR, 'X', 2); s(PS, 'Q', 6);
    [PK, PS, PD, PL, PW, PR, PC].map(p => s(p, 'Bt', 7));
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 64, 32, 0, gl.RGBA, gl.FLOAT, table());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.activeTexture(gl.TEXTURE0);
  },

  draw(gl, T, D) {
    const [w, h] = D.size(), w2 = w + 1 >> 1, q = Math.max(1, w >> 2), r = Math.max(1, h >> 2), FB = gl.FRAMEBUFFER,
      tx = (u, t) => { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, t); };
    if (w != w0 || h != h0) {
      w0 = w; h0 = h;
      [A, B, C2, G, K2].map(t => t && (gl.deleteTexture(t.tex), gl.deleteFramebuffer(t.fb)));
      A = D.rt(w2, h, 1); B = D.rt(q, r, 1); C2 = D.rt(q, r, 1); G = D.rt(q, r, 1); K2 = D.rt(q, r, 1);
      tx(2, A.tex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
      tx(3, B.tex); tx(4, C2.tex); tx(5, G.tex); tx(6, K2.tex); tx(0, D.text.tex);
    }
    const U = story(T, w, h), set = p => { D.bind(p); gl.uniform4fv(LOC(p, 'U'), U); };
    gl.disable(gl.BLEND);
    // clouds (quarter resolution)
    gl.bindFramebuffer(FB, K2.fb); gl.viewport(0, 0, q, r); set(PK); D.tri();
    // scene, checkerboard (half the pixels)
    gl.bindFramebuffer(FB, A.fb); gl.viewport(0, 0, w2, h);
    set(PS); D.tri();
    tx(2, A.tex); gl.generateMipmap(gl.TEXTURE_2D); gl.activeTexture(gl.TEXTURE0);
    // bloom (quarter resolution, level 2 of the scene) and god rays
    gl.viewport(0, 0, q, r);
    gl.bindFramebuffer(FB, B.fb); D.bind(PB); gl.uniform1i(LOC(PB, 'X'), 2); gl.uniform3f(LOC(PB, 'M'), h / 540 / q, 0, 2); D.tri();
    gl.bindFramebuffer(FB, C2.fb); gl.uniform1i(LOC(PB, 'X'), 3); gl.uniform3f(LOC(PB, 'M'), 0, h / 540 / r, 0); D.tri();
    // the composite always adds this target: when the rays pass is skipped it has to be cleared, or the last rays frame stays
    gl.bindFramebuffer(FB, G.fb);
    if (U[58] > 0 && U[54] + U[68] > 0) { set(PR); D.tri(); }
    else { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
    // composite
    gl.bindFramebuffer(FB, null); gl.viewport(0, 0, w, h);
    set(PC); D.tri();
    // sparks, dust and lamps on top, additive
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    if (U[47] > 0 && U[49] > 0) { set(PD); gl.drawArrays(gl.POINTS, 0, 3000); }
    if (U[52] < 1.3) { set(PL); gl.drawArrays(gl.LINES, 0, 1200); }
    if (T < 47) { set(PW); gl.drawArrays(gl.POINTS, 0, 956); }
    gl.disable(gl.BLEND);
  },

  music(K) {
    const c = K.c, H = K.hz, O = K.out, t = x => x * BAR, kt = [];
    const F = (f, to, ty = 'lowpass', q = .7) => { const n = c.createBiquadFilter(); n.type = ty; n.frequency.value = f; n.Q.value = q; n.connect(to); return n; };
    // one reverb and one delay for the whole piece; buses: drums, bass, strings, brass, bells, ambience
    const rv = K.rev(3.4, 2.4, .45), dl = K.dly(BT * .75, .3, .2, O, 2600);
    const drum = K.bus(.9), bas = F(240, K.bus(1)), str = K.bus(1), sf = F(3600, str), brs = K.bus(1), bf = F(1100, brs),
      bell = K.bus(1), amb = K.bus(1), sL = K.bus(1, -.4, sf), sR = K.bus(1, .4, sf), pl = K.bus(.8, .25);
    drum.connect(K.bus(.22, 0, rv)); str.connect(K.bus(.6, 0, rv)); brs.connect(K.bus(.5, 0, rv)); bell.connect(rv); bell.connect(dl);
    amb.connect(rv); pl.connect(K.bus(.5, 0, rv)); pl.connect(dl);
    let z = 7;
    const rnd = () => (z = z * 16807 % 2147483647) / 2147483647;
    // swell: re-automates a kit noise burst into a rise from silence
    const sw = (a, d, f1, f2, q, v, to, ty) => { const g = K.n(a, d, f1, f2, q, v, to, ty).gain; g.cancelScheduledValues(a); g.setValueAtTime(v / 400, a); g.exponentialRampToValueAtTime(v, a + d * .92); g.linearRampToValueAtTime(0, a + d); };
    // inharmonic metal clang far away (mostly reverb)
    const clang = (a, f, v, pan) => { const b = K.bus(.5, pan, rv); [1, 1.47, 2.09, 2.56, 3.39].map((m, k) => K.o('sine', a, 2.4 - k * .35, f * m, 0, v / (1 + k * .5), b)); K.n(a, .08, f * 3, 0, 4, v, b); };
    // taiko: pitched body, skin, slap
    const taiko = (a, v) => { K.o('sine', a, .8, 105, 48, v * .45, drum, .2); K.o('triangle', a, .25, 220, 110, v * .2, drum, .06); K.n(a, .16, 420, 0, .8, v * .6, drum); kt.push(a); };
    const tom = (a, v) => { K.o('sine', a, .3, 190, 120, v * .4, drum, .1); K.n(a, .07, 1000, 0, 1.2, v * .35, drum); };
    const chord = (ns, a, d, v, at = .6, rl = 1.2) => ns.map((n, k) => K.p('sawtooth', a, d, H(n), v * (k ? 1 : .8), at, rl, k % 2 ? sR : sL, 0, k ? 0 : 6));
    const brass = (ns, a, d, v) => ns.map((n, k) => K.p('sawtooth', a, d, H(n) * (1 + k * .002), v, d * .5, .5, bf));
    // bell: inharmonic partials of a struck bar
    const bellN = (a, n, v) => [[1, 1, 4], [2.76, .3, 1.8], [5.4, .1, .8], [.5, .18, 4.5]].map(([m, g, d]) => K.o('sine', a, d, H(n) * m, 0, v * g, bell));
    const pluck = (a, n, v) => K.o('triangle', a, .9, H(n), 0, v, pl);

    // EMERGENCE, bars 0-5: rumble from silence, low drone, distant clangs (the grid blinks with them), ticks
    sw(.2, t(5), 50, 360, .7, .22, amb, 'lowpass');
    sw(t(2.5), t(2.5), 500, 3000, 1.6, .02, amb);
    K.p('sine', t(1.5), t(9) - t(1.5), H(38), .045, t(3), t(1.5), bas);
    K.p('triangle', t(2.5), t(8) - t(2.5), H(45), .02, t(2.5), t(1.5), bas);
    K.p('sine', t(3), t(2), H(86), .006, t(1.5), t(1), amb);
    CLANG.map((b, k) => clang(t(b), 260 + 420 * rnd(), .05 + .03 * k / 10, rnd() * 1.4 - .7));
    for (let b = 1.5; b < 5; b += .125) if (rnd() < .2) K.n(t(b), .012, 4200, 0, 3, .012 + b * .003, amb);

    // drums (shared DRUMS list), toms in the rise, shaker, snare roll into the hit
    DRUMS.map(([b, v]) => taiko(t(b), b < HIT ? v : v * .75));
    for (let b = 10; b < 14; b += .125) if ((b * 8 | 0) % 4 == 3) tom(t(b), .5);
    for (let b = 11; b < 15; b += .25) K.n(t(b) + BT * .5, .04, 7000, 0, 1, .025 + .02 * (b % 1 > .4), drum, 'highpass');
    for (let b = 14; b < 15; b += 1 / 16) K.n(t(b), .07, 1500, 0, 1, .04 + .3 * (b - 14) ** 2, drum);

    // harmony bars 5-14: Dm Bb F C | Dm Bb F C | Bb C, strings, bass, string ostinato from bar 7, brass from bar 10
    const CH = [[50, 53, 57, 62], [46, 50, 53, 58], [45, 48, 53, 57], [43, 48, 52, 55]], RT = [38, 34, 41, 36];
    for (let b = 5; b < 15; b++) {
      const k = b < 13 ? (b - 5) % 4 : b - 12, ns = CH[k], r = RT[k], up = b >= 10;
      chord(up ? [ns[0], ns[1] + 12, ns[2] + 12, ns[3] + 12] : ns, t(b), BAR - .15, up ? .075 : .07, b == 5 ? 1.5 : .5, 1);
      K.p('triangle', t(b), BAR - .1, H(r), up ? .13 : .1, .04, .4, bas);
      if (b >= 7) for (let m = 0; m < 8; m++) K.p('sawtooth', t(b) + m * BT / 2, BT * .28, H(r + [24, 31, 36, 31][m % 4] + (up ? 12 : 0)), (m % 2 ? .035 : .05) * (up ? 1.2 : 1), .006, .07, m % 2 ? sR : sL);
      if (up) brass([r + 12, r + 19, r + 24], t(b), BAR, .065);
    }
    // the bell motif in minor hints at the words (A D F)
    [[11, 69], [11.5, 74], [12, 77], [13, 69], [13.5, 74], [14, 77]].map(([b, n]) => bellN(t(b), n, .1));
    // riser into the hit
    sw(t(13), t(2), 300, 6000, 1.2, .1, amb);
    K.o('sawtooth', t(13), t(2), H(50), H(74), .02, sf, t(2));

    // SUNRISE HIT, bar 15: boom, cymbal, D major tutti
    const X = t(HIT);
    K.o('sine', X, 3.5, 85, 40, .9, drum, .6); K.n(X, 5, 6500, 0, .6, .14, amb, 'highpass'); K.n(X, 1.4, 400, 0, .8, .35, drum);
    // bars 15-19: D, Bm, Bb, C, then D major with the last word
    const WP = [[HIT, [50, 54, 57, 62, 66], 38], [16, [47, 50, 54, 59, 62], 35], [17, [46, 50, 53, 58, 62], 34], [18, [48, 52, 55, 60, 64], 36]];
    WP.map(([b, ns, r]) => {
      chord(ns, t(b), BAR - .1, .06, b == HIT ? .05 : .4, 1.2);
      K.p('triangle', t(b), BAR, H(r), .12, .05, .6, bas);
      brass([ns[0], ns[2]], t(b), BAR, .05);
      for (let m = 0; m < 8; m++) pluck(t(b) + m * BT / 2, ns[[0, 2, 4, 2, 1, 3, 4, 3][m]] + 12, .09);
    });
    // words: one rising bell per word (A5, D6, F#6), the last with the final chord
    WORDS.map((b, k) => { bellN(t(b), [81, 86, 90][k], .3 + .06 * k); bellN(t(b), [69, 74, 78][k], .14); });
    const E = t(19);
    chord([50, 54, 57, 62, 66, 69], E, 3.2, .065, .06, 4.5); brass([38, 45, 50], E, 3, .07);
    K.p('triangle', E, 3, H(38), .18, .05, 4, bas); K.p('sine', E, 3, H(26), .1, .05, 4, bas);
    K.o('sine', E, 3, 80, 40, .6, drum, .4); K.n(E, 4, 6000, 0, .6, .1, amb, 'highpass');
    for (let m = 0; m < 12; m++) pluck(E + m * BT / 2, [62, 66, 69, 74, 78, 81][m % 6], .08 * (1 - m / 13));
    bellN(t(21), 86, .12);
    K.duck(str.gain, kt, .6, .2); K.duck(brs.gain, kt, .75, .2);
    O.gain.setValueAtTime(1, t(20.5)); O.gain.linearRampToValueAtTime(0, 59.2);
  },
});
