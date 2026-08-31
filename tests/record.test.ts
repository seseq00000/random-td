import { describe, expect, it } from 'vitest'
import { Game } from '../src/core/gameState.js'
import {
  NICKNAME_MAX,
  bestPerNickname,
  buildRecord,
  compareRecords,
  describeRecord,
  normalizeNickname,
  rankOf,
  rankRecords,
  type RunRecord,
} from '../src/core/record.js'
import {
  LocalRecordStore,
  MAX_RECORDS,
  MemoryRecordStore,
  type RecordStore,
} from '../src/storage/recordStore.js'

function rec(overrides: Partial<RunRecord> = {}): RunRecord {
  const playedAt = overrides.playedAt ?? 1_000
  const seed = overrides.seed ?? 1
  return {
    id: `${playedAt}-${seed}`,
    nickname: 'tester',
    playedAt,
    seed,
    reachedWave: 10,
    cleared: false,
    life: 5,
    missionsCleared: 3,
    missionGold: 500,
    challengesUsed: 1,
    topTier: 4,
    slots: 6,
    durationSec: 600,
    ...overrides,
  }
}

describe('닉네임 정규화', () => {
  it('앞뒤 공백을 없앤다', () => {
    expect(normalizeNickname('  홍길동  ')).toBe('홍길동')
  })

  it('연속 공백을 하나로 접는다', () => {
    expect(normalizeNickname('홍   길동')).toBe('홍 길동')
  })

  it('길이를 잘라낸다', () => {
    const long = 'a'.repeat(NICKNAME_MAX + 10)
    expect(normalizeNickname(long)?.length).toBe(NICKNAME_MAX)
  })

  it('비어 있으면 null', () => {
    expect(normalizeNickname('')).toBeNull()
    expect(normalizeNickname('    ')).toBeNull()
  })
})

describe('순위 규칙 — 도달 웨이브 → 라이프 → 미션', () => {
  it('도달 웨이브가 높은 쪽이 상위다', () => {
    const high = rec({ reachedWave: 20, life: 1 })
    const low = rec({ reachedWave: 19, life: 20, playedAt: 2000 })
    expect(rankRecords([low, high])[0]).toBe(high)
  })

  it('웨이브가 같으면 라이프로 가린다', () => {
    const more = rec({ reachedWave: 20, life: 9, playedAt: 2000 })
    const less = rec({ reachedWave: 20, life: 3 })
    expect(rankRecords([less, more])[0]).toBe(more)
  })

  it('웨이브·라이프가 같으면 미션 수로 가린다', () => {
    const more = rec({ reachedWave: 20, life: 5, missionsCleared: 9, playedAt: 2000 })
    const less = rec({ reachedWave: 20, life: 5, missionsCleared: 2 })
    expect(rankRecords([less, more])[0]).toBe(more)
  })

  it('전부 같으면 먼저 기록한 쪽이 상위다', () => {
    const first = rec({ playedAt: 100, seed: 1 })
    const second = rec({ playedAt: 200, seed: 2 })
    expect(rankRecords([second, first])[0]).toBe(first)
  })

  it('클리어한 기록이 자연히 최상위로 온다', () => {
    // 클리어하면 wave 가 TOTAL_WAVES + 1 이라 별도 규칙이 필요 없다
    const cleared = rec({ reachedWave: 31, cleared: true, life: 1, playedAt: 5000 })
    const almost = rec({ reachedWave: 30, life: 20 })
    expect(rankRecords([almost, cleared])[0]).toBe(cleared)
  })

  it('정렬이 원본 배열을 건드리지 않는다', () => {
    const a = rec({ reachedWave: 5 })
    const b = rec({ reachedWave: 25, playedAt: 2000 })
    const input = [a, b]
    rankRecords(input)
    expect(input).toEqual([a, b])
  })

  it('compareRecords 는 정렬 함수로 일관되게 동작한다', () => {
    const a = rec({ reachedWave: 20, playedAt: 1 })
    const b = rec({ reachedWave: 10, playedAt: 2 })
    expect(compareRecords(a, b)).toBeLessThan(0)
    expect(compareRecords(b, a)).toBeGreaterThan(0)
    expect(compareRecords(a, a)).toBe(0)
  })
})

describe('rankOf', () => {
  it('1-based 순위를 준다', () => {
    const top = rec({ reachedWave: 30, playedAt: 1, seed: 1 })
    const mid = rec({ reachedWave: 20, playedAt: 2, seed: 2 })
    const low = rec({ reachedWave: 10, playedAt: 3, seed: 3 })
    const all = [low, top, mid]
    expect(rankOf(all, top.id)).toBe(1)
    expect(rankOf(all, mid.id)).toBe(2)
    expect(rankOf(all, low.id)).toBe(3)
  })

  it('없는 id 는 0', () => {
    expect(rankOf([rec()], 'nope')).toBe(0)
  })
})

describe('bestPerNickname', () => {
  it('닉네임마다 최고 기록만 남긴다', () => {
    const aLow = rec({ nickname: 'A', reachedWave: 10, playedAt: 1, seed: 1 })
    const aHigh = rec({ nickname: 'A', reachedWave: 25, playedAt: 2, seed: 2 })
    const b = rec({ nickname: 'B', reachedWave: 20, playedAt: 3, seed: 3 })

    const best = bestPerNickname([aLow, aHigh, b])
    expect(best).toHaveLength(2)
    expect(best[0]).toBe(aHigh)
    expect(best[1]).toBe(b)
  })

  it('기록이 없으면 빈 배열', () => {
    expect(bestPerNickname([])).toEqual([])
  })
})

describe('buildRecord', () => {
  it('끝난 게임에서 기록을 만든다', () => {
    const game = new Game(777)
    game.grantUnit('t1_single')
    game.step(1 / 60)

    const r = buildRecord(game, { nickname: '홍길동', playedAt: 12345, challengesUsed: 2 })
    expect(r.id).toBe('12345-777')
    expect(r.nickname).toBe('홍길동')
    expect(r.seed).toBe(777)
    expect(r.reachedWave).toBe(game.wave)
    expect(r.cleared).toBe(false)
    expect(r.challengesUsed).toBe(2)
    expect(r.topTier).toBe(1)
  })

  it('클리어 여부가 반영된다', () => {
    const game = new Game(1)
    game.over = 'victory'
    const r = buildRecord(game, { nickname: 'x', playedAt: 1, challengesUsed: 0 })
    expect(r.cleared).toBe(true)
  })

  it('경과 시간이 누적된다', () => {
    const game = new Game(1)
    for (let i = 0; i < 120; i++) game.step(1 / 60)
    const r = buildRecord(game, { nickname: 'x', playedAt: 1, challengesUsed: 0 })
    expect(r.durationSec).toBe(2)
  })
})

describe('describeRecord', () => {
  it('클리어와 탈락을 구분한다', () => {
    expect(describeRecord(rec({ cleared: true, life: 7 }))).toContain('클리어')
    expect(describeRecord(rec({ cleared: false, reachedWave: 13 }))).toContain('13')
  })
})

// ── 저장소 ────────────────────────────────────────────────

/** localStorage 를 흉내내는 최소 구현 */
function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  }
}

/** 접근할 때마다 던지는 저장소 — 사생활 보호 모드 등을 흉내낸다 */
function brokenStorage(): Storage {
  const boom = () => {
    throw new Error('storage unavailable')
  }
  return {
    get length(): number {
      return boom()
    },
    clear: boom,
    getItem: boom,
    key: boom,
    removeItem: boom,
    setItem: boom,
  }
}

function storeSuite(name: string, make: () => RecordStore): void {
  describe(name, () => {
    it('추가한 기록을 돌려준다', async () => {
      const store = make()
      await store.add(rec({ playedAt: 1, seed: 1 }))
      await store.add(rec({ playedAt: 2, seed: 2 }))
      expect(await store.list()).toHaveLength(2)
    })

    it('비어 있으면 빈 배열', async () => {
      expect(await make().list()).toEqual([])
    })

    it('clear 하면 비워진다', async () => {
      const store = make()
      await store.add(rec())
      await store.clear()
      expect(await store.list()).toEqual([])
    })

    it('닉네임을 저장·복원한다', async () => {
      const store = make()
      expect(await store.getNickname()).toBeNull()
      await store.setNickname('홍길동')
      expect(await store.getNickname()).toBe('홍길동')
    })

    it('발견 목록이 합집합으로 누적된다', async () => {
      const store = make()
      expect(await store.getDiscovered()).toEqual([])

      await store.addDiscovered(['t1_single', 't1_splash'])
      await store.addDiscovered(['t1_splash', 't2_buff'])

      const found = await store.getDiscovered()
      expect(found).toHaveLength(3) // splash 가 중복으로 쌓이지 않는다
      expect(new Set(found)).toEqual(new Set(['t1_single', 't1_splash', 't2_buff']))
    })

    it('빈 배열을 넣어도 안전하다', async () => {
      const store = make()
      await store.addDiscovered([])
      expect(await store.getDiscovered()).toEqual([])
    })

    it('상한을 넘으면 오래된 것부터 버린다', async () => {
      const store = make()
      for (let i = 0; i < MAX_RECORDS + 10; i++) {
        await store.add(rec({ playedAt: i + 1, seed: i + 1 }))
      }
      const all = await store.list()
      expect(all).toHaveLength(MAX_RECORDS)
      // 가장 오래된 10개가 사라졌다
      expect(all[0]!.playedAt).toBe(11)
    })
  })
}

storeSuite('MemoryRecordStore', () => new MemoryRecordStore())
storeSuite('LocalRecordStore', () => new LocalRecordStore(fakeStorage()))

describe('LocalRecordStore 내구성', () => {
  it('깨진 JSON 이 들어 있으면 빈 목록으로 취급한다', async () => {
    const storage = fakeStorage()
    storage.setItem('random-td:records:v1', '{{{ not json')
    expect(await new LocalRecordStore(storage).list()).toEqual([])
  })

  it('배열이 아닌 값도 견딘다', async () => {
    const storage = fakeStorage()
    storage.setItem('random-td:records:v1', '{"nope":1}')
    expect(await new LocalRecordStore(storage).list()).toEqual([])
  })

  it('모양이 다른 항목은 걸러낸다', async () => {
    const storage = fakeStorage()
    storage.setItem('random-td:records:v1', JSON.stringify([rec(), { junk: true }, null]))
    expect(await new LocalRecordStore(storage).list()).toHaveLength(1)
  })

  it('저장소가 던져도 게임이 죽지 않는다', async () => {
    const store = new LocalRecordStore(brokenStorage())
    await expect(store.list()).resolves.toEqual([])
    await expect(store.add(rec())).resolves.toBeUndefined()
    await expect(store.getNickname()).resolves.toBeNull()
    await expect(store.setNickname('x')).resolves.toBeUndefined()
    await expect(store.clear()).resolves.toBeUndefined()
    await expect(store.getDiscovered()).resolves.toEqual([])
    await expect(store.addDiscovered(['t1_single'])).resolves.toBeUndefined()
  })

  it('발견 목록이 깨져 있어도 빈 목록으로 취급한다', async () => {
    const storage = fakeStorage()
    storage.setItem('random-td:discovered:v1', 'not json')
    expect(await new LocalRecordStore(storage).getDiscovered()).toEqual([])

    storage.setItem('random-td:discovered:v1', JSON.stringify(['t1_single', 42, null]))
    expect(await new LocalRecordStore(storage).getDiscovered()).toEqual(['t1_single'])
  })
})
