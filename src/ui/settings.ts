/**
 * 진동과 전체화면.
 *
 * 둘 다 **기기마다 지원이 갈린다.** 특히 iOS 사파리는 진동(`navigator.vibrate`)을
 * 아예 지원하지 않고, 전체화면도 임의 요소에는 못 건다(비디오만 된다).
 * 그래서 "지원하는가"를 먼저 묻고, 안 되면 UI 에서 옵션을 감춘다 —
 * 눌러도 아무 일 없는 버튼이 제일 나쁘다.
 */

// ── 진동 ─────────────────────────────────────────────────

export function vibrationSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

/**
 * 진동 패턴(ms). 소리와 달리 **아주 아껴서 쓴다** —
 * 손에 계속 울리면 금방 거슬리고 배터리도 먹는다. 판단이 걸린 순간에만.
 */
export const VIBRATE = {
  /** 코어가 뚫렸다 = 라이프 감소. 화면 흔들림과 같이 온다 */
  coreHit: [45] as number[],
  /** 보스 등장 — 두 번 톡톡 */
  bossSpawn: [25, 60, 25] as number[],
  /** 상위 등급 뽑기 */
  celebrate: [15, 40, 30] as number[],
  /** 패배 */
  defeat: [70, 60, 70] as number[],
} as const

export class Vibration {
  private enabled = true

  get supported(): boolean {
    return vibrationSupported()
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    if (!on) this.cancel()
  }

  buzz(pattern: readonly number[]): void {
    if (!this.enabled || !this.supported) return
    try {
      navigator.vibrate([...pattern])
    } catch {
      // 지원한다고 해놓고 던지는 기기가 있다 — 게임이 죽으면 안 된다
    }
  }

  cancel(): void {
    if (!this.supported) return
    try {
      navigator.vibrate(0)
    } catch {
      /* 위와 같음 */
    }
  }
}

// ── 전체화면 ─────────────────────────────────────────────

interface WebkitFullscreen {
  webkitRequestFullscreen?: () => Promise<void> | void
  webkitExitFullscreen?: () => Promise<void> | void
  webkitFullscreenElement?: Element | null
}

export function fullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false
  const el = document.documentElement as HTMLElement & WebkitFullscreen
  return Boolean(document.fullscreenEnabled || el.webkitRequestFullscreen)
}

export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false
  const doc = document as Document & WebkitFullscreen
  return Boolean(document.fullscreenElement ?? doc.webkitFullscreenElement)
}

/** 켜고 끄기. 실패하면 조용히 무시한다 — 사용자 제스처 밖에서 부르면 거부된다. */
export async function toggleFullscreen(): Promise<boolean> {
  const doc = document as Document & WebkitFullscreen
  const el = document.documentElement as HTMLElement & WebkitFullscreen
  try {
    if (isFullscreen()) {
      if (document.exitFullscreen) await document.exitFullscreen()
      else await doc.webkitExitFullscreen?.()
      return false
    }
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' })
    else await el.webkitRequestFullscreen?.()
    return isFullscreen()
  } catch {
    return isFullscreen()
  }
}

/**
 * iOS 는 전체화면 API 를 안 열어준다. 대신 **홈 화면에 추가**하면 주소창 없이 뜬다
 * (`display: standalone`). 이미 그렇게 실행 중인지 확인해서, 그럴 땐 버튼을 감춘다.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone
  return Boolean(iosStandalone) || window.matchMedia('(display-mode: standalone)').matches
}
