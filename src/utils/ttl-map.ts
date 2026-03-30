/**
 * A Map with automatic TTL-based expiration.
 * Entries are proactively removed via setTimeout, preventing memory leaks
 * from entries that are set but never read again.
 */
export class TtlMap<K, V> {
  private map = new Map<K, { value: V; timer: ReturnType<typeof setTimeout> }>();

  constructor(private defaultTtlMs: number) {}

  set(key: K, value: V, ttlMs?: number): void {
    this.delete(key); // clear existing timer if key is overwritten
    const timer = setTimeout(() => this.map.delete(key), ttlMs ?? this.defaultTtlMs);
    timer.unref(); // don't block process exit
    this.map.set(key, { value, timer });
  }

  get(key: K): V | undefined {
    return this.map.get(key)?.value;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    const entry = this.map.get(key);
    if (entry) {
      clearTimeout(entry.timer);
      this.map.delete(key);
      return true;
    }
    return false;
  }

  get size(): number {
    return this.map.size;
  }
}
