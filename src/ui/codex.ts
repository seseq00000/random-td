import { CREATURES } from '../data/creatures.js'
import { tierColor, tierLabel } from '../data/tiers.js'
import { TIER_COUNT, unitsOfTier } from '../data/units.js'
import { drawCreature } from '../render/creatures.js'
import { creatureIcon } from './creatureIcon.js'

/**
 * 도감 + 역할 범례.
 *
 * 둘을 한 오버레이에 합쳤다 — 범례만 따로 두면 UI 가 하나 더 늘어난다.
 *
 * 벤치 카드에는 캔버스를 안 심지만(매 프레임 갱신이라 무겁다) **도감은 열 때 한 번만
 * 그리므로** 42칸에 작은 캔버스를 써도 된다. 그래서 여기엔 글자가 아니라 진짜 동물이 들어간다.
 */

const CELL = 34

export interface CodexState {
  /** 지금 보유 중인 유닛 id → 개수 */
  held: Map<string, number>
  /** 한 번이라도 보유했던 유닛 id */
  discovered: Set<string>
}

function creatureCanvas(defId: string, tier: number, roleIdx: number, state: CodexState): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = CELL
  canvas.height = CELL
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  const role = CREATURES[roleIdx]!.role
  const owned = (state.held.get(defId) ?? 0) > 0
  const seen = state.discovered.has(defId)

  drawCreature(ctx, role, CELL / 2, CELL / 2, CELL - 6, tier, {
    dimmed: !owned && !seen,
    ...(owned ? {} : { ringColor: seen ? tierColor(tier) : '#3a4450' }),
  })
  if (!owned && seen) canvas.style.opacity = '0.55'
  return canvas
}

export function renderCodex(target: HTMLElement, state: CodexState): void {
  target.replaceChildren()

  // ── 범례 ───────────────────────────────────────────────
  const legend = document.createElement('div')
  legend.className = 'codex-legend'
  for (const c of CREATURES) {
    const item = document.createElement('div')
    item.className = 'legend-item'

    // 범례도 글자가 아니라 실제 동물로 — "이 실루엣이 이 역할"이 그림으로 이어져야 한다
    const chip = creatureIcon(c.role, 3, false, 26)
    chip.classList.add('legend-glyph')

    const text = document.createElement('span')
    text.className = 'legend-text'
    text.textContent = `${c.name} — ${c.blurb}`

    item.append(chip, text)
    legend.appendChild(item)
  }
  target.appendChild(legend)

  // ── 도감 그리드 ────────────────────────────────────────
  const hint = document.createElement('p')
  hint.className = 'codex-hint'
  hint.textContent = '한 줄(티어)을 전부 밝히면 그게 곧 다이소 미션 달성이다'
  target.appendChild(hint)

  const grid = document.createElement('div')
  grid.className = 'codex-grid'
  grid.style.gridTemplateColumns = `44px repeat(${CREATURES.length}, 1fr)`

  for (let tier = 1; tier <= TIER_COUNT; tier++) {
    const label = document.createElement('div')
    label.className = 'codex-tier'
    label.textContent = tierLabel(tier)
    label.style.color = tierColor(tier)
    grid.appendChild(label)

    const units = unitsOfTier(tier)
    for (let i = 0; i < units.length; i++) {
      const def = units[i]!
      const count = state.held.get(def.id) ?? 0
      const seen = state.discovered.has(def.id)

      const cell = document.createElement('div')
      cell.className = 'codex-cell'
      if (count > 0) cell.classList.add('held')
      else if (seen) cell.classList.add('seen')
      cell.title = count > 0 ? `${def.name} · 보유 ${count}` : seen ? `${def.name} (발견함)` : '미발견'

      cell.appendChild(creatureCanvas(def.id, tier, i, state))

      if (count > 1) {
        const badge = document.createElement('span')
        badge.className = 'codex-count'
        badge.textContent = String(count)
        cell.appendChild(badge)
      }
      grid.appendChild(cell)
    }
  }
  target.appendChild(grid)

  const total = TIER_COUNT * CREATURES.length
  const found = [...state.discovered].length
  const summary = document.createElement('div')
  summary.className = 'codex-summary'
  summary.textContent = `발견 ${found} / ${total}종`
  target.appendChild(summary)
}
