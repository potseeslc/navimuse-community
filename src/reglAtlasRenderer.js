import createREGL from 'regl';
import { atlasPointArray } from './atlasOverviewGeometry.js';

export function atlasPointStyle(cameraMode, pointCount, devicePixelRatio = 1) {
  const count = Math.max(1, Number(pointCount) || 1);
  const dpr = Math.max(1, Math.min(2, Number(devicePixelRatio) || 1));
  const overview = cameraMode === 'overview';
  const densityScale = Math.max(.28, Math.min(1, Math.sqrt((overview ? 60_000 : 30_000) / count)));
  const starPopulation = overview ? 440 : 360;
  return Object.freeze({
    densityScale,
    pointSize: Math.max(1.2, (overview ? 1.75 + .35 * densityScale : 1.7 + .65 * densityScale) * dpr),
    pointAlpha: overview ? Math.min(.42, .3 + .1 * densityScale) : .5 * densityScale,
    starSize: (overview ? 6.7 : 6.5) * dpr,
    starThreshold: 1 - Math.min(overview ? .028 : .02, Math.max(.0035, starPopulation / count))
  });
}

export function atlasAnimationIntervalMs(pointCount) {
  const count = Math.max(0, Number(pointCount) || 0);
  if (count >= 80_000) return 125;
  if (count >= 40_000) return 80;
  return 40;
}

export class ReglAtlasRenderer {
  constructor({ onFailure = () => {}, onDiagnostics = () => {} } = {}) {
    this.onFailure = onFailure;
    this.onDiagnostics = onDiagnostics;
    this.regl = null;
    this.canvas = null;
    this.pointBuffer = null;
    this.pinBuffer = null;
    this.suspendFlag = false;
    this.latestFrame = null;
    this.resizeObserver = null;
    this.failed = false;
    this.handleContextLoss = null;
    this.animationFrame = 0;
    this.lastAnimationTime = 0;
    this.reducedMotion = false;
    this.pointCount = 0;
    this.pointTiles = null;
    this.animate = null;
    this.lastDiagnosticsKey = '';
  }

  mount(target) {
    if (!(target instanceof HTMLCanvasElement)) throw new TypeError('Atlas renderer target must be a canvas');
    this.canvas = target;
    this.regl = createREGL({ canvas: target, attributes: { antialias: false, alpha: false } });
    this.pointBuffer = this.regl.buffer();
    this.pinBuffer = this.regl.buffer();
    const vert = 'precision highp float;attribute vec2 position;uniform vec4 view;uniform float pointSize;uniform float variedSize;uniform float starOnly;uniform float starThreshold;varying vec2 world;varying float sparkle;void main(){vec2 n=(position-view.xy)/view.zw*2.0;world=position;sparkle=fract(sin(dot(position,vec2(127.1,311.7)))*43758.5453);float star=step(starThreshold,sparkle);gl_Position=vec4(mix(n,vec2(3.0),starOnly*(1.0-star)),0,1);gl_PointSize=pointSize*mix(1.0,2.6,star*variedSize);}';
    const frag = `precision highp float;
uniform vec4 color; uniform float cosmic; uniform float softness; uniform float starPass; uniform float time;
varying vec2 world; varying float sparkle;
void main(){
  vec2 p=(gl_PointCoord-.5)*2.0; float d=length(p); if(d>1.0)discard;
  float radial=1.0-smoothstep(softness,1.0,d); float core=1.0-smoothstep(0.0,.34,d);
  float rays=max(exp(-abs(p.x)*34.0)*(1.0-smoothstep(.08,1.0,abs(p.y))),exp(-abs(p.y)*34.0)*(1.0-smoothstep(.08,1.0,abs(p.x))));
  float light=mix(radial,max(core,rays*.76),starPass);
  float drift=sin(time*.17+world.y*4.2)*.09+cos(time*.11+world.x*3.6)*.06;
  float current=sin(world.x*4.4-world.y*2.8+time*.14)*.5+.5;
  light*=mix(1.0,.34+smoothstep(.16,.84,current)*.9,cosmic);
  float envelope=1.0-smoothstep(.38,1.0,length(world*vec2(.86,1.05)));
  light*=mix(1.0,(.48+envelope*.72)*(.62+smoothstep(.05,.95,sparkle)*.5),cosmic);
  float axis=world.x+drift;
  vec3 blue=vec3(.06,.25,1.0); vec3 cyan=vec3(.08,.78,1.0); vec3 pearl=vec3(1.0,.77,.38);
  vec3 violet=vec3(.72,.08,1.0); vec3 amber=vec3(1.0,.48,.04); vec3 coral=vec3(1.0,.08,.03);
  float fieldA=sin(axis*2.6+world.y*3.4+time*.035)*.5+.5;
  float fieldB=cos(world.x*3.7-world.y*2.1-time*.027)*.5+.5;
  float fieldC=sin((world.x+world.y)*2.2+time*.021+current)*.5+.5;
  vec3 galactic=mix(blue,coral,smoothstep(.12,.88,fieldA));
  galactic=mix(galactic,cyan,smoothstep(.5,.96,fieldB)*.72);
  galactic=mix(galactic,violet,smoothstep(.52,.94,1.0-fieldC)*.68);
  galactic=mix(galactic,amber,smoothstep(.58,.98,fieldC)*(.38+current*.42));
  galactic=mix(galactic,pearl,smoothstep(.76,1.0,fieldA*fieldB)*.48);
  galactic=min(vec3(1.0),galactic*mix(2.8,4.2,pow(sparkle,8.0))+vec3(.05));
  vec3 rgb=mix(color.rgb,galactic,cosmic); gl_FragColor=vec4(rgb,color.a*light);
}`;
    const draw = (buffer, primitive = 'points', additive = primitive === 'points') => this.regl({
      vert,
      frag: primitive === 'points' ? frag : 'precision highp float;uniform vec4 color;void main(){gl_FragColor=color;}',
      attributes: { position: buffer },
      uniforms: { view: this.regl.prop('view'), pointSize: this.regl.prop('pointSize'), variedSize: this.regl.prop('variedSize'), starOnly: this.regl.prop('starOnly'), starThreshold: this.regl.prop('starThreshold'), starPass: this.regl.prop('starPass'), color: this.regl.prop('color'), cosmic: this.regl.prop('cosmic'), softness: this.regl.prop('softness'), ...(primitive === 'points' ? { time: this.regl.prop('time') } : {}) },
      count: this.regl.prop('count'), primitive,
      blend: { enable: true, func: { src: 'src alpha', dst: additive ? 'one' : 'one minus src alpha' } }
    });
    this.drawPoints = draw(this.pointBuffer);
    this.drawPins = draw(this.pinBuffer);
    this.drawBackdrop = this.regl({
      vert: 'precision highp float;attribute vec2 position;varying vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0,1);}',
      frag: 'precision highp float;varying vec2 uv;uniform float time;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}float cloud(vec2 p,vec2 center,vec2 shape,float falloff){return exp(-length((p-center)*shape)*falloff);}void main(){vec2 flow=vec2(sin(time*.09+uv.y*3.2),cos(time*.07+uv.x*2.8))*.065;vec2 counter=vec2(cos(time*.055-uv.y*2.1),sin(time*.075+uv.x*2.6))*.05;vec2 p=uv-0.5+flow;float broad=noise((uv+flow)*3.4);float medium=noise((uv-flow*.7+counter)*8.0);float fine=noise((uv+flow*.4-counter)*19.0);float n=.48+broad*.72+medium*.38+fine*.14;float edge=smoothstep(.24,.72,length(p*vec2(.86,1.08)));float blue=cloud(p,vec2(-.34+sin(time*.041)*.08,-.12+cos(time*.053)*.05),vec2(1.0,1.6),2.6);float cyan=cloud(p,vec2(-.16+cos(time*.037)*.07,.19+sin(time*.047)*.07),vec2(1.35,2.0),3.0);float violet=cloud(p,vec2(.08+sin(time*.035)*.09,-.05+cos(time*.045)*.07),vec2(1.15,1.8),2.8);float amber=cloud(p,vec2(.28+cos(time*.039)*.08,.15+sin(time*.051)*.06),vec2(1.05,1.7),2.7);float coral=cloud(p,vec2(.38+sin(time*.033)*.11,-.22+cos(time*.043)*.06),vec2(1.1,1.9),3.0);float ribbon=exp(-abs((uv.y-.52)-sin(uv.x*5.2+time*.08)*.105)*8.0)*(.35+.65*noise(vec2(uv.x*5.0-time*.035,uv.y*3.0)));float veil=.82+edge*.62;vec3 color=vec3(.006,.011,.021);color+=vec3(.045,.18,.72)*blue*n*.28*veil;color+=vec3(.025,.48,.58)*cyan*n*.24*veil;color+=vec3(.43,.075,.62)*violet*n*.25*veil;color+=vec3(.64,.26,.035)*amber*n*.25*veil;color+=vec3(.74,.055,.025)*coral*n*.3*veil;color+=(mix(vec3(.04,.3,.62),vec3(.62,.055,.025),smoothstep(.15,.85,uv.x)))*ribbon*n*.12;float breathing=.9+sin(time*.12+broad*6.283)*.1;color*=breathing;float dustCloud=min(1.0,blue+cyan+violet+amber+coral);float dust=step(.9915,hash(floor(uv*vec2(1100.0,700.0))))*(.09+dustCloud*.28)*smoothstep(.48,1.2,n);vec3 dustColor=mix(vec3(.28,.72,1.0),vec3(1.0,.38,.16),smoothstep(.12,.88,uv.x));float vignette=1.0-smoothstep(.48,.86,length(uv-.5));gl_FragColor=vec4((color+dustColor*dust)*(.72+.28*vignette),1.0);}',
      attributes: { position: [[-1, -1], [3, -1], [-1, 3]] },
      uniforms: { time: this.regl.prop('time') },
      count: 3,
      depth: { enable: false }
    });
    this.handleContextLoss = event => {
      event.preventDefault();
      this.fail(new Error('Sonic Atlas WebGL context was lost.'));
    };
    target.addEventListener('webglcontextlost', this.handleContextLoss);
    this.resizeObserver = new ResizeObserver(() => this.guardedRedraw());
    this.resizeObserver.observe(target);
    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reducedMotion = Boolean(motionQuery?.matches);
    this.animate = timestamp => {
      this.animationFrame = 0;
      if (this.latestFrame && timestamp - this.lastAnimationTime >= atlasAnimationIntervalMs(this.pointCount)) {
        this.lastAnimationTime = timestamp;
        this.guardedRedraw(timestamp / 1000);
      }
      this.startAnimation();
    };
    this.startAnimation();
  }

  fail(error) {
    if (this.failed) return;
    this.failed = true;
    this.onFailure(error);
  }

  guardedRedraw(time) {
    try { this.redraw(time); }
    catch (error) { this.fail(error); }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  startAnimation() {
    if (this.animationFrame || this.reducedMotion || this.suspendFlag || !this.animate) return;
    this.animationFrame = window.requestAnimationFrame(this.animate);
  }

  stopAnimation() {
    if (this.animationFrame) window.cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
  }

  render(frame) {
    this.latestFrame = frame;
    if (this.pointTiles !== frame.tiles) {
      const points = atlasPointArray(frame.tiles);
      const pointData = new Float32Array(points.length * 2);
      for (let index = 0; index < points.length; index += 1) {
        pointData[index * 2] = points[index].x;
        pointData[index * 2 + 1] = points[index].y;
      }
      this.pointBuffer(pointData);
      this.pointCount = points.length;
      this.pointTiles = frame.tiles;
    }
    this.redraw();
  }

  redraw(time = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000) {
    if (!this.regl || this.suspendFlag || !this.latestFrame) return;
    this.resize();
    const frame = this.latestFrame;
    const camera = frame.camera.view;
    const view = [camera.centerX, camera.centerY, camera.width, camera.height];
    const dpr = this.canvas.width / Math.max(1, this.canvas.clientWidth);
    const pointStyle = atlasPointStyle(frame.camera.mode, this.pointCount, dpr);
    this.regl.poll();
    this.regl.clear({ color: [.009, .014, .023, 1] });
    this.drawBackdrop({ time });
    this.drawPoints({ view, time, pointSize: pointStyle.pointSize, variedSize: .45, starOnly: 0, starThreshold: pointStyle.starThreshold, starPass: 0, softness: .74, cosmic: 1, color: [1, 1, 1, pointStyle.pointAlpha], count: this.pointCount });
    this.drawPoints({ view, time, pointSize: pointStyle.starSize, variedSize: .65, starOnly: 1, starThreshold: pointStyle.starThreshold, starPass: 1, softness: 0, cosmic: 0, color: [.94, .99, 1, .92], count: this.pointCount });
    const diagnosticsKey = `${this.pointCount}/${dpr}`;
    if (diagnosticsKey !== this.lastDiagnosticsKey) {
      this.lastDiagnosticsKey = diagnosticsKey;
      this.onDiagnostics(Object.freeze({ drawnCount: this.pointCount, devicePixelRatio: dpr }));
    }
    for (const role of ['waypoint', 'destination', 'current']) {
      const selected = frame.pins.filter(pin => pin.role === role);
      const data = new Float32Array(selected.flatMap(pin => [pin.x, pin.y]));
      this.pinBuffer(data);
      if (data.length) {
        const color = role === 'current' ? [.35, .63, 1, 1] : role === 'destination' ? [1, .34, .23, 1] : [.88, .8, 1, 1];
        this.drawPins({ view, time, pointSize: (role === 'current' ? 36 : role === 'destination' ? 30 : 22) * dpr, variedSize: 0, starOnly: 0, starThreshold: 1, starPass: 0, softness: .42, cosmic: 0, color: [...color.slice(0, 3), .14], count: data.length / 2 });
        this.drawPins({ view, time, pointSize: (role === 'current' ? 12 : role === 'destination' ? 10 : 7) * dpr, variedSize: 0, starOnly: 0, starThreshold: 1, starPass: 1, softness: 0, cosmic: 0, color, count: data.length / 2 });
      }
    }
  }

  setReducedMotion(value) { this.reducedMotion = Boolean(value); this.reducedMotion ? this.stopAnimation() : this.startAnimation(); this.redraw(); }
  suspend() { this.suspendFlag = true; this.stopAnimation(); }
  resume() { this.suspendFlag = false; this.redraw(); this.startAnimation(); }
  requestContextLossForEvidence() {
    const gl = this.regl?._gl || this.canvas?.getContext?.('webgl2') || this.canvas?.getContext?.('webgl');
    const extension = gl?.getExtension?.('WEBGL_lose_context');
    if (!extension?.loseContext) return false;
    extension.loseContext();
    return true;
  }
  dispose() {
    this.resizeObserver?.disconnect();
    this.stopAnimation();
    if (this.canvas && this.handleContextLoss) this.canvas.removeEventListener('webglcontextlost', this.handleContextLoss);
    try { this.pointBuffer?.destroy(); this.pinBuffer?.destroy(); this.regl?.destroy(); }
    finally { this.regl = null; this.canvas = null; this.latestFrame = null; this.handleContextLoss = null; this.pointCount = 0; this.pointTiles = null; this.animate = null; this.lastDiagnosticsKey = ''; }
  }
}
