import { forwardRef, useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "./utils";

type ShaderUniform = {
  type: "1f" | "2f" | "3f" | "4f";
  value: number | number[];
};

interface ShaderProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  fs: string;
  className?: string;
  style?: CSSProperties;
  uniforms?: Record<string, ShaderUniform>;
  fallback?: ReactNode;
}

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create WebGL shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Unable to compile WebGL shader";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function buildFragmentShader(source: string, uniforms: Record<string, ShaderUniform>) {
  const glslType = (type: ShaderUniform["type"]) => ({
    "1f": "float",
    "2f": "vec2",
    "3f": "vec3",
    "4f": "vec4",
  })[type];
  const declarations = Object.entries(uniforms)
    .filter(([name]) => source.includes(name))
    .map(([name, uniform]) => `uniform ${glslType(uniform.type)} ${name};`)
    .join("\n");

  return `
precision highp float;
uniform vec3 iResolution;
uniform float iTime;
${declarations}
${source}
void main() {
  vec4 color = vec4(0.0, 0.0, 0.0, 1.0);
  mainImage(color, gl_FragCoord.xy);
  gl_FragColor = color;
}
`;
}

function setUniform(gl: WebGLRenderingContext, location: WebGLUniformLocation, uniform: ShaderUniform) {
  const value = uniform.value;
  if (uniform.type === "1f") gl.uniform1f(location, value as number);
  if (uniform.type === "2f") gl.uniform2fv(location, value as number[]);
  if (uniform.type === "3f") gl.uniform3fv(location, value as number[]);
  if (uniform.type === "4f") gl.uniform4fv(location, value as number[]);
}

export const Shader = forwardRef<HTMLDivElement, ShaderProps>(function Shader(
  { fs, className, style, uniforms = {}, fallback, ...props },
  forwardedRef,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mediaQuery.matches);
    update();
    mediaQuery.addEventListener?.("change", update);
    return () => mediaQuery.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animationFrame = 0;
    let resizeObserver: ResizeObserver | null = null;
    let gl: WebGLRenderingContext | null = null;
    let program: WebGLProgram | null = null;

    try {
      gl = canvas.getContext("webgl", { alpha: true, antialias: false });
      if (!gl) throw new Error("WebGL is not available");

      const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
      const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, buildFragmentShader(fs, uniforms));
      program = gl.createProgram();
      if (!program) throw new Error("Unable to create WebGL program");
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || "Unable to link WebGL program");
      }

      const positionBuffer = gl.createBuffer();
      if (!positionBuffer) throw new Error("Unable to create WebGL buffer");
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      gl.useProgram(program);
      const position = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      const resolution = gl.getUniformLocation(program, "iResolution");
      const time = gl.getUniformLocation(program, "iTime");
      const uniformLocations = Object.fromEntries(
        Object.keys(uniforms).map((name) => [name, gl!.getUniformLocation(program!, name)]),
      );

      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        gl!.viewport(0, 0, canvas.width, canvas.height);
      };

      const render = (now: number) => {
        resize();
        gl!.useProgram(program);
        if (resolution) gl!.uniform3f(resolution, canvas.width, canvas.height, 1);
        if (time) gl!.uniform1f(time, reducedMotion ? 0 : now / 1000);
        for (const [name, uniform] of Object.entries(uniforms)) {
          const location = uniformLocations[name];
          if (location) setUniform(gl!, location, uniform);
        }
        gl!.drawArrays(gl!.TRIANGLES, 0, 6);
        if (!reducedMotion) animationFrame = requestAnimationFrame(render);
      };

      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas);
      setFailed(false);
      animationFrame = requestAnimationFrame(render);

      return () => {
        cancelAnimationFrame(animationFrame);
        resizeObserver?.disconnect();
        gl?.deleteBuffer(positionBuffer);
        gl?.deleteShader(vertexShader);
        gl?.deleteShader(fragmentShader);
        gl?.deleteProgram(program);
      };
    } catch {
      setFailed(true);
      resizeObserver?.disconnect();
      if (program && gl) gl.deleteProgram(program);
    }
  }, [fs, reducedMotion, uniforms]);

  return (
    <div ref={forwardedRef} className={cn("relative h-full w-full overflow-hidden", className)} style={style} aria-hidden="true" {...props}>
      {failed ? fallback : <canvas ref={canvasRef} className="block h-full w-full" />}
    </div>
  );
});

Shader.displayName = "Shader";
