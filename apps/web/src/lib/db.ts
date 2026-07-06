import type { SolveResult, SolverRow } from "@gto-lab/engine-wasm";

const DB_NAME = "gto-lab";
const DB_VERSION = 1;
const SOLVE_RECORD_VERSION = 1;
const STORES = ["solves", "ranges", "training"] as const;

type StoreName = (typeof STORES)[number];
export type CacheStats = Record<StoreName, number>;
export type SolveSummary = { key: string; createdAt: number; spot: unknown };
export type TrainingResult = { key: string; createdAt: number; spot: string; nodeId: string; street: string; hand: string; action: string; evLoss: number; grade: string };
type SolveRecord = {
  key: string;
  meta: { version: number; createdAt: number; spot: unknown };
  blob: {
    nodes?: SolveResult["nodes"];
    informationSets?: SolveResult["informationSets"];
    combos: string[];
    handClasses?: string[];
    weights?: Float32Array;
    blockers?: Float32Array;
    fold: Uint16Array;
    call: Uint16Array;
    raise: Uint16Array;
    foldEv?: Float32Array;
    callEv?: Float32Array;
    raiseEv?: Float32Array;
    bestRaiseAmount?: Float32Array;
    equity: Uint16Array;
    ev: Float32Array;
    eqr: Float32Array;
    exploitability: { iteration: number; value: number }[];
    metrics: SolveResult["metrics"];
  };
};

const DEFAULT_SOLVE_CACHE_BYTES = 500 * 1024 * 1024;

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

export async function clearAllData(): Promise<void> {
  await Promise.all(STORES.map((store) => clearStore(store)));
}

export async function deleteSolve(key: string): Promise<void> {
  const db = await openGtoDb();
  await txDone(db.transaction("solves", "readwrite").objectStore("solves").delete(key));
}

export async function listSolveRecords(): Promise<SolveSummary[]> {
  const db = await openGtoDb();
  const records = await reqResult<SolveRecord[]>(db.transaction("solves").objectStore("solves").getAll());
  return records
    .map((rec) => ({ key: rec.key, createdAt: rec.meta.createdAt, spot: rec.meta.spot }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function cacheStats(): Promise<CacheStats> {
  const entries = await Promise.all(STORES.map(async (store) => [store, await countStore(store)] as const));
  return Object.fromEntries(entries) as CacheStats;
}

export async function pruneSolveCache(maxBytes = DEFAULT_SOLVE_CACHE_BYTES): Promise<void> {
  const db = await openGtoDb();
  const tx = db.transaction("solves", "readwrite");
  const store = tx.objectStore("solves");
  const records = await reqResult<SolveRecord[]>(store.getAll());
  let total = records.reduce((sum, rec) => sum + solveRecordBytes(rec), 0);
  const oldest = records.sort((a, b) => a.meta.createdAt - b.meta.createdAt);
  for (const rec of oldest) {
    if (total <= maxBytes) break;
    total -= solveRecordBytes(rec);
    store.delete(rec.key);
  }
  await txComplete(tx);
}

export async function saveRange(name: string, text: string): Promise<void> {
  await putRecord("ranges", { key: name, text, updatedAt: Date.now(), version: 1 });
}

export async function loadRange(name: string): Promise<string | null> {
  return (await getRecord<{ text: string }>("ranges", name))?.text ?? null;
}

export async function saveTrainingResult(result: Omit<TrainingResult, "key" | "createdAt">): Promise<string> {
  const createdAt = Date.now();
  const suffix = "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  const key = `${createdAt}-${suffix}`;
  await putRecord<TrainingResult>("training", { key, createdAt, ...result });
  return key;
}

export async function listTrainingResults(): Promise<TrainingResult[]> {
  const db = await openGtoDb();
  const records = await reqResult<TrainingResult[]>(db.transaction("training").objectStore("training").getAll());
  return records.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveSolve(spot: unknown, result: SolveResult): Promise<string> {
  const key = await cacheKey(spot);
  await putRecord<SolveRecord>("solves", { key, meta: { version: SOLVE_RECORD_VERSION, createdAt: Date.now(), spot }, blob: packSolve(result) });
  await pruneSolveCache();
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
    nodes: result.nodes,
    informationSets: result.informationSets,
    combos: result.rows.map((r) => r.combo),
    handClasses: result.rows.map((r) => r.handClass),
    weights: Float32Array.from(result.rows.map((r) => r.weight)),
    blockers: Float32Array.from(result.rows.flatMap((r) => [r.blockedCombos, r.blockerPct])),
    fold: packProb(result.rows.map((r) => r.fold)),
    call: packProb(result.rows.map((r) => r.call)),
    raise: packProb(result.rows.map((r) => r.raise)),
    foldEv: Float32Array.from(result.rows.map((r) => r.foldEv)),
    callEv: Float32Array.from(result.rows.map((r) => r.callEv)),
    raiseEv: Float32Array.from(result.rows.map((r) => r.raiseEv)),
    bestRaiseAmount: Float32Array.from(result.rows.map((r) => r.bestRaiseAmount)),
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
    handClass: blob.handClasses?.[i] ?? "unknown",
    weight: blob.weights?.[i] ?? 1,
    blockedCombos: blob.blockers?.[i * 2] ?? 0,
    blockerPct: blob.blockers?.[i * 2 + 1] ?? 0,
    fold: fold[i]!,
    call: call[i]!,
    raise: raise[i]!,
    foldEv: blob.foldEv?.[i] ?? 0,
    callEv: blob.callEv?.[i] ?? 0,
    raiseEv: blob.raiseEv?.[i] ?? 0,
    bestRaiseAmount: blob.bestRaiseAmount?.[i] ?? 0,
    equity: equity[i]!,
    ev: blob.ev[i]!,
    eqr: blob.eqr[i]!
  }));
  const nodes = blob.nodes ?? [{ id: "root", label: "Root", street: "preflop", actions: ["fold", "call", "raise"], infoSet: "preflop:root" }];
  return { nodes, informationSets: blob.informationSets ?? infoSetsFromNodes(nodes), rows, exploitability: blob.exploitability, metrics: blob.metrics };
}

function infoSetsFromNodes(nodes: SolveResult["nodes"]): SolveResult["informationSets"] {
  return nodes.map((node) => ({ key: node.infoSet ?? `${node.street}:${node.id}`, nodeId: node.id, street: node.street, actions: node.actions, ...infoSetRefs(node) }));
}

function infoSetRefs(node: SolveResult["nodes"][number]): Pick<SolveResult["informationSets"][number], "strategyRef" | "metricRef"> {
  if (node.amount !== undefined && node.actions.length) return { strategyRef: "bet-response", metricRef: "bet-response" };
  if (node.amount !== undefined) return { strategyRef: "terminal", metricRef: `response:${node.id}` };
  if (node.id === "root") return { strategyRef: "root", metricRef: "root" };
  if (node.id === "root/raise-sizes") return { strategyRef: "raise-sizes", metricRef: "raise-sizes" };
  if (node.id.startsWith("root/turn-") || node.id.startsWith("root/river-")) return { strategyRef: "root", metricRef: "root" };
  if (node.id.startsWith("root/")) return { strategyRef: "terminal", metricRef: `action:${node.id.slice("root/".length)}` };
  return { strategyRef: node.id, metricRef: node.id };
}

function reqResult<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

function countStore(store: StoreName): Promise<number> {
  return openGtoDb().then((db) => reqResult<number>(db.transaction(store).objectStore(store).count()));
}

function solveRecordBytes(rec: SolveRecord): number {
  const blob = rec.blob;
  return JSON.stringify(rec.meta).length + JSON.stringify(blob.nodes ?? []).length + JSON.stringify(blob.informationSets ?? []).length + blob.combos.join("").length + (blob.handClasses?.join("").length ?? 0) + (blob.weights?.byteLength ?? 0) + (blob.blockers?.byteLength ?? 0) + blob.fold.byteLength + blob.call.byteLength + blob.raise.byteLength + (blob.foldEv?.byteLength ?? 0) + (blob.callEv?.byteLength ?? 0) + (blob.raiseEv?.byteLength ?? 0) + (blob.bestRaiseAmount?.byteLength ?? 0) + blob.equity.byteLength + blob.ev.byteLength + blob.eqr.byteLength + blob.exploitability.length * 16 + 64;
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

function txComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
  });
}
