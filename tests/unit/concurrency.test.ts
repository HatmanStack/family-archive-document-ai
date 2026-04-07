/**
 * Tests for mapWithConcurrency helper used by letter-processor.
 */
import { describe, it, expect } from 'vitest'
import { mapWithConcurrency } from '../../backend/lambdas/letter-processor/src/lib/concurrency'

describe('mapWithConcurrency', () => {
  it('returns results in input order on success', async () => {
    const items = [1, 2, 3, 4, 5]
    const result = await mapWithConcurrency(items, 2, async n => n * 2)
    expect(result).toEqual([2, 4, 6, 8, 10])
  })

  it('caps in-flight tasks at the concurrency limit', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const items = Array.from({ length: 20 }, (_, i) => i)
    await mapWithConcurrency(items, 5, async () => {
      inFlight++
      if (inFlight > maxInFlight) maxInFlight = inFlight
      await new Promise(r => setTimeout(r, 5))
      inFlight--
    })
    expect(maxInFlight).toBeLessThanOrEqual(5)
    expect(maxInFlight).toBeGreaterThan(1)
  })

  it('aborts and rethrows on first error', async () => {
    let processed = 0
    await expect(
      mapWithConcurrency([1, 2, 3, 4, 5], 2, async n => {
        processed++
        if (n === 3) throw new Error('boom')
        return n
      })
    ).rejects.toThrow('boom')
    // Should not process every item once an error fires.
    expect(processed).toBeLessThan(5 + 1)
  })

  it('rejects limit < 1', async () => {
    await expect(mapWithConcurrency([1], 0, async x => x)).rejects.toThrow(
      /limit must be >= 1/
    )
  })

  it('handles empty input', async () => {
    const result = await mapWithConcurrency<number, number>([], 5, async x => x)
    expect(result).toEqual([])
  })
})
