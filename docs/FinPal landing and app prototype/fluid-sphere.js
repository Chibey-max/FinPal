(() => {
  if (customElements.get('fluid-sphere')) return;
  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = `precision highp float;
uniform vec2 uRes;uniform float uT;uniform vec2 uM;uniform float uR;uniform vec2 uC;uniform float uI;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<5;i++){v+=a*n(p);p=m*p;a*=.5;}return v;}
void main(){
 vec2 uv=(gl_FragCoord.xy-.5*uRes)/min(uRes.x,uRes.y)-uC;
 float d=length(uv);vec3 col=vec3(0.);float al=0.;
 float glow=exp(-pow(max(d-uR,0.)*5.,1.4))*.07;
 if(d<uR){
  vec2 q=uv/uR;float z=sqrt(max(0.,1.-dot(q,q)));vec3 nn=vec3(q,z);
  float t=uT*.055;
  vec2 p=nn.xy/(1.15+nn.z)*2.4+uM*.5;
  vec2 w=vec2(fbm(p+vec2(t,-t*.7)),fbm(p+vec2(5.2-t*.8,1.3+t)));
  vec2 w2=vec2(fbm(p+3.*w+vec2(1.7,9.2)+t*.4),fbm(p+3.*w+vec2(8.3,2.8)-t*.3));
  float f=fbm(p+2.6*w2);
  vec3 deep=vec3(.025,.03,.045),cool=vec3(.14,.27,.43),warm=vec3.55,.40,.29),pale=vec3(.70,.68,.62);
  vec3 liq=mix(deep,cool,smoothstep(.28,.7,f));
  liq=mix(liq,warm,smoothstep(.5,.9,w2.x)*.85);
  liq=mix(liq,pale,smoothstep(.62,.95,f*w.y*1.7)*.4);
  float rim=1.-z;
  col=liq*mix(.16,1.,smoothstep(0.,.85,rim))*uI;
  col+=vec3(.55,.6,.72)*pow(rim,3.2)*.38;
  vec3 L=normalize(vec3(.35+uM.x*.5,.8-uM.y*.5,.55));
  col+=vec3(1.)*pow(max(dot(nn,normalize(L+vec3(0,0,1))),0.),140.)*.95;
  col+=vec3(.9,.8,.7)*pow(max(dot(nn,normalize(vec3(-.6,-.5,.6)+vec3(0,0,1))),0.),40.)*.06;
  col*=mix(.5,1.,smoothstep(-1.1,.35,q.y));
  al=smoothstep(uR,uR-.003,d);
 }
 col+=vec3(.5,.56,.68)*glow;al=max(al,glow*1.6);
 gl_FragColor=vec4(col,al);
}`.replace('vec3.55', 'vec3(.55');
  class FluidSphere extends HTMLElement {
    static get observedAttributes() { return ['radius', 'cx', 'cy', 'intensity']; }
    attributeChangedCallback() { this.readAttrs(); }
    readAttrs() {
      const g = (k, d) => { const v = parseFloat(this.getAttribute(k)); return isNaN(v) ? d : v; };
      this.R = g('radius', 0.42); this.C = [g('cx', 0), g('cy', 0)]; this.I = g('intensity', 1);
    }
    connectedCallback() {
      if (this.live) return; this.live = true; this.readAttrs();
      Object.assign(this.style, { display: 'block', width: this.style.width || '100%', height: this.style.height || '100%', position: this.style.position || 'relative' });
      const c = document.createElement('canvas');
      c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
      this.appendChild(c); this.c = c;
      const gl = c.getContext('webgl', { premultipliedAlpha: false, alpha: true });
      if (!gl) { c.style.background = 'radial-gradient(circle,rgba(60,80,110,.5),transparent 60%)'; return; }
      const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(o)); return o; };
      const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.gl = gl; this.u = {}; ['uRes', 'uT', 'uM', 'uR', 'uC', 'uI'].forEach((k) => (this.u[k] = gl.getUniformLocation(pr, k)));
      this.m = [0, 0]; this.tm = [0, 0];
      this.onMove = (e) => { this.tm = [e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5]; };
      addEventListener('pointermove', this.onMove);
      this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this); this.resize();
      this.t0 = performance.now();
      const loop = () => {
        this.raf = requestAnimationFrame(loop);
        this.m[0] += (this.tm[0] - this.m[0]) * 0.04; this.m[1] += (this.tm[1] - this.m[1]) * 0.04;
        const g = this.gl, u = this.u;
        g.viewport(0, 0, c.width, c.height); g.clearColor(0, 0, 0, 0); g.clear(g.COLOR_BUFFER_BIT);
        g.uniform2f(u.uRes, c.width, c.height); g.uniform1f(u.uT, (performance.now() - this.t0) / 1000);
        g.uniform2f(u.uM, this.m[0], this.m[1]); g.uniform1f(u.uR, this.R); g.uniform2f(u.uC, this.C[0], this.C[1]); g.uniform1f(u.uI, this.I);
        g.drawArrays(g.TRIANGLES, 0, 3);
      };
      loop();
    }
    resize() { if (!this.c) return; const d = Math.min(devicePixelRatio || 1, 1.5), r = this.getBoundingClientRect(); this.c.width = Math.max(1, r.width * d); this.c.height = Math.max(1, r.height * d); }
    disconnectedCallback() { cancelAnimationFrame(this.raf); removeEventListener('pointermove', this.onMove); this.ro && this.ro.disconnect(); this.innerHTML = ''; this.live = false; }
  }
  customElements.define('fluid-sphere', FluidSphere);
})();
