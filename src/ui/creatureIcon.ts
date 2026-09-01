import type { Role } from '../core/types.js'
import { drawCreature } from '../render/creatures.js'

/**
 * DOM UI 에서 쓰는 동물 아이콘.
 *
 * 원래 카드에는 글자(냥/곰/빼/늘/도/멍)를 썼다. "카드마다 캔버스를 심으면 무겁다"는
 * 이유였는데, 실제로 무거운 건 **캔버스가 아니라 매번 다시 그리는 것**이었다.
 * 그리기 결과를 data URL 로 캐시해두면 두 번째부터는 `<img>` 한 줄이라 공짜다.
 *
 * 종류가 유한하다(6역할 × 7티어 × 각성여부 × 크기 몇 종)는 게 이 캐시가 성립하는 근거다.
 */

const cache = new Map<string, string>()

/** 화면에 그려질 크기의 몇 배로 렌더할지 — 고밀도 화면에서 뭉개지지 않게 */
const SUPERSAMPLE = 3

/**
 * 동물 그림의 data URL. 같은 조합이면 캐시에서 바로 준다.
 *
 * `size` 는 CSS 픽셀 기준 한 변 길이다. 고슴도치 가시가 몸통 반지름의 1.5배까지
 * 뻗고 각성 광채도 바깥으로 한 겹 더 나가므로, 몸통은 상자의 62% 로 잡아 여백을 남긴다.
 */
export function creatureIconUrl(role: Role, tier: number, awakened = false, size = 48): string {
  const key = `${role}:${tier}:${awakened}:${size}`
  const hit = cache.get(key)
  if (hit) return hit

  const canvas = document.createElement('canvas')
  canvas.width = size * SUPERSAMPLE
  canvas.height = size * SUPERSAMPLE
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.scale(SUPERSAMPLE, SUPERSAMPLE)

  drawCreature(ctx, role, size / 2, size / 2, size * 0.62, tier, { awakened })

  const url = canvas.toDataURL()
  cache.set(key, url)
  return url
}

/** 바로 붙일 수 있는 `<img>`. alt 는 비워둔다 — 옆에 이름 텍스트가 이미 있다. */
export function creatureIcon(
  role: Role,
  tier: number,
  awakened = false,
  size = 48,
): HTMLImageElement {
  const img = document.createElement('img')
  img.className = 'creature-icon'
  img.src = creatureIconUrl(role, tier, awakened, size)
  img.alt = ''
  img.width = size
  img.height = size
  return img
}
