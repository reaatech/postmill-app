// Run `fn` over `items` with at most `concurrency` calls in flight at once, preserving
// input order in the returned array. Bounds load on rate-limited / CPU-heavy fan-outs
// (e.g. live analytics provider calls, per-post comment sync) — never an unbounded
// Promise.all. Errors propagate; callers needing per-item resilience should try/catch
// inside `fn`.
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let next = 0;

  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  });

  await Promise.all(workers);
  return results;
}
