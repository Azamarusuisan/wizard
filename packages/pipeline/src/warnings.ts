const seen = new Set<string>();

export function warnOnce(key: string, message: string) {
  if (seen.has(key)) return;
  seen.add(key);
  console.warn(message);
}
