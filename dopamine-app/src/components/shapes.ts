import type { Shape } from "../types";

/** All paths live in a 100 x 100 box with a 2 unit margin. */
const SIZE = 100;
const CENTER = SIZE / 2;

function polygon(sides: number, radius: number, rotation = -Math.PI / 2): string {
  const points: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i * 2 * Math.PI) / sides;
    points.push(`${CENTER + radius * Math.cos(a)},${CENTER + radius * Math.sin(a)}`);
  }
  return `M${points.join(" L")} Z`;
}

function star(points: number, outer: number, inner: number): string {
  const parts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    parts.push(`${CENTER + r * Math.cos(a)},${CENTER + r * Math.sin(a)}`);
  }
  return `M${parts.join(" L")} Z`;
}

function roundedSquare(radius: number): string {
  const m = 4;
  const s = SIZE - m * 2;
  const r = radius;
  return [
    `M${m + r},${m}`,
    `H${m + s - r}`,
    `A${r},${r} 0 0 1 ${m + s},${m + r}`,
    `V${m + s - r}`,
    `A${r},${r} 0 0 1 ${m + s - r},${m + s}`,
    `H${m + r}`,
    `A${r},${r} 0 0 1 ${m},${m + s - r}`,
    `V${m + r}`,
    `A${r},${r} 0 0 1 ${m + r},${m}`,
    "Z",
  ].join(" ");
}

export const SHAPE_PATHS: Record<Shape, string> = {
  circle: "M50,2 A48,48 0 1,1 50,98 A48,48 0 1,1 50,2 Z",
  squircle: "M50,3 C82,3 97,18 97,50 C97,82 82,97 50,97 C18,97 3,82 3,50 C3,18 18,3 50,3 Z",
  square: roundedSquare(14),
  hexagon: polygon(6, 47),
  star: star(5, 48, 24),
  heart:
    "M50,92 C22,68 4,52 4,32 C4,18 15,7 28,7 C38,7 46,13 50,21 C54,13 62,7 72,7 C85,7 96,18 96,32 C96,52 78,68 50,92 Z",
  blob: "M52,4 C72,2 92,18 94,40 C96,62 84,90 60,95 C36,100 8,84 5,58 C2,34 30,6 52,4 Z",
};

export const SHAPE_VIEWBOX = `0 0 ${SIZE} ${SIZE}`;
