import { LIMIT, splitText, type Tree } from "./scene.ts";

export function normalizeMessage(value: string) {
  return splitText(value.trim()).slice(0, LIMIT).join("");
}

export function linkFor({ message, seed }: Tree, address: string) {
  const url = new URL(address);
  const payload = new URLSearchParams({ tree: message });
  if (seed !== undefined) payload.set("seed", seed.toString(36));
  url.hash = payload.toString();
  return url.href;
}

// Reads a shared tree from `#tree=…&seed=…`. Untrusted input.
export function readLinkedTree(address: string): Tree | null {
  const fragment = new URLSearchParams(new URL(address).hash.slice(1));
  const message = normalizeMessage(fragment.get("tree") ?? "");
  if (!message) return null;
  const seedText = fragment.get("seed") ?? "";
  const seed = /^[a-z0-9]{1,7}$/.test(seedText) ? Number.parseInt(seedText, 36) : NaN;
  return Number.isInteger(seed) && seed <= 0xffffffff ? { message, seed } : { message };
}
