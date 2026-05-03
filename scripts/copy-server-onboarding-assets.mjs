import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "server/src/onboarding-assets");
const target = resolve(root, "server/dist/onboarding-assets");

await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
