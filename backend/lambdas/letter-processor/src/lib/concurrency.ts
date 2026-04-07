/**
 * Bounded-concurrency parallel map.
 *
 * Runs `fn(item, index)` for each item with at most `limit` in flight at once.
 * Preserves output ordering by index. If any task rejects, the returned
 * promise rejects with the first error (after in-flight tasks settle).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (limit < 1) throw new Error('mapWithConcurrency: limit must be >= 1')
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  let firstError: unknown = undefined

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++
      if (i >= items.length) return
      if (firstError !== undefined) return
      try {
        results[i] = await fn(items[i], i)
      } catch (err) {
        if (firstError === undefined) firstError = err
        return
      }
    }
  }

  const workerCount = Math.min(limit, items.length)
  const workers: Promise<void>[] = []
  for (let i = 0; i < workerCount; i++) workers.push(worker())
  await Promise.all(workers)

  if (firstError !== undefined) throw firstError
  return results
}
