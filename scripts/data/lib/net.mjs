// Polite HTTP helpers for the build scripts. Node 24 built-ins only.
// Every request carries a descriptive User-Agent, requests to the same host are
// at least MIN_GAP_MS apart, and nothing is retried more than MAX_TRIES times.
// Downloaded bytes are data: they are written to disk and parsed, never executed.

import { createWriteStream } from 'node:fs';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const UA = 'ImmoMogul-build/0.1 (personal open-data project)';
export const MIN_GAP_MS = 1100;
export const MAX_TRIES = 3;

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CACHE_DIR = path.resolve(HERE, '..', '..', '.cache');
export const PROJECT_DIR = path.resolve(HERE, '..', '..', '..');
export const DATA_DIR = path.join(PROJECT_DIR, 'data');

const lastByHost = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function politeWait(url) {
  const host = new URL(url).host;
  const last = lastByHost.get(host) || 0;
  const wait = last + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastByHost.set(host, Date.now());
}

/** fetch with User-Agent, per-host gap and bounded retries. Follows redirects. */
export async function politeFetch(url, init = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    await politeWait(url);
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        ...init,
        headers: { 'User-Agent': UA, ...(init.headers || {}) },
      });
      if (res.status >= 500 && attempt < MAX_TRIES) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        await res.arrayBuffer().catch(() => {});
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_TRIES) break;
    }
  }
  throw lastErr;
}

export async function fetchJson(url) {
  const res = await politeFetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

export async function fetchText(url) {
  const res = await politeFetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** Stream a URL to a file. Returns { bytes, sha256, finalUrl, status }. */
export async function downloadToFile(url, filePath) {
  const res = await politeFetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  await mkdir(path.dirname(filePath), { recursive: true });
  const hash = createHash('sha256');
  let bytes = 0;
  const counter = new TransformStream({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      hash.update(chunk);
      controller.enqueue(chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body.pipeThrough(counter)), createWriteStream(filePath));
  return { bytes, sha256: hash.digest('hex'), finalUrl: stripQuery(res.url), status: res.status };
}

/** The signed storage link carries credentials in its query string; keep only the path. */
export function stripQuery(url) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

export function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export async function readMeta(filePath) {
  try {
    return JSON.parse(await readFile(`${filePath}.meta.json`, 'utf8'));
  } catch {
    return null;
  }
}

export async function writeMeta(filePath, meta) {
  await writeFile(`${filePath}.meta.json`, JSON.stringify(meta, null, 2) + '\n');
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** First line of a file (the CSV header) without reading the whole file. */
export async function firstLine(filePath) {
  const fh = await open(filePath, 'r');
  try {
    const buf = Buffer.alloc(65536);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    const text = buf.subarray(0, bytesRead).toString('utf8').replace(/^﻿/, '');
    return text.split(/\r?\n/)[0];
  } finally {
    await fh.close();
  }
}
