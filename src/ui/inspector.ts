import { AWAKEN_DAMAGE_MUL } from '../core/gameState.js'
import type { TargetPriority, UnitDef, UnitInstance } from '../core/types.js'
import { creatureOf } from '../data/creatures.js'
import { sellValue } from '../data/slots.js'
import { tierColor, tierLabel } from '../data/tiers.js'
import { getUnit } from '../data/units.js'

/**
 * 유닛 상세 슬롯.
 *
 * 동물 실루엣으로 바꾸면서 "이 고슴도치가 뭘 하는 애인지" 알려줄 곳이 필요해졌다.
 * 공격력·공속·DPS 를 **뭉치지 않고 따로** 보여주고, 역할별 특수 효과를 수치로 푼다.
 */

const PRIORITY_LABEL: Record<TargetPriority, string> = {
  first: '선두 우선',
  closest: '근접 우선',
  strongest: '강한 적 우선',
}

function row(label: string, value: string, accent?: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'insp-row'
  const l = document.createElement('span')
  l.textContent = label
  const v = document.createElement('b')
  v.textContent = value
  if (accent) v.style.color = accent
  el.append(l, v)
  return el
}

/** 역할별 특수 효과를 수치로 푼다 — 있는 것만 */
function specialLines(def: UnitDef, mul: number): HTMLElement[] {
  const out: HTMLElement[] = []

  if (def.splashRadius > 0) {
    out.push(row('광역', `반경 ${def.splashRadius}타일`))
  }
  if (def.pierceCount > 1) {
    out.push(row('관통', `최대 ${def.pierceCount}명`))
  }
  if (def.slow) {
    const pct = Math.round((1 - def.slow.factor) * 100)
    out.push(row('슬로우', `속도 -${pct}% · ${def.slow.duration}초`))
  }
  if (def.aura) {
    const dmg = Math.round((def.aura.damageMul - 1) * 100)
    const spd = Math.round((def.aura.attackSpeedMul - 1) * 100)
    out.push(row('버프 오라', `인접 공격력 +${dmg}% · 공속 +${spd}%`))
  }
  if (def.attackSpeed > 0) {
    out.push(row('타겟 우선순위', PRIORITY_LABEL[def.targetPriority]))
  }
  if (mul > 1) {
    out.push(row('각성', `모든 공격력 ×${mul}`, '#f0c651'))
  }
  return out
}

export interface InspectorActions {
  /** 이 유닛이 지금 필드에 있는가 */
  onField: boolean
  /** 필드 → 벤치 */
  onRecall: () => void
  /** 벤치 → 필드. 자리는 자동으로 정해지므로 "대기" 단계가 없다 — 누르면 바로 들어간다 */
  onPlace: () => void
  onSell: () => void
}

function actionButton(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = primary ? 'insp-action primary' : 'insp-action'
  btn.textContent = label
  btn.addEventListener('click', onClick)
  return btn
}

export function renderInspector(
  target: HTMLElement,
  unit: UnitInstance | null,
  actions?: InspectorActions,
): void {
  target.replaceChildren()
  target.hidden = unit === null
  if (!unit) return

  const def = getUnit(unit.defId)
  const creature = creatureOf(def.role)
  const mul = unit.awakened ? AWAKEN_DAMAGE_MUL : 1
  const damage = def.damage * mul
  const dps = damage * def.attackSpeed

  const head = document.createElement('div')
  head.className = 'insp-head'
  head.style.setProperty('--tier-color', tierColor(def.tier))

  const glyph = document.createElement('span')
  glyph.className = 'insp-glyph'
  glyph.style.background = creature.body
  glyph.textContent = creature.glyph

  const titles = document.createElement('div')
  const name = document.createElement('div')
  name.className = 'insp-name'
  name.textContent = unit.awakened ? `${def.name} ★` : def.name
  const grade = document.createElement('div')
  grade.className = 'insp-grade'
  grade.textContent = `${tierLabel(def.tier)} · ${creature.name}`
  grade.style.color = tierColor(def.tier)
  titles.append(name, grade)

  head.append(glyph, titles)

  const blurb = document.createElement('div')
  blurb.className = 'insp-blurb'
  blurb.textContent = creature.blurb

  target.append(head, blurb)

  if (def.attackSpeed > 0) {
    target.append(
      row('공격력', Math.round(damage).toLocaleString()),
      row('공격 속도', `${def.attackSpeed}회/초`),
      row('DPS', Math.round(dps).toLocaleString()),
    )
  } else {
    target.append(row('공격', '하지 않는다'))
  }
  target.append(row('사거리', `${def.range}타일`))

  for (const el of specialLines(def, mul)) target.appendChild(el)

  // 환급은 티어가 아니라 그 개체에 실제로 들어간 골드를 따른다
  target.append(row('투입 / 환급', `${unit.paid.toLocaleString()} / ${sellValue(unit.paid)}골드`))

  if (!actions) return

  // 회수도 배치도 **버튼**이다. 우클릭·좌표 탭은 폰에서 못 쓴다.
  const bar = document.createElement('div')
  bar.className = 'insp-actions'

  if (actions.onField) {
    bar.appendChild(actionButton('벤치로 회수', actions.onRecall, true))
  } else {
    bar.appendChild(actionButton('배치하기', actions.onPlace, true))
  }
  bar.appendChild(actionButton(`팔기 +${sellValue(unit.paid)}`, actions.onSell))

  target.appendChild(bar)
}
