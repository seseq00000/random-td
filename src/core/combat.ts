import { distance, tilesToPixels, tileToPixel } from './grid.js'
import type { Enemy, TargetPriority, TargetType, Tower, UnitDef, Vec2 } from './types.js'

/** 방어력은 단순 감산. 방어관통은 나중에 effect 로 붙인다. */
export function damageAfterArmor(damage: number, armor: number): number {
  return Math.max(1, damage - armor)
}

/**
 * 공격 가능 여부.
 *
 * 공중 적이 있던 시절엔 `ground`/`air`/`both` 로 갈렸지만, 공중을 없애면서
 * 지상만 남았다 — 이제 버프 유닛(`none`)만 공격을 못 한다.
 * 공중을 되살리고 싶으면 `TargetType` 에 다시 넣고 여기서 갈라주면 된다.
 */
export function canTarget(targetType: TargetType, _enemy: Enemy): boolean {
  return targetType !== 'none'
}

export interface Targetable {
  enemy: Enemy
  pos: Vec2
}

/**
 * 사거리 안의 적 중 우선순위 규칙에 따라 하나를 고른다.
 * - first: 경로를 가장 많이 진행한 적 (누출 직전을 먼저 막는다)
 * - closest: 타워에서 가장 가까운 적
 * - strongest: 남은 HP 가 가장 많은 적 (보스용)
 */
export function selectTarget(
  towerPos: Vec2,
  rangeTiles: number,
  targetType: TargetType,
  priority: TargetPriority,
  candidates: readonly Targetable[],
): Enemy | null {
  const rangePx = tilesToPixels(rangeTiles)
  let best: Enemy | null = null
  let bestScore = -Infinity

  for (const c of candidates) {
    if (c.enemy.hp <= 0) continue
    if (!canTarget(targetType, c.enemy)) continue
    const d = distance(towerPos, c.pos)
    if (d > rangePx) continue

    const score =
      priority === 'first' ? c.enemy.dist : priority === 'closest' ? -d : c.enemy.hp

    if (score > bestScore) {
      bestScore = score
      best = c.enemy
    }
  }
  return best
}

/** 인접 8타일의 buff 오라를 합산한다. 오라는 곱연산으로 중첩된다. */
export function auraMultipliers(
  tower: Tower,
  towers: readonly Tower[],
  defOf: (defId: string) => UnitDef,
): { damageMul: number; attackSpeedMul: number } {
  let damageMul = 1
  let attackSpeedMul = 1

  for (const other of towers) {
    if (other.uid === tower.uid) continue
    const def = defOf(other.defId)
    if (!def.aura) continue
    const dx = Math.abs(other.tx - tower.tx)
    const dy = Math.abs(other.ty - tower.ty)
    if (dx <= 1 && dy <= 1) {
      damageMul *= def.aura.damageMul
      attackSpeedMul *= def.aura.attackSpeedMul
    }
  }
  return { damageMul, attackSpeedMul }
}

/** 스플래시 반경 안의 적을 모은다 (직격 대상 포함). */
export function splashTargets(
  center: Vec2,
  radiusTiles: number,
  candidates: readonly Targetable[],
): Enemy[] {
  if (radiusTiles <= 0) return []
  const radiusPx = tilesToPixels(radiusTiles)
  return candidates
    .filter((c) => c.enemy.hp > 0 && distance(center, c.pos) <= radiusPx)
    .map((c) => c.enemy)
}

export function towerPixelPos(tower: Tower): Vec2 {
  return tileToPixel(tower.tx, tower.ty)
}

/** 슬로우를 적용한다. 더 강한 슬로우가 약한 것을 덮어쓴다. */
export function applySlow(enemy: Enemy, factor: number, duration: number): void {
  if (factor < enemy.slowFactor || enemy.slowRemaining <= 0) {
    enemy.slowFactor = factor
  }
  enemy.slowRemaining = Math.max(enemy.slowRemaining, duration)
}

export function currentSpeed(enemy: Enemy): number {
  return enemy.slowRemaining > 0 ? enemy.speed * enemy.slowFactor : enemy.speed
}
