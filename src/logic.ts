export type LoopMode = 'all' | 'one' | 'off' | 'sentence';
export function nextIndex(index: number, count: number, loop: LoopMode): number | null {
  if (loop === 'one') return index;
  if (index + 1 < count) return index + 1;
  return loop === 'all' ? 0 : null;
}
export function safeNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
export function speechChunk(text: string, start: number): string {
  const rest = text.slice(start);
  const sentence = rest.match(/^.*?[.!?](?:\s|$)/s)?.[0] ?? rest;
  if (sentence.length <= 240) return sentence;
  const cut = sentence.lastIndexOf(' ', 230);
  return sentence.slice(0, cut > 0 ? cut + 1 : 230);
}
export function clock(seconds: number): string {
  const n = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');
}

