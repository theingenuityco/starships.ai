'use client';

import { useEffect, useRef } from 'react';

const VERT = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision mediump float;

uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uMouse;
uniform float uScroll;

out vec4 fragColor;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i + vec2(0.0, 0.0)), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 5; i++) {
    sum += amp * valueNoise(p * freq);
    freq *= 2.0;
    amp *= 0.5;
  }
  return sum;
}

// Ridged noise — produces sharp filamentary ridges instead of smooth blobs.
// Each octave is pre-weighted by the previous to enhance filament structure
// (musgrave-style multifractal).
float ridgedFbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.55;
  float freq = 1.0;
  float weight = 1.0;
  for (int i = 0; i < 6; i++) {
    float n = valueNoise(p * freq);
    n = 1.0 - abs(2.0 * n - 1.0);
    n *= n;
    n *= weight;
    weight = clamp(n * 2.5, 0.0, 1.0);
    sum += amp * n;
    freq *= 2.07;
    amp *= 0.5;
  }
  return sum;
}

// Star field with per-star variation in brightness, size, color, twinkle, and bloom.
// Returns a pre-tinted color so different stellar types add their own hue.
//
// Per-star randomization:
//   - Brightness: exponential distribution (pow), so most stars are dim, a few are bright
//   - Size: scales with brightness, with extra hash-driven variation (0.75x–1.3x)
//   - Falloff: sharp inner core (visible pixel) + soft bloom halo (1/(1+d²))
//   - Color: stellar-type palette (blue/white/yellow/amber/red), distributed roughly
//     like real stellar populations
//   - Twinkle: each star has its own phase AND rate; bright stars twinkle less
vec3 starsLayer(vec2 uv, float t, float threshold) {
  vec2 g = floor(uv);
  vec2 f = fract(uv) - 0.5;
  float h = hash12(g);
  if (h < threshold) return vec3(0.0);

  vec2 starPos = vec2(hash12(g + 17.0), hash12(g + 31.0)) - 0.5;
  vec2 toCenter = f - starPos;
  float d = length(toCenter);

  // Brightness — exponential-ish curve: many faint, few very bright (softer than 2.5
  // so newly-added dim stars at lower thresholds still register visually)
  float brightHash = (h - threshold) / (1.0 - threshold);
  float brightness = pow(brightHash, 2.0);

  // Size correlates with brightness, plus per-star hash variation
  float sizeHash = hash12(g + 53.0);
  float size = mix(0.008, 0.04, brightness) * mix(0.75, 1.3, sizeHash);

  // Sharp pixel-like core + soft bloom halo (1/(1+kd²) for gaussian-ish falloff)
  float core = pow(smoothstep(size, 0.0, d), 1.5);
  float halo = 1.0 / (1.0 + d * d * 800.0);
  float intensity = (core + halo * 0.4) * brightness;

  // Twinkle — varied phase AND rate per star. Bright stars twinkle less (stable).
  float twinkle = 0.6 + 0.4 * sin(t * (0.5 + sizeHash * 0.9) + h * 6.2831);
  intensity *= mix(twinkle, 1.0, brightness * 0.5);

  // Stellar-type color from a fresh hash. Distribution roughly mirrors real stars.
  float colorHash = hash12(g + 71.0);
  vec3 color;
  if (colorHash < 0.18)      color = vec3(0.65, 0.82, 1.00); // blue (O/B)
  else if (colorHash < 0.50) color = vec3(0.98, 0.98, 1.00); // white (A/F)
  else if (colorHash < 0.78) color = vec3(1.00, 0.96, 0.85); // pale yellow (G)
  else if (colorHash < 0.93) color = vec3(1.00, 0.80, 0.58); // amber (K)
  else                       color = vec3(1.00, 0.62, 0.45); // red (M)

  return color * intensity;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  vec2 p = (gl_FragCoord.xy * 2.0 - uResolution.xy) / uResolution.y;
  // Slight horizontal stretch — real nebulae often have galactic-plane flow
  p.y *= 1.15;

  vec2 mouseOffset = uMouse * 0.032;
  float scrollY = uScroll * 0.2;

  // --- Plumes are split across 4 depth tiers, each with its own parallax response.
  // Mouse multipliers fan out from 0.05 (deep wash, far) to 0.85 (amber cores, near)
  // so foreground gas shifts ~17x more than background — producing the depth illusion.
  // Each layer also uses an independent warp field whose shape evolves in time, so
  // plume curves morph instead of just translating across the screen.

  // Layer 1 — Magenta plume (mid-far)
  vec2 qM = p * 0.55 + vec2(uTime * 0.0026, uTime * 0.0010 + scrollY) - mouseOffset * 0.18;
  vec2 warpM = vec2(
    fbm(qM + vec2(1.7, 9.2 + uTime * 0.012)),
    fbm(qM + vec2(8.3 + uTime * 0.010, 2.8))
  ) * 2.8;
  float plumeM = pow(ridgedFbm(qM + warpM) * 1.25, 1.9);

  // Layer 2 — Teal plume (mid-near, ~3x more parallax than magenta)
  vec2 qT = p * 0.42 + vec2(-uTime * 0.0024, uTime * 0.0017 + scrollY * 0.9) - mouseOffset * 0.50;
  vec2 warpT = vec2(
    fbm(qT + vec2(-2.3, 4.1 + uTime * 0.013)),
    fbm(qT + vec2(6.7 + uTime * 0.011, -1.9))
  ) * 2.5;
  float plumeT = pow(ridgedFbm(qT + warpT + vec2(5.0, 0.0)) * 1.15, 1.8);

  // Layer 3 — Amber hot cores (foreground, own translation + heavy parallax, but shares
  // warpM so structure still echoes the magenta cloud body)
  vec2 qA = p * 0.52 + vec2(uTime * 0.0022, uTime * 0.0008) - mouseOffset * 0.85;
  float plumeA = pow(ridgedFbm(qA + 1.3 * warpM + vec2(-3.4, 7.9)), 3.5);

  // Layer 0 — Deep violet wash (farthest, near-zero parallax response)
  float deep = smoothstep(
    0.3, 0.92,
    fbm(p * 0.18 + vec2(uTime * 0.0014, uTime * 0.0010) - mouseOffset * 0.05)
  );

  // --- Dust lanes — low-frequency dark filaments that cut through the gas ---
  float dust = fbm(p * 0.55 + warpM * 0.25 + vec2(uTime * 0.0015, 0.0));
  float dustMask = smoothstep(0.32, 0.62, dust);

  // --- Nebula footprint — a rough diagonal band with flares breaking outward.
  // Centerline runs corner to corner ("\" diagonal): angle = atan(height/width) so
  // it tracks the actual screen diagonal at any aspect ratio.
  float aspect = uResolution.x / uResolution.y;
  float bandAngle = -atan(1.0 / max(aspect, 0.5));
  mat2 bandRot = mat2(cos(bandAngle), -sin(bandAngle), sin(bandAngle), cos(bandAngle));
  vec2 bandUv = bandRot * p;  // through screen center, upper-left to lower-right corner

  // Centerline distortion — three octaves with strong amplitudes so the band actually
  // bows off the geometric diagonal. Time drives a slice through the noise field's Y
  // axis so the curve SHAPE morphs (not just translates) at a rate visible over ~10s.
  float centerXL = fbm(vec2(bandUv.x * 0.20 + 7.3, uTime * 0.022));
  float centerLo = fbm(vec2(bandUv.x * 0.55, uTime * 0.032 + 3.7));
  float centerHi = fbm(vec2(bandUv.x * 1.9 + 11.0, uTime * 0.045));
  float centerDisplace = (centerXL - 0.5) * 3.6
                       + (centerLo - 0.5) * 1.10
                       + (centerHi - 0.5) * 0.35;
  float lineDist = abs(bandUv.y + centerDisplace);

  // Thickness varies along the band length AND morphs in time — bulges grow & contract.
  float thickLo = fbm(vec2(bandUv.x * 0.5, uTime * 0.026 + 5.1));
  float thickHi = fbm(vec2(bandUv.x * 1.6 + 17.0, uTime * 0.038 + 9.3));
  float thickness = 0.28 + 0.22 * thickLo + 0.10 * (thickHi - 0.5);

  // Main band coverage
  float bandCore = smoothstep(thickness, 0.0, lineDist);

  // FLARES — sparse wispy tendrils that curve through space. The noise field is
  // domain-warped before sampling so filaments swirl rather than run in straight
  // perpendicular streaks. Both the warp itself and the ridged sampling evolve in
  // time, so individual flares grow, fade, and reshape rather than just sliding.
  vec2 flareCoord = vec2(bandUv.x * 2.0, (bandUv.y - centerDisplace) * 1.4);
  vec2 flareWarp = vec2(
    fbm(bandUv * 0.65 + vec2(5.3, 1.2 + uTime * 0.035)),
    fbm(bandUv * 0.65 + vec2(2.1 + uTime * 0.030, 8.7))
  ) * 2.0;
  float flareNoise = ridgedFbm(flareCoord + flareWarp + vec2(uTime * 0.006, uTime * 0.022));
  float flareFalloff = exp(-abs(bandUv.y + centerDisplace) * 2.5);
  float flares = pow(flareNoise, 4.5) * flareFalloff * 1.4;

  // Brightness profile along the band: dim in the middle (behind text), brightest near
  // the corners, then fades past the corners. Uses pow() on the ramp so the dim center
  // covers a wider visual area than a linear interpolation would.
  float diagHalfLen = sqrt(aspect * aspect + 1.0);
  float centerRamp = pow(smoothstep(0.0, diagHalfLen * 0.75, abs(bandUv.x)), 1.8);
  float centerDim = mix(0.08, 1.0, centerRamp);
  float cornerFade = 1.0 - smoothstep(diagHalfLen * 1.05, diagHalfLen * 1.25, abs(bandUv.x));
  float endTaper = centerDim * cornerFade;
  float footprint = max(bandCore, flares) * endTaper;

  // --- Stars: three layers at increasing densities for the deep-field look.
  // Dust: tiniest pinpoints, very dense → fills the void with the JWST-style faint background
  // BG:   small stars, dense, mostly dim
  // FG:   larger sparkles, sparser, brighter (foreground depth, with mouse parallax)
  // Each star carries its own stellar-type color.
  vec3 starsDust = starsLayer(p * 78.0 + vec2(0.0, scrollY * 10.0), uTime, 0.72);
  vec3 starsBg   = starsLayer(p * 38.0 + vec2(0.0, scrollY * 8.0),  uTime, 0.80);
  vec3 starsFg   = starsLayer(p * 11.0 + mouseOffset * 10.0 + vec2(0.0, scrollY * 4.0), uTime, 0.93);

  vec3 bg       = vec3(0.020, 0.024, 0.034);
  vec3 cMagenta = vec3(0.95, 0.28, 0.70);
  vec3 cTeal    = vec3(0.22, 0.78, 0.88);
  vec3 cAmber   = vec3(1.00, 0.60, 0.30);
  vec3 cDeep    = vec3(0.22, 0.18, 0.50);

  // Build gas contribution separately so we can mask it cleanly
  vec3 gas = vec3(0.0);
  gas += cDeep    * deep   * 0.22;
  gas += cMagenta * plumeM * 0.95;
  gas += cTeal    * plumeT * 0.75;
  gas += cAmber   * plumeA * 0.85;
  // Carve dust lanes within the gas only (doesn't darken the void)
  gas *= 0.45 + 0.55 * dustMask;
  // Confine to footprint — this is what makes negative space dominate
  gas *= footprint;

  vec3 col = bg + gas;

  // Stars on top, present across the whole frame. Per-star colors come from starsLayer.
  col += starsDust * 0.55;
  col += starsBg   * 0.85;
  col += starsFg   * 1.55;

  // Soft outer vignette to ensure edges go fully dark
  vec2 vigUv = uv - vec2(0.5, 0.7);
  vigUv.x *= 0.75;
  float vig = smoothstep(0.95, 0.2, length(vigUv));
  col = mix(bg, col, vig);

  // Gentle tonemap so dense plume cores don't blow out
  col = col / (1.0 + col * 0.5);

  fragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('HeroBackground shader compile failed:', gl.getShaderInfoLog(shader));
    }
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

type Props = {
  className?: string;
};

export function HeroBackground({ className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cores = navigator.hardwareConcurrency ?? 4;
    if (window.innerWidth < 640 && cores < 4) return;

    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false });
    } catch {
      return;
    }
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('HeroBackground link failed:', gl.getProgramInfoLog(program));
      }
      return;
    }
    gl.useProgram(program);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    const aPos = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(program, 'uTime');
    const uResolution = gl.getUniformLocation(program, 'uResolution');
    const uMouse = gl.getUniformLocation(program, 'uMouse');
    const uScroll = gl.getUniformLocation(program, 'uScroll');

    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;
    let scroll = 0;
    let targetScroll = 0;
    let visible = true;
    let firstFrameDrawn = false;
    let raf = 0;
    const startTime = performance.now();

    const resize = () => {
      if (!gl) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const scale = 0.75;
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr * scale));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      targetMouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      targetMouseY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    };

    const onScroll = () => {
      targetScroll = window.scrollY / Math.max(1, window.innerHeight);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0 }
    );
    observer.observe(canvas);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!gl) return;
      if (!visible && firstFrameDrawn) return;

      resize();

      if (!reduced) {
        mouseX += (targetMouseX - mouseX) * 0.04;
        mouseY += (targetMouseY - mouseY) * 0.04;
        scroll += (targetScroll - scroll) * 0.08;
      }

      const t = reduced ? 1.5 : (performance.now() - startTime) / 1000;
      gl.uniform1f(uTime, t);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform2f(uMouse, mouseX, mouseY);
      gl.uniform1f(uScroll, scroll);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (!firstFrameDrawn) {
        firstFrameDrawn = true;
        canvas.style.opacity = '1';
        if (reduced) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      }
    };

    window.addEventListener('resize', resize);
    if (!reduced) {
      window.addEventListener('mousemove', onMouseMove, { passive: true });
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    resize();
    tick();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('scroll', onScroll);
      observer.disconnect();
      if (gl) {
        gl.deleteProgram(program);
        gl.deleteBuffer(buf);
        if (vao) gl.deleteVertexArray(vao);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ opacity: 0, transition: 'opacity 600ms ease-out', width: '100%', height: '100%' }}
      aria-hidden
    />
  );
}
