import * as THREE from "three";
import { GRADE, PALETTE } from "@/viewer/grade.ts";

let installed = false;

/**
 * One grade for every material: ACES, then the shared saturation, contrast,
 * blue-grey shadow lift, warm highlight, and a small highlight bloom.
 * Applied in the forward pass so time-of-day changes do not swap post profiles.
 */
export function installViceGrade(): void {
  if (installed) return;
  const needle = "vec3 CustomToneMapping( vec3 color ) { return color; }";
  const shadow = new THREE.Color(PALETTE.shadow);
  const peach = new THREE.Color(PALETTE.peach);
  const body = `
    vec3 CustomToneMapping( vec3 color ) {
      // CityGrade — values are copied from GRADE / PALETTE. Do not branch on time of day.
      float pre = dot(color, vec3(0.2126, 0.7152, 0.0722)) * toneMappingExposure;
      float hot = max(pre - ${GRADE.bloom.threshold.toFixed(3)}, 0.0);
      vec3 c = color + color * hot * ${GRADE.bloom.strength.toFixed(3)} * ${GRADE.bloom.radius.toFixed(3)};
      c = ACESFilmicToneMapping(c);
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(luma), c, ${GRADE.saturation.toFixed(3)});
      c = (c - 0.18) * ${GRADE.contrast.toFixed(3)} + 0.18;
      float sh = smoothstep(0.28, 0.0, luma);
      c += vec3(${shadow.r.toFixed(4)}, ${shadow.g.toFixed(4)}, ${shadow.b.toFixed(4)}) * ${GRADE.shadowLift.toFixed(3)} * sh;
      float hi = smoothstep(0.62, 1.05, luma);
      c = mix(c, c * vec3(${peach.r.toFixed(4)}, ${peach.g.toFixed(4)}, ${peach.b.toFixed(4)}), hi * ${GRADE.highlightMix.toFixed(3)});
      return max(c, vec3(0.0));
    }
  `;
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
  if (!chunk.includes(needle)) {
    installed = chunk.includes("CityGrade") || chunk.includes("ViceCityGrade");
    if (!installed) throw new Error("City grade could not find CustomToneMapping");
    return;
  }
  THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(needle, body);
  installed = true;
}
