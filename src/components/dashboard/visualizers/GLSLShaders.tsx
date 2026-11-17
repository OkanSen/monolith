import React, { useEffect, useRef } from 'react';

export type ShaderMode = 'ASTRAL_WARP' | 'SOLAR_VORTEX' | 'HYPER_TUBE' | 'MENGER_TESSERACT';

interface GLSLShadersProps {
  analyserRef: React.RefObject<AnalyserNode | null>;
  mode: ShaderMode;
}

const VERTEX_SHADER_SOURCE = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_prev_frame;
uniform vec2 u_res;
uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_treb;
uniform int u_mode;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

vec3 spectralPalette(float t) {
  vec3 a = vec3(0.5, 0.5, 0.5);
  vec3 b = vec3(0.5, 0.5, 0.5);
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(0.00, 0.33, 0.67);
  return a + b * cos(6.28318 * (c * t + d + vec3(u_time * 0.05, u_bass * 0.25, u_treb * 0.15)));
}

vec3 psychedelicPalette(float t, float depth) {
  vec3 c1 = vec3(0.05, 0.12, 0.85);
  vec3 c2 = vec3(0.02, 0.85, 0.75);
  vec3 c3 = vec3(0.98, 0.10, 0.55);
  vec3 c4 = vec3(1.00, 0.90, 0.15);

  float p = fract(t + u_time * 0.08);
  vec3 col = mix(c1, c2, smoothstep(0.0, 0.33, p));
  col = mix(col, c3, smoothstep(0.33, 0.66, p));
  col = mix(col, c4, smoothstep(0.66, 1.0, p));
  return col * (0.85 + u_bass * 0.5);
}

float sdBox(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

float mengerPrismSDF(vec3 p, out float outEdges, out float outActivity) {
  float baseScale = 0.68 + u_bass * 0.05;
  vec3 bOuter = vec3(baseScale);
  float dCube = sdBox(p, bOuter);

  float innerHole = sdBox(p, vec3(baseScale * 0.44));
  float dHollow = max(dCube, -innerHole);

  vec3 pFract = p;
  float s = 1.0;
  for (int m = 0; m < 3; m++) {
    vec3 a = mod(pFract * s, 2.0) - 1.0;
    s *= 3.0;
    vec3 r = abs(1.0 - 3.0 * abs(a));
    float da = max(r.x, r.y);
    float db = max(r.y, r.z);
    float dc = max(r.z, r.x);
    float c = (min(da, min(db, dc)) - 1.0) / s;
    if (c > dHollow) dHollow = c;
  }

  vec3 pFold = abs(p);
  if (pFold.x < pFold.y) pFold.xy = pFold.yx;
  if (pFold.y < pFold.z) pFold.yz = pFold.zy;
  if (pFold.x < pFold.y) pFold.xy = pFold.yx;

  float dPrisms = 1000.0;
  float maxMotion = 0.0;

  for (int ix = -1; ix <= 1; ix++) {
    for (int iy = -1; iy <= 1; iy++) {
      vec2 gridCoord = vec2(float(ix) * 0.22, float(iy) * 0.22);
      float cellHash = fract(sin(float(ix * 37 + iy * 73)) * 43758.5453);

      float freq = 0.0;
      if (cellHash < 0.33) {
        freq = u_bass * (1.1 + 0.4 * sin(u_time * 4.0 + cellHash * 6.28));
      } else if (cellHash < 0.66) {
        freq = u_mid * (1.0 + 0.5 * cos(u_time * 5.0 + cellHash * 6.28));
      } else {
        freq = u_treb * (1.3 + 0.7 * sin(u_time * 7.5 + cellHash * 6.28));
      }

      float outerHeight = 0.035 + freq * 0.35;
      vec3 outerCenter = vec3(gridCoord.x, gridCoord.y, baseScale + outerHeight * 0.85);
      vec3 outerSize = vec3(0.045, 0.045, outerHeight);
      float dOuterBar = sdBox(pFold - outerCenter, outerSize);

      float innerHeight = 0.03 + freq * 0.25;
      vec3 innerCenter = vec3(gridCoord.x * 0.65, gridCoord.y * 0.65, (baseScale * 0.44) - innerHeight * 0.85);
      vec3 innerSize = vec3(0.035, 0.035, innerHeight);
      float dInnerBar = sdBox(pFold - innerCenter, innerSize);

      float dPair = min(dOuterBar, dInnerBar);
      if (dPair < dPrisms) {
        dPrisms = dPair;
        if (freq > 0.35) maxMotion = freq;
      }
    }
  }

  float dCombined = min(dHollow, dPrisms);
  float wireShell = smoothstep(0.03, 0.0, dHollow);
  float wirePrism = smoothstep(0.025, 0.0, dPrisms);

  outEdges = max(wireShell, wirePrism * 1.6);
  outActivity = maxMotion;
  return dCombined;
}

void main() {
  vec2 uv = v_uv;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  float dist = length(p);
  float angle = atan(p.y, p.x);

  // PRESET 1: ASTRAL WARP
  if (u_mode == 0) {
    float zoom = 0.988 - (u_bass * 0.025);
    float twist = (0.012 + u_mid * 0.035) * (1.0 - smoothstep(0.0, 1.2, dist));
    
    vec2 warpedUv = (uv - 0.5);
    warpedUv *= rot(twist);
    warpedUv = warpedUv * zoom + 0.5;

    float noiseDistort = snoise(vec3(p * 3.5, u_time * 0.45));
    warpedUv += vec2(
      cos(angle * 4.0 + u_time),
      sin(angle * 4.0 - u_time)
    ) * (0.0035 + u_treb * 0.008) * noiseDistort;

    vec2 caOffset = vec2(0.0035 + u_bass * 0.006, 0.0);
    float rPrev = texture2D(u_prev_frame, clamp(warpedUv - caOffset, 0.0, 1.0)).r;
    float gPrev = texture2D(u_prev_frame, clamp(warpedUv, 0.0, 1.0)).g;
    float bPrev = texture2D(u_prev_frame, clamp(warpedUv + caOffset, 0.0, 1.0)).b;
    vec3 feedbackCol = vec3(rPrev, gPrev, bPrev) * 0.965;

    float symmetry = 8.0;
    float symAngle = mod(angle + u_time * 0.25, 6.28318 / symmetry) - (3.14159 / symmetry);
    vec2 symP = vec2(cos(symAngle), sin(symAngle)) * dist;

    float rings = sin(length(symP) * (18.0 + u_bass * 12.0) - u_time * 3.0 + noiseDistort * 4.0);
    float ripple = smoothstep(0.75, 0.0, abs(rings)) * (0.35 + u_mid * 0.65);

    float lightning = snoise(vec3(symP * (6.0 + u_treb * 8.0), u_time * 1.5));
    float arc = smoothstep(0.05, 0.0, abs(lightning)) * (0.25 + u_treb * 0.95);

    vec3 freshColor = spectralPalette(dist * 1.5 + u_time * 0.2) * (ripple + arc);
    float coreFalloff = exp(-dist * (2.8 - u_bass * 1.2));
    vec3 coreBloom = vec3(1.0, 0.45, 0.15) * coreFalloff * (0.7 + u_bass * 1.5);

    vec3 composite = feedbackCol + freshColor * 0.45 + coreBloom * 0.35;
    vec3 mapped = composite / (composite + vec3(0.85));
    mapped = pow(mapped, vec3(1.15));
    gl_FragColor = vec4(mapped, 1.0);
  }
  // PRESET 2: SOLAR VORTEX
  else if (u_mode == 1) {
    float rSafe = max(dist, 0.015);
    vec2 tunnelUv = vec2(angle / 3.14159, (1.0 / rSafe) + u_time * 2.2);

    float wallRings = sin(tunnelUv.y * 14.0 + u_time * 4.0);
    float wallRibs = cos(tunnelUv.x * 16.0);
    float wallNoise = snoise(vec3(tunnelUv * vec2(4.0, 1.5), u_time * 0.6));
    float wallLattice = abs(wallRings * wallRibs) + wallNoise * (0.3 + u_mid * 0.5);

    vec3 tunnelCol = spectralPalette(tunnelUv.y * 0.15);
    tunnelCol *= smoothstep(0.1, 0.8, wallLattice) * (0.4 + u_bass * 0.7);

    float depthFog = smoothstep(0.0, 1.1, dist);
    vec3 backgroundWorld = tunnelCol * depthFog;

    float rays = 12.0;
    float starAngle = mod(angle + u_time * 0.4, 6.28318 / rays) - (3.14159 / rays);
    float starDist = dist * (1.0 + abs(sin(angle * 6.0 + u_time * 2.0)) * (0.3 + u_mid * 0.4));
    
    float flareNoise = snoise(vec3(p * (7.0 - u_bass * 2.5), u_time * 1.8));
    float corePlasma = exp(-starDist * (4.2 - u_bass * 2.2)) * (1.2 + u_bass * 2.0);
    corePlasma += max(0.0, flareNoise) * exp(-dist * 3.0) * (0.6 + u_treb * 1.5);

    vec3 flameCore = mix(vec3(1.0, 0.25, 0.05), vec3(1.0, 0.85, 0.3), clamp(corePlasma * 0.6, 0.0, 1.0));
    flameCore += vec3(1.0, 0.98, 0.9) * pow(clamp(corePlasma * 0.75, 0.0, 1.0), 3.0);

    float lightningArc = snoise(vec3(p * (12.0 + u_treb * 10.0), u_time * 3.5));
    float spark = smoothstep(0.04, 0.0, abs(lightningArc)) * exp(-dist * 2.2) * (0.6 + u_treb * 1.8);
    vec3 sparkCol = vec3(0.7, 0.95, 1.0) * spark;

    vec3 composite = backgroundWorld + flameCore * corePlasma + sparkCol;
    vec3 mapped = composite / (composite + vec3(0.9));
    mapped = pow(mapped, vec3(1.2));
    gl_FragColor = vec4(mapped, 1.0);
  }
  // PRESET 3: HYPER TUBE
  else if (u_mode == 2) {
    float yawRoll = sin(u_time * 0.5) * (0.22 + u_bass * 0.28);
    vec2 camP = p * rot(yawRoll);

    float rSafe = max(length(camP), 0.012);
    float zDepth = (1.0 / rSafe) + u_time * (1.8 + u_bass * 1.6);
    float baseAngle = atan(camP.y, camP.x);

    float corkscrew = sin(zDepth * 0.22 + u_time * 0.7) * (1.2 + u_mid * 0.8) + u_time * 0.35;
    float th = baseAngle + corkscrew;

    float folds = 6.0;
    float foldedTh = abs(mod(th + 3.14159 / folds, 6.28318 / folds) - 3.14159 / folds);

    float liquid1 = sin(foldedTh * 8.0 + zDepth * 3.2);
    float liquid2 = cos(zDepth * 4.8 - u_time * 2.4);
    float fluidNoise = snoise(vec3(vec2(foldedTh * 4.0, zDepth * 0.5), u_time * 0.5));
    
    float wallRibs = abs(liquid1 + liquid2 * 0.75 + fluidNoise * 1.2) * (0.42 + u_bass * 0.65);
    wallRibs += sin(zDepth * 16.0) * (0.15 + u_treb * 0.35);

    float colorCoord = zDepth * 0.12 + wallRibs * 0.24;
    vec3 tubeColor = psychedelicPalette(colorCoord, zDepth);

    float ridgeHighlights = pow(clamp(wallRibs * 0.7, 0.0, 1.0), 3.0) * (1.0 + u_treb * 1.6);
    tubeColor += vec3(0.9, 0.95, 1.0) * ridgeHighlights * 0.8;

    float horizonGlow = exp(-rSafe * 4.5);
    vec3 coreColor = vec3(1.0, 0.88, 0.25) * horizonGlow * (1.4 + u_bass * 1.8);

    float edgeFog = smoothstep(0.0, 0.85, rSafe);
    vec3 composite = tubeColor * edgeFog + coreColor;

    vec3 mapped = composite / (composite + vec3(0.8));
    mapped = pow(mapped, vec3(1.18));
    gl_FragColor = vec4(mapped, 1.0);
  }
  // PRESET 4: MENGER TESSERACT
  else {
    float rotY = u_time * 0.32 + sin(u_time * 0.35) * 0.28;
    float rotX = sin(u_time * 0.25) * 0.42 + cos(u_time * 0.15) * 0.18;
    float rotZ = cos(u_time * 0.20) * 0.24;

    vec3 ro = vec3(0.0, 0.0, -3.9);
    vec3 rd = normalize(vec3(p, 1.8));

    ro.xz *= rot(rotY); rd.xz *= rot(rotY);
    ro.yz *= rot(rotX); rd.yz *= rot(rotX);
    ro.xy *= rot(rotZ); rd.xy *= rot(rotZ);

    float t = 0.0;
    vec3 col = vec3(0.008, 0.006, 0.015);
    float glow = 0.0;
    float hitEdge = 0.0;
    float hitActivity = 0.0;

    for (int i = 0; i < 54; i++) {
      vec3 pos = ro + rd * t;
      float edgeVal = 0.0;
      float activity = 0.0;
      float d = mengerPrismSDF(pos, edgeVal, activity);

      if (d < 0.003) {
        hitEdge = edgeVal;
        hitActivity = activity;

        vec3 darkObsidian = vec3(0.02, 0.02, 0.035);
        vec3 neonCyan    = vec3(0.0, 0.95, 1.0);
        vec3 neonMagenta = vec3(1.0, 0.05, 0.55);
        vec3 attackGold  = vec3(1.0, 0.88, 0.18);
        vec3 attackWhite = vec3(1.0, 0.98, 0.95);

        vec3 edgePalette = mix(neonCyan, neonMagenta, sin(pos.y * 3.5 + u_time * 2.0) * 0.5 + 0.5);

        if (hitActivity > 0.01) {
          edgePalette = mix(edgePalette, attackGold, clamp(hitActivity * 1.5, 0.0, 1.0));
          edgePalette = mix(edgePalette, attackWhite, smoothstep(0.65, 1.2, hitActivity));
        }

        float edgeBoost = pow(clamp(hitEdge * 0.72, 0.0, 1.0), 2.0) * (1.5 + u_treb * 3.0);
        col = darkObsidian + edgePalette * edgeBoost;

        float corePulse = exp(-length(pos) * 2.0) * (u_bass * 1.7);
        col += vec3(0.0, 0.75, 0.95) * corePulse;
        break;
      }

      glow += (0.015 / (abs(d) + 0.015)) * (0.16 + u_bass * 0.45);
      t += max(d * 0.65, 0.022);
      if (t > 7.5) break;
    }

    vec3 auraFog = mix(vec3(0.04, 0.01, 0.03), vec3(0.01, 0.04, 0.12), u_bass);
    col += auraFog * (glow * 0.02);

    vec3 mapped = col / (col + vec3(0.7));
    mapped = pow(mapped, vec3(1.25));
    gl_FragColor = vec4(mapped, 1.0);
  }
}
`;

export const GLSLShaders: React.FC<GLSLShadersProps> = ({ analyserRef, mode }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false });
    if (!gl) return;

    const compileShader = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };

    const vert = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const frag = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    if (!vert || !frag) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uBass = gl.getUniformLocation(prog, 'u_bass');
    const uMid = gl.getUniformLocation(prog, 'u_mid');
    const uTreb = gl.getUniformLocation(prog, 'u_treb');
    const uModeLoc = gl.getUniformLocation(prog, 'u_mode');
    const uPrevFrame = gl.getUniformLocation(prog, 'u_prev_frame');

    let fboWidth = 0;
    let fboHeight = 0;
    let fbos: WebGLFramebuffer[] = [];
    let textures: WebGLTexture[] = [];
    let currentFboIndex = 0;

    const initFramebuffers = (w: number, h: number) => {
      fbos.forEach((f) => gl.deleteFramebuffer(f));
      textures.forEach((t) => gl.deleteTexture(t));
      fbos = [];
      textures = [];

      fboWidth = w;
      fboHeight = h;

      for (let i = 0; i < 2; i++) {
        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        const fbo = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

        fbos.push(fbo);
        textures.push(tex);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    let animId: number;
    let t = 0;
    const dataArray = new Uint8Array(256);

    const render = () => {
      const w = (canvas.width = canvas.parentElement?.clientWidth || 520);
      const h = (canvas.height = canvas.parentElement?.clientHeight || 150);

      if (w !== fboWidth || h !== fboHeight) {
        initFramebuffers(w, h);
      }

      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(dataArray);
      }

      const bass = ((dataArray[2] || 0) + (dataArray[4] || 0) + (dataArray[6] || 0)) / (3 * 255);
      const mid = ((dataArray[12] || 0) + (dataArray[18] || 0) + (dataArray[24] || 0)) / (3 * 255);
      const treb = ((dataArray[32] || 0) + (dataArray[40] || 0) + (dataArray[48] || 0)) / (3 * 255);

      t += 0.018;

      gl.useProgram(prog);
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uBass, bass);
      gl.uniform1f(uMid, mid);
      gl.uniform1f(uTreb, treb);

      const shaderModeId =
        mode === 'ASTRAL_WARP' ? 0 : mode === 'SOLAR_VORTEX' ? 1 : mode === 'HYPER_TUBE' ? 2 : 3;
      gl.uniform1i(uModeLoc, shaderModeId);

      const readTexture = textures[currentFboIndex];
      const writeFbo = fbos[1 - currentFboIndex];

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, readTexture);
      gl.uniform1i(uPrevFrame, 0);

      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
      gl.viewport(0, 0, w, h);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      currentFboIndex = 1 - currentFboIndex;
      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      fbos.forEach((f) => gl.deleteFramebuffer(f));
      textures.forEach((t) => gl.deleteTexture(t));
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    };
  }, [mode, analyserRef]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
};