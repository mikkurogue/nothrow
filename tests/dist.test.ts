import { describe, expect, test } from 'vite-plus/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const distEntry = resolve(process.cwd(), 'dist/index.mjs');
const runOrSkip = existsSync(distEntry) ? test : test.skip;

describe('Published surface (dist)', () => {
  runOrSkip('exports expected public API from dist/index.mjs', async () => {
    const mod = await import(distEntry);

    expect(typeof mod.Result).toBe('object');
    expect(typeof mod.ok).toBe('function');
    expect(typeof mod.err).toBe('function');
    expect(typeof mod.try).toBe('function');
    expect(typeof mod.tryAsync).toBe('function');
    expect(typeof mod.taggedError).toBe('function');
  });
});
