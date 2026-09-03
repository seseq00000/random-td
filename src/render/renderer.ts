import { CORE_FLASH_DURATION, type Game } from '../core/gameState.js'
import { CENTER_PX, FIELD_H, FIELD_W, TILE, tileToPixel, tilesToPixels } from '../core/grid.js'
import { orbitPosition, spawnAngle } from '../core/orbit.js'
import type { EnemyType, Role, Vec2 } from '../core/types.js'
import { CREATURES } from '../data/creatures.js'
import { CORE_RADIUS_TILES, SPAWN_RADIUS_TILES } from '../data/field.js'
import { getUnit } from '../data/units.js'
import { drawCreature, drawMonster, monsterColor } from './creatures.js'
import { Effects } from './effects.js'
import type { FrameEvents } from './observer.js'
import { drawProjectile, projectileStyle } from './projectiles.js'

/**
 * DOM 카드용 역할 표기. 동물의 몸통색과 한 글자를 그대로 쓴다.
 * (카드 아이콘은 `ui/creatureIcon.ts` 가 진짜 동물 그림으로 대체했지만,
 *  몸통색은 카드 테두리·글리프 배경으로 여전히 쓰인다.)
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
  muzzle: '#fff3c4',
  rangeFill: 'rgba(120,190,255,0.10)',
  rangeStroke: 'rgba(120,190,255,0.55)',
}

/**
 * 적 타입별 크기. 색과 형태는 `render/creatures.ts` 가 그린다.
 * 크기만으로도 "물량이 왔다"가 읽혀야 한다.
 *
 * 캔버스가 600px 인데 폰에서는 ~390px 로 축소돼 표시된다 — 실제 화면 크기는 여기 값의
 * 0.65배다. 그래서 원안(9/11/6/16)보다 25% 키웠다. 폰에서 안 보이면 없는 것과 같다.
 */
const ENEMY_RADIUS: Record<EnemyType, number> = {
  normal: 11,
  armored: 14,
  swarm: 8,
  boss: 20,
}

/** 타워 실루엣 지름(px). 타일이 40px 이라 34 면 거의 꽉 찬다. */
const TOWER_SIZE = 34

/** 피격 흰 섬광이 남는 시간(초) */
const HIT_FLASH = 0.11
/** 발사 섬광이 남는 시간(초) */
const MUZZLE_FLASH = 0.08
/** 코어 피격 시 화면 흔들림이 가라앉는 시간(초) */
const SHAKE_DECAY = 0.36

export interface RenderHints {
  selectedTowerUid: number | null
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D
  private readonly fx = new Effects()

  // 프레임 간 차이 관찰은 `GameObserver` 가 한다 — 렌더러와 오디오가 같은 이벤트를 쓴다.
  // 여기 남는 건 **연출이 얼마나 남았는가** 뿐이다.
  private hitFlash = new Map<number, number>()
  private muzzle = new Map<number, number>()
  private shake = 0
  /**
   * 투사체의 **화면상** 직전 위치. 꼬리와 진행 방향을 그리는 데만 쓴다.
   *
   * 관찰자에도 비슷한 맵이 있지만 목적이 다르다 — 저쪽은 "사라졌으니 착탄"을 알아내려고,
   * 이쪽은 "어디서 여기로 왔나"를 그리려고 든다. 순수하게 렌더링 관심사라 여기 남긴다.
   */
  private trail = new Map<number, Vec2>()

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D 컨텍스트를 얻지 못했다')
    this.ctx = ctx
    canvas.width = FIELD_W
    canvas.height = FIELD_H
  }

  /** 새 판을 시작할 때. 남은 연출이 다음 판으로 새면 안 된다. */
  reset(): void {
    this.hitFlash.clear()
    this.muzzle.clear()
    this.fx.clear()
    this.shake = 0
  }

  draw(game: Game, hints: RenderHints, dt: number, events: FrameEvents): void {
    this.consume(game, events, dt)
    this.fx.update(dt)

    const { ctx } = this
    ctx.clearRect(0, 0, FIELD_W, FIELD_H)

    ctx.save()
    if (this.shake > 0) {
      // 흔들림은 화면 전체에 걸어야 "맞았다"가 몸으로 읽힌다
      const mag = this.shake * 7
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag)
    }

    this.drawField()
    this.drawSpawnPortal()
    this.drawSlots(game)
    this.drawCore(game)
    this.drawTowers(game, hints)
    this.drawProjectiles(game)
    this.drawEnemies(game)
    this.fx.draw(ctx)

    ctx.restore()
  }

  // ── 이벤트 소비: 관찰은 GameObserver 가 하고 여기선 연출만 건다 ─────

  private consume(game: Game, ev: FrameEvents, dt: number): void {
    decay(this.hitFlash, dt)
    decay(this.muzzle, dt)
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt / SHAKE_DECAY)

    if (ev.coreHit) {
      this.shake = 1
      this.fx.coreBreach(CENTER_PX.x, CENTER_PX.y)
    }

    for (const hit of ev.enemyHits) {
      this.hitFlash.set(hit.uid, HIT_FLASH)
      this.fx.spark(hit.pos.x, hit.pos.y)
    }

    for (const death of ev.enemyDeaths) {
      const big = death.type === 'boss'
      this.fx.burst(
        death.pos.x,
        death.pos.y,
        monsterColor(death.type),
        big ? 18 : 9,
        big ? 165 : 110,
      )
      // 죽은 적의 섬광이 남아 있으면 다음 uid 에 잘못 붙을 수 있다
      this.hitFlash.delete(death.uid)
    }

    for (const fire of ev.towerFires) this.muzzle.set(fire.uid, MUZZLE_FLASH)

    for (const hit of ev.projectileHits) {
      const style = projectileStyle(hit.role)
      // 포탄은 광역이라 더 크게 터진다 — 스플래시 반경이 눈에 보여야 한다
      const heavy = hit.role === 'splash'
      this.fx.burst(hit.pos.x, hit.pos.y, style.color, heavy ? 12 : 5, heavy ? 130 : 70)
    }

    // 사라진 타워·투사체의 잔여 연출 정리
    const towerUids = new Set(game.towers.map((t) => t.uid))
    for (const uid of [...this.muzzle.keys()]) {
      if (!towerUids.has(uid)) this.muzzle.delete(uid)
    }
    const projUids = new Set(game.projectiles.map((p) => p.uid))
    for (const uid of [...this.trail.keys()]) {
      if (!projUids.has(uid)) this.trail.delete(uid)
    }
  }

  // ── 필드 ───────────────────────────────────────────────

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
    // 흔들림으로 가장자리가 비지 않게 넉넉히 칠한다
    ctx.fillRect(-20, -20, FIELD_W + 40, FIELD_H + 40)

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

      // 발사 섬광 — 실루엣 뒤에 깔아야 동물이 가려지지 않는다
      const flash = this.muzzle.get(tower.uid)
      if (flash) {
        const a = flash / MUZZLE_FLASH
        ctx.beginPath()
        ctx.arc(cx, cy, TOWER_SIZE * (0.55 + (1 - a) * 0.35), 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,243,196,${0.45 * a})`
        ctx.fill()
      }

      // 역할 = 동물 실루엣 / 동물 = 몸통색 / 티어 = 테두리 등급.
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

      // 피격 섬광 — 몬스터 위에 흰 막을 덮는다. 짧아야 "맞았다"로 읽히고,
      // 길면 색이 날아가서 무슨 타입인지 안 보인다.
      const flash = this.hitFlash.get(e.uid)
      if (flash) {
        ctx.save()
        ctx.globalAlpha = (flash / HIT_FLASH) * 0.75
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(p.x, p.y, r * 0.98, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

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
    // 첫 프레임에는 직전 위치가 없다 — 그땐 목표를 향한 방향으로 세운다
    const enemyPos = new Map(game.enemies.map((e) => [e.uid, game.enemyPos(e)]))

    for (const p of game.projectiles) {
      const role = getUnit(p.sourceDefId).role
      const style = projectileStyle(role)
      const prev = this.trail.get(p.uid)

      // 꼬리 — 직전 위치까지 선을 그으면 속도가 눈에 보인다.
      // 색을 투사체와 공유해서 "저 파란 게 저기서 왔다"가 이어진다.
      if (prev && style.trailWidth > 0) {
        ctx.save()
        ctx.globalAlpha = style.trailAlpha
        ctx.strokeStyle = style.color
        ctx.lineWidth = style.trailWidth
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(prev.x, prev.y)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
        ctx.restore()
      }

      const target = enemyPos.get(p.targetUid)
      const from = prev
      const angle =
        from && (from.x !== p.x || from.y !== p.y)
          ? Math.atan2(p.y - from.y, p.x - from.x)
          : target
            ? Math.atan2(target.y - p.y, target.x - p.x)
            : 0

      drawProjectile(ctx, role, p.x, p.y, angle)
      this.trail.set(p.uid, { x: p.x, y: p.y })
    }
  }
}

/** 남은 시간이 있는 맵을 dt 만큼 줄이고, 다 된 항목은 지운다 */
function decay(map: Map<number, number>, dt: number): void {
  for (const [k, v] of map) {
    const next = v - dt
    if (next <= 0) map.delete(k)
    else map.set(k, next)
  }
}

export { ROLE_STYLE }
