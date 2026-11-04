import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";

import { useTheme } from "@/lib/theme-context";

// Port of apps/web/src/components/fluid-sphere.tsx (itself a port of
// docs/design_handoff_finpal/reference/fluid-sphere.js): the domain-warped
// fBm liquid in deep navy, steel blue, warm amber and pale cream, with rim
// light and an outer glow. The web draws it with alpha over the page; here
// it is composited over the page colour in the shader so it is opaque, which
// avoids premultiplied-alpha differences between platforms.
const VERTEX = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
const FRAGMENT = `precision highp float;
uniform vec2 uRes;uniform float uT;uniform vec2 uM;uniform float uR;uniform vec2 uC;uniform float uI;uniform float uLight;uniform vec3 uBg;
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
 al=clamp(al,0.,1.);
 vec3 outc;
 if(uLight>.5){
  // Light theme: the web recolours the canvas with CSS
  // invert(1) hue-rotate(180deg) saturate(1.3) brightness(1.04) at 70% opacity.
  vec3 c=clamp(vec3(1.)-col,0.,1.);
  c=clamp(vec3(dot(c,vec3(-.574,1.43,.144)),dot(c,vec3(.426,.43,.144)),dot(c,vec3(.426,1.43,-.856))),0.,1.);
  c=clamp(vec3(dot(c,vec3(1.2361,-.2145,-.0216)),dot(c,vec3(-.0639,1.0855,-.0216)),dot(c,vec3(-.0639,-.2145,1.2784))),0.,1.);
  c=clamp(c*1.04,0.,1.);
  outc=mix(uBg,c,al*.7);
 }else{
  outc=mix(uBg,col,al);
 }
 gl_FragColor=vec4(outc,1.);
}`;

// "Centered orb" placement the web uses behind every page.
const RADIUS = 0.46;
const CENTER = [0, -0.02] as const;
const INTENSITY = 0.85;

// The orb is soft, so draw at half size and scale up: a quarter of the
// pixels to shade, and a much lighter load on the GPU and battery.
const RENDER_SCALE = 0.5;
const FRAME_MS = 1000 / 30;

export function Backdrop() {
  const { width, height } = useWindowDimensions();
  const { scheme, colors } = useTheme();
  const schemeRef = useRef(scheme);
  // Fade from the veil colour at zero alpha, not black, to avoid a grey band.
  const clear = colors.veilDeep.replace(/[\d.]+\)$/, "0)");
  const [reduceMotion, setReduceMotion] = useState(false);
  const reduceMotionRef = useRef(false);
  const redraw = useRef<(() => void) | null>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => sub.remove();
  }, []);

  useEffect(() => {
    schemeRef.current = scheme;
    if (reduceMotionRef.current) redraw.current?.();
  }, [scheme]);

  useEffect(() => {
    reduceMotionRef.current = reduceMotion;
    // A still frame is enough when motion is reduced.
    if (reduceMotion) redraw.current?.();
  }, [reduceMotion]);

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    // If the shader cannot run on this device, the plain page colour shows.
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const point = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(point);
    gl.vertexAttribPointer(point, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(program, name);
    const uRes = u("uRes");
    const uT = u("uT");
    const uM = u("uM");
    const uR = u("uR");
    const uC = u("uC");
    const uI = u("uI");
    const uLight = u("uLight");
    const uBg = u("uBg");

    const start = Date.now();
    let raf = 0;
    let last = 0;
    let running = true;

    const draw = () => {
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(
        uT,
        reduceMotionRef.current ? 12 : (Date.now() - start) / 1000,
      );
      gl.uniform2f(uM, 0, 0);
      gl.uniform1f(uR, RADIUS);
      gl.uniform2f(uC, CENTER[0], CENTER[1]);
      gl.uniform1f(uI, INTENSITY);
      const light = schemeRef.current === "light";
      gl.uniform1f(uLight, light ? 1 : 0);
      // The page colour the orb is composited over (#edf0f5 / #040509).
      if (light) gl.uniform3f(uBg, 0.929, 0.941, 0.961);
      else gl.uniform3f(uBg, 0.0157, 0.0196, 0.0353);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.endFrameEXP();
    };
    redraw.current = draw;

    const loop = () => {
      if (!running) return;
      const now = Date.now();
      if (!reduceMotionRef.current && now - last >= FRAME_MS) {
        last = now;
        draw();
      }
      raf = requestAnimationFrame(loop);
    };
    draw();
    loop();

    // Stop shading while the app is in the background.
    const state = AppState.addEventListener("change", (next) => {
      running = next === "active";
      if (running) loop();
      else cancelAnimationFrame(raf);
    });
    // GLView gives no unmount hook; the context dies with the view.
    redraw.current = draw;
    return () => state.remove();
  };

  return (
    <View
      style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}
      pointerEvents="none"
    >
      <GLView
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: width * RENDER_SCALE,
          height: height * RENDER_SCALE,
          transformOrigin: "top left",
          transform: [{ scale: 1 / RENDER_SCALE }],
        }}
        onContextCreate={onContextCreate}
      />
      {/* Keeps text readable over the orb: an even wash plus a deeper fade
          toward the bottom, where body copy usually sits. */}
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.veilWash }]}
      />
      <LinearGradient
        style={StyleSheet.absoluteFill}
        colors={[clear, clear, colors.veilDeep]}
        locations={[0, 0.45, 1]}
      />
    </View>
  );
}
