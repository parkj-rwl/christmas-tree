import { LIMIT, splitText, themes, type Tree } from "./scene.ts";

export function normalizeMessage(value: string) {
  return splitText(value.trim()).slice(0, LIMIT).join("");
}

function encodeTree({ message, seed, color }: Tree) {
  const payload = new URLSearchParams({ tree: message });
  if (seed !== undefined) payload.set("seed", seed.toString(36));
  else if (color) payload.set("color", color);
  return payload.toString();
}

export function linkFor(tree: Tree, address: string) {
  const url = new URL(address);
  url.hash = encodeTree(tree);
  return url.href;
}

// Reads a shared tree from `#tree=…&seed=…` (or the older `&color=…` form). Untrusted input.
export function readLinkedTree(address: string): Tree | null {
  const fragment = new URLSearchParams(new URL(address).hash.slice(1));
  const message = normalizeMessage(fragment.get("tree") ?? "");
  if (!message) return null;
  const seedText = fragment.get("seed") ?? "";
  const seed = /^[a-z0-9]{1,7}$/.test(seedText) ? Number.parseInt(seedText, 36) : NaN;
  if (Number.isInteger(seed) && seed <= 0xffffffff) return { message, seed };
  const color = fragment.get("color") ?? "";
  return { message, color: Object.hasOwn(themes, color) ? color : "green" };
}
