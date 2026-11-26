import { HEIGHT, LOOP, PALETTE, WIDTH, type Scene } from "./scene.ts";

// Matches the body background in index.css for each lights state.
const BACKGROUND = { on: "#0d1627", off: "#0b3a30" };

const rgb = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [value >> 16, (value >> 8) & 255, value & 255];
};

// Fixed palette: the background, a ramp to white for snow, and a ramp toward every scene colour.
function makePalette(background: string) {
  const base = rgb(background);
  const colors: number[][] = [base];
  function ramp(to: number[], steps: number) {
    for (let step = 1; step <= steps; step += 1) {
      colors.push(base.map((channel, index) => Math.round(channel + (to[index] - channel) * step / steps)));
    }
  }
  ramp([255, 255, 255], 24);
  for (const color of PALETTE) ramp(rgb(color), 12);
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

// Renders one full loop of the scene into an animated GIF. Returns null if cancelled.
export async function recordGif(
  scene: Scene,
  lightsOn: boolean,
  onProgress: (percent: number) => void,
  cancelled: () => boolean
) {
  const frame = document.createElement("canvas");
  frame.width = 480;
  frame.height = Math.round(HEIGHT * frame.width / WIDTH);
  const capture = frame.getContext("2d", { willReadFrequently: true })!;
  const background = lightsOn ? BACKGROUND.on : BACKGROUND.off;
  const palette = makePalette(background);
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
    scene.render(time, lightsOn ? 1 : 0);
    capture.fillStyle = background;
    capture.fillRect(0, 0, frame.width, frame.height);
    capture.drawImage(scene.canvas, 0, 0, frame.width, frame.height);
    indexPixels(capture.getImageData(0, 0, frame.width, frame.height).data, pixels);
    gif.addFrame(pixels);
  }
  return gif.finish();
}
