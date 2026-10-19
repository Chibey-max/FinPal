"use client";

import { useEffect, useRef } from "react";

// Port of docs/design_handoff_finpal/reference/fluid-sphere.js. The shader
// keeps the domain-warped fBm liquid (deep navy, steel blue, warm amber,
// pale cream), rim light and outer glow. The specular highlights were removed:
// they read as a bright spot in dark mode and a dark one once light mode
// inverts the colours. The pointer still drifts the liquid itself (uM).
const VERTEX = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
const FRAGMENT = `precision highp float;
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
  vec3 deep=vec3(.025,.03,.045),cool=vec3(.14,.27,.43),warm=vec3(.55,.40,.29),pale=vec3(.70,.68,.62);
  vec3 liq=mix(deep,cool,smoothstep(.28,.7,f));
  liq=mix(liq,warm,smoothstep(.5,.9,w2.x)*.85);
  liq=mix(liq,pale,smoothstep(.62,.95,f*w.y*1.7)*.4);
  float rim=1.-z;
  col=liq*mix(.16,1.,smoothstep(0.,.85,rim))*uI;
  col+=vec3(.55,.6,.72)*pow(rim,3.2)*.38;
  col*=mix(.5,1.,smoothstep(-1.1,.35,q.y));
  al=smoothstep(uR,uR-.003,d);
 }
 col+=vec3(.5,.56,.68)*glow;al=max(al,glow*1.6);
 gl_FragColor=vec4(col,al);
}`;

export interface FluidSphereProps {
  radius?: number;
  cx?: number;
  cy?: number;
  intensity?: number;
}

/** "Right orb" placement by default: radius .62, cx .62, cy .18, intensity 1. */
export function FluidSphere({
  radius = 0.62,
  cx = 0.62,
  cy = 0.18,
  intensity = 1,
}: FluidSphereProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const props = useRef({ radius, cx, cy, intensity });

  useEffect(() => {
    props.current = { radius, cx, cy, intensity };
  }, [radius, cx, cy, intensity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
    });
    if (!gl) {
      canvas.dataset.fallback = "true";
      return;
    }

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };
    const program = gl.createProgram()!;
    const vertex = compile(gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      canvas.dataset.fallback = "true";
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const point = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(point);
    gl.vertexAttribPointer(point, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const u = Object.fromEntries(
      ["uRes", "uT", "uM", "uR", "uC", "uI"].map((name) => [
        name,
        gl.getUniformLocation(program, name),
      ]),
    );

    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const mouse = [0, 0];
    let target = [0, 0];
    let raf = 0;
    const start = performance.now();

    const draw = () => {
      // The liquid drifts with the pointer, eased at 0.04 per frame.
      mouse[0]! += (target[0]! - mouse[0]!) * 0.04;
      mouse[1]! += (target[1]! - mouse[1]!) * 0.04;
      const { radius: r, cx: x, cy: y, intensity: i } = props.current;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(u.uRes!, canvas.width, canvas.height);
      gl.uniform1f(
        u.uT!,
        reduceMotion.matches ? 12 : (performance.now() - start) / 1000,
      );
      gl.uniform2f(u.uM!, mouse[0]!, mouse[1]!);
      gl.uniform1f(u.uR!, r);
      gl.uniform2f(u.uC!, x, y);
      gl.uniform1f(u.uI!, i);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    const run = () => {
      cancelAnimationFrame(raf);
      if (document.hidden) return;
      if (reduceMotion.matches) draw();
      else loop();
    };

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(box.width * dpr));
      canvas.height = Math.max(1, Math.round(box.height * dpr));
      if (reduceMotion.matches) draw();
    };
    const move = (event: PointerEvent) => {
      target = [
        event.clientX / innerWidth - 0.5,
        event.clientY / innerHeight - 0.5,
      ];
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    addEventListener("pointermove", move, { passive: true });
    document.addEventListener("visibilitychange", run);
    reduceMotion.addEventListener("change", run);
    run();
    canvas.dataset.ready = "true";

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      removeEventListener("pointermove", move);
      document.removeEventListener("visibilitychange", run);
      reduceMotion.removeEventListener("change", run);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fluid-sphere-canvas"
      aria-hidden="true"
    />
  );
}
