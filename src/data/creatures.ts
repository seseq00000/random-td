import type { Role } from '../core/types.js'

/**
 * 애칭 사다리 길이. `units.ts` 가 `TIER_COUNT` 와 같은지 검증한다.
 *
 * 여기서 `units.ts` 를 import 하지 않는 이유: `units.ts` 가 이 파일을 import 하므로
 * 순환이 된다. 상수를 여기서 내보내고 **검증은 아래쪽(units)에서** 한다.
 */
export const NICKNAME_TIERS = 7

/**
 * 숲속 자경단 — 역할별 동물.
 *
 * 역할의 **기능**과 동물의 **생김새**가 1:1로 맞는 것만 골랐다.
 * 고슴도치가 가시를 직선으로 쏘는 걸 보면 관통이라는 걸 안다 — 설명이 필요 없다.
 *
 * 40px 타일에서는 디테일이 안 보이므로 **실루엣 단서**가 전부다.
 * 귀 모양·가시·부리처럼 윤곽으로 구분되는 특징만 쓴다.
 */
export interface Creature {
  role: Role
  /** 동물 이름 */
  name: string
  /** 벤치 카드에 찍는 한 글자 */
  glyph: string
  /** 몸통색 — 동물다움을 담당한다 (티어는 테두리 색이 담당) */
  body: string
  /** 몸통보다 어두운 귀·가시·무늬용 */
  accent: string
  /** 역할 한 줄 설명 — 범례와 툴팁에서 쓴다 */
  blurb: string
  /**
   * 티어 1~7 애칭. 어근이 2글자인 빼미·늘보·도치는 T2 에서 `-이` 를 붙이지 않는다
   * (`빼미이` 가 어색하다). 공식에 예외를 두는 대신 7개를 명시한다.
   */
  nicknames: readonly string[]
}

export const CREATURES: readonly Creature[] = [
  {
    role: 'single',
    name: '고양이',
    glyph: '냥',
    body: '#e08a4a',
    accent: '#b96a33',
    blurb: '단일 딜러 — 가장 강한 적 하나를 정확히 때린다',
    nicknames: ['아기냥', '냥이', '냥님', '냥경', '냥장', '냥왕', '냥신'],
  },
  {
    role: 'splash',
    name: '곰',
    glyph: '곰',
    body: '#8a6244',
    accent: '#63452f',
    blurb: '광역 — 내려찍어 주변을 한꺼번에 친다',
    nicknames: ['아기곰', '곰이', '곰님', '곰경', '곰장', '곰왕', '곰신'],
  },
  {
    role: 'sniper',
    name: '올빼미',
    glyph: '빼',
    body: '#6f8ba8',
    accent: '#4d6376',
    blurb: '장거리 — 사거리가 가장 길다. 멀리서 꾸준히 쏜다',
    nicknames: ['아기빼미', '빼미', '빼미님', '빼미경', '빼미장', '빼미왕', '빼미신'],
  },
  {
    role: 'control',
    name: '나무늘보',
    glyph: '늘',
    body: '#a89878',
    accent: '#7d7057',
    blurb: '제어 — 적을 느리게 만든다. 딜은 낮다',
    nicknames: ['아기늘보', '늘보', '늘보님', '늘보경', '늘보장', '늘보왕', '늘보신'],
  },
  {
    role: 'pierce',
    name: '고슴도치',
    glyph: '도',
    body: '#6a5240',
    accent: '#403022',
    blurb: '관통 — 가시가 직선으로 여러 명을 꿰뚫는다',
    nicknames: ['아기도치', '도치', '도치님', '도치경', '도치장', '도치왕', '도치신'],
  },
  {
    role: 'buff',
    name: '강아지',
    glyph: '멍',
    body: '#e8d5a8',
    accent: '#bda878',
    blurb: '버프 — 직접 싸우지 않고 인접한 동료를 북돋운다',
    nicknames: ['아기멍', '멍이', '멍님', '멍경', '멍장', '멍왕', '멍신'],
  },
]

const BY_ROLE = new Map(CREATURES.map((c) => [c.role, c]))

for (const c of CREATURES) {
  if (c.nicknames.length !== NICKNAME_TIERS) {
    throw new Error(
      `creatures: ${c.name} 애칭이 ${c.nicknames.length}개다 (${NICKNAME_TIERS}개여야 한다)`,
    )
  }
}

export function creatureOf(role: Role): Creature {
  const c = BY_ROLE.get(role)
  if (!c) throw new Error(`creatures: 역할 ${role} 에 동물이 없다`)
  return c
}

/** 티어에 맞는 애칭. 범위 밖은 양 끝으로 떨군다. */
export function nicknameOf(role: Role, tier: number): string {
  const list = creatureOf(role).nicknames
  const idx = Math.min(list.length - 1, Math.max(0, Math.round(tier) - 1))
  return list[idx]!
}
