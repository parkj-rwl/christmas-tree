export const WIDTH = 720;
export const HEIGHT = 575;
export const LIMIT = 48;
const MESSAGE_END = 1150;
const GROW_END = MESSAGE_END + 3750;
const HOLD_END = GROW_END + 3600;
export const LOOP = HOLD_END + 2550;
export const SAMPLE = "문구를 입력하면 트리가 됩니다";
const TAU = Math.PI * 2;
const MONO = 'Menlo, Consolas, "Apple SD Gothic Neo", "Malgun Gothic", monospace';
const BOLD = '"Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif';
const MAX_GLYPHS = 2700;

const FOLIAGE = ["#0f6b4a", "#14825a", "#1c9a6a", "#2bb37c", "#5fd39c"];
const ORNAMENTS = ["#ff4d5e", "#ffcc4d", "#3fd2c7", "#ff8fb1"];
const TRUNK = ["#8a5a35", "#b07a4a", "#d4a26a"];
const BULB_OFF = "#7f8d8f";
const BULB_ON = "#fff6dc";
const STAR = "#ffd34d";
const MOSAIC = ["#ffffff", "#fff1d0", "#d9f5e6"];
export const PALETTE = [...FOLIAGE, ...ORNAMENTS, ...TRUNK, BULB_OFF, BULB_ON, STAR, ...MOSAIC];

const segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });
export const splitText = (value: string) => Array.from(segmenter.segment(value), (part) => part.segment);
const isBlank = (character: string) => /^\s+$/u.test(character);

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smooth(value: number) {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
}

function seedRandom(seed: number) {
  return function next() {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// Everything below is generated from one seeded stream, so the call order defines the tree's shape.
const random = seedRandom(281224);
const snow = Array.from({ length: 152 }, () => ({
  x: random() * WIDTH, y: random() * HEIGHT, speed: 10 * (1 + Math.floor(random() * 4)),
  phase: random() * TAU, size: .8 + random() * 1.6, brightness: random()
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
    ornament: random() > .93
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
// Sparkles that twinkle just outside the tree's silhouette while the lights are on.
const twinkles = Array.from({ length: 12 }, () => {
  const height = .1 + random() * .8;
  const side = random() > .5 ? 1 : -1;
  return {
    x: 360 + side * (205 * (1 - height) + 12 + random() * 34),
    y: 490 - height * 365,
    phase: random() * TAU,
    size: 4 + random() * 4
  };
});

export type Tree = { message: string; seed?: number };
type Glyph = { bitmap: HTMLCanvasElement; edge: number };
type Mark = { character: string; x: number; y: number; color: string };
type Anchor = { character: string; x: number; y: number };

function canvasScale() {
  return Math.min(matchMedia("(max-width: 799px)").matches ? 1.25 : 2, Math.max(1, window.devicePixelRatio || 1));
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

function bloomAt(time: number) {
  if (time < MESSAGE_END) return 0;
  if (time < GROW_END) return (time - MESSAGE_END) / (GROW_END - MESSAGE_END);
  if (time < HOLD_END) return 1;
  return 1 - (time - HOLD_END) / (LOOP - HOLD_END);
}

export type Scene = ReturnType<typeof createScene>;

// Draws on a transparent canvas so the page background (which changes with the lights) shows through.
export function createScene(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const glyphs = new Map<string, Glyph>();
  let dpr = 1;
  let message = SAMPLE;
  let layout: { anchors: Anchor[]; marks: Mark[]; tileSize: number; bitmap: HTMLCanvasElement };
  let ornamentColors: string[] = [];

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

  function star(x: number, y: number, points: number, outer: number, inner: number, color: string, alpha: number) {
    if (alpha < .02 || outer <= 0) return;
    ctx.globalAlpha = clamp(alpha);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let index = 0; index < points * 2; index += 1) {
      const radius = index % 2 ? inner : outer;
      const angle = -Math.PI / 2 + index * Math.PI / points;
      ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawSnow(time: number) {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    const cycle = time / LOOP * TAU;
    ctx.fillStyle = "#ffffff";
    for (const flake of snow) {
      const y = (flake.y + time / LOOP * flake.speed / 10 * HEIGHT) % HEIGHT;
      const x = flake.x + 7 * Math.sin(cycle + flake.phase);
      const pulse = .72 + .28 * Math.sin(cycle * 2 + flake.phase);
      ctx.globalAlpha = (.1 + .3 * flake.brightness) * pulse * smooth(y / 28) * smooth((HEIGHT - y) / 28);
      ctx.beginPath();
      ctx.arc(x, y, flake.size / 2, 0, TAU);
      ctx.fill();
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
          color: MOSAIC[(marks.length + Math.round(cell.y / spacing + size)) % MOSAIC.length]
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

  // `lit` runs from 0 (lights off) to 1 (lights on).
  function drawTree(time: number, mix: number, lit: number) {
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
        particle, source, target, movement, accent: ornamentColors[index],
        x: source.x + (target.x - source.x) * movement + (particle.drift - .5) * 95 * arc,
        y: source.y + (target.y - source.y) * movement - (37 + particle.delay * 51) * arc
      };
    }).sort((left, right) => left.target.depth - right.target.depth);

    light(360, 502, 102, "#ffd98a", smooth((mix - .35) / .5) * .22 * lit);
    for (const { particle, source, target, movement, accent, x, y } of visible) {
      const amplitude = smooth((mix - .025) / .15) * smooth(movement / .23);
      if (amplitude < .03) continue;
      const depth = (target.depth + 1) / 2;
      const index = Math.min(4, Math.floor(particle.tint * 3.1 + depth * 1.45));
      const color = particle.trunk ? TRUNK[Math.min(2, Math.floor(depth * 3))] : FOLIAGE[index];
      const size = movement < .35 ? tileSize : particle.ornament ? 13 : particle.tint > .73 ? 11 : 9;
      const sparkle = (.7 + .3 * Math.sin(seconds * 3.9 + particle.angle * 9)) * depth;
      if (particle.ornament && !particle.trunk && mix > .82 && depth > .54) {
        light(x, y, 13, accent, smooth((mix - .82) / .18) * sparkle * .75 * lit);
        drawGlyph(source.character, x, y, size, accent, amplitude * (.6 + sparkle * .4));
      } else {
        drawGlyph(source.character, x, y, size, movement < .35 ? source.color : color, amplitude * (.3 + .7 * depth));
      }
    }

    const strung = smooth((mix - .7) / .27);
    for (let index = 0; index < garland.length && strung > 0; index += 1) {
      const t = index / (garland.length - 1);
      const reveal = smooth(strung * 1.35 - t * .35);
      const bulb = project(garland[index], angle);
      const front = .25 + .75 * smooth((bulb.depth + .11) / .7);
      const flicker = .78 + .22 * Math.sin(seconds * 3.4 + index * .23);
      const character = anchors[index % anchors.length].character;
      drawGlyph(character, bulb.x, bulb.y, 8, BULB_OFF, reveal * front * .7 * (1 - lit));
      const shine = reveal * front * flicker * lit;
      if (index % 7 === 0) light(bulb.x, bulb.y, 11, "#ffe9b0", shine * .6);
      drawGlyph(character, bulb.x, bulb.y, 8, BULB_ON, shine * .9);
    }

    const crown = smooth((mix - .89) / .11);
    if (crown > .01) {
      const twinkle = .88 + .12 * Math.sin(seconds * 4);
      light(360, 112, 34, STAR, crown * twinkle * lit);
      star(360, 112, 5, 15 + 1.5 * lit * twinkle, 6.5, STAR, crown);
      for (const spark of twinkles) {
        const pulse = Math.max(0, Math.sin(seconds * 2.2 + spark.phase));
        star(spark.x, spark.y, 4, spark.size * pulse, spark.size * pulse * .22, "#ffffff", crown * lit * pulse);
      }
    }
  }

  fit();

  return {
    canvas,
    setTree({ message: value, seed = 0 }: Tree) {
      message = value;
      const next = seedRandom(seed);
      ornamentColors = tree.map(() => ORNAMENTS[Math.floor(next() * ORNAMENTS.length)]);
      glyphs.clear();
      layout = makeMosaic(value);
    },
    resize() {
      if (dpr === canvasScale()) return;
      fit();
      layout = makeMosaic(message);
    },
    render(time: number, lit: number) {
      const mix = bloomAt(time);
      drawSnow(time);
      drawTree(time, mix, lit);
      drawMessage(mix);
      ctx.globalAlpha = 1;
      return mix;
    }
  };
}
