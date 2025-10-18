import * as THREE from 'three'
import type { IUniform } from 'three'

// Simple fbm noise helpers in GLSL
const fragmentShader = /* glsl */ `
  precision highp float;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uChromatic;
  uniform float uIntensity; // 0..1
  uniform float uWarpProgress; // 0..1

  // Hash/Noise utilities
  float hash(vec2 p){return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123);} 
  float noise(in vec2 p){
    vec2 i = floor(p); vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0,0.0));
    float c = hash(i + vec2(0.0,1.0));
    float d = hash(i + vec2(1.0,1.0));
    vec2 u = f*f*(3.0-2.0*f);
    return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
  }
  float fbm(vec2 p){
    float v = 0.0; float a = 0.5; vec2 shift = vec2(100.0);
    for (int i=0;i<5;i++){ v += a*noise(p); p = p*2.0 + shift; a *= 0.5; }
    return v;
  }

  void main(){
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec2 p = (uv - 0.5) * vec2(uResolution.x/uResolution.y, 1.0);

    // pointer attraction
    vec2 m = (uPointer - 0.5) * vec2(uResolution.x/uResolution.y, 1.0);
    float dist = length(p - m);
    float attract = smoothstep(0.8, 0.0, dist);

    // lattice via fbm bands
    float t = uTime * mix(0.05, 0.12, uIntensity);
    float n = fbm(p*3.0 + t);
    float bands = smoothstep(0.45, 0.55, abs(fract(n*3.0) - 0.5));

    // deep-space palette with primary accent
    vec3 deep = vec3(0.03,0.06,0.10);
    vec3 glow = vec3(0.20,0.45,0.90); // primary-ish
    vec3 col = mix(deep, glow, bands * (0.6 + 0.4*attract));

    // subtle vignette
    float vig = smoothstep(0.95, 0.4, length(uv-0.5));
    col *= vig;

    // chromatic aberration on interaction
    float ca = uChromatic * 0.0025 * uIntensity;
    // Fake CA by shifting color channels by radial amount
    float angle = atan(p.y, p.x);
    vec2 dir = vec2(cos(angle), sin(angle));
    vec2 rUv = uv + dir * ca;
    vec2 gUv = uv;
    vec2 bUv = uv - dir * ca;
    // Sample fbm again cheaply for channels
    float r = fbm((rUv-0.5)*3.0 + t);
    float g = fbm((gUv-0.5)*3.0 + t);
    float b = fbm((bUv-0.5)*3.0 + t);
    vec3 caCol = mix(deep, glow, smoothstep(0.45, 0.55, abs(fract(vec3(r,g,b)*3.0)-0.5)));
    col = mix(col, caCol, uChromatic*0.5);

    // warp ripple (pronounced ring that sweeps outward)
    float rp = uWarpProgress; // 0..1
    float rNorm = length(uv - 0.5) / 0.7071; // 0..1 to corners
    float ring = smoothstep(0.02, 0.0, abs(rNorm - rp));
    float warpAmp = mix(0.0, 0.35, uIntensity);
    // brighten ring
    col += ring * warpAmp;

    gl_FragColor = vec4(col, 1.0);
  }
`

const vertexShader = /* glsl */ `
  void main(){
    gl_Position = vec4(position, 1.0);
  }
`

export type NeuralUniforms = { [key: string]: IUniform<any> } & {
  uResolution: IUniform<THREE.Vector2>
  uTime: IUniform<number>
  uPointer: IUniform<THREE.Vector2>
  uChromatic: IUniform<number>
  uIntensity: IUniform<number>
  uWarpProgress: IUniform<number>
}

export function createNeuralLatticeMaterial(): THREE.ShaderMaterial & { uniforms: NeuralUniforms } {
  const uniforms: NeuralUniforms = {
    uResolution: new THREE.Uniform(new THREE.Vector2(1920, 1080)),
    uTime: new THREE.Uniform(0),
    uPointer: new THREE.Uniform(new THREE.Vector2(0.5, 0.5)),
    uChromatic: new THREE.Uniform(0),
    uIntensity: new THREE.Uniform(1),
    uWarpProgress: new THREE.Uniform(0),
  }

  const mat = new THREE.ShaderMaterial({
    uniforms,
    fragmentShader,
    vertexShader,
    depthWrite: false,
    depthTest: false,
    transparent: false,
  }) as THREE.ShaderMaterial & { uniforms: NeuralUniforms }

  return mat
}
