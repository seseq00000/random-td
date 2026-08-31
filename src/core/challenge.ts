import { TOKEN_MAX, isTokenWave, type ChallengeKind } from '../data/challenge.js'
import type { ChallengeFlags } from './wave.js'

export type DeclareFailure = 'no-token' | 'already-declared' | 'wrong-phase'
export type DeclareResult = { ok: true; tokensLeft: number } | { ok: false; reason: DeclareFailure }

/**
 * 도전 토큰과 선언 상태.
 *
 * 토큰은 4웨이브마다 1개씩 충전되고 **최대 2개**만 들고 있을 수 있다 —
 * 아껴도 넘쳐서 버려지므로 계속 쓸 수밖에 없다. 그게 설계 의도다.
 */
export class Challenges {
  tokens = 0
  /** 이번 전투에 적용될 선언. 준비 페이즈 종료 전까지 취소 가능하다. */
  readonly declared = new Set<ChallengeKind>()
  /** 총 충전량 — 상한 때문에 버려진 토큰을 세기 위해 따로 센다 */
  granted = 0
  wasted = 0

  /** 준비 페이즈 진입 시 호출. 충전됐으면 true. */
  grantForWave(wave: number): boolean {
    if (!isTokenWave(wave)) return false
    this.granted += 1
    if (this.tokens >= TOKEN_MAX) {
      this.wasted += 1
      return false
    }
    this.tokens += 1
    return true
  }

  declare(kind: ChallengeKind): DeclareResult {
    if (this.declared.has(kind)) return { ok: false, reason: 'already-declared' }
    if (this.tokens <= 0) return { ok: false, reason: 'no-token' }
    this.tokens -= 1
    this.declared.add(kind)
    return { ok: true, tokensLeft: this.tokens }
  }

  /** 취소하면 토큰을 돌려준다. */
  cancel(kind: ChallengeKind): boolean {
    if (!this.declared.delete(kind)) return false
    this.tokens += 1
    return true
  }

  isDeclared(kind: ChallengeKind): boolean {
    return this.declared.has(kind)
  }

  flags(): ChallengeFlags {
    return {
      fever: this.declared.has('fever'),
      challengeBoss: this.declared.has('boss'),
    }
  }

  /** 전투가 끝나면 선언을 비운다. 토큰은 이미 소모됐다. */
  consume(): void {
    this.declared.clear()
  }
}
