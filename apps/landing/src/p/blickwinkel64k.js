// Blickwinkel: production blickwinkel64k for the dreambau.com landing page.
//
// Theme: impossible is a matter of perspective. You look through the eye of a machine. First a glass prism hangs in
// front of the lens: in the dark a few lamps appear twice, shifted and split into colour, and the focus searches. The
// prism slides away and the lights move to where they really are. Three beams of exposed concrete are cast in timber
// formwork and stripped on the beat; the camera circles them and they clearly do not meet. Then the camera reaches the
// one line from which they line up and pulls back while it zooms in (a dolly zoom) until the perspective is flat: on the
// click the beams close into an impossible triangle. The shadow on the floor keeps showing three separate beams.
//
// Picture: one raymarched scene pass into a float target (distance field of the beams, the formwork and the props, an
// analytic floor, soft shadows, exact box normals, a contact term on the floor; depth in alpha), then one composite
// pass: the prism as a screen-space deflection with dispersion (the dim scene in three reads, the lamps as seven
// discs, one per wavelength), the lamps as bokeh discs, focus through the mip chain, a soft glow, filmic tone mapping,
// vignette, grain and the tagline. JS computes camera, light and story once per frame (uniform block U); the shaders
// do not keep any state.
//
// The impossible triangle is three real boxes along three edges of a unit cube, seen along its diagonal. The end of
// the cantilever that is seen in front of the far end of the floor beam is cut away by a prism along that diagonal, so
// from the line the two ends join (and the cut is edge-on); the beams have no ambient occlusion, because the hidden
// corner would lack the darkening of the real ones, and the concrete texture uses coordinates that are the same for
// both ends of the hidden corner.
//
// Music: glass and wood, 108 BPM, G Lydian. Marimba and glass play the same figure; the glass is a sixteenth late, like
// a refracted image, and the gap closes during the dolly zoom until both fall into unison on the click.
//
// One tempo for picture and music: BPM 108, beat 0.556 s, bar 2.222 s. Sync points (bar → seconds):
//   0-6    0.0-13.3   prism and lamps: the lamps appear doubled and dispersed, the focus searches; glass notes with refracted echoes
//   6      13.3       kick, bass and marimba enter; the key light comes on; the prism starts to slide out; formwork of beam 1
//   8      17.8       beam 1 stripped; the formwork of the column rises
//   10     22.2       column stripped; props and formwork of the cantilever
//   12     26.7       cantilever stripped; bar 13 (28.9 s): the props are pulled, one per beat, and the cantilever holds
//   14-16  31.1-35.6  the camera settles onto the line; the glass voice starts to catch up with the marimba
//   16-18  35.6-40.0  dolly zoom, riser; one eighth of silence before the click
//   18     40.0       click: the triangle closes, unison, G major, "Jeht nich…" on a glass bell (D6)
//   20, 22 44.4, 48.9 "jibs nich…" and "dreambau.com" on glass bells (G5, B5), the last with the final chord
//   after the click the light wanders, the pool of light opens and the camera pushes in slowly (6 % until 64 s)
//   every kick lifts the exposure a little (E.x); the grain falls from strong to almost nothing
const BPM = 108, BT = 60 / BPM, BAR = 4 * BT;
const STRIP = [8, 10, 12], PULL = [13, 13.25, 13.5], CLICK = 18, WORDS = [18, 20, 22];
const NU = 24;

// lamps on the floor of the hall (world positions; the same numbers are in the scene shader)
const LAMPS = [[1.53, .18, 3.2], [4.15, .3, 1.82], [3.96, .12, 4.09], [1.82, .45, 5.23], [6.92, .22, 2.62], [2.43, .08, 1.05]];

// ------------------------------------------------------------------------------------------------------------------
// Shaders
// ------------------------------------------------------------------------------------------------------------------
const COMMON = /*glsl*/`
uniform vec4 U[24];
// U[0] camera position, focal length | U[1] right, lens shift x | U[2] up, lens shift y | U[3] forward, exposure
// U[4] key light direction, key intensity | U[5] floor pool centre xz, radius along the shadow, radius towards the camera
// U[6] fill direction, fill | U[7..9] beam k: formwork growth, seconds since stripping, concrete there, sag
// U[10] props: growth, pulled 0..2 | U[11] prism: edge point, angle, amount | U[12] prism: deviation, dispersion,
// scene blur, grain | U[13] lamps, vignette, lens fringes, click glow | U[14] words 1..3, fade-in from black
// U[15..20] lamp discs: xy, radius, intensity | U[21] warmth of the key light
const vec3 C1=vec3(.5,.1,.1),H1=vec3(.5,.1,.1),C2=vec3(.9,.5,.1),H2=vec3(.1,.5,.1),C3=vec3(.9,.9,.5),H3=vec3(.1,.1,.5);
`;

const SCENE = /*glsl*/`
#define TF .028
const vec3 E1=vec3(.70711,0,-.70711),E2=vec3(-.40825,.8165,-.40825);
const vec3 LP[6]=vec3[](vec3(1.53,.18,3.2),vec3(4.15,.3,1.82),vec3(3.96,.12,4.09),vec3(1.82,.45,5.23),vec3(6.92,.22,2.62),vec3(2.43,.08,1.05));

float box(vec3 p,vec3 h){vec3 q=abs(p)-h;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);}
// the part of the cantilever that is seen in front of the far end of the floor beam, as a prism along the diagonal
float cut(vec3 p){
  vec2 q=vec2(dot(p,E1),dot(p,E2));
  return max(max(dot(q,vec2(-.5,.866)),q.x-.14142),max(dot(q,vec2(.5,-.866))-.14142,-q.x))-.0015;
}
// formwork shell of a beam: centre c, half size h, growth axis a, opening axis o, growth g, seconds since stripping s
float form(vec3 p,vec3 c,vec3 h,vec3 a,vec3 o,float g,float s){
  if(g<=0.||s>2.)return 9.;
  vec3 q=p-c;
  float L=dot(h,abs(a)),cl=dot(q,a)-(-L-TF+(2.*L+2.*TF)*g);
  if(s<0.){
    float sh=max(box(q,h+TF),-box(q,h+.002));
    return max(sh,cl);
  }
  float m=.34*smoothstep(0.,.55,s),fy=1.7*s*s,d=9.;
  for(int k=0;k<2;k+=1){
    float sg=float(k)*2.-1.;
    vec3 r=q-sg*m*o+vec3(0,fy,0);
    float sh=max(max(box(r,h+TF),-box(r,h+.002)),-sg*dot(r,o));
    d=min(d,sh);
  }
  return max(d,-p.y);
}
vec2 map(vec3 p){
  vec2 r=vec2(max(p.y+.02,0.)+9.,0);
  float d;
  if(U[7].z>0.){d=box(p-C1,H1);if(d<r.x)r=vec2(d,1);}
  if(U[8].z>0.){d=box(p-C2,H2);if(d<r.x)r=vec2(d,2);}
  if(U[9].z>0.){d=max(box(p-C3-vec3(0,U[9].w,0),H3),-cut(p));if(d<r.x)r=vec2(d,3);}
  d=form(p,C1,H1,vec3(-1,0,0),vec3(0,0,1),U[7].x,U[7].y);if(d<r.x)r=vec2(d,4);
  d=form(p,C2,H2,vec3(0,1,0),vec3(1,0,0),U[8].x,U[8].y);if(d<r.x)r=vec2(d,5);
  d=form(p,C3,H3,vec3(0,0,1),vec3(1,0,0),U[9].x,U[9].y);if(d<r.x)r=vec2(d,6);
  if(U[10].x>0.){
    // props under the cantilever: rise from the floor, are pulled one by one
    for(int i=0;i<3;i+=1){
      float z=.28+.33*float(i),hgt=(.8-TF)*U[10].x*(1.-U[10][1+i]);
      if(hgt<=0.)continue;
      d=box(p-vec3(.9,hgt*.5,z),vec3(.018,hgt*.5,.018));
      d=min(d,box(p-vec3(.9,hgt-.006,z),vec3(.06,.006,.05)));
      if(d<r.x)r=vec2(d,7);
    }
  }
  return r;
}
vec3 bn(vec3 x,vec3 c,vec3 h){vec3 q=(x-c)/h,a=abs(q);return a.x>a.y&&a.x>a.z?vec3(sign(q.x),0,0):a.y>a.z?vec3(0,sign(q.y),0):vec3(0,0,sign(q.z));}
vec3 cutn(vec3 p){
  vec2 q=vec2(dot(p,E1),dot(p,E2));
  vec4 v=vec4(dot(q,vec2(-.5,.866)),q.x-.14142,dot(q,vec2(.5,-.866))-.14142,-q.x);
  vec2 n=v.x>=max(v.y,max(v.z,v.w))?vec2(-.5,.866):v.y>=max(v.z,v.w)?vec2(1,0):v.z>=v.w?vec2(.5,-.866):vec2(-1,0);
  return -(n.x*E1+n.y*E2);
}
// formwork: the outer box of the shell (or of the half it was split into)
vec3 fn(vec3 p,vec3 c,vec3 h,vec3 o,float s){
  vec3 q=p-c;
  if(s>=0.){float sg=dot(q,o)<0.?-1.:1.;q+=-sg*.34*smoothstep(0.,.55,s)*o+vec3(0,1.7*s*s,0);}
  return bn(q,vec3(0),h+TF);
}
// props: the nearest post
vec3 pn(vec3 x){float z=.28+.33*clamp(floor((x.z-.28)/.33+.5),0.,2.);vec2 d=vec2(x.x-.9,x.z-z);return abs(d.x)>abs(d.y)?vec3(sign(d.x),0,0):vec3(0,0,sign(d.y));}
vec2 bbox(vec3 o,vec3 d,vec3 lo,vec3 hi){vec3 m=1./d,a=(lo-o)*m,b=(hi-o)*m;vec3 n=min(a,b),f=max(a,b);return vec2(max(max(n.x,n.y),n.z),min(min(f.x,f.y),f.z));}
const vec3 BL=vec3(-.45,0,-.45),BH=vec3(1.45,1.25,1.45);
float shadow(vec3 o,vec3 d){
  vec2 b=bbox(o,d,BL,BH);
  if(b.x>b.y||b.y<0.)return 1.;
  float r=1.,t=max(b.x,.004);
  for(int i=0;i<32;i+=1){
    float h=map(o+d*t).x;
    r=min(r,9.*h/t);
    t+=clamp(h,.006,.12);
    if(r<.002||t>b.y)break;
  }
  return clamp(r,0.,1.);
}
void main(){
  vec2 p=(2.*gl_FragCoord.xy-R)/R.y;
  vec3 ro=U[0].xyz,rd=normalize((p.x-U[1].w)*U[1].xyz+(p.y-U[2].w)*U[2].xyz+U[0].w*U[3].xyz);
  float t=1e4,m=-1.,fp=.7/(U[0].w*R.y);
  vec2 b=bbox(ro,rd,BL,BH);
  vec3 c3=C3+vec3(0,U[9].w,0);
  if(b.x<b.y&&b.y>0.){
    float s=max(b.x,0.);
    vec2 h=vec2(1);
    for(int i=0;i<90;i+=1){
      vec3 x=ro+rd*s;
      h=map(x);
      if(h.x<s*fp){
        // seen from the line, the cut is edge-on: within a pixel or two of it, look through the cantilever to the floor
        // beam behind it, which looks exactly the same there (this also hides the edges that end at the cut)
        if(h.y>2.5&&h.y<3.5&&cut(x)<3.*s*fp&&abs(dot(rd,cutn(x)))<.02)s=max(s,bbox(ro,rd,c3-H3,c3+H3).y)+.001;
        else{t=s;m=h.y;break;}
      }
      // inside the cut-away end of the cantilever there is nothing: jump to where the ray leaves the beam
      else if(U[9].z>0.&&box(x-c3,H3)<0.&&cut(x)<0.)s=max(s,bbox(ro,rd,c3-H3,c3+H3).y)+.001;else s+=h.x;
      if(s>b.y)break;
    }
    // a ray that grazes an edge creeps along it until the steps run out: count it as a hit
    if(m<0.&&s<b.y&&h.x<.004){t=s;m=h.y;}
  }
  float tf=rd.y<0.?-ro.y/rd.y:1e4;
  if(tf<t){t=tf;m=0.;}
  vec3 col=vec3(0);
  if(m>=0.){
    vec3 x=ro+rd*t,L=U[4].xyz,n=m<.5?vec3(0,1,0):m<1.5?bn(x,C1,H1):m<2.5?bn(x,C2,H2):m<3.5?(-cut(x)>box(x-c3,H3)-.0002&&abs(dot(rd,cutn(x)))>.05?cutn(x):bn(x,c3,H3))
      :m<4.5?fn(x,C1,H1,vec3(0,0,1),U[7].y):m<5.5?fn(x,C2,H2,vec3(1,0,0),U[8].y):m<6.5?fn(x,C3,H3,vec3(1,0,0),U[9].y):pn(x);
    float kd=max(dot(n,L),0.),sh=kd>0.&&U[4].w>0.?shadow(x+n*.002,L):0.,ao=1.;
    // no ambient occlusion on the beams (see the top of the file), one cheap contact term on the floor
    if(m<.5&&U[7].x>0.)ao=clamp(.45+5.*map(x+vec3(0,.06,0)).x,0.,1.);
    vec3 alb;
    if(m<.5){
      // floor: dark concrete, mottled; lit by a soft pool around the beams
      float v=vn(x.xz*1.7)*.35+vn(x.xz*4.3)*.25+vn(x.xz*11.)*.25+vn(x.xz*27.)*.15;
      alb=vec3(.11,.108,.104)*(.75+.5*v);
      vec2 e=x.xz-U[5].xy;
      kd*=smoothstep(1.,.3,length(vec2(dot(e,vec2(.7071,-.7071))/U[5].z,dot(e,vec2(.7071))/U[5].w)));
    }else if(m<3.5){
      // exposed concrete: pores and a faint imprint of the boards, the same on both ends of the hidden corner
      vec2 q=vec2(dot(x,E1),dot(x,E2));
      float st=abs(n.y)>.5?x.z:x.y,g=fbm(q*14.)*.7+vn(q*61.)*.3;
      alb=vec3(.58,.57,.55)*(.9+.14*g)*(1.-.05*smoothstep(.4,.5,abs(fract(st*15.)-.5)));
    }else if(m<6.5){
      // timber formwork: boards along the beam
      float st=dot(x,vec3(13.7,17.1,15.3)),g=vn(vec2(st*.9,dot(x,vec3(41.,3.,29.))));
      alb=vec3(.46,.31,.17)*(.8+.3*g)*(1.-.45*smoothstep(.44,.5,abs(fract(dot(x,vec3(0,1,1))*18.)-.5)));
    }else alb=vec3(.52,.2,.08);
    vec3 kc=mix(vec3(1.,.9,.78),vec3(1.,.84,.66),U[21].x)*(1.+.12*U[13].w);
    col=alb*(kc*U[4].w*kd*sh+vec3(.5,.62,.8)*U[6].w*max(dot(n,U[6].xyz),0.)*ao+vec3(.1,.12,.16)*.05*ao);
    // the lamps light the floor around them
    if(U[13].x>0.)for(int i=0;i<6;i+=1){vec3 l=LP[i]-x;float q=dot(l,l);col+=alb*vec3(1.,.66,.36)*U[13].x*.5*max(dot(n,l),0.)*inversesqrt(q)/(1.+q*2.);}
    if(m>.5)col+=vec3(.55,.6,.65)*.04*U[4].w*sh*pow(max(dot(reflect(rd,n),L),0.),24.);
  }
  O=vec4(col,t);
}`;

const COMP = /*glsl*/`
uniform sampler2D X;
vec2 uvo(vec2 p){return p*R.y/R*.5+.5;}
vec3 scn(vec2 p,float l){return textureLod(X,uvo(p),l).rgb;}
vec3 spec(float l){return clamp(vec3(1.5-3.*l,1.5-abs(3.*l-1.5),3.*l-1.5),0.,1.);}
void main(){
  vec2 fc=gl_FragCoord.xy,p=(2.*fc-R)/R.y,uv=fc/R;
  float pw=1.6/R.y,lod=U[12].z,ca=U[13].z*dot(p,p);
  // the picture as the lens sees it (lateral colour fringes grow towards the edges; where they are below half a pixel, one read)
  vec3 col=scn(p,lod);
  if(ca*length(p)*R.y>1.)col=vec3(scn(p*(1.+ca),lod).r,col.g,scn(p*(1.-ca),lod).b);
  // the prism: a half plane beyond its edge sees the scene deflected and split by wavelength
  // (the dim scene with three reads, the bright lamps below as seven discs)
  float pa=U[11].w,an=U[11].z;
  vec2 N=vec2(cos(an),sin(an));
  float sd=dot(p-U[11].xy,N),inP=pa>0.?smoothstep(-pw,pw,sd):0.;
  const vec3 ws=vec3(2.286,4.714,2.286);
  if(inP>0.){
    vec3 c=vec3(scn(p+N*(U[12].x-U[12].y*.3),lod).r,scn(p+N*U[12].x,lod).g,scn(p+N*(U[12].x+U[12].y*.3),lod).b);
    col=mix(col,c*.86,inP);
  }
  // lamps as bokeh discs: the direct image outside the prism, the deflected one inside it
  for(int i=0;i<6;i+=1){
    vec4 L=U[15+i];
    if(L.w<=0.)continue;
    float r=max(L.z,1.2/R.y),I=L.w*.0022/(r*r+.00003),e=length(p-L.xy);
    vec3 lc=vec3(1.,.78,.55);
    col+=lc*I*(1.-inP)*smoothstep(r,r-pw,e)*(.85+.15*smoothstep(r*.5,r,e));
    col+=lc*L.w*.004*exp(-e*e/(r*r*9.+.002))*(1.-inP);
    if(inP>0.)for(int k=0;k<7;k+=1){
      float l=(float(k)+.5)/7.;
      vec2 q=L.xy-N*(U[12].x+U[12].y*(l-.5));
      float f=length(p-q);
      col+=spec(l)/ws*7.*inP*.86*(I*smoothstep(r,r-pw,f)+L.w*.004*exp(-f*f/(r*r*9.+.002)));
    }
  }
  // the glass edge catches a little light
  col+=vec3(.55,.6,.7)*pa*U[14].w*(.03+U[13].x*.05)*exp(-sd*sd/(pw*pw*3.));
  // soft glow
  col+=textureLod(X,uv,4.).rgb*.07+textureLod(X,uv,6.).rgb*.05;
  col*=U[3].w*(1.+.07*E.x);
  col=col*(2.51*col+.03)/(col*(2.43*col+.59)+.14);
  col=pow(clamp(col,0.,1.),vec3(1./2.2));
  vec2 v=uv*2.-1.;
  col*=1.-U[13].y*dot(v*vec2(.85,1.),v*vec2(.85,1.));
  // tagline: each line arrives split into colour and aligns, like the prism image did
  vec3 a=U[14].xyz;
  if(a.x>0.){
    vec3 d=tdist(p),o=vec3(1.-a)*.03,hr=a*(1.-smoothstep(vec3(0),vec3(TSP*TT.z/(TSW*.5)),d));
    float hal=max(hr.x,max(hr.y,hr.z));
    col*=1.-.6*hal;
    vec3 dr=tdist(p+vec2(o.x,0)),db=tdist(p-vec2(o.x,0)),er=tdist(p+vec2(o.y,0)),eb=tdist(p-vec2(o.y,0)),gr=tdist(p+vec2(o.z,0)),gb=tdist(p-vec2(o.z,0));
    vec3 tr=vec3(smoothstep(pw,-pw,dr.x),smoothstep(pw,-pw,er.y),smoothstep(pw,-pw,gr.z))*a;
    vec3 tg=vec3(smoothstep(pw,-pw,d.x),smoothstep(pw,-pw,d.y),smoothstep(pw,-pw,d.z))*a;
    vec3 tb=vec3(smoothstep(pw,-pw,db.x),smoothstep(pw,-pw,eb.y),smoothstep(pw,-pw,gb.z))*a;
    vec3 cv=vec3(max(tr.x,max(tr.y,tr.z)),max(tg.x,max(tg.y,tg.z)),max(tb.x,max(tb.y,tb.z)));
    col=mix(col,vec3(1.,.94,.84),cv);
    col+=vec3(1.,.9,.75)*.06*hal*hal*(1.-max(cv.x,max(cv.y,cv.z)));
  }
  col+=(h2(fc+fract(T*7.31)*vec2(311.7,173.3))-.5)*U[12].w+(h2(fc*1.37)-.5)/255.;
  O=vec4(col,1);
}`;

// ------------------------------------------------------------------------------------------------------------------
// Story: everything the picture needs at time T, as one uniform block
// ------------------------------------------------------------------------------------------------------------------
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = (a, b, x) => { x = cl((x - a) / (b - a)); return x * x * (3 - 2 * x); };
const mix = (a, b, k) => a + (b - a) * k;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nz = a => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
const TH = Math.PI / 4, PH = Math.asin(1 / Math.sqrt(3)), Q = [.5, .5, .5];
const U = new Float32Array(4 * NU);
const put = (i, a, b, c, d) => { U.set([a, b, c, d], 4 * i); };

// segment from the camera to a lamp against the beams that stand (and their formwork): is the lamp hidden?
function hidden(o, P, boxes) {
  const d = sub(P, o);
  for (const [c, h] of boxes) {
    let t0 = 0, t1 = 1;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(d[k]) < 1e-9) { if (Math.abs(o[k] - c[k]) > h[k]) { t0 = 2; break; } continue; }
      let a = (c[k] - h[k] - o[k]) / d[k], b = (c[k] + h[k] - o[k]) / d[k];
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    }
    if (t0 < t1) return true;
  }
  return false;
}

function story(T, w, h) {
  const b = T / BAR, asp = w / h;
  // camera: an orbit around the centre of the beams that ends on the diagonal, then a dolly zoom along it
  const o = sm(0, 16, b), z = cl((b - 16) / 2), lock = (1 - z * z) * sm(14, 16, b);
  const th = TH + 3.1 * (1 - o) + .06 * lock, ph = mix(.1, PH, Math.pow(o, 1.25)) + .035 * lock;
  const d = mix(3.6, 3.4, o) * Math.pow(600 / 3.4, z * z * z);
  // final framing: the triangle sits in the band above the tagline block, as large as the band allows
  const tx = D0.text, tw = Math.min(asp * .88, .92), th2 = tw * tx.H / tx.W, l0 = tx.lines && tx.lines[0];
  const top = (l0 ? th2 - 2 * th2 * (l0.y + .155 * l0.h) / tx.H : th2 * .8) + .05, hTri = .9 * (.97 - top);
  // after the click: a slow push-in (6 % until the end), the light wanders and the pool slowly opens, so that the
  // room becomes visible and the shadow keeps showing three separate beams from a changing angle
  const after = 1 - (1 - cl((T - 40) / 24)) ** 2;
  const k1 = hTri / .98 * (.94 + .06 * after), k = mix(2.2 / 3.4, k1, sm(15, 18, b)), f = b < 16 ? 2.2 : k * d;
  const fin = sm(14.5, 17.5, b), drift = T > 40 ? T - 40 : 0, cx = -Math.min(.22, .35 * (asp - .6));
  const sx = fin * (cx - .283 * k1) + .004 * Math.sin(drift * .13), sy = fin * (.97 + top) / 2 + .003 * Math.sin(drift * .09);
  const pos = [Q[0] + d * Math.cos(ph) * Math.cos(th), Q[1] + d * Math.sin(ph), Q[2] + d * Math.cos(ph) * Math.sin(th)];
  const look = [Q[0] + .12 * Math.sin(T * .23) * (1 - o), Q[1] - .1 * (1 - o), Q[2] + .1 * Math.cos(T * .19) * (1 - o)];
  const fw = nz(sub(look, pos)), rt = nz(crs(fw, [0, 1, 0])), up = crs(rt, fw);
  // exposure: the key light comes on at bar 6
  const key = sm(6, 6.4, b), clickT = T - CLICK * BAR, glow = clickT > 0 ? Math.exp(-clickT * 2.5) : 0;
  put(0, ...pos, f); put(1, ...rt, sx); put(2, ...up, sy); put(3, ...fw, 1.15);
  const la = .7 + .7 * after + (T > 64 ? .03 * Math.sin((T - 64) * .07) : 0);
  const L = nz([-Math.cos(la) * .77, .643, Math.sin(la) * .77]);
  put(4, ...L, 2.6 * key * (1 + .12 * after)); put(5, .9 - .35 * after, -.3 - .35 * after, 1.65 * (1 + .45 * after), .95 * (1 + .12 * after)); put(6, ...nz([.8, .35, -.5]), .5 * key);
  // formwork: growth, seconds since stripping, concrete there, sag of the cantilever when the last prop goes
  const gr = [[6.25, 7.5], [8.25, 9.75], [10.5, 11.75]];
  const lastPull = T - PULL[2] * BAR - .3, sag = lastPull > 0 ? -.004 * Math.exp(-lastPull * 3) * Math.cos(lastPull * 14) : 0;
  for (let i = 0; i < 3; i++) put(7 + i, sm(gr[i][0], gr[i][1], b), b < STRIP[i] ? -1 : T - STRIP[i] * BAR, b > gr[i][1] ? 1 : 0, i == 2 ? sag : 0);
  put(10, sm(10.25, 10.75, b), ...PULL.map(q => sm(q, q + .2, b)));
  // prism: rotates slowly in front of the lens, slides out between bar 6 and 10
  const an = .55 + .25 * Math.sin(T * .17), out = 2.8 * sm(6, 10, b);
  const ex = -.2 + .15 * Math.sin(T * .3) + Math.cos(an) * out, ey = .08 * Math.cos(T * .21) + Math.sin(an) * out;
  const pa = b < 10.5 ? 1 : 0;
  // focus searches in the emergence, then settles; a tiny focus snap on the click
  const hunt = 1 - sm(3, 6, b), ap = mix(.012, .085, hunt), zf = 4.6 + 2.8 * Math.sin(T * 1.1 + .6 * Math.sin(T * .7)) * hunt;
  const blur = 2.6 * hunt * (.6 + .4 * Math.sin(T * 1.1)) + (clickT > 0 ? .9 * Math.exp(-clickT * 9) : 0);
  const grain = .075 * sm(0, 2.5, T) * (1 - .86 * sm(4, 18, b));
  put(11, ex, ey, an, pa); put(12, .3, .13, blur, grain);
  const lamp = sm(.5, 3, b) * (1 - .6 * sm(6, 8, b)) * (1 - sm(11, 14, b));
  put(13, lamp, .32, .0035, glow);
  put(14, ...WORDS.map(q => sm(q * BAR, q * BAR + .7, T)), sm(.3, 3, T));
  put(21, .7 * sm(40, 60, T), 0, 0, 0);
  // lamp discs
  const boxes = [];
  if (b > 7.5) boxes.push([[.5, .1, .1], [.53, .13, .13]]);
  if (b > 8.6) boxes.push([[.9, .5, .1], [.13, .53, .13]]);
  if (b > 11) boxes.push([[.9, .9, .5], [.13, .13, .53]]);
  LAMPS.forEach((P, i) => {
    const v = sub(P, pos), zz = dot(v, fw);
    if (zz < .1 || lamp <= 0 || hidden(pos, P, boxes)) { put(15 + i, 0, 0, 0, 0); return; }
    const x = dot(v, rt) / zz * f + sx, y = dot(v, up) / zz * f + sy;
    put(15 + i, x, y, ap * Math.abs(1 - zf / zz) + .002, lamp * (.6 + .4 * ((i * 7) % 5) / 4) * 2.2 / zz);
  });
  return U;
}

let PS, PC, A = null, w0 = 0, h0 = 0;
const LOC = (p, n) => (n in p.u ? p.u[n] : (p.u[n] = D0.gl().getUniformLocation(p, n)));
let D0;

Dream.add({
  id: 'blickwinkel64k',
  dur: 60, fin: 53, cta: 54.5,
  px: 1.2e6,

  init(gl, D) {
    D0 = D;
    PS = D.prog(null, COMMON + SCENE);
    PC = D.prog(null, COMMON + COMP);
    gl.useProgram(PC); gl.uniform1i(LOC(PC, 'X'), 2);
  },

  draw(gl, T, D) {
    const [w, h] = D.size();
    if (w != w0 || h != h0) {
      w0 = w; h0 = h;
      if (A) { gl.deleteTexture(A.tex); gl.deleteFramebuffer(A.fb); }
      A = D.rt(w, h, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, A.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, D.text.tex);
    }
    const u = story(T, w, h);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, A.fb); gl.viewport(0, 0, w, h);
    D.bind(PS); gl.uniform4fv(LOC(PS, 'U'), u); D.tri();
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, A.tex); gl.generateMipmap(gl.TEXTURE_2D);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, D.text.tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
    D.bind(PC); gl.uniform4fv(LOC(PC, 'U'), u); D.tri();
  },

  music(K) {
    const c = K.c, hz = K.hz, at = (bar, beat = 0) => bar * BAR + beat * BT;
    const rv = K.rev(3.4, 2.6, .42), dl = K.dly(BT * .75, .38, .2, K.out, 3200);
    const lp = (f, v = 1, pan = 0) => { const g = K.bus(v, pan), n = c.createBiquadFilter(); n.type = 'lowpass'; n.frequency.value = f; n.connect(g); n.g = g; return n; };
    // a noise swell that rises to v over d seconds (filter f1 → f2), cut at the end
    const swell = (t, d, f1, f2, v, to, type = 'bandpass') => {
      if (!K.mine()) return;
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = K.noise; s.loop = true; f.type = type; f.Q.value = .9;
      f.frequency.setValueAtTime(f1, t); f.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + d * .94); g.gain.linearRampToValueAtTime(0, t + d);
      s.connect(f).connect(g).connect(to); s.start(t); s.stop(t + d + .02);
    };
    const mar = K.bus(.62, -.28), gla = K.bus(.42, .3), bel = K.bus(.6, .1), bas = lp(820, .9), drm = K.bus(.85), wood = K.bus(.4, .18), hat = K.bus(.16, -.12), pad = lp(1500, .5), air = K.bus(.5);
    mar.connect(K.bus(.3, 0, rv)); gla.connect(K.bus(.65, 0, rv)); gla.connect(K.bus(.4, 0, dl)); bel.connect(rv); bel.connect(K.bus(.5, 0, dl));
    pad.connect(rv); wood.connect(K.bus(.25, 0, rv)); air.connect(rv); drm.connect(K.bus(.12, 0, rv));
    // the figure (G Lydian), eighths, two bars long
    const CELL = [67, 74, 71, 74, 73, 74, 71, 69, 67, 74, 71, 76, 74, 73, 71, 66];
    const marimba = (t, n, v) => { const f = hz(n); K.o('sine', t, .55, f, f, v, mar); K.o('sine', t, .09, f * 3.93, f * 3.93, v * .2, mar); };
    const glass = (t, n, v, to = gla) => { const f = hz(n); K.o('sine', t, 1.7, f, f, v, to); K.o('sine', t, .55, f * 2.76, f * 2.76, v * .22, to); };
    // emergence: single glass notes, each with a refracted echo (late, a little sharp, on the other side)
    const echo = K.bus(.5, -.55);
    echo.connect(K.bus(.7, 0, rv));
    [[1.5, 74], [2.25, 71], [2.75, 79], [3.25, 73], [3.75, 76], [4.25, 74], [4.6, 67], [5, 78], [5.4, 73], [5.75, 71]].forEach(([q, n], i) => {
      const t = at(q), v = .03 + .05 * i / 9;
      glass(t, n, v);
      glass(t + .17, n + .18, v * .6, echo);
    });
    swell(0, 13.6, 160, 700, .05, air, 'lowpass');
    K.p('sine', at(1.5), at(4.5), hz(43), .035, 3, 2.5, pad);
    K.p('triangle', at(2.5), at(3.5), hz(50), .025, 3, 2.5, pad, 0, 6);
    // the build: kick, pizzicato bass, marimba; the glass voice plays the same figure a sixteenth late until bar 14,
    // then the gap closes, and from the click on both are in unison
    const ROOT = { 6: 43, 7: 43, 8: 43, 9: 43, 10: 40, 11: 40, 12: 45, 13: 45, 14: 40, 15: 40, 16: 38, 17: 38, 18: 43, 19: 43, 20: 43, 21: 43 };
    const CH = { 6: [55, 59, 62], 8: [57, 61, 64], 10: [55, 59, 62, 64], 12: [57, 61, 64], 14: [55, 59, 62, 64], 16: [54, 57, 62], 18: [55, 59, 62, 67], 20: [57, 61, 64, 67] };
    const kicks = [];
    for (let bar = 6; bar < 22; bar++) {
      const r = ROOT[bar], busy = bar >= 14 && bar < 18;
      for (let s = 0; s < 8; s++) {
        const t = at(bar, s / 2);
        if (bar == 17 && s == 7) continue;                     // one eighth of silence before the click
        const n = CELL[(bar % 2) * 8 + s], v = .22 + (s % 2 ? 0 : .07) + (bar >= 18 ? .05 : 0);
        if (bar < 22) marimba(t, n, v);
        const gap = BT / 4 * cl((CLICK - bar - s / 8) / 4);
        if (bar >= 7) glass(t + gap, n + 12, .1 + (bar >= 14 ? .04 : 0));
      }
      // kick: half time, every beat while the camera searches, the big one on the click
      for (let q = 0; q < 4; q++) {
        if (!(q % 2 == 0 || busy) || (bar == 17 && q == 3)) continue;
        const t = at(bar, q);
        kicks.push(t);
        K.o('sine', t, .34, 118, 44, .85, drm, .07);
        K.n(t, .02, 3000, 1500, 1, .05, drm);
      }
      // pizzicato bass
      [[0, 0, .9], [1.5, 7, .55], [2, 0, .7], [3.5, 12, .5]].forEach(([q, iv, v]) => { if (!(bar == 17 && q > 3)) K.o('sawtooth', at(bar, q), .38, hz(r + iv), hz(r + iv) * .995, v * .5, bas); });
      // woody clicks on the off-beats and a soft shaker from bar 10
      if (bar >= 8 && bar < 18) for (let q = 0; q < 4; q++) { if (bar == 17 && q == 3) continue; const t = at(bar, q + .5); K.n(t, .03, 2400, 2200, 7, .45, wood); K.o('sine', t, .045, 1850, 1700, .2, wood); }
      if (bar >= 10 && bar < 18) for (let s = 0; s < 16; s++) { if (bar == 17 && s > 13) continue; K.n(at(bar, s / 4), .035, 7000, 6500, .9, s % 4 == 2 ? .6 : .3, hat, 'highpass'); }
      if (CH[bar]) CH[bar].forEach((n, j) => K.p('triangle', at(bar), BAR * 2 - .3, hz(n), .05, .4, .8, pad, 0, 7 + j));
    }
    // formwork falls (bars 8, 10, 12): a short clatter of boards and a low thud; props pulled (bar 13): small metal tings
    STRIP.forEach(q => { const t = at(q); K.o('sine', t, .5, 90, 50, .5, drm, .2); [0, .05, .11, .2, .26].forEach((x, i) => K.n(t + .25 + x, .07, 900 - i * 90, 500, 3, .3 - i * .04, wood)); });
    PULL.forEach(q => { const t = at(q); K.o('sine', t, .5, 1250, 1240, .08, bel); K.o('sine', t, .3, 3400, 3380, .03, bel); K.n(t, .05, 400, 200, 2, .15, drm); });
    // riser into the click
    swell(at(16), BAR * 2 - BT / 2, 300, 4200, .08, air);
    // the click: wood block, glass chord, soft low boom
    const tc = at(CLICK);
    K.o('sine', tc, .12, 1450, 1300, .5, wood); K.n(tc, .04, 2600, 2400, 5, .6, wood);
    K.o('sine', tc, 2.2, 62, 40, .9, drm, .3); kicks.push(tc);
    [55, 59, 62, 67, 74].forEach((n, i) => glass(tc + i * .012, n + 12, .1));
    K.n(tc, 2.5, 5000, 1800, .7, .06, air);
    // words: one glass bell each (D6 on the click, G5, B5), the last with the final G major chord
    [[WORDS[0], 86], [WORDS[1], 79], [WORDS[2], 83]].forEach(([q, n]) => glass(at(q), n, .28, bel));
    const tf = at(WORDS[2]);
    [43, 50, 55, 59, 62, 67, 71].forEach((n, j) => K.p('triangle', tf, 4.2, hz(n), .07, .03, 4, pad, 0, 5 + j));
    K.o('sine', tf, 3, 49, 48, .5, drm, .1); kicks.push(tf);
    [67, 71, 74, 79].forEach((n, i) => marimba(tf + i * .09, n, .2));
    K.duck(pad.g.gain, kicks, .55, .22);
  },
});
