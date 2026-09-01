import { GACHA_COST, GACHA_TABLE, tierWeights } from '../data/gachaTable.js'
import { tierColor, tierLabel } from '../data/tiers.js'
import { TIER_COUNT } from '../data/units.js'

/**
 * 뽑기 확률표.
 *
 * 두 가지를 같이 보여준다:
 * - **지금 웨이브의 확률** — 뽑을지 말지 판단하는 데 필요한 값
 * - **구간 전체표** — "몇 웨이브까지 버티면 레전드가 나오나"를 계획하는 데 필요한 값
 *
 * 표는 `data/gachaTable.ts` 를 그대로 읽는다. 수치를 여기 옮겨 적으면 두 곳이 어긋난다.
 */

/** 구간 헤더 표기 — 마지막 행은 maxWave 가 Infinity 라 "26+" 처럼 연다 */
function bandLabels(): string[] {
  return GACHA_TABLE.map((band, i) => {
    const prev = i === 0 ? 0 : GACHA_TABLE[i - 1]!.maxWave
    return Number.isFinite(band.maxWave) ? `~${band.maxWave}` : `${prev + 1}+`
  })
}

function currentBandIndex(wave: number): number {
  const idx = GACHA_TABLE.findIndex((b) => wave <= b.maxWave)
  return idx < 0 ? GACHA_TABLE.length - 1 : idx
}

export function renderOdds(target: HTMLElement, wave: number): void {
  const weights = tierWeights(wave)
  const activeBand = currentBandIndex(wave)

  const head = document.createElement('div')
  head.className = 'odds-head'
  head.textContent = `웨이브 ${wave} · 뽑기 ${GACHA_COST}골드`
  target.appendChild(head)

  // ── 지금 웨이브 ────────────────────────────────────────
  const list = document.createElement('div')
  list.className = 'odds-list'

  for (let tier = TIER_COUNT; tier >= 1; tier--) {
    const pct = weights[tier - 1] ?? 0
    const row = document.createElement('div')
    row.className = 'odds-row'
    if (pct === 0) row.classList.add('zero')

    const name = document.createElement('span')
    name.className = 'odds-name'
    name.textContent = tierLabel(tier)
    name.style.color = pct === 0 ? '' : tierColor(tier)

    const bar = document.createElement('span')
    bar.className = 'odds-bar'
    const fill = document.createElement('span')
    // 30% 가 최대치라 100% 기준으로 그리면 막대가 전부 뭉개진다 — 최대값 기준으로 편다
    const max = Math.max(...weights)
    fill.style.width = `${max > 0 ? (pct / max) * 100 : 0}%`
    fill.style.background = tierColor(tier)
    bar.appendChild(fill)

    const val = document.createElement('span')
    val.className = 'odds-pct'
    val.textContent = pct === 0 ? '—' : `${pct}%`

    row.append(name, bar, val)
    list.appendChild(row)
  }
  target.appendChild(list)

  // ── 구간 전체표 ────────────────────────────────────────
  const caption = document.createElement('p')
  caption.className = 'sheet-hint'
  caption.textContent = '웨이브가 진행될수록 확률이 상위 등급으로 옮겨간다. 현재 구간은 밝게 표시된다.'
  target.appendChild(caption)

  const labels = bandLabels()
  const table = document.createElement('div')
  table.className = 'odds-table'
  table.style.gridTemplateColumns = `minmax(48px, auto) repeat(${labels.length}, 1fr)`

  const corner = document.createElement('span')
  corner.className = 'odds-th'
  corner.textContent = '등급'
  table.appendChild(corner)

  for (let i = 0; i < labels.length; i++) {
    const th = document.createElement('span')
    th.className = 'odds-th'
    if (i === activeBand) th.classList.add('active')
    th.textContent = labels[i]!
    table.appendChild(th)
  }

  for (let tier = TIER_COUNT; tier >= 1; tier--) {
    const name = document.createElement('span')
    name.className = 'odds-td name'
    name.textContent = tierLabel(tier)
    name.style.color = tierColor(tier)
    table.appendChild(name)

    for (let i = 0; i < GACHA_TABLE.length; i++) {
      const pct = GACHA_TABLE[i]!.weights[tier - 1] ?? 0
      const td = document.createElement('span')
      td.className = 'odds-td'
      if (i === activeBand) td.classList.add('active')
      if (pct === 0) td.classList.add('zero')
      // 0 을 "0" 으로 적으면 표가 숫자로 꽉 차 읽기 어렵다 — 없는 칸은 비운다
      td.textContent = pct === 0 ? '·' : String(pct)
      table.appendChild(td)
    }
  }
  target.appendChild(table)
}
