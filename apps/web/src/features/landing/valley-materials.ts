import * as THREE from "three";

/**
 * Surface refinement for the pastel valley.
 *
 * The source GLB colours everything with flat vertex colours and one roughness
 * per material, which reads as plastic. These shader patches keep the palette
 * but add world-space variation so clay, stone, grass, timber, foliage and water
 * respond to light differently. Nothing here changes geometry or the asset files.
 */

export type SurfaceKind =
  | "terrain" | "meadow" | "foliage" | "timber" | "water" | "cascade" | "waterHighlight" | "streamHighlight"
  | "windowLight" | "character" | "fern" | "foam";

export type SharedUniforms = {
  uTime: { value: number };
  /** Where the two lake waterfalls hit the water (world space); rings spread from here. */
  uPlunge: { value: THREE.Vector3[] };
  /** Duck pond: centre x/z and calm radius. Ripples die down inside it. */
  uPond: { value: THREE.Vector3 };
  /** Live duck positions, for small wake rings. */
  uDucks: { value: THREE.Vector3[] };
};

/** Per-fern uniforms: base position + height (w) and the current lean offset in world units. */
export type FernUniforms = {
  uFernBase: { value: THREE.Vector4 };
  uPush: { value: THREE.Vector3 };
};

export function createSharedUniforms(plunge: readonly THREE.Vector3[], pond: THREE.Vector3, duckCount: number): SharedUniforms {
  return {
    uTime: { value: 0 },
    uPlunge: { value: plunge.map((v) => v.clone()) },
    uPond: { value: pond.clone() },
    uDucks: { value: Array.from({ length: duckCount }, () => new THREE.Vector3(0, -50, 0)) },
  };
}

const NOISE_GLSL = /* glsl */ `
float lkHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float lkNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(lkHash(i), lkHash(i + vec3(1, 0, 0)), f.x), mix(lkHash(i + vec3(0, 1, 0)), lkHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(lkHash(i + vec3(0, 0, 1)), lkHash(i + vec3(1, 0, 1)), f.x), mix(lkHash(i + vec3(0, 1, 1)), lkHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float lkFbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * lkNoise(p); p *= 2.03; a *= 0.5; }
  return v;
}
`;

const VERTEX_DECL = /* glsl */ `
varying vec3 vLkWorldPos;
varying vec3 vLkWorldNormal;
/* Streams: x = distance from the bank (0 at the edge, 1 mid-channel), y = flow time from the source (s). Baked in Blender. */
varying vec2 vLkFlow;
`;

const UNIFORM_DECL = /* glsl */ `
uniform float uTime;
uniform vec3 uPlunge[2];
uniform vec3 uPond;
uniform vec3 uDucks[3];
`;

const VERTEX_BODY = /* glsl */ `
vLkWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vLkWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
vLkFlow = uv;
`;

/** Tree crowns: a slow breeze (coherent per crown) plus a light leaf flutter; a couple of centimetres at most. */
const FOLIAGE_VERTEX = /* glsl */ `
{
  vec3 lkWp = (modelMatrix * vec4(transformed, 1.0)).xyz;
  float lkSway = sin(uTime * 1.1 + lkWp.x * 0.5 + lkWp.z * 0.4) * 0.016;
  float lkFlutter = sin(uTime * 3.7 + dot(lkWp, vec3(3.1, 2.3, 2.9))) * 0.005;
  vec3 lkOffset = vec3(lkSway + lkFlutter, 0.0, lkSway * 0.6 - lkFlutter);
  transformed += inverse(mat3(modelMatrix)) * lkOffset;
}
`;

/** Fern fronds: wind sway plus a scroll-driven lean, stronger towards the frond tips. */
const FERN_VERTEX = /* glsl */ `
{
  vec3 lkWp = (modelMatrix * vec4(transformed, 1.0)).xyz;
  float lkH = clamp((lkWp.y - uFernBase.y) / uFernBase.w, 0.0, 1.4);
  float lkBend = lkH * lkH;
  float lkReach = clamp(length(lkWp.xz - uFernBase.xz) / (uFernBase.w * 1.6), 0.0, 1.0);
  float lkGust = sin(uTime * 1.25 + lkWp.x * 1.7 + lkWp.z * 1.3) * 0.6 + sin(uTime * 2.9 + lkWp.x * 4.1 + lkWp.z * 2.3) * 0.22 * lkReach;
  vec3 lkSway = vec3(lkGust * 0.045, sin(uTime * 2.2 + lkWp.z * 3.0) * 0.012 * lkReach, lkGust * 0.03) * uFernBase.w * lkBend;
  float lkLean = lkBend * 0.6 + lkReach * lkH * 0.5;
  vec3 lkPush = uPush * lkLean;
  lkPush.y -= length(uPush.xz) * lkLean * 0.45;
  transformed += inverse(mat3(modelMatrix)) * (lkSway + lkPush);
}
`;

/** Lake ripples: rings spreading from both plunge pools and from each duck, quiet inside the duck pond. */
const RING_GLSL = /* glsl */ `
vec3 lkLakeRipple(vec3 p) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    vec2 d = p.xz - uPlunge[i].xz;
    float r = length(d);
    float w = sin(r * 13.0 - uTime * 2.4) * exp(-r * 1.9) * smoothstep(0.3, 0.8, r);
    acc.xz += d / max(r, 1e-3) * w;
    acc.y += max(w, 0.0);
  }
  for (int i = 0; i < 3; i++) {
    vec2 d = p.xz - uDucks[i].xz;
    float r = length(d);
    float w = sin(r * 34.0 - uTime * 4.2) * exp(-r * 5.5) * smoothstep(0.05, 0.13, r);
    acc.xz += d / max(r, 1e-3) * w * 0.7;
    acc.y += max(w, 0.0) * 0.5;
  }
  return acc;
}
`;

/** Albedo + roughness tweaks per surface, injected after vertex colours are applied. */
const SURFACE_GLSL: Record<SurfaceKind, string> = {
  terrain: /* glsl */ `
    // Three ground types from the baked vertex colour + slope: grass tops, bare soil (path, banks) and rock faces.
    // Vertex colour keeps the baked AO; every tweak below multiplies it, so crevices stay dark.
    vec3 base = diffuseColor.rgb;
    vec3 p = vLkWorldPos;
    float slope = 1.0 - clamp(vLkWorldNormal.y, 0.0, 1.0);
    float rockMask = smoothstep(0.3, 0.6, slope);
    float grassMask = smoothstep(0.015, 0.07, base.g - max(base.r, base.b)) * (1.0 - rockMask);
    float soilMask = (1.0 - rockMask) * (1.0 - grassMask);
    float lum = dot(base, vec3(0.299, 0.587, 0.114));
    float grain = lkFbm(p * 3.1);
    float speck = lkNoise(p * 23.0);
#ifdef LK_LITE
    float fine = 0.5;
#else
    float fine = lkNoise(p * 61.0);
#endif

    // Rock: warped sedimentary bands in cream, rosy clay and ochre, weathering streaks below ledges, moss on shelves.
    float warp = lkFbm(p * 0.65 + 11.0);
    float band = p.y * 3.4 + warp * 2.8;
    vec3 tone = mix(vec3(1.1, 1.0, 0.9), vec3(0.94, 0.84, 0.82), sin(band) * 0.5 + 0.5);
    tone = mix(tone, vec3(1.08, 0.94, 0.7), smoothstep(0.66, 0.95, sin(band * 2.6 + 1.3) * 0.5 + 0.5) * 0.8);
    float streak = smoothstep(0.45, 0.85, lkNoise(vec3(p.x * 6.0, p.y * 0.4, p.z * 6.0)));
    // Vertical joints (stretched along Y) in some places, as layered rock splits; masked so they stay sparse.
#ifdef LK_LITE
    float crack = 0.0;
#else
    float joint = 1.0 - smoothstep(0.0, 0.03, abs(lkNoise(vec3(p.x * 4.2, p.y * 0.7, p.z * 4.2) + warp * 0.4) - 0.5));
    float crack = joint * smoothstep(0.5, 0.7, lkNoise(p * 1.1 + 9.0));
#endif
    vec3 rock = base * tone * (0.88 + 0.24 * (grain - 0.5)) * (0.92 + 0.14 * speck) * (1.0 - 0.17 * streak) * (1.0 - 0.22 * crack);
    float shelf = smoothstep(0.62, 0.42, slope) * rockMask;
    float moss = smoothstep(0.52, 0.72, lkFbm(p * 1.7 + 3.0)) * max(shelf, 0.25 * rockMask * smoothstep(0.6, 0.8, warp));
    rock = mix(rock, vec3(0.3, 0.42, 0.17) * (0.65 + lum), moss * 0.75);

    // Grass: sunlit and cool patches, darker clumps, tiny blade speckle; a soil lip where the turf rolls over an edge.
    float patchN = lkFbm(p * 0.8 + 7.0);
    vec3 grass = base * mix(vec3(0.84, 1.0, 0.94), vec3(1.18, 1.08, 0.72), smoothstep(0.34, 0.74, patchN));
    grass *= 0.86 + 0.26 * (grain - 0.5) - 0.2 * smoothstep(0.6, 0.85, lkNoise(p * 7.5));
    // Painterly blade strokes: noise stretched along a slowly turning direction.
#ifdef LK_LITE
    float blade = 0.5;
#else
    float ang = 0.65 + (lkNoise(p * 0.5) - 0.5) * 0.7;
    vec2 dir = vec2(cos(ang), sin(ang));
    float blade = lkNoise(vec3(dot(p.xz, dir) * 3.0, dot(p.xz, vec2(-dir.y, dir.x)) * 42.0, p.y * 4.0));
#endif
    grass *= 0.94 + 0.11 * (blade - 0.5) + 0.08 * (speck - 0.5);
    grass *= vec3(1.02, 1.06, 0.9); // fresh spring green
    float lip = smoothstep(0.14, 0.3, slope) * (1.0 - rockMask);
    grass = mix(grass, vec3(0.36, 0.27, 0.16) * (0.6 + lum), lip * 0.55 * (0.6 + 0.4 * grain));

    // Soil (trail, sandy banks): pebbles, damp patches, fine grit.
    float pebble = smoothstep(0.74, 0.8, lkNoise(p * 14.0));
    float damp = smoothstep(0.55, 0.8, lkFbm(p * 1.3 + 5.0));
    vec3 soil = base * (0.92 + 0.14 * (grain - 0.5)) * (0.95 + 0.1 * (fine - 0.5));
    soil = mix(soil, soil * vec3(0.86, 0.84, 0.82), damp * 0.5);
    soil = mix(soil, base * vec3(1.15, 1.1, 1.03), pebble * 0.7);
#ifndef LK_LITE
    soil *= 1.0 - 0.18 * smoothstep(0.76, 0.82, lkNoise(p * 14.0 + 0.06));
#endif

    diffuseColor.rgb = rock * rockMask + grass * grassMask + soil * soilMask;
    // Wet band and a hint of algae where land meets the lake.
    float wet = 1.0 - smoothstep(0.0, 0.32, p.y);
    diffuseColor.rgb *= mix(1.0, 0.8, wet);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.86, 1.02, 0.94), wet * 0.6);
    lkRoughness = mix(mix(0.97, 0.9, soilMask), 0.82, rockMask) - 0.25 * wet;
  `,
  meadow: /* glsl */ `
    float clump = lkFbm(vLkWorldPos * 2.2);
    float blade = lkNoise(vLkWorldPos * 26.0);
    float patchM = lkFbm(vLkWorldPos * 0.8 + 7.0);
    diffuseColor.rgb *= 0.86 + 0.24 * (clump - 0.5) + 0.1 * (blade - 0.5);
    diffuseColor.rgb *= mix(vec3(0.88, 1.0, 0.95), vec3(1.14, 1.07, 0.78), smoothstep(0.34, 0.74, patchM));
    diffuseColor.rgb *= vec3(1.02, 1.06, 0.9);
    lkRoughness = 0.97;
  `,
  foliage: /* glsl */ `
    // Painted canopies: sunlit warm tops, cool shaded undersides, leaf clumps with darker pockets between them,
    // and a slightly different green for each crown. Multiplies the baked colour so its AO stays.
    vec3 p = vLkWorldPos;
    vec3 n = normalize(vLkWorldNormal);
    float lit = clamp(dot(n, normalize(vec3(-14.0, 22.0, 12.0))) * 0.5 + 0.5, 0.0, 1.0);
    float up = n.y * 0.5 + 0.5;
    float hue = lkNoise(p * 0.45 + 2.0);
    vec3 tint = mix(vec3(0.9, 1.0, 0.98), vec3(1.08, 1.04, 0.84), smoothstep(0.3, 0.7, hue));
    float clump = lkFbm(p * 4.2);
    float pocket = smoothstep(0.42, 0.24, clump);
    float leaf = lkNoise(p * 17.0);
    vec3 col = diffuseColor.rgb * tint;
    col *= mix(vec3(0.72, 0.84, 0.88), vec3(1.12, 1.08, 0.86), smoothstep(0.25, 0.85, lit * 0.6 + up * 0.4));
    // Pockets between clumps go cool and deep (not grey-brown), like shade inside a crown.
    col = mix(col, col * vec3(0.66, 0.8, 0.84), pocket * 0.55);
    col *= 0.93 + 0.14 * (leaf - 0.5) + 0.1 * (clump - 0.5);
    // Lower needles and leaves sit in the crown's own shade.
    col *= 0.88 + 0.12 * smoothstep(1.0, 6.5, p.y);
    diffuseColor.rgb = col;
    lkRoughness = 0.95;
  `,
  timber: /* glsl */ `
    // Grain runs along the longest axis of logs and planks: stretch noise along Y and horizontal X.
    float rings = lkFbm(vec3(vLkWorldPos.x * 3.0, vLkWorldPos.y * 34.0, vLkWorldPos.z * 3.0));
    float knots = smoothstep(0.72, 0.9, lkNoise(vLkWorldPos * 7.0));
    diffuseColor.rgb *= 0.86 + 0.24 * rings - 0.12 * knots;
    diffuseColor.rgb *= vec3(1.02, 0.99, 0.95);
    lkRoughness = 0.74 + 0.16 * rings;
  `,
  water: /* glsl */ `
    // Pastel sky-blue water: pull the baked turquoise towards a soft blue, keeping its light/dark variation.
    {
      float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.75, 0.95) * (l / 0.74), 0.8);
    }
    float depthTint = smoothstep(-0.7, 0.0, vLkWorldPos.y);
    float caustic = lkFbm(vec3(vLkWorldPos.xz * 1.6, uTime * 0.18));
    diffuseColor.rgb *= mix(0.78, 1.0, depthTint);
    diffuseColor.rgb += vec3(0.035, 0.05, 0.045) * smoothstep(0.55, 0.85, caustic);
    diffuseColor.rgb += vec3(0.022, 0.03, 0.028) * smoothstep(0.15, 0.9, lkLakeRipple(vLkWorldPos).y);
    lkRoughness = 0.16;
  `,
  cascade: /* glsl */ `
    // Streams and falls: streaks travel along the baked flow coordinates, so they follow every bend downhill.
    float steep = 1.0 - clamp(abs(vLkWorldNormal.y), 0.0, 1.0);
    {
      float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.8, 0.96) * (l / 0.74), 0.6);
    }
    float ph = vLkFlow.y - uTime * mix(1.0, 1.6, steep);
    float across = vLkFlow.x * 4.5 + lkNoise(vLkWorldPos * 0.9) * 1.6;
    float streak = lkFbm(vec3(across, ph * 2.3, 0.37));
    // Falling sheet: thin dark-teal gaps where the water thins, and veils that sway across.
    float gap = steep * (1.0 - smoothstep(0.28, 0.46, lkFbm(vec3(across * 1.7, ph * 1.2, 5.3))));
    float fine = lkNoise(vec3(across * 3.0, ph * 7.0, 1.9));
    float edge = 1.0 - smoothstep(0.0, 0.2, vLkFlow.x);
    float lip = 1.0 - smoothstep(0.0, 0.35, vLkFlow.y);
    float plunge = 1.0 - smoothstep(0.0, 0.5, vLkWorldPos.y);
    float foam = steep * smoothstep(0.5, 0.72, streak) * 0.8
      + edge * (0.2 + 0.5 * fine) * mix(0.3, 0.7, steep)
      + lip * (0.3 + 0.4 * fine)
      + plunge * (0.4 + 0.55 * fine)
      + (1.0 - steep) * smoothstep(0.6, 0.78, streak) * 0.28;
    foam = clamp(foam - gap * 0.55 * (1.0 - plunge), 0.0, 0.94);
    vec3 sheet = mix(diffuseColor.rgb * (0.9 + 0.14 * streak), diffuseColor.rgb * vec3(0.72, 0.86, 0.86), gap * 0.6);
    diffuseColor.rgb = mix(sheet, vec3(0.94, 0.98, 0.97), foam);
    // Ragged, thinning sides on the falling sheet instead of a cut ribbon edge (alpha-to-coverage, no sorting).
    float rag = lkNoise(vec3(vLkFlow.x * 3.0, ph * 4.0, 7.7));
    diffuseColor.a *= mix(1.0, smoothstep(0.03, 0.08, vLkFlow.x + (rag - 0.5) * 0.18), steep * (1.0 - plunge));
    lkRoughness = mix(0.12, 0.62, foam);
  `,
  waterHighlight: /* glsl */ `
    float shimmer = lkNoise(vec3(vLkWorldPos.xz * 2.5, uTime * 0.7));
    diffuseColor.a *= 0.55 + 0.4 * shimmer;
    {
      // The baked rings around the falls read as a printed target; break them into wobbling arcs and send a
      // brightness pulse outward so they look like spreading ripples.
      vec2 d0 = vLkWorldPos.xz - uPlunge[0].xz;
      vec2 d1 = vLkWorldPos.xz - uPlunge[1].xz;
      vec2 d = dot(d0, d0) < dot(d1, d1) ? d0 : d1;
      float r = length(d);
      float near = 1.0 - smoothstep(1.2, 3.6, r);
      float ang = atan(d.y, d.x);
      float arcs = smoothstep(0.38, 0.62, lkNoise(vec3(cos(ang) * 2.2 + r * 0.6, sin(ang) * 2.2, r * 1.3 - uTime * 0.35)));
      float pulse = 0.25 + 0.75 * smoothstep(-0.2, 0.9, sin(r * 4.2 - uTime * 2.0));
      diffuseColor.a *= mix(1.0, arcs * pulse * 0.75, near);
    }
    lkRoughness = 0.5;
  `,
  streamHighlight: /* glsl */ `
    float ph = vLkFlow.y - uTime;
    float m = lkNoise(vec3(vLkFlow.x * 5.0, ph * 2.6, 4.2));
    diffuseColor.a *= 0.2 + 0.8 * smoothstep(0.42, 0.74, m);
    // The faceted foam slabs baked at the lake line are replaced by the soft plunge-foam discs.
    diffuseColor.a *= smoothstep(0.12, 0.4, vLkWorldPos.y);
    lkRoughness = 0.45;
  `,
  foam: /* glsl */ `
    // Churning plunge foam: dense at the centre, breaking into drifting flecks at the rim.
    float r = length(vLkFlow - 0.5) * 2.0;
    // Foam drifts outward from the impact and fades smoothly; no hard cut-out edge.
    float churn = lkFbm(vec3(vLkWorldPos.xz * 4.0 - (vLkFlow - 0.5) * uTime * 0.9, uTime * 0.6));
    float fine = lkNoise(vec3(vLkWorldPos.xz * 16.0, uTime * 1.1));
    float fleck = smoothstep(0.62, 0.85, lkNoise(vec3(vLkWorldPos.xz * 26.0 - r * 4.0, uTime * 1.4)));
    float core = 1.0 - smoothstep(0.25, 0.8, r);
    float body = (1.0 - smoothstep(0.35, 1.0, r)) * smoothstep(0.25, 0.6, churn + core * 0.35);
    float rim = (1.0 - smoothstep(0.5, 1.0, r)) * fleck * 0.45;
    diffuseColor.rgb = vec3(0.95, 0.985, 0.975) * (0.95 + 0.06 * fine);
    diffuseColor.a = clamp(body * (0.7 + 0.3 * fine) + core * 0.5 * (0.6 + 0.4 * churn) + rim, 0.0, 0.95);
    lkRoughness = 0.7;
  `,
  fern: /* glsl */ `
    float tint = lkFbm(vLkWorldPos * 2.6);
    diffuseColor.rgb *= 0.9 + 0.18 * (tint - 0.5);
    lkRoughness = 0.86;
  `,
  windowLight: /* glsl */ `
    lkRoughness = 0.5;
  `,
  character: /* glsl */ `
    float fuzz = lkNoise(vLkWorldPos * 140.0);
    diffuseColor.rgb *= 0.97 + 0.06 * fuzz;
    lkRoughness = 0.9;
  `,
};

/** Ripples in view space for water, so reflections break up instead of mirroring flat. */
const NORMAL_GLSL: Partial<Record<SurfaceKind, string>> = {
  terrain: /* glsl */ `
#ifndef LK_LITE
    {
      // Procedural bump: chiselled rock faces and a soft lumpy turf instead of flat facets. Fades with distance
      // so far slopes do not shimmer.
      float slope = 1.0 - clamp(vLkWorldNormal.y, 0.0, 1.0);
      float rk = smoothstep(0.3, 0.6, slope);
      float fade = 1.0 - smoothstep(9.0, 32.0, length(vViewPosition));
      vec3 q = vLkWorldPos * mix(3.2, 2.4, rk);
      const float e = 0.07;
      float n0 = lkNoise(q) + 0.45 * lkNoise(q * 2.7);
      vec3 g = vec3(
        lkNoise(q + vec3(e, 0.0, 0.0)) + 0.45 * lkNoise((q + vec3(e, 0.0, 0.0)) * 2.7),
        lkNoise(q + vec3(0.0, e, 0.0)) + 0.45 * lkNoise((q + vec3(0.0, e, 0.0)) * 2.7),
        lkNoise(q + vec3(0.0, 0.0, e)) + 0.45 * lkNoise((q + vec3(0.0, 0.0, e)) * 2.7)) - n0;
      g /= e;
      g -= vLkWorldNormal * dot(g, vLkWorldNormal);
      vec3 bump = -g * mix(0.05, 0.2, rk) * fade;
      normal = normalize(normal + (viewMatrix * vec4(bump, 0.0)).xyz);
    }
#endif
  `,
  water: /* glsl */ `
    {
      vec2 rp = vLkWorldPos.xz * 2.4;
      float n1 = lkNoise(vec3(rp, uTime * 0.45)) - 0.5;
      float n2 = lkNoise(vec3(rp.yx + 7.3, uTime * 0.38)) - 0.5;
      // The duck pond stays glassy; the open lake keeps its breeze.
      float calm = smoothstep(uPond.z * 0.6, uPond.z * 1.6, distance(vLkWorldPos.xz, uPond.xy));
      vec3 ripple = vec3(n1, 0.0, n2) * mix(0.05, 0.22, calm);
      ripple.xz += lkLakeRipple(vLkWorldPos).xz * 0.11;
      normal = normalize(normal + (viewMatrix * vec4(ripple, 0.0)).xyz);
    }
  `,
  foliage: /* glsl */ `
    {
      // Leaf-clump relief so each low-poly blob reads as many small tufts instead of flat facets.
      float fade = 1.0 - smoothstep(8.0, 30.0, length(vViewPosition));
      vec3 q = vLkWorldPos * 4.2;
      const float e = 0.06;
      float n0 = lkNoise(q) + 0.5 * lkNoise(q * 2.3);
      vec3 g = vec3(
        lkNoise(q + vec3(e, 0.0, 0.0)) + 0.5 * lkNoise((q + vec3(e, 0.0, 0.0)) * 2.3),
        lkNoise(q + vec3(0.0, e, 0.0)) + 0.5 * lkNoise((q + vec3(0.0, e, 0.0)) * 2.3),
        lkNoise(q + vec3(0.0, 0.0, e)) + 0.5 * lkNoise((q + vec3(0.0, 0.0, e)) * 2.3)) - n0;
      g /= e;
      g -= vLkWorldNormal * dot(g, vLkWorldNormal);
      normal = normalize(normal + (viewMatrix * vec4(-g * 0.11 * fade, 0.0)).xyz);
    }
  `,
  cascade: /* glsl */ `
    {
      float ph = vLkFlow.y - uTime;
      float a = lkNoise(vec3(vLkFlow.x * 6.0, ph * 3.0, 0.5)) - 0.5;
      float b = lkNoise(vec3(vLkFlow.x * 6.0 + 3.1, ph * 3.0, 2.5)) - 0.5;
      normal = normalize(normal + (viewMatrix * vec4(a * 0.35, b * 0.2, b * 0.35, 0.0)).xyz);
    }
  `,
};

/** Soft rim to separate characters from the meadow (reads as fur instead of glossy plastic). */
const RIM_GLSL: Partial<Record<SurfaceKind, string>> = {
  character: /* glsl */ `
    {
      float rim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.6);
      outgoingLight += rim * vec3(1.0, 0.96, 0.86) * 0.16;
    }
  `,
  fern: /* glsl */ `
    {
      // Thin fronds glow a little where the sun passes through them.
      float rim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
      outgoingLight += rim * vec3(0.78, 0.9, 0.52) * 0.09;
    }
  `,
  foliage: /* glsl */ `
    {
      float rim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
      outgoingLight += rim * vec3(0.86, 0.94, 0.66) * 0.09;
    }
  `,
};

/**
 * Neutral tone mapping keeps edges crisp but saturates the vertex colours; pull landscape
 * surfaces back towards the pastel palette (characters and water keep their own colour).
 */
const PASTEL_GLSL: Partial<Record<SurfaceKind, string>> = Object.fromEntries(
  (["terrain", "meadow", "foliage", "timber", "fern"] as const).map((kind) => [kind, /* glsl */ `
    {
      float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      // Bright, friendly pastel: keep most of the colour, only a light creamy wash.
      diffuseColor.rgb = mix(vec3(lum), diffuseColor.rgb, 0.92);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.98, 0.96, 0.9) * lum * 1.15, 0.05);
    }
  `]),
);
PASTEL_GLSL.water = /* glsl */ `
  diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), diffuseColor.rgb, 0.95);
`;

type PatchableMaterial = THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;

export function patchSurface(material: PatchableMaterial, kind: SurfaceKind, uniforms: SharedUniforms, fern?: FernUniforms): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (fern) Object.assign(shader.uniforms, fern);
    const fernDecl = fern ? "uniform vec4 uFernBase;\nuniform vec3 uPush;\n" : "";
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_DECL}\n${UNIFORM_DECL}\n${fernDecl}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${fern ? FERN_VERTEX : ""}\n${kind === "foliage" ? FOLIAGE_VERTEX : ""}\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${VERTEX_DECL}\n${UNIFORM_DECL}\n${NOISE_GLSL}\n${RING_GLSL}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\nfloat lkRoughness = roughness;\n${SURFACE_GLSL[kind]}\n${PASTEL_GLSL[kind] ?? ""}`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = clamp(lkRoughness, 0.04, 1.0);")
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n${NORMAL_GLSL[kind] ?? ""}`)
      .replace("#include <opaque_fragment>", `${RIM_GLSL[kind] ?? ""}\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `lumikids-${kind}`;
  material.needsUpdate = true;
}

/**
 * Lower-tier terrain: drops the procedural bump and the finest noise layers (blade strokes, grit, cracks) while
 * keeping strata, moss, grass patches and the wet band. Recompiles the material once.
 */
export function setTerrainLite(material: THREE.Material, lite: boolean): void {
  // MeshStandardMaterial carries `defines` at runtime (STANDARD/PHYSICAL) but the typings omit it.
  const target = material as THREE.Material & { defines?: Record<string, string> };
  const defines: Record<string, string> = { ...target.defines };
  if (lite === "LK_LITE" in defines) return;
  if (lite) defines.LK_LITE = "";
  else delete defines.LK_LITE;
  target.defines = defines;
  material.needsUpdate = true;
}

/** Map GLB material names (see LumiKids_Pastel_Valley.glb) to a surface treatment. */
export function surfaceForMaterial(name: string): SurfaceKind | null {
  switch (name) {
    case "Clay and Grass": return "terrain";
    case "Meadow": return "meadow";
    case "Pine Needles": return "foliage";
    case "Cabin Timber": return "timber";
    case "Lake Water": return "water";
    case "Cascade Water": return "cascade";
    case "Water Highlights": return "waterHighlight";
    case "Window Light": return "windowLight";
    default: return null;
  }
}

/** Material parameters that the shader patch does not cover (env response, emissive, transparency). */
export function tuneMaterial(material: THREE.MeshStandardMaterial, kind: SurfaceKind): THREE.MeshStandardMaterial {
  material.metalness = 0;
  switch (kind) {
    case "water":
    case "cascade": {
      const physical = new THREE.MeshPhysicalMaterial({
        color: material.color,
        vertexColors: material.vertexColors,
        roughness: kind === "water" ? 0.16 : 0.3,
        metalness: 0,
        clearcoat: kind === "water" ? 0.55 : 0.25,
        clearcoatRoughness: 0.32,
        envMapIntensity: kind === "water" ? 0.55 : 0.35,
        specularIntensity: 0.6,
      });
      physical.name = material.name;
      // Lets the cascade fade its ragged sides through MSAA coverage, without transparent sorting.
      if (kind === "cascade") physical.alphaToCoverage = true;
      material.dispose();
      return physical;
    }
    case "waterHighlight":
      material.transparent = true;
      material.depthWrite = false;
      material.emissiveIntensity = 0.6;
      material.envMapIntensity = 0.2;
      return material;
    case "windowLight":
      material.emissive = new THREE.Color("#ffd99a");
      material.emissiveIntensity = 0.55;
      return material;
    case "timber":
      material.envMapIntensity = 0.25;
      return material;
    default:
      material.envMapIntensity = 0.3;
      return material;
  }
}
