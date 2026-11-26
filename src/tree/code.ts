import { LOOP, splitText } from "./scene.ts";

export const CODE_ROWS = 5;

export type CodeLine = { line: string; letters: string[]; start: number; duration: number };
export type Token = { text: string; kind?: "code-string" | "code-keyword" | "code-name" };
export type EditorState = { index: number; first: number; typed: number; cursor: boolean };

const codePattern = /"(?:[^"\\]|\\.)*"|#[^\n]*|\b(?:from|import|def|return|for|in|while|yield|if|else|True)\b|\b(?:message|letters|cells|phase|target|source)\b|\b\d+(?:\.\d+)?\b/gu;
const keyword = /^(from|import|def|return|for|in|while|yield|if|else|True)$/;

// Each line gets a typing slot proportional to its length; slots are stretched to fill one animation loop.
export function makeCode(value: string): CodeLine[] {
  const source = [
    "message = " + JSON.stringify(value),
    "from math import cos, sin, tau",
    "",
    "letters = tuple(c for c in message",
    "                if not c.isspace())",
    "",
    "def glyph_at(index):",
    "    return letters[index % len(letters)]",
    "",
    "def smooth(x):",
    "    x = max(0, min(x, 1))",
    "    return x * x * (3 - 2 * x)",
    "",
    "def project(h, radius, angle):",
    "    depth = sin(angle)",
    "    x = 360 + cos(angle) * radius",
    "    y = 490 - h * 365 + depth * radius * .23",
    "    return x, y",
    "",
    "def morph(source, target, phase):",
    "    return source + (target - source) * smooth(phase)",
    "",
    "def spiral(step, total):",
    "    f = step / total",
    "    return f * tau * 3.45",
    "",
    "def frames():",
    "    while True:",
    "        for tick in range(" + Math.round(LOOP * 60 / 1000) + "):",
    "            phase = tick / 60",
    "            yield phase"
  ];
  let start = 0;
  const spans = source.map((line, index) => {
    const letters = splitText(line);
    const duration = (letters.length + (letters.length ? 7 : 10)) * (index % 3 === 0 ? .94 : 1.02);
    const span = { line, letters, start, duration };
    start += duration;
    return span;
  });
  return spans.map(span => ({ ...span, start: span.start * LOOP / start, duration: span.duration * LOOP / start }));
}

// Syntax-highlighted tokens for the first `length` letters of a line.
export function tokenize(row: CodeLine | undefined, length: number): Token[] {
  if (!row || !length) return [];
  const tokens: Token[] = [];
  const end = row.letters.slice(0, length).join("").length;
  let position = 0;
  for (const match of row.line.matchAll(codePattern)) {
    if (match.index >= end) break;
    if (match.index > position) tokens.push({ text: row.line.slice(position, match.index) });
    const kind = match[0].startsWith('"') || match[0].startsWith("#") ? "code-string"
      : keyword.test(match[0]) ? "code-keyword" : "code-name";
    const stop = Math.min(end, match.index + match[0].length);
    tokens.push({ text: row.line.slice(match.index, stop), kind });
    position = stop;
  }
  if (position < end) tokens.push({ text: row.line.slice(position, end) });
  return tokens;
}

export function editorState(timeline: CodeLine[], time: number, paused: boolean): EditorState {
  const upcoming = timeline.findIndex(span => span.start > time);
  const index = upcoming === -1 ? timeline.length - 1 : Math.max(0, upcoming - 1);
  const span = timeline[index];
  const typed = Math.min(span.letters.length, Math.floor((time - span.start) / (span.duration * .86) * span.letters.length) + 1);
  const first = Math.max(0, index - CODE_ROWS + 1);
  const cursor = paused || (time - span.start) % 650 < 440;
  return { index, first, typed, cursor };
}
