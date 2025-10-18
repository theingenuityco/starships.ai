'use client'

import { BlendFunction, Effect } from 'postprocessing'

// Minimal radial warp + brightness bump (postprocessing Effect)
const fragmentShader = /* glsl */ `
  uniform float uProgress; // 0..1
  uniform float uStrength; // 0..1
  uniform float uTime;

  void mainUv(inout vec2 uv) {
    float r = distance(uv, vec2(0.5));
    float ring = smoothstep(0.02, 0.0, abs(r - uProgress));
    float distort = uStrength * ring * 0.15;
    vec2 dir = normalize(uv - vec2(0.5));
    uv += dir * distort;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float r = distance(uv, vec2(0.5));
    float ring = smoothstep(0.02, 0.0, abs(r - uProgress));
    float boost = ring * (0.35 * uStrength);
    vec3 col = inputColor.rgb + boost;
    outputColor = vec4(col, inputColor.a);
  }
`

export class WarpRippleEffect extends Effect {
  constructor({ blendFunction = BlendFunction.SCREEN } = {}) {
    super('WarpRippleEffect', fragmentShader, {
      blendFunction,
      uniforms: new Map([
        ['uProgress', { value: 0 }],
        ['uStrength', { value: 1 }],
        ['uTime', { value: 0 }],
      ]),
    })
  }
  set progress(v: number) {
    ;(this as any).uniforms.get('uProgress').value = v
  }
  set strength(v: number) {
    ;(this as any).uniforms.get('uStrength').value = v
  }
  set time(v: number) {
    ;(this as any).uniforms.get('uTime').value = v
  }
}

export function createWarpRippleEffect(): WarpRippleEffect {
  return new WarpRippleEffect()
}

export default WarpRippleEffect
