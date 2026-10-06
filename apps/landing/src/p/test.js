// Test production: exercises the runtime (text field, audio kit, envelope). Not shipped as one of the three.
Dream.add({
  id: 'test', dur: 20, fin: 14, cta: 15,
  frag: /*glsl*/`
void main(){
  vec2 p=(2.*gl_FragCoord.xy-R)/R.y;
  float n=fbm(p*3.+T*.2);
  vec3 col=vec3(.05,.07,.12)+.25*n*vec3(.3,.5,1.);
  vec3 d=tdist(p);
  float k0=smoothstep(4.,5.,T),k1=smoothstep(7.,8.,T),k2=smoothstep(10.,11.,T);
  float a=smoothstep(.006,-.006,d.x)*k0;
  float b=smoothstep(.006,-.006,d.y)*k1;
  float c=smoothstep(.006,-.006,d.z)*k2;
  col=mix(col,vec3(1.,.8,.4),max(a,max(b,c)));
  col+=vec3(.5,.7,1.)*E.x*.25*(1.-length(p)*.5);
  col+=(h2(gl_FragCoord.xy+T)-.5)*.04;
  O=vec4(col,1);
}`,
  music(K) {
    const kick = [], c = K.c, rv = K.rev(2, 3, .35), bass = K.bus(.5);
    for (let b = 0; b < 40; b++) {
      const t = b * .5;
      if (t < 2) continue;
      kick.push(t);
      K.o('sine', t, .35, 150, 42, .9, K.out, .1);
      K.n(t + .25, .05, 7000, 7000, 1, .12, K.out, 'highpass');
      if (b % 4 === 2) K.n(t, .18, 1800, 900, 1.2, .3, rv);
    }
    for (let i = 0; i < 8; i++) K.p('sawtooth', 2 + i * 2.5, 2.2, K.hz([45, 48, 52, 43][i % 4]), .25, .1, .6, bass, 400, 8);
    K.n(0, 4, 300, 6000, 2, .05);
  },
});
