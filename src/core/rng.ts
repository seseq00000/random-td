/**
 * 시드 PRNG. core/ 전역에서 Math.random 사용을 금지하는 대신 이걸 쓴다.
 * 결정론이 유닛 테스트·리플레이·멀티 동기화의 전제 조건이다.
 */

export interface Rng {
  /** [0, 1) */
  next(): number
  /** [0, maxExclusive) 정수 */
  int(maxExclusive: number): number
  /** 배열에서 균등 추첨 */
  pick<T>(items: readonly T[]): T
  /** 현재 내부 상태 — 스냅샷/복원용 */
  getState(): number
  setState(state: number): void
}

/** mulberry32 — 32비트 상태, 빠르고 분포가 충분히 균등하다. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('rng.pick: 빈 배열')
      return items[Math.floor(next() * items.length)] as T
    },
    getState: () => state,
    setState: (s) => {
      state = s >>> 0
    },
  }
}
