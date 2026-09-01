import type { Role } from '../core/types.js'

/**
 * 역할별 투사체 모양.
 *
 * 전부 같은 노란 동그라미였을 때는 **화면만 보고 무슨 유닛이 일하는지 알 수 없었다.**
 * 역할 = 동물 실루엣이라는 규칙을 투사체까지 밀어붙인다 — 고드름이 날아가면 느려지고,
 * 화살이 멀리서 오면 저격이고, 가시가 관통한다는 게 설명 없이 읽혀야 한다.
 *
 * 모든 그리기는 **원점 기준 +x 가 진행 방향**이다. 회전은 호출부가 건다.
 */

export interface ProjectileStyle {
  /** 본체 색. 꼬리와 착탄 파티클이 이 색을 공유해서 인과가 이어진다 */
  color: string
  /** 꼬리 두께(px). 무거운 것일수록 굵다 */
  trailWidth: number
  /** 꼬리 알파 */
  trailAlpha: number
  draw(ctx: CanvasRenderingContext2D): void
}

/**
 * 제어(나무늘보) 색은 몬스터의 슬로우 표시 링(#7fd8ff)과 **일부러 같다.**
 * 파란 고드름이 맞은 자리에 파란 링이 생기는 게 보이면 인과가 설명 없이 읽힌다.
 */
const ICE = '#7fd8ff'

function bullet(ctx: CanvasRenderingContext2D): void {
  // 총알 — 짧고 빠른 캡슐. 공속이 제일 빠른 역할이라 잔상이 촘촘하게 남는다.
  ctx.fillStyle = '#ffe08a'
  ctx.beginPath()
  ctx.ellipse(0, 0, 5, 2.2, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff8dc'
  ctx.beginPath()
  ctx.ellipse(1.6, 0, 2, 1.1, 0, 0, Math.PI * 2)
  ctx.fill()
}

function shell(ctx: CanvasRenderingContext2D): void {
  // 포탄 — 크고 둔한 구체. 느리게 날아가서 "묵직하다"가 읽힌다.
  ctx.fillStyle = '#5a3a24'
  ctx.beginPath()
  ctx.arc(0, 0, 5.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#ff9d5c'
  ctx.lineWidth = 1.6
  ctx.stroke()
  // 뒤쪽 불꽃
  ctx.fillStyle = 'rgba(255,157,92,0.55)'
  ctx.beginPath()
  ctx.moveTo(-4.5, -2.4)
  ctx.lineTo(-10, 0)
  ctx.lineTo(-4.5, 2.4)
  ctx.closePath()
  ctx.fill()
}

function arrow(ctx: CanvasRenderingContext2D): void {
  // 화살 — 길고 가늘다. 최장 사거리라 화면을 가로지르는 선이 보인다.
  ctx.strokeStyle = '#cfe3f5'
  ctx.lineWidth = 1.6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-8, 0)
  ctx.lineTo(5, 0)
  ctx.stroke()

  ctx.fillStyle = '#eef6ff'
  ctx.beginPath()
  ctx.moveTo(9, 0)
  ctx.lineTo(3.5, -2.8)
  ctx.lineTo(3.5, 2.8)
  ctx.closePath()
  ctx.fill()

  // 깃 — 뒤쪽에 두 줄
  ctx.strokeStyle = 'rgba(207,227,245,0.75)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(-8, 0)
  ctx.lineTo(-11, -2.6)
  ctx.moveTo(-8, 0)
  ctx.lineTo(-11, 2.6)
  ctx.stroke()
}

function icicle(ctx: CanvasRenderingContext2D): void {
  // 고드름 — 앞이 뾰족한 마름모. 반투명이라 얼음처럼 보인다.
  ctx.fillStyle = 'rgba(127,216,255,0.9)'
  ctx.beginPath()
  ctx.moveTo(8, 0)
  ctx.lineTo(-1, -3.2)
  ctx.lineTo(-6, 0)
  ctx.lineTo(-1, 3.2)
  ctx.closePath()
  ctx.fill()
  // 하이라이트 — 결정면 느낌
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(6, 0)
  ctx.lineTo(-3, -1.2)
  ctx.stroke()
}

function spike(ctx: CanvasRenderingContext2D): void {
  // 가시 — 아주 가늘고 긴 바늘. 관통이라 여러 마리를 꿰는 게 보여야 한다.
  ctx.fillStyle = '#d9a066'
  ctx.beginPath()
  ctx.moveTo(10, 0)
  ctx.lineTo(-7, -1.7)
  ctx.lineTo(-7, 1.7)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(255,235,205,0.8)'
  ctx.beginPath()
  ctx.moveTo(10, 0)
  ctx.lineTo(1, -0.7)
  ctx.lineTo(1, 0.7)
  ctx.closePath()
  ctx.fill()
}

/** 버프는 공격하지 않는다 — 도달할 일이 없지만 Record 를 채워 타입을 닫는다 */
function none(): void {}

export const PROJECTILE_STYLES: Record<Role, ProjectileStyle> = {
  single: { color: '#ffe08a', trailWidth: 2.5, trailAlpha: 0.35, draw: bullet },
  splash: { color: '#ff9d5c', trailWidth: 4.5, trailAlpha: 0.3, draw: shell },
  sniper: { color: '#cfe3f5', trailWidth: 1.8, trailAlpha: 0.45, draw: arrow },
  control: { color: ICE, trailWidth: 3, trailAlpha: 0.4, draw: icicle },
  pierce: { color: '#d9a066', trailWidth: 2, trailAlpha: 0.4, draw: spike },
  buff: { color: '#ffffff', trailWidth: 0, trailAlpha: 0, draw: none },
}

export function projectileStyle(role: Role): ProjectileStyle {
  return PROJECTILE_STYLES[role]
}

/** 진행 방향으로 회전시켜 그린다 */
export function drawProjectile(
  ctx: CanvasRenderingContext2D,
  role: Role,
  x: number,
  y: number,
  angle: number,
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  PROJECTILE_STYLES[role].draw(ctx)
  ctx.restore()
}
