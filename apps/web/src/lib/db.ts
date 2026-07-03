import type { SolveResult, SolverRow } from "@gto-lab/engine-wasm";

const DB_NAME = "gto-lab";
const DB_VERSION = 1;
const STORES = ["solves", "ranges", "training"] as const;

type StoreName = (typeof STORES)[number];
type SolveRecord = {
  key: string;
  meta: { createdAt: number; spot: unknown };
  blob: {
    combos: string[];
    fold: Uint16Array;
    call: Uint16Array;
    raise: Uint16Array;
    equity: Uint16Array;
    ev: Float32Array;
    eqr: Float32Array;
    exploitability: { iteration: number; value: number }[];
    metrics: SolveResult["metrics"];
  };
};

let dbPromise: Promise<IDBDatabase> | null = null;

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export async function cacheKey(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function openGtoDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      for (const name of STORES) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: "key" });
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
  return dbPromise;
}

export async function putRecord<T extends { key: string }>(store: StoreName, value: T): Promise<void> {
  const db = await openGtoDb();
  await txDone(db.transaction(store, "readwrite").objectStore(store).put(value));
}

export async function getRecord<T>(store: StoreName, key: string): Promise<T | null> {
  const db = await openGtoDb();
  return await reqResult<T | undefined>(db.transaction(store).objectStore(store).get(key)) ?? null;
}

export async function clearStore(store: StoreName): Promise<void> {
  const db = await openGtoDb();
  await txDone(db.transaction(store, "readwrite").objectStore(store).clear());
}

export async function saveRange(name: string, text: string): Promise<void> {
  await putRecord("ranges", { key: name, text, updatedAt: Date.now(), version: 1 });
}

export async function loadRange(name: string): Promise<string | null> {
  return (await getRecord<{ text: string }>("ranges", name))?.text ?? null;
}

export async function saveSolve(spot: unknown, result: SolveResult): Promise<string> {
  const key = await cacheKey(spot);
  await putRecord<SolveRecord>("solves", { key, meta: { createdAt: Date.now(), spot }, blob: packSolve(result) });
  return key;
}

export async function loadSolve(spot: unknown): Promise<SolveResult | null> {
  const key = await cacheKey(spot);
  const rec = await getRecord<SolveRecord>("solves", key);
  return rec ? unpackSolve(rec.blob) : null;
}

function packProb(xs: number[]): Uint16Array {
  return Uint16Array.from(xs, (x) => Math.round(Math.max(0, Math.min(1, x)) * 65535));
}

function unpackProb(xs: Uint16Array): number[] {
  return [...xs].map((x) => x / 65535);
}

function packSolve(result: SolveResult): SolveRecord["blob"] {
  return {
    combos: result.rows.map((r) => r.combo),
    fold: packProb(result.rows.map((r) => r.fold)),
    call: packProb(result.rows.map((r) => r.call)),
    raise: packProb(result.rows.map((r) => r.raise)),
    equity: packProb(result.rows.map((r) => r.equity)),
    ev: Float32Array.from(result.rows.map((r) => r.ev)),
    eqr: Float32Array.from(result.rows.map((r) => r.eqr)),
    exploitability: result.exploitability,
    metrics: result.metrics
  };
}

function unpackSolve(blob: SolveRecord["blob"]): SolveResult {
  const fold = unpackProb(blob.fold);
  const call = unpackProb(blob.call);
  const raise = unpackProb(blob.raise);
  const equity = unpackProb(blob.equity);
  const rows: SolverRow[] = blob.combos.map((combo, i) => ({
    combo,
    fold: fold[i]!,
    call: call[i]!,
    raise: raise[i]!,
    equity: equity[i]!,
    ev: blob.ev[i]!,
    eqr: blob.eqr[i]!
  }));
  return { rows, exploitability: blob.exploitability, metrics: blob.metrics };
}

function reqResult<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

function txDone(req: IDBRequest<any>): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = req.transaction;
    if (!tx) {
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
      return;
    }
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
  });
}
