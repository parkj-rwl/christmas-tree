import { HEIGHT, LOOP, WIDTH, allThemes, type Scene } from "./scene.ts";
import { CODE_ROWS, editorState, tokenize, type CodeLine } from "./code.ts";

const editorRowHeight = 19;
const editorHeight = 18 + CODE_ROWS * editorRowHeight;
const tokenColors: Record<string, string> = { "code-string": "#ebc081", "code-keyword": "#d4afea", "code-name": "#a2d8f6" };

function drawEditor(context: CanvasRenderingContext2D, top: number, time: number, timeline: CodeLine[]) {
  const width = context.canvas.width;
  const { index, first, typed, cursor } = editorState(timeline, time, false);
  context.save();
  context.translate(0, top);
  context.fillStyle = "#0d1d26";
  context.fillRect(0, 0, width, editorHeight);
  context.fillStyle = "#1b343b";
  context.fillRect(0, 0, width, 2);
  context.fillStyle = "#5aa487";
  context.fillRect(0, 0, width * time / LOOP, 2);
  context.font = "12px Menlo, Consolas, monospace";
  context.textBaseline = "middle";
  for (let lineIndex = first; lineIndex <= index; lineIndex++) {
    const row = timeline[lineIndex];
    const active = lineIndex === index;
    const y = 9 + (lineIndex - first) * editorRowHeight;
    const middle = y + editorRowHeight / 2;
    if (active) {
      context.fillStyle = "#172f39";
      context.fillRect(0, y, width, editorRowHeight);
      context.fillStyle = "#83e7b4";
      context.fillRect(0, y, 2, editorRowHeight);
    }
    context.fillStyle = "#789599";
    context.textAlign = "right";
    context.fillText(String(lineIndex + 1), 31, middle);
    context.textAlign = "left";
    let x = 44;
    for (const token of tokenize(row, active ? typed : row.letters.length)) {
      context.fillStyle = (token.kind && tokenColors[token.kind]) || "#b8d1d5";
      context.fillText(token.text, x, middle);
      x += context.measureText(token.text).width;
    }
    if (active && cursor) {
      context.fillStyle = "#9becc1";
      context.fillRect(Math.min(x + 1, width - 3), middle - 6, 2, 12);
    }
  }
  context.restore();
}

// Fixed palette: dark background ramps plus a ramp toward every theme accent.
function makePalette() {
  const colors: number[][] = [];
  function ramp(from: number[], to: number[], steps: number) {
    for (let step = 1; step <= steps; step += 1) {
      colors.push(from.map((channel, index) => Math.round(channel + (to[index] - channel) * step / steps)));
    }
  }
  const dark = [9, 23, 29];
  ramp([3, 10, 15], [24, 48, 51], 30);
  ramp([7, 17, 26], [44, 85, 79], 15);
  const accents = allThemes.flatMap(theme =>
    [theme.foliage[0], theme.foliage[2], theme.foliage[4], theme.ornaments[0], theme.garland]
  );
  accents.push("#e3f9e9", "#e1aa73", "#b4cfda", "#fff1cb");
  for (const hex of accents) {
    const value = Number.parseInt(hex.slice(1), 16);
    ramp(dark, [value >> 16, (value >> 8) & 255, value & 255], 8);
  }
  return colors;
}

function colorIndexer(palette: number[][]) {
  const lookup = new Int16Array(64 ** 3);
  lookup.fill(-1);
  return function indexPixels(rgba: Uint8ClampedArray, pixels: Uint8Array) {
    for (let pixel = 0, offset = 0; pixel < pixels.length; pixel += 1, offset += 4) {
      const r = rgba[offset], g = rgba[offset + 1], b = rgba[offset + 2];
      const key = (r >> 2) * 4096 + (g >> 2) * 64 + (b >> 2);
      if (lookup[key] === -1) {
        let bestDistance = Infinity;
        for (let index = 0; index < palette.length; index += 1) {
          const [red, green, blue] = palette[index];
          const distance = 2 * (r - red) ** 2 + 3 * (g - green) ** 2 + (b - blue) ** 2;
          if (distance < bestDistance) {
            bestDistance = distance;
            lookup[key] = index;
          }
        }
      }
      pixels[pixel] = lookup[key];
    }
  };
}

// GIF-flavoured LZW with 8-bit minimum code size.
function packCodes(pixels: Uint8Array) {
  const clear = 256;
  const stop = 257;
  const dictionary = new Map<number, number>();
  const bytes: number[] = [];
  let bits = 0, buffer = 0, width = 9, next = 258;
  function write(code: number) {
    buffer |= code << bits;
    bits += width;
    while (bits >= 8) {
      bytes.push(buffer & 255);
      buffer >>>= 8;
      bits -= 8;
    }
  }
  write(clear);
  let prefix = pixels[0];
  for (let index = 1; index < pixels.length; index += 1) {
    const color = pixels[index];
    const key = (prefix << 8) | color;
    const match = dictionary.get(key);
    if (match !== undefined) {
      prefix = match;
      continue;
    }
    write(prefix);
    if (next < 4096) {
      if (next === (1 << width)) width += 1;
      dictionary.set(key, next++);
    } else {
      write(clear);
      dictionary.clear();
      width = 9;
      next = 258;
    }
    prefix = color;
  }
  write(prefix);
  if (width < 12 && next === (1 << width)) width += 1;
  write(stop);
  if (bits) bytes.push(buffer & 255);
  return Uint8Array.from(bytes);
}

function newGif(width: number, height: number, palette: number[][], delay: number) {
  const word = (value: number) => [value & 255, value >> 8];
  const size = [...word(width), ...word(height)];
  const colors = new Uint8Array(256 * 3);
  colors.set(palette.flat());
  const parts: Uint8Array[] = [
    Uint8Array.from([71, 73, 70, 56, 57, 97, ...size, 0xf7, 0, 0]),
    colors,
    Uint8Array.from([0x21, 0xff, 11, 78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48, 3, 1, 0, 0, 0])
  ];
  const frameHeader = Uint8Array.from([0x21, 0xf9, 4, 4, ...word(delay), 0, 0, 0x2c, 0, 0, 0, 0, ...size, 0, 8]);
  return {
    addFrame(pixels: Uint8Array) {
      const bytes = packCodes(pixels);
      const blocks = new Uint8Array(bytes.length + Math.ceil(bytes.length / 255) + 1);
      let output = 0;
      for (let offset = 0; offset < bytes.length; offset += 255) {
        const block = bytes.subarray(offset, offset + 255);
        blocks[output++] = block.length;
        blocks.set(block, output);
        output += block.length;
      }
      parts.push(frameHeader, blocks);
    },
    finish() {
      return new Blob([...parts, Uint8Array.of(0x3b)] as BlobPart[], { type: "image/gif" });
    }
  };
}

// Renders one full loop (scene + editor strip) into an animated GIF. Returns null if cancelled.
export async function recordGif(
  scene: Scene,
  timeline: CodeLine[],
  onProgress: (percent: number) => void,
  cancelled: () => boolean
) {
  const frame = document.createElement("canvas");
  frame.width = 480;
  const sceneHeight = Math.round(HEIGHT * frame.width / WIDTH);
  frame.height = sceneHeight + editorHeight;
  const capture = frame.getContext("2d", { willReadFrequently: true })!;
  const palette = makePalette();
  const indexPixels = colorIndexer(palette);
  const pixels = new Uint8Array(frame.width * frame.height);
  const step = 80;
  const gif = newGif(frame.width, frame.height, palette, step / 10);
  for (let time = 0, index = 0; time < LOOP; time += step, index += 1) {
    if (index % 4 === 0) {
      onProgress(Math.floor(time / LOOP * 100));
      await new Promise(resolve => setTimeout(resolve, 0));
      if (cancelled()) return null;
    }
    scene.render(time);
    capture.drawImage(scene.canvas, 0, 0, frame.width, sceneHeight);
    drawEditor(capture, sceneHeight, time, timeline);
    indexPixels(capture.getImageData(0, 0, frame.width, frame.height).data, pixels);
    gif.addFrame(pixels);
  }
  return gif.finish();
}
