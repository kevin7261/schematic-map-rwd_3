import { pathToFileURL } from 'node:url';

const srcRoot = new URL('./src/', import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const mapped = new URL(specifier.slice(2), srcRoot).href;
    return nextResolve(mapped, context);
  }
  return nextResolve(specifier, context);
}
