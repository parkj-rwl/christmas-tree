// Run: npm run check
import assert from "node:assert/strict";
import { linkFor, readLinkedTree } from "./link.ts";

const base = "https://example.com/";
const tree = { message: "메리 크리스마스 🎄", seed: 0xffffffff };
assert.deepEqual(readLinkedTree(linkFor(tree, base)), tree);
assert.equal(readLinkedTree(base), null);
assert.equal(readLinkedTree(base + "#tree=%20%20"), null);
assert.deepEqual(readLinkedTree(base + "#tree=hi&color=red"), { message: "hi", color: "red" });
assert.deepEqual(readLinkedTree(base + "#tree=hi&color=__proto__"), { message: "hi", color: "green" });
assert.deepEqual(readLinkedTree(base + "#tree=hi&seed=zzzzzzz"), { message: "hi", color: "green" });
assert.equal(readLinkedTree(base + "#tree=" + "가".repeat(60))?.message, "가".repeat(48));
console.log("link ok");
