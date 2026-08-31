import { describe, expect, it } from 'vitest'
import { createRng } from '../src/core/rng.js'

describe('rng', () => {
  it('같은 시드는 같은 수열을 낸다', () => {
    const a = createRng(12345)
    const b = createRng(12345)
    const seqA = Array.from({ length: 100 }, () => a.next())
    const seqB = Array.from({ length: 100 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('다른 시드는 다른 수열을 낸다', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(a.next()).not.toBe(b.next())
  })

  it('next()는 [0,1) 범위를 벗어나지 않는다', () => {
    const rng = createRng(777)
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('분포가 균등하다 (10만 회, 10구간 각 10% ±0.5%p)', () => {
    const rng = createRng(2024)
    const buckets = new Array(10).fill(0)
    const N = 100_000
    for (let i = 0; i < N; i++) buckets[Math.floor(rng.next() * 10)]++
    for (const count of buckets) {
      expect(Math.abs(count / N - 0.1)).toBeLessThan(0.005)
    }
  })

  it('int(n)은 [0,n) 정수를 낸다', () => {
    const rng = createRng(42)
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(6)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(6)
    }
  })

  it('상태를 저장·복원하면 이후 수열이 재현된다', () => {
    const rng = createRng(99)
    rng.next()
    rng.next()
    const snapshot = rng.getState()
    const after = [rng.next(), rng.next(), rng.next()]
    rng.setState(snapshot)
    expect([rng.next(), rng.next(), rng.next()]).toEqual(after)
  })

  it('빈 배열 pick 은 에러', () => {
    expect(() => createRng(1).pick([])).toThrow()
  })
})
