export const WIDTH = 720;
export const HEIGHT = 575;
export const LIMIT = 48;
export const MESSAGE_END = 1150;
export const GROW_END = MESSAGE_END + 3750;
export const HOLD_END = GROW_END + 3600;
export const LOOP = HOLD_END + 2550;
export const SAMPLE = "문구를 입력하면 트리가 됩니다";
const TAU = Math.PI * 2;
const MONO = 'Menlo, Consolas, "Apple SD Gothic Neo", "Malgun Gothic", monospace';
const BOLD = '"Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif';
const MAX_GLYPHS = 2700;

const segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });
export const splitText = (value: string) => Array.from(segmenter.segment(value), (part) => part.segment);
const isBlank = (character: string) => /^\s+$/u.test(character);

export function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function smooth(value: number) {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
}

export function seedRandom(seed: number) {
  return function next() {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// Everything below is generated from one seeded stream, so the call order defines the tree's shape.
const random = seedRandom(281224);
const snow = Array.from({ length: 152 }, () => ({
  x: random() * WIDTH, y: random() * HEIGHT, speed: 10 * (1 + Math.floor(random() * 4)),
  phase: random() * TAU, size: .55 + random() * 1.55, brightness: random(), plus: random() > .82
}));
const ground = Array.from({ length: 380 }, () => ({
  x: 92 + random() * 536, y: 469 + random() * 95, tint: random()
}));
const tiers = [
  [.08, .40, 196, 303], [.26, .55, 164, 248], [.42, .70, 128, 204],
  [.57, .83, 97, 156], [.70, .923, 68, 115], [.81, .997, 41, 77]
];

type Particle = {
  height: number; radius: number; angle: number; trunk: boolean;
  tint: number; delay: number; drift: number; ornament: boolean;
};

function point(height: number, radius: number, angle: number, trunk = false): Particle {
  return {
    height, radius, angle, trunk,
    tint: random(), delay: random(), drift: random(),
    ornament: random() > .965
  };
}

const tree: Particle[] = [];
for (let index = 0; index < 71; index += 1) {
  const height = random() * .13;
  tree.push(point(height, (11 + random() * 12) * (1 - height * 2.3), random() * TAU, true));
}
for (const [low, high, width, quantity] of tiers) {
  for (let index = 0; index < quantity; index += 1) {
    const rise = random() ** 1.18;
    const angle = random() * TAU;
    const branch = .9 + .13 * Math.sin(angle * 7 + low * 4) + .058 * Math.sin(angle * 13);
    const radius = (1 - rise) ** .78 * width * (.47 + random() * .57) * branch;
    const height = low + (high - low) * rise + .028 * (1 - rise) ** 2 * Math.sin(angle * 7) + (random() - .5) * .017;
    tree.push(point(height, radius, angle));
  }
}
const garland = Array.from({ length: 140 }, (_, index) => {
  const fraction = index / 139;
  const height = .115 + fraction * .774;
  return { height, radius: 198 * (1 - height) ** 1.07 + 7, angle: fraction * TAU * 3.45 + .4 };
});

type Theme = { foliage: string[]; ornaments: string[]; glow: string; garland: string };
export const themes: Record<string, Theme> = {
  green: {
    foliage: ["#4c9f7b", "#58b78c", "#73cea3", "#97e8bb", "#bfefd0"],
    ornaments: ["#ffd487", "#f89487", "#a2eaea"], glow: "#51cf9e", garland: "#f9d38e"
  },
  red: {
    foliage: ["#a14256", "#c75566", "#ec6d7c", "#ff8c97", "#ffc3c7"],
    ornaments: ["#ffd28c", "#ffacc2", "#ffefe7"], glow: "#eb536d", garland: "#ffcd93"
  },
  gold: {
    foliage: ["#a38340", "#c99a49", "#edb84f", "#ffd77c", "#ffe9aa"],
    ornaments: ["#fff3c7", "#ffa26d", "#ffe480"], glow: "#ffca66", garland: "#fff0b5"
  },
  white: {
    foliage: ["#7894a6", "#96afbd", "#bed0d9", "#e0ebee", "#ffffff"],
    ornaments: ["#f5fbff", "#a6daed", "#ffe6b6"], glow: "#b7d7e7", garland: "#e4f5ff"
  }
};
export const allThemes = Object.values(themes);

function distributeThemes(count: number, next: () => number) {
  const result: Theme[] = [];
  while (result.length < count) {
    const group = [...allThemes];
    for (let i = group.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
    result.push(...group);
  }
  return result.slice(0, count);
}

const copper = ["#985d3b", "#c7885b", "#e1aa73"];
const mosaicColors = ["#a9e5c6", "#c9f0d7", "#e3f9e9"];

export type Tree = { message: string; seed?: number; color?: string };
type Glyph = { bitmap: HTMLCanvasElement; edge: number };
type Mark = { character: string; x: number; y: number; color: string };
type Anchor = { character: string; x: number; y: number };

function canvasScale() {
  return Math.min(matchMedia("(max-width: 799px)").matches ? 1.25 : 2, Math.max(1, window.devicePixelRatio || 1));
}

function makeSky() {
  const background = document.createElement("canvas");
  background.width = WIDTH;
  background.height = HEIGHT;
  const brush = background.getContext("2d")!;
  brush.fillStyle = "#08151d";
  brush.fillRect(0, 0, WIDTH, HEIGHT);
  const atmosphere = brush.createRadialGradient(360, 357, 32, 360, 360, 425);
  atmosphere.addColorStop(0, "#162f31");
  atmosphere.addColorStop(.56, "#102529");
  atmosphere.addColorStop(1, "#08151d");
  brush.fillStyle = atmosphere;
  brush.fillRect(0, 0, WIDTH, HEIGHT);
  const horizon = brush.createRadialGradient(360, 510, 0, 360, 510, 268);
  horizon.addColorStop(0, "#32665630");
  horizon.addColorStop(1, "#32665600");
  brush.save();
  brush.translate(0, 408);
  brush.scale(1, .2);
  brush.fillStyle = horizon;
  brush.fillRect(0, 0, WIDTH, 835);
  brush.restore();
  for (const { x, y, tint } of ground) {
    const distance = Math.hypot((x - 360) / 286, (y - 515) / 62);
    brush.globalAlpha = .35 * tint * clamp(1.2 - distance);
    brush.fillStyle = "#83bfc2";
    brush.fillRect(x, y, tint > .84 ? 4 : 1.8, 1);
  }
  return background;
}

function project(particle: { height: number; radius: number; angle: number }, angle: number) {
  const phase = particle.angle + angle;
  const depth = Math.sin(phase);
  const radius = particle.radius;
  return {
    x: 360 + Math.cos(phase) * radius * (1 + depth * radius / 1320),
    y: 490 - particle.height * 365 + depth * radius * .23,
    depth
  };
}

export function bloomAt(time: number) {
  if (time < MESSAGE_END) return 0;
  if (time < GROW_END) return (time - MESSAGE_END) / (GROW_END - MESSAGE_END);
  if (time < HOLD_END) return 1;
  return 1 - (time - HOLD_END) / (LOOP - HOLD_END);
}

export type Scene = ReturnType<typeof createScene>;

export function createScene(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const sky = makeSky();
  const glyphs = new Map<string, Glyph>();
  let dpr = 1;
  let message = SAMPLE;
  let layout: { anchors: Anchor[]; marks: Mark[]; tileSize: number; bitmap: HTMLCanvasElement };
  let colors: { foliage: Theme[]; lights: string[]; glow: string; star: string };

  function fit() {
    dpr = canvasScale();
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    glyphs.clear();
  }

  function getGlyph(character: string, size: number, color: string) {
    const key = character + "|" + size + "|" + color;
    const stored = glyphs.get(key);
    if (stored) return stored;
    const bitmap = document.createElement("canvas");
    const edge = Math.ceil(size * 1.8);
    bitmap.width = bitmap.height = edge * dpr;
    const stamp = bitmap.getContext("2d")!;
    stamp.scale(dpr, dpr);
    stamp.font = "600 " + size + "px " + MONO;
    stamp.textAlign = "center";
    stamp.textBaseline = "middle";
    stamp.fillStyle = color;
    stamp.fillText(character, edge / 2, edge / 2 + 1);
    if (glyphs.size >= MAX_GLYPHS) glyphs.delete(glyphs.keys().next().value!);
    const glyph = { bitmap, edge };
    glyphs.set(key, glyph);
    return glyph;
  }

  function drawGlyph(character: string, x: number, y: number, size: number, color: string, alpha: number) {
    if (alpha < .025) return;
    const { bitmap, edge } = getGlyph(character, size, color);
    ctx.globalAlpha = clamp(alpha);
    ctx.drawImage(bitmap, x - edge / 2, y - edge / 2, edge, edge);
  }

  function light(x: number, y: number, radius: number, color: string, intensity: number) {
    if (intensity <= .02) return;
    ctx.globalAlpha = clamp(intensity);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(.22, color + "72");
    gradient.addColorStop(1, color + "00");
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function drawSky(time: number) {
    ctx.globalAlpha = 1;
    ctx.drawImage(sky, 0, 0, WIDTH, HEIGHT);
    const cycle = time / LOOP * TAU;
    for (const flake of snow) {
      const y = (flake.y + time / LOOP * flake.speed / 10 * HEIGHT) % HEIGHT;
      const x = flake.x + 7 * Math.sin(cycle + flake.phase);
      const pulse = .72 + .28 * Math.sin(cycle * 2 + flake.phase);
      ctx.globalAlpha = (.15 + .42 * flake.brightness) * pulse * smooth(y / 28) * smooth((HEIGHT - y) / 28);
      ctx.fillStyle = flake.brightness > .82 ? "#c1e1e8" : "#7dabb7";
      if (flake.plus && flake.size > 1.25) {
        ctx.fillRect(x - 2, y, 5, .8);
        ctx.fillRect(x, y - 2, .8, 5);
      } else {
        ctx.fillRect(x, y, flake.size, flake.size);
      }
    }
  }

  // Lays the message out in the largest font that fits in two rows (falls back to 30px with more rows).
  function measureMessage(value: string) {
    const pieces = splitText(value);
    const maxWidth = 590;
    for (const size of [78, 71, 64, 57, 50, 44, 39, 34, 30]) {
      ctx.font = "800 " + size + "px " + BOLD;
      const rows: { character: string; width: number }[][] = [[]];
      const widths = [0];
      for (const character of pieces) {
        const width = Math.max(1, ctx.measureText(character).width);
        let row = rows.length - 1;
        if (widths[row] + width > maxWidth && widths[row] > 0) {
          rows.push([]);
          widths.push(0);
          row += 1;
        }
        rows[row].push({ character, width });
        widths[row] += width;
      }
      if (rows.length > 2 && size > 30) continue;
      const anchors: Anchor[] = [];
      rows.forEach((row, rowIndex) => {
        let x = (WIDTH - widths[rowIndex]) / 2;
        const y = 282 + (rowIndex - (rows.length - 1) / 2) * size * 1.22;
        for (const { character, width } of row) {
          if (!isBlank(character)) anchors.push({ character, x: x + width / 2, y });
          x += width;
        }
      });
      return { anchors, size };
    }
    throw new Error("unreachable");
  }

  // Samples a big rendering of one character on a grid; each inked cell becomes a small glyph.
  function glyphCells(mask: HTMLCanvasElement, character: string, size: number, spacing: number) {
    const scale = 3;
    const edge = Math.ceil(size * 1.8 * scale);
    const center = edge / 2;
    const brush = mask.getContext("2d", { willReadFrequently: true })!;
    mask.width = mask.height = edge;
    brush.font = "800 " + size * scale + "px " + BOLD;
    brush.textAlign = "center";
    brush.textBaseline = "middle";
    brush.fillStyle = "#fff";
    brush.fillText(character, center, center);
    const { data } = brush.getImageData(0, 0, edge, edge);
    const limit = Math.floor((size * .82) / spacing);
    const radius = Math.max(1, Math.round(spacing * scale * .30));
    const cells: { x: number; y: number }[] = [];

    for (let row = -limit; row <= limit; row += 1) {
      for (let col = -limit; col <= limit; col += 1) {
        const x = Math.round(center + col * spacing * scale);
        const y = Math.round(center + row * spacing * scale);
        let ink = 0;
        for (let dy = -radius; dy <= radius; dy += radius) {
          for (let dx = -radius; dx <= radius; dx += radius) {
            ink += data[((y + dy) * edge + x + dx) * 4 + 3] || 0;
          }
        }
        if (ink > 830) cells.push({ x: col * spacing, y: row * spacing });
      }
    }
    return cells.length ? cells : [{ x: 0, y: 0 }];
  }

  function makeMosaic(value: string) {
    const { anchors, size } = measureMessage(value);
    const spacing = Math.max(3.4, size / 9.8);
    const tileSize = Math.round(spacing * .94 * 2) / 2;
    const mask = document.createElement("canvas");
    const cellsByCharacter = new Map<string, { x: number; y: number }[]>();
    const marks: Mark[] = [];
    for (const anchor of anchors) {
      if (!cellsByCharacter.has(anchor.character)) {
        cellsByCharacter.set(anchor.character, glyphCells(mask, anchor.character, size, spacing));
      }
      for (const cell of cellsByCharacter.get(anchor.character)!) {
        marks.push({
          character: anchors[marks.length % anchors.length].character,
          x: anchor.x + cell.x,
          y: anchor.y + cell.y,
          color: mosaicColors[(marks.length + Math.round(cell.y / spacing + size)) % mosaicColors.length]
        });
      }
    }

    const bitmap = document.createElement("canvas");
    bitmap.width = WIDTH * dpr;
    bitmap.height = HEIGHT * dpr;
    const brush = bitmap.getContext("2d")!;
    brush.scale(dpr, dpr);
    for (const { character, x, y, color } of marks) {
      const { bitmap: stamp, edge } = getGlyph(character, tileSize, color);
      brush.drawImage(stamp, x - edge / 2, y - edge / 2, edge, edge);
    }
    return { anchors, marks, tileSize, bitmap };
  }

  function drawMessage(mix: number) {
    const opacity = 1 - smooth(mix / .25);
    if (opacity <= .02) return;
    ctx.globalAlpha = opacity;
    ctx.drawImage(layout.bitmap, 0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;
  }

  function drawTree(time: number, mix: number) {
    if (mix <= 0) return;
    const seconds = time / 1000;
    const angle = .69 + Math.sin(time / LOOP * TAU - .33) * .92 + seconds * .18;
    const { anchors, marks, tileSize } = layout;
    const visible = tree.map((particle, index) => {
      const source = marks[Math.floor(index * marks.length / tree.length)];
      const target = project(particle, angle);
      const delay = particle.height * .41 + particle.delay * .17;
      const movement = smooth((mix - delay * .69) / .64);
      const arc = Math.sin(movement * Math.PI);
      return {
        particle, source, target, movement, theme: colors.foliage[index],
        x: source.x + (target.x - source.x) * movement + (particle.drift - .5) * 95 * arc,
        y: source.y + (target.y - source.y) * movement - (37 + particle.delay * 51) * arc
      };
    }).sort((left, right) => left.target.depth - right.target.depth);

    light(360, 502, 102, colors.glow, smooth((mix - .35) / .5) * .22);
    for (const { particle, source, target, movement, theme, x, y } of visible) {
      const amplitude = smooth((mix - .025) / .15) * smooth(movement / .23);
      if (amplitude < .03) continue;
      const depth = (target.depth + 1) / 2;
      const index = Math.min(4, Math.floor(particle.tint * 3.1 + depth * 1.45));
      const color = particle.trunk ? copper[Math.min(2, Math.floor(depth * 3))] : theme.foliage[index];
      const size = movement < .35 ? tileSize : particle.ornament ? 13 : particle.tint > .73 ? 11 : 9;
      const accent = theme.ornaments[Math.floor(particle.tint * theme.ornaments.length)];
      const sparkle = (.7 + .3 * Math.sin(seconds * 3.9 + particle.angle * 9)) * depth;
      if (particle.ornament && mix > .82 && depth > .54) {
        light(x, y, 13, accent, smooth((mix - .82) / .18) * sparkle * .75);
        drawGlyph(source.character, x, y, size, accent, amplitude * (.52 + sparkle * .44));
      } else {
        drawGlyph(source.character, x, y, size, movement < .35 ? source.color : color, amplitude * (.22 + .65 * depth));
      }
    }

    const lights = smooth((mix - .7) / .27);
    for (let index = 0; index < garland.length && lights > 0; index += 1) {
      const t = index / (garland.length - 1);
      const level = smooth(lights * 1.35 - t * .35);
      const bulb = project(garland[index], angle);
      const flicker = .78 + .22 * Math.sin(seconds * 3.4 + index * .23);
      const shine = level * (.25 + .75 * smooth((bulb.depth + .11) / .7)) * flicker;
      const garlandColor = colors.lights[index];
      if (index % 7 === 0) light(bulb.x, bulb.y, 11, garlandColor, shine * .6);
      drawGlyph(anchors[index % anchors.length].character, bulb.x, bulb.y, 8, garlandColor, shine * .75);
    }
    const star = smooth((mix - .89) / .11);
    if (star > .01) {
      const x = 360;
      const y = 112;
      const twinkle = .88 + .12 * Math.sin(seconds * 4);
      light(x, y, 31, colors.star, star * twinkle);
      light(x, y, 13, "#ffe7a7", star * .7);
      ctx.globalAlpha = star * twinkle;
      ctx.fillStyle = "#fff1cb";
      const tip = 13 * twinkle;
      ctx.beginPath();
      ctx.moveTo(x, y - tip);
      ctx.lineTo(x + 2.3, y - 2.2);
      ctx.lineTo(x + tip, y);
      ctx.lineTo(x + 2.3, y + 2.2);
      ctx.lineTo(x, y + tip);
      ctx.lineTo(x - 2.3, y + 2.2);
      ctx.lineTo(x - tip, y);
      ctx.lineTo(x - 2.3, y - 2.2);
      ctx.closePath();
      ctx.fill();
    }
  }

  fit();

  return {
    canvas,
    setTree({ message: value, seed = 0, color }: Tree) {
      message = value;
      const legacy = color ? themes[color] : undefined;
      const next = seedRandom(seed);
      colors = legacy
        ? { foliage: Array(tree.length).fill(legacy), lights: Array(garland.length).fill(legacy.garland), glow: legacy.glow, star: legacy.garland }
        : { foliage: distributeThemes(tree.length, next), lights: distributeThemes(garland.length, next).map(theme => theme.foliage[3]), glow: "#aad1c1", star: "#f8d995" };
      glyphs.clear();
      layout = makeMosaic(value);
    },
    resize() {
      if (dpr === canvasScale()) return;
      fit();
      layout = makeMosaic(message);
    },
    render(time: number) {
      const mix = bloomAt(time);
      drawSky(time);
      drawTree(time, mix);
      drawMessage(mix);
      ctx.globalAlpha = 1;
      return mix;
    }
  };
}
