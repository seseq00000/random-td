import { creatureOf } from '../data/creatures.js'
import { celebrationText, tierColor, tierLabel } from '../data/tiers.js'
import { getUnit } from '../data/units.js'
import { creatureIcon } from './creatureIcon.js'

/**
 * 상위 등급 뽑기 축하 연출.
 *
 * **게임을 멈추지 않는다.** 전투 중에도 뽑을 수 있게 되면서, 팝업이 진행을 막으면
 * 그게 곧 페널티가 된다. 그래서 `pointer-events: none` 인 오버레이로 띄우고
 * 시간이 지나면 알아서 사라진다 — 탭으로 넘길 수도 없게 하는 대신 짧게 끝낸다.
 */

/** 연출 유지 시간(ms). 등급이 높을수록 조금 더 오래 본다. */
function duration(tier: number): number {
  return tier >= 6 ? 2200 : tier >= 5 ? 1900 : 1600
}

let timer: number | undefined

export function celebrate(target: HTMLElement, defId: string): void {
  const def = getUnit(defId)
  const creature = creatureOf(def.role)
  const color = tierColor(def.tier)

  target.replaceChildren()
  target.hidden = false
  target.style.setProperty('--celebrate-color', color)
  // 재시작을 위해 애니메이션 클래스를 한 번 떼었다 붙인다
  target.classList.remove('show')
  void target.offsetWidth
  target.classList.add('show')

  const rays = document.createElement('div')
  rays.className = 'celebrate-rays'

  const card = document.createElement('div')
  card.className = 'celebrate-card'

  const icon = creatureIcon(def.role, def.tier, false, 88)
  icon.classList.add('celebrate-icon')

  const grade = document.createElement('div')
  grade.className = 'celebrate-grade'
  grade.textContent = celebrationText(def.tier)
  grade.style.color = color

  const name = document.createElement('div')
  name.className = 'celebrate-name'
  name.textContent = def.name

  const sub = document.createElement('div')
  sub.className = 'celebrate-sub'
  sub.textContent = `${tierLabel(def.tier)} · ${creature.name}`

  card.append(rays, icon, grade, name, sub)
  target.appendChild(card)

  clearTimeout(timer)
  timer = window.setTimeout(() => {
    target.classList.remove('show')
    // 페이드아웃이 끝난 뒤에 감춘다
    timer = window.setTimeout(() => {
      target.hidden = true
      target.replaceChildren()
    }, 280)
  }, duration(def.tier))
}
