import { describe, expect, it } from 'vitest'
import {
  CENTER_PX,
  GRID_H,
  GRID_W,
  TILE,
  distance,
  inBounds,
  pixelToTile,
  tileKey,
  tileToPixel,
  tilesToPixels,
} from '../src/core/grid.js'
import {
  orbitAngle,
  orbitPosition,
  orbitRadiusTiles,
  reachedCore,
  spawnAngle,
} from '../src/core/orbit.js'
import {
  CORE_RADIUS_TILES,
  REVOLUTIONS,
  SPAWN_ANGLE,
  SPAWN_RADIUS_TILES,
  SPIRAL_LENGTH,
  SLOT_POSITIONS,
} from '../src/data/field.js'
import { BASE_SPEED, SPAWN_INTERVAL } from '../src/data/waves.js'
import { MAX_SLOTS } from '../src/core/economy.js'

describe('grid', () => {
  it('tileToPixel 은 타일 중심을 준다', () => {
    expect(tileToPixel(0, 0)).toEqual({ x: TILE / 2, y: TILE / 2 })
    expect(tileToPixel(3, 2)).toEqual({ x: 3 * TILE + TILE / 2, y: 2 * TILE + TILE / 2 })
  })

  it('pixelToTile 은 tileToPixel 의 역이다', () => {
    for (let tx = 0; tx < GRID_W; tx++) {
      for (let ty = 0; ty < GRID_H; ty++) {
        const p = tileToPixel(tx, ty)
        expect(pixelToTile(p.x, p.y)).toEqual({ tx, ty })
      }
    }
  })

  it('inBounds 는 격자 밖을 걸러낸다', () => {
    expect(inBounds(0, 0)).toBe(true)
    expect(inBounds(GRID_W - 1, GRID_H - 1)).toBe(true)
    expect(inBounds(-1, 0)).toBe(false)
    expect(inBounds(GRID_W, 0)).toBe(false)
    expect(inBounds(0, GRID_H)).toBe(false)
  })

  it('tileKey 는 격자 안에서 충돌하지 않는다', () => {
    const keys = new Set<number>()
    for (let tx = 0; tx < GRID_W; tx++) {
      for (let ty = 0; ty < GRID_H; ty++) keys.add(tileKey(tx, ty))
    }
    expect(keys.size).toBe(GRID_W * GRID_H)
  })

  it('필드는 정사각이다 — 원형 나선을 담아야 한다', () => {
    expect(GRID_W).toBe(GRID_H)
  })
})

describe('슬롯 자리', () => {
  it('개수가 최대 슬롯 수와 일치한다', () => {
    expect(SLOT_POSITIONS.length).toBe(MAX_SLOTS)
  })

  it('서로 겹치지 않는다', () => {
    const keys = new Set(SLOT_POSITIONS.map((p) => tileKey(p.tx, p.ty)))
    expect(keys.size).toBe(SLOT_POSITIONS.length)
  })

  it('전부 격자 안이고 코어보다 바깥이 아니다', () => {
    for (const p of SLOT_POSITIONS) {
      expect(inBounds(p.tx, p.ty)).toBe(true)
      // 타워는 코어 근처에 모인다 — 스폰 반경 안쪽이어야 사거리가 게이트로 작동한다
      const d = distance(tileToPixel(p.tx, p.ty), CENTER_PX)
      expect(d).toBeLessThan(tilesToPixels(SPAWN_RADIUS_TILES))
    }
  })

  it('연달아 배치한 두 타워는 인접한다 — 버프 오라가 의미를 갖는 조건', () => {
    // 앞 8칸은 코어를 시계방향으로 도는 링이라 이웃끼리 붙어 있어야 한다
    for (let i = 0; i < 7; i++) {
      const a = SLOT_POSITIONS[i]!
      const b = SLOT_POSITIONS[i + 1]!
      expect(Math.abs(a.tx - b.tx)).toBeLessThanOrEqual(1)
      expect(Math.abs(a.ty - b.ty)).toBeLessThanOrEqual(1)
    }
  })
})

describe('orbit — 나선 기하', () => {
  it('시작점의 반경은 스폰 반경이다', () => {
    expect(orbitRadiusTiles(0)).toBeCloseTo(SPAWN_RADIUS_TILES)
  })

  it('끝점의 반경은 코어 반경이다', () => {
    expect(orbitRadiusTiles(SPIRAL_LENGTH)).toBeCloseTo(CORE_RADIUS_TILES)
  })

  it('반경은 단조 감소한다', () => {
    let prev = Infinity
    for (let i = 0; i <= 50; i++) {
      const r = orbitRadiusTiles((SPIRAL_LENGTH * i) / 50)
      expect(r).toBeLessThan(prev)
      prev = r
    }
  })

  it('진행 범위를 벗어나도 양 끝에서 멈춘다', () => {
    expect(orbitRadiusTiles(-500)).toBeCloseTo(SPAWN_RADIUS_TILES)
    expect(orbitRadiusTiles(SPIRAL_LENGTH * 99)).toBeCloseTo(CORE_RADIUS_TILES)
  })

  it('전 구간에서 정확히 REVOLUTIONS 바퀴를 돈다', () => {
    const turned = orbitAngle(SPIRAL_LENGTH, 0) - orbitAngle(0, 0)
    expect(turned).toBeCloseTo(2 * Math.PI * REVOLUTIONS)
  })

  it('각도는 단조 증가한다 — 한 방향으로만 돈다', () => {
    let prev = -Infinity
    for (let i = 0; i <= 50; i++) {
      const a = orbitAngle((SPIRAL_LENGTH * i) / 50, 0)
      expect(a).toBeGreaterThan(prev)
      prev = a
    }
  })

  it('시작 각도가 다르면 같은 진행도에서 다른 위치에 있다', () => {
    const a = orbitPosition(SPIRAL_LENGTH / 2, 0)
    const b = orbitPosition(SPIRAL_LENGTH / 2, Math.PI)
    expect(distance(a, b)).toBeGreaterThan(TILE)
  })

  it('위치는 중심에서 반경만큼 떨어져 있다', () => {
    for (const dist of [0, SPIRAL_LENGTH * 0.25, SPIRAL_LENGTH * 0.6, SPIRAL_LENGTH]) {
      const p = orbitPosition(dist, 1.2)
      expect(distance(p, CENTER_PX)).toBeCloseTo(tilesToPixels(orbitRadiusTiles(dist)))
    }
  })

  it('진행할수록 중심에 가까워진다', () => {
    const early = distance(orbitPosition(0, 0), CENTER_PX)
    const late = distance(orbitPosition(SPIRAL_LENGTH * 0.9, 0), CENTER_PX)
    expect(late).toBeLessThan(early)
  })

  it('reachedCore 는 전 구간을 지났을 때만 참이다', () => {
    expect(reachedCore(0)).toBe(false)
    expect(reachedCore(SPIRAL_LENGTH - 1)).toBe(false)
    expect(reachedCore(SPIRAL_LENGTH)).toBe(true)
    expect(reachedCore(SPIRAL_LENGTH + 100)).toBe(true)
  })
})

describe('spawnAngle — 한 지점에서 나온다', () => {
  it('항상 같은 각도를 준다 (결정론)', () => {
    expect(spawnAngle()).toBe(SPAWN_ANGLE)
    expect(spawnAngle()).toBe(spawnAngle())
  })

  it('모든 적의 스폰 위치가 정확히 같다', () => {
    const first = orbitPosition(0, spawnAngle())
    const tenth = orbitPosition(0, spawnAngle())
    expect(tenth).toEqual(first)
  })

  it('스폰 지점은 스폰 반경 위에 있다', () => {
    const p = orbitPosition(0, spawnAngle())
    expect(distance(p, CENTER_PX)).toBeCloseTo(tilesToPixels(SPAWN_RADIUS_TILES))
  })

  it('시간차가 곧 나선 위의 간격이 된다 — 같은 지점에서 나와도 겹치지 않는다', () => {
    // 스폰 간격(0.7초) × 속도만큼 진행도가 벌어진다. 그 차이가 위치 차이로 나타나야
    // "한 줄로 늘어선다"가 성립한다.
    const a = orbitPosition(0, spawnAngle())
    const b = orbitPosition(BASE_SPEED * 40 * SPAWN_INTERVAL, spawnAngle())
    expect(distance(a, b)).toBeGreaterThan(TILE / 2)
  })
})
