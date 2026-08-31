import { creatureOf } from '../data/creatures.js'
import { AWAKEN_GLOW, tierColor } from '../data/tiers.js'
import type { EnemyType, Role } from '../core/types.js'

/**
 * 동물과 몬스터를 Canvas path 로 그린다. 이미지 파일이 없다.
 *
 * **40px 타일에서는 실루엣이 전부다.** 눈·코 같은 디테일은 뭉개지므로
 * 윤곽으로 구분되는 특징(귀 모양, 가시, 부리)에만 예산을 쓴다.
 *
 * 모든 함수가 `size` 를 받는다 — 필드(30px)와 도감(32px) 양쪽에서 쓴다.
 */

export interface CreatureStyle {
  /** 등급 테두리 색. 생략하면 몸통색을 어둡게 쓴다 */
  ringColor?: string
  /** 각성 광채 */
  awakened?: boolean
  /** 미발견 도감 칸처럼 실루엣만 어둡게 */
  dimmed?: boolean
}

function withAlpha(ctx: CanvasRenderingContext2D, alpha: number, draw: () => void): void {
  const prev = ctx.globalAlpha
  ctx.globalAlpha = alpha
  draw()
  ctx.globalAlpha = prev
}

/** 뾰족한 삼각 귀 — 고양이 */
function pointedEars(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  for (const dir of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(cx + dir * r * 0.75, cy - r * 0.35)
    ctx.lineTo(cx + dir * r * 0.95, cy - r * 1.15)
    ctx.lineTo(cx + dir * r * 0.25, cy - r * 0.8)
    ctx.closePath()
    ctx.fill()
  }
}

/** 둥근 귀 — 곰 */
function roundEars(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  for (const dir of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(cx + dir * r * 0.72, cy - r * 0.68, r * 0.36, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** 늘어진 귀 — 강아지 */
function floppyEars(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  for (const dir of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(cx + dir * r * 0.85, cy + r * 0.05, r * 0.3, r * 0.6, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** 등의 삼각 가시 — 고슴도치. 이 게임에서 가장 눈에 띄어야 하는 실루엣이다. */
function spikes(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const count = 7
  for (let i = 0; i < count; i++) {
    const a = Math.PI + (Math.PI * (i + 0.5)) / count
    const bx = cx + Math.cos(a) * r * 0.85
    const by = cy + Math.sin(a) * r * 0.85
    ctx.beginPath()
    ctx.moveTo(bx - Math.sin(a) * r * 0.2, by + Math.cos(a) * r * 0.2)
    ctx.lineTo(cx + Math.cos(a) * r * 1.5, cy + Math.sin(a) * r * 1.5)
    ctx.lineTo(bx + Math.sin(a) * r * 0.2, by - Math.cos(a) * r * 0.2)
    ctx.closePath()
    ctx.fill()
  }
}

/** 눈 두 개. 크기로 성격을 준다 (올빼미는 크게, 나무늘보는 처지게) */
function eyes(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  opts: { size: number; droop?: boolean },
): void {
  ctx.fillStyle = '#1a1d22'
  for (const dir of [-1, 1]) {
    const ex = cx + dir * r * 0.34
    const ey = cy - r * 0.05 + (opts.droop ? r * 0.18 : 0)
    ctx.beginPath()
    ctx.ellipse(ex, ey, r * opts.size, r * opts.size * (opts.droop ? 0.6 : 1), 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** 부리 — 올빼미 */
function beak(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.fillStyle = '#e0b04a'
  ctx.beginPath()
  ctx.moveTo(cx, cy + r * 0.55)
  ctx.lineTo(cx - r * 0.18, cy + r * 0.2)
  ctx.lineTo(cx + r * 0.18, cy + r * 0.2)
  ctx.closePath()
  ctx.fill()
}

/**
 * 동물 한 마리. `size` 는 전체 지름 기준.
 */
export function drawCreature(
  ctx: CanvasRenderingContext2D,
  role: Role,
  cx: number,
  cy: number,
  size: number,
  tier: number,
  style: CreatureStyle = {},
): void {
  const c = creatureOf(role)
  const r = size / 2
  const ring = style.ringColor ?? tierColor(tier)

  ctx.save()
  if (style.dimmed) ctx.globalAlpha = 0.28

  // 각성 광채 — 테두리 바깥으로 한 겹 더
  if (style.awakened) {
    ctx.strokeStyle = AWAKEN_GLOW
    ctx.lineWidth = Math.max(2, r * 0.22)
    ctx.globalAlpha = (style.dimmed ? 0.28 : 1) * 0.45
    ctx.beginPath()
    ctx.arc(cx, cy, r * 1.12, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = style.dimmed ? 0.28 : 1
  }

  // 귀·가시는 몸통 뒤에 깔아야 실루엣이 산다
  ctx.fillStyle = c.accent
  if (role === 'single') pointedEars(ctx, cx, cy, r)
  else if (role === 'splash') roundEars(ctx, cx, cy, r)
  else if (role === 'buff') floppyEars(ctx, cx, cy, r)
  else if (role === 'pierce') spikes(ctx, cx, cy, r)

  // 몸통
  ctx.fillStyle = c.body
  ctx.beginPath()
  if (role === 'sniper') {
    // 올빼미는 머리가 넓적하다
    ctx.ellipse(cx, cy, r * 1.02, r * 0.92, 0, 0, Math.PI * 2)
  } else {
    ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2)
  }
  ctx.fill()

  // 등급 테두리
  ctx.strokeStyle = ring
  ctx.lineWidth = Math.max(1.5, r * 0.16)
  ctx.stroke()

  // 얼굴
  if (role === 'sniper') {
    eyes(ctx, cx, cy, r, { size: 0.3 })
    beak(ctx, cx, cy, r)
  } else if (role === 'control') {
    eyes(ctx, cx, cy, r, { size: 0.2, droop: true })
    // 긴 팔 — 느릿한 느낌
    ctx.strokeStyle = c.accent
    ctx.lineWidth = Math.max(1.5, r * 0.18)
    ctx.beginPath()
    ctx.moveTo(cx - r * 0.85, cy + r * 0.35)
    ctx.lineTo(cx - r * 1.15, cy + r * 0.9)
    ctx.stroke()
  } else {
    eyes(ctx, cx, cy, r, { size: 0.16 })
  }

  ctx.restore()
}

// ── 몬스터 ─────────────────────────────────────────────────

/**
 * 미워할 만큼만 못생기게. 단 **기능 가독성이 최우선**이다 —
 * 장갑은 껍질로, 물량은 크기로, 보스는 왕관으로 즉시 구분돼야 한다.
 */
const MONSTER_BODY: Record<EnemyType, string> = {
  normal: '#7fc36b',
  armored: '#9aa4b0',
  swarm: '#d8b34a',
  boss: '#b06ad0',
}

export function drawMonster(
  ctx: CanvasRenderingContext2D,
  type: EnemyType,
  cx: number,
  cy: number,
  r: number,
  opts: { challengeBoss?: boolean; slowed?: boolean } = {},
): void {
  ctx.save()

  // 슬라임 몸 — 아래가 눌린 물방울
  ctx.fillStyle = MONSTER_BODY[type]
  ctx.beginPath()
  ctx.moveTo(cx - r, cy + r * 0.75)
  ctx.quadraticCurveTo(cx - r * 1.05, cy - r * 0.55, cx, cy - r)
  ctx.quadraticCurveTo(cx + r * 1.05, cy - r * 0.55, cx + r, cy + r * 0.75)
  ctx.closePath()
  ctx.fill()

  if (type === 'armored') {
    // 껍질 — 위를 덮는 두꺼운 호
    ctx.strokeStyle = '#5c6672'
    ctx.lineWidth = Math.max(2.5, r * 0.3)
    ctx.beginPath()
    ctx.arc(cx, cy - r * 0.05, r * 0.82, Math.PI * 1.05, Math.PI * 1.95)
    ctx.stroke()
  }

  if (type === 'boss') {
    ctx.fillStyle = '#f0c651'
    const cw = r * 0.72
    ctx.beginPath()
    ctx.moveTo(cx - cw, cy - r * 0.82)
    ctx.lineTo(cx - cw * 0.5, cy - r * 1.35)
    ctx.lineTo(cx, cy - r * 0.95)
    ctx.lineTo(cx + cw * 0.5, cy - r * 1.35)
    ctx.lineTo(cx + cw, cy - r * 0.82)
    ctx.closePath()
    ctx.fill()
  }

  // 도전 보스는 내가 부른 것이라 금테로 구분한다
  if (opts.challengeBoss) {
    ctx.strokeStyle = '#ffd75e'
    ctx.lineWidth = Math.max(2, r * 0.2)
    ctx.beginPath()
    ctx.arc(cx, cy, r * 1.08, 0, Math.PI * 2)
    ctx.stroke()
  }

  if (opts.slowed) {
    withAlpha(ctx, 0.8, () => {
      ctx.strokeStyle = '#7fd8ff'
      ctx.lineWidth = Math.max(1.5, r * 0.16)
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.95, 0, Math.PI * 2)
      ctx.stroke()
    })
  }

  // 눈 — 작을수록 순하고 클수록 사납다
  ctx.fillStyle = '#1a1d22'
  const es = type === 'swarm' ? r * 0.16 : r * 0.13
  for (const dir of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(cx + dir * r * 0.33, cy - r * 0.05, es, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}
