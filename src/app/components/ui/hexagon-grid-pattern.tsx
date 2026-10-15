import { forwardRef, useMemo, type ComponentPropsWithoutRef } from "react";
import { Shader } from "./shader";

export interface HexagonGridPatternShadersProps extends ComponentPropsWithoutRef<"div"> {
  speed?: number;
  scale?: number;
  showGrid?: boolean;
  patternDensity?: number;
}

// Adapted from shadcn.io's Hexagon Grid Pattern shader component.
const FRAGMENT_SHADER = `
#extension GL_OES_standard_derivatives : enable

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(27.617, 57.743))) * 43758.5453);
}

const vec2 s = vec2(1.732, 1.0);

float getHex(vec2 p) {
  return max(dot(abs(p.xy), s / 2.0), abs(p.y * s.y));
}

vec4 getGrid(vec2 p) {
  vec4 ip = floor(vec4(p / s, p / s - 0.5));
  vec4 q = p.xyxy - vec4(ip.xy + 0.5, ip.zw + 1.0) * s.xyxy;
  return dot(q.xy, q.xy) < dot(q.zw, q.zw)
    ? vec4(q.xy, ip.xy)
    : vec4(q.zw, ip.zw + 0.5);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  float res = min(iResolution.y, 800.0);
  vec2 uv = (fragCoord.xy - iResolution.xy * 0.5) / res;
  vec2 p = uv * u_scale - vec2(-1.0, -0.5) * iTime * u_speed / 4.0;
  float sf = 1.0 / res * u_scale;
  vec4 p4 = getGrid(p);

  vec2 vID[6];
  vID[0] = vec2(-1.0 / 3.0, 0.0);
  vID[1] = vec2(-1.0 / 6.0, 0.5);
  vID[2] = vec2(1.0 / 6.0, 0.5);
  vID[3] = vec2(1.0 / 3.0, 0.0);
  vID[4] = vec2(1.0 / 6.0, -0.5);
  vID[5] = vec2(-1.0 / 6.0, -0.5);

  vec3 col = vec3(1.0);
  for (int i = 0; i < 6; i++) {
    vec2 currentVertex;
    vec2 neighborVertex;
    if (i == 0) { currentVertex = vID[5]; neighborVertex = vID[4]; }
    else if (i == 1) { currentVertex = vID[4]; neighborVertex = vID[3]; }
    else if (i == 2) { currentVertex = vID[3]; neighborVertex = vID[2]; }
    else if (i == 3) { currentVertex = vID[2]; neighborVertex = vID[1]; }
    else if (i == 4) { currentVertex = vID[1]; neighborVertex = vID[0]; }
    else { currentVertex = vID[0]; neighborVertex = vID[5]; }

    vec2 q = abs(p4.xy - currentVertex * s * 0.5);
    float hx = getHex(q) - 0.265;
    float oHx = hx;
    q = abs(p4.xy - neighborVertex * s / 2.0);
    float hx2 = getHex(q) - 0.27;
    hx = max(hx, -hx2);

    float pat = (1.0 - abs(fract(oHx * 16.0 * u_patternDensity + 0.2) - 0.5) * 2.0) - 0.55;
    pat = smoothstep(0.0, 0.2, pat);
    col = mix(col, vec3(1.0) * pat, 1.0 - smoothstep(0.0, sf, hx));
    col = mix(col, vec3(1.0), 1.0 - smoothstep(0.0, sf, max(oHx + 0.22, -hx2)));
    vec3 sh = mix(col, vec3(0.0), 1.0 - smoothstep(0.0, sf, hx));
    col = mix(col, sh, (1.0 - smoothstep(0.0, sf * 8.0, max(max(hx, hx2), -hx2))) * 0.5);
  }

  float gHx = getHex(p4.xy);
  if (u_showGrid > 0.5) {
    col = mix(col, vec3(0.0), 1.0 - smoothstep(0.0, sf, abs(gHx - 0.5) - 0.035));
    col = mix(col, vec3(1.0, 0.05, 0.1) * 1.5, 1.0 - smoothstep(0.0, sf, abs(gHx - 0.5) - 0.0075));
    col = mix(col, vec3(0.0), (1.0 - smoothstep(0.0, sf * 5.0, gHx - 0.045)) * 0.5);
    col = mix(col, vec3(0.0), 1.0 - smoothstep(0.0, sf, gHx - 0.045));
    col = mix(col, vec3(1.0, 0.05, 0.2), 1.0 - smoothstep(0.0, sf, gHx - 0.015));
  } else {
    col = mix(col, vec3(0.0), (1.0 - smoothstep(0.0, sf * 5.0, gHx - 0.02)) * 0.5);
    col = mix(col, vec3(0.0), 1.0 - smoothstep(0.0, sf, gHx - 0.02));
  }

  fragColor = vec4(sqrt(max(col, 0.0)), 1.0);
}
`;

export const HexagonGridPatternShaders = forwardRef<HTMLDivElement, HexagonGridPatternShadersProps>(function HexagonGridPatternShaders(
  { speed = 0.15, scale = 2.6, showGrid = true, patternDensity = 0.8, className, ...props },
  ref,
) {
  const uniforms = useMemo(() => ({
    u_speed: { type: "1f" as const, value: speed },
    u_scale: { type: "1f" as const, value: scale },
    u_showGrid: { type: "1f" as const, value: showGrid ? 1 : 0 },
    u_patternDensity: { type: "1f" as const, value: patternDensity },
  }), [patternDensity, scale, showGrid, speed]);

  return (
    <Shader
      ref={ref}
      fs={FRAGMENT_SHADER}
      uniforms={uniforms}
      className={className}
      {...props}
      fallback={<div className="h-full w-full bg-[var(--nerdvana-bg)]" />}
    />
  );
});

HexagonGridPatternShaders.displayName = "HexagonGridPatternShaders";
