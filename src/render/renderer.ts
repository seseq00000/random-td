import { CORE_FLASH_DURATION, type Game } from '../core/gameState.js'
import { CENTER_PX, FIELD_H, FIELD_W, TILE, tileToPixel, tilesToPixels } from '../core/grid.js'
import { orbitPosition, spawnAngle } from '../core/orbit.js'
import type { EnemyType, Role } from '../core/types.js'
import { CREATURES } from '../data/creatures.js'
import { CORE_RADIUS_TILES, SPAWN_RADIUS_TILES } from '../data/field.js'
import { getUnit } from '../data/units.js'
import { drawCreature, drawMonster } from './creatures.js'

/**
 * DOM 카드용 역할 표기. 동물의 몸통색과 한 글자를 그대로 쓴다 —
 * 카드마다 캔버스를 심지 않고도 `냥/곰/빼/늘/도/멍` 으로 동물이 읽힌다.
 * (도감은 열 때 한 번만 그리므로 거기선 진짜 동물을 그린다.)
 */
const ROLE_STYLE: Record<Role, { color: string; glyph: string }> = Object.fromEntries(
  CREATURES.map((c) => [c.role, { color: c.body, glyph: c.glyph }]),
) as Record<Role, { color: string; glyph: string }>

const COLORS = {
  bgOuter: '#161d19',
  bgInner: '#232f26',
  ring: 'rgba(255,255,255,0.055)',
  spawnRing: 'rgba(255,255,255,0.13)',
  core: '#5ad48c',
  coreHit: '#ff6b6b',
  portal: '#e27878',
  emptySlot: 'rgba(255,255,255,0.10)',
  enemyHpBg: 'rgba(0,0,0,0.6)',
  enemyHp: '#5fd35f',
  projectile: '#ffe08a',
  rangeFill: 'rgba(120,190,255,0.10)',
  rangeStroke: 'rgba(120,190,255,0.55)',
}

/**
 * 적 타입별 크기. 색과 형태는 `render/creatures.ts` 가 그린다.
 * 크기만으로도 "물량이 왔다"가 읽혀야 한다.
 *
 * 캔버스가 600px 인데 폰에서는 ~380px 로 축소돼 표시된다 — 실제 화면 크기는 여기 값의
 * 0.63배다. 그래서 원안(9/11/6/16)보다 25% 키웠다. 폰에서 안 보이면 없는 것과 같다.
 */
const ENEMY_RADIUS: Record<EnemyType, number> = {
  normal: 11,
  armored: 14,
  swarm: 8,
  boss: 20,
}

/** 타워 실루엣 지름(px). 타일이 40px 이라 34 면 거의 꽉 찬다. */
const TOWER_SIZE = 34

export interface RenderHints {
  selectedTowerUid: number | null
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D 컨텍스트를 얻지 못했다')
    this.ctx = ctx
    canvas.width = FIELD_W
    canvas.height = FIELD_H
  }

  draw(game: Game, hints: RenderHints): void {
    const { ctx } = this
    ctx.clearRect(0, 0, FIELD_W, FIELD_H)
    this.drawField()
    this.drawSpawnPortal()
    this.drawSlots(game)
    this.drawCore(game)
    this.drawTowers(game, hints)
    this.drawEnemies(game)
    this.drawProjectiles(game)
  }

  /**
   * 배경과 동심원 가이드.
   *
   * 링이 **사거리를 읽는 눈금**이다 — 사거리 6짜리는 원이 6번째 링까지 줄었을 때부터 쏜다.
   * 격자선을 지운 자리에 링을 넣어서, 화면이 오히려 단순해지면서 정보량은 늘었다.
   */
  private drawField(): void {
    const { ctx } = this

    const bg = ctx.createRadialGradient(
      CENTER_PX.x,
      CENTER_PX.y,
      0,
      CENTER_PX.x,
      CENTER_PX.y,
      tilesToPixels(SPAWN_RADIUS_TILES),
    )
    bg.addColorStop(0, COLORS.bgInner)
    bg.addColorStop(1, COLORS.bgOuter)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, FIELD_W, FIELD_H)

    ctx.lineWidth = 1
    for (let r = 1; r <= SPAWN_RADIUS_TILES; r++) {
      ctx.beginPath()
      ctx.arc(CENTER_PX.x, CENTER_PX.y, tilesToPixels(r), 0, Math.PI * 2)
      ctx.strokeStyle = r === SPAWN_RADIUS_TILES ? COLORS.spawnRing : COLORS.ring
      ctx.stroke()
    }
  }

  /**
   * 적이 나오는 지점. 모든 적이 여기서 나오므로 **표시가 없으면 화면이 안 읽힌다** —
   * "저기서 나와서 가운데로 온다"가 한눈에 들어와야 한다.
   */
  private drawSpawnPortal(): void {
    const { ctx } = this
    const p = orbitPosition(0, spawnAngle())

    ctx.save()
    ctx.translate(p.x, p.y)

    // 바깥 후광
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 22)
    glow.addColorStop(0, 'rgba(226,120,120,0.35)')
    glow.addColorStop(1, 'rgba(226,120,120,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(0, 0, 22, 0, Math.PI * 2)
    ctx.fill()

    // 코어 쪽을 향해 열린 반원 — 어느 방향으로 나아가는지까지 읽힌다
    ctx.strokeStyle = COLORS.portal
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(0, 0, 13, Math.PI * 0.15, Math.PI * 0.85)
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(0, 0, 7, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.portal
    ctx.fill()
    ctx.restore()
  }

  /** 소유했지만 비어 있는 자리. 슬롯을 사면 링을 따라 하나씩 늘어나는 게 보여야 한다. */
  private drawSlots(game: Game): void {
    const { ctx } = this
    const occupied = new Set(game.towers.map((t) => `${t.tx},${t.ty}`))

    ctx.strokeStyle = COLORS.emptySlot
    ctx.lineWidth = 1.5
    for (const pos of game.inv.ownedSlots()) {
      if (occupied.has(`${pos.tx},${pos.ty}`)) continue
      const p = tileToPixel(pos.tx, pos.ty)
      ctx.beginPath()
      ctx.arc(p.x, p.y, TILE * 0.32, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  /** 중앙 코어. 맞으면 번쩍인다 — 라이프가 줄었다는 걸 로그가 아니라 화면에서 읽게 한다. */
  private drawCore(game: Game): void {
    const { ctx } = this
    const r = tilesToPixels(CORE_RADIUS_TILES)
    const hit = game.coreFlash > 0
    const intensity = hit ? game.coreFlash / CORE_FLASH_DURATION : 0

    if (hit) {
      ctx.beginPath()
      ctx.arc(CENTER_PX.x, CENTER_PX.y, r * (1 + intensity * 1.6), 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,107,107,${0.35 * intensity})`
      ctx.fill()
    }

    ctx.beginPath()
    ctx.arc(CENTER_PX.x, CENTER_PX.y, r, 0, Math.PI * 2)
    ctx.fillStyle = hit ? COLORS.coreHit : COLORS.core
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  private drawTowers(game: Game, hints: RenderHints): void {
    const { ctx } = this

    for (const tower of game.towers) {
      const def = getUnit(tower.defId)
      const { x: cx, y: cy } = tileToPixel(tower.tx, tower.ty)
      const selected = hints.selectedTowerUid === tower.uid

      if (selected) this.drawRange(cx, cy, def.range)

      // 역할 = 동물 실루엣 / 동물 = 몸통색 / 티어 = 테두리 등급.
      // 세 축이 겹치지 않아 40px 에서도 셋 다 읽힌다.
      drawCreature(ctx, def.role, cx, cy, TOWER_SIZE, def.tier, {
        ...(selected ? { ringColor: '#ffffff' } : {}),
        awakened: tower.awakened,
      })

      // 등급명은 타일에 안 들어가므로 여기선 숫자를 쓴다 (텍스트 UI 에서 등급명)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 12px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      ctx.lineWidth = 3
      ctx.strokeText(String(def.tier), cx + 14, cy - 13)
      ctx.fillText(String(def.tier), cx + 14, cy - 13)
    }
  }

  private drawRange(cx: number, cy: number, rangeTiles: number): void {
    const { ctx } = this
    ctx.beginPath()
    ctx.arc(cx, cy, tilesToPixels(rangeTiles), 0, Math.PI * 2)
    ctx.fillStyle = COLORS.rangeFill
    ctx.fill()
    ctx.strokeStyle = COLORS.rangeStroke
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  private drawEnemies(game: Game): void {
    const { ctx } = this

    for (const e of game.enemies) {
      const p = game.enemyPos(e)
      // 도전 보스는 정규 보스보다 크게 그려 "내가 부른 것"이 구분되게 한다
      const r = e.isChallengeBoss ? ENEMY_RADIUS[e.type] * 1.35 : ENEMY_RADIUS[e.type]

      drawMonster(ctx, e.type, p.x, p.y, r, {
        challengeBoss: e.isChallengeBoss,
        slowed: e.slowRemaining > 0,
      })

      const w = r * 2.5
      const ratio = Math.max(0, e.hp / e.maxHp)
      ctx.fillStyle = COLORS.enemyHpBg
      ctx.fillRect(p.x - w / 2, p.y - r - 8, w, 4)
      ctx.fillStyle = COLORS.enemyHp
      ctx.fillRect(p.x - w / 2, p.y - r - 8, w * ratio, 4)
    }
  }

  private drawProjectiles(game: Game): void {
    const { ctx } = this
    ctx.fillStyle = COLORS.projectile
    for (const p of game.projectiles) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

export { ROLE_STYLE }
