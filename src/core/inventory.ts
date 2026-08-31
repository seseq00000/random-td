import { SLOT_POSITIONS } from '../data/field.js'
import { GACHA_COST } from '../data/gachaTable.js'
import { nextSlotPrice, sellValue } from '../data/slots.js'
import { MAX_SLOTS, START_SLOTS } from './economy.js'
import { tileKey } from './grid.js'
import type { TileCoord, Tower, UnitInstance } from './types.js'

/** 벤치는 8칸 고정. 확장을 넣으면 "필드를 넓힐까, 더 뽑을까" 2지선다가 흐려진다. */
export const BENCH_CAPACITY = 8

/**
 * 배치 실패 사유.
 *
 * 경로형에서는 `occupied`/`on-path`/`out-of-bounds` 로 갈렸지만, 자리를 플레이어가
 * 고르지 않게 되면서 **전부 `no-slot` 하나로 수렴했다** — 빈 슬롯이 있으면 반드시
 * 성공하고, 없으면 "배치할 공간이 없다" 하나만 보여주면 된다.
 */
export type PlaceFailure = 'no-slot' | 'not-found'
export type PlaceResult = { ok: true; at: TileCoord } | { ok: false; reason: PlaceFailure }

export type BuySlotResult =
  | { ok: true; cost: number; owned: number }
  | { ok: false; reason: 'max-slots' | 'insufficient-gold' }

/**
 * 보유 유닛 전체(필드 + 벤치)와 슬롯·잠금을 관리한다.
 * 전투·웨이브·페이즈는 모른다 — Game 이 그쪽을 맡는다.
 */
export class Inventory {
  slotsOwned = START_SLOTS
  bench: UnitInstance[] = []
  towers: Tower[] = []

  /**
   * 합성 잠금은 **유닛 종류(defId) 단위**다.
   * 컬렉터 미션(같은 유닛 5개)을 노릴 때 3개 자동 합성을 막는 장치이고,
   * 플레이어에게 보이는 단위도 종류별 카드이므로 단위가 일치해야 한다.
   */
  readonly lockedDefIds = new Set<string>()

  private readonly occupied = new Set<number>()
  private nextUid = 1

  // ── 조회 ────────────────────────────────────────────────

  /** 필드 + 벤치 전체. 미션 판정과 합성 탐색의 기준이다. */
  allUnits(): UnitInstance[] {
    return [...this.towers, ...this.bench]
  }

  /** 종류별 보유 개수 (필드 + 벤치 합산). 각성 유닛은 별도로 센다. */
  countsByDef(): Map<string, number> {
    const counts = new Map<string, number>()
    for (const u of this.allUnits()) {
      if (u.awakened) continue
      counts.set(u.defId, (counts.get(u.defId) ?? 0) + 1)
    }
    return counts
  }

  benchCountOf(defId: string): number {
    return this.bench.filter((u) => u.defId === defId).length
  }

  totalCountOf(defId: string): number {
    return this.allUnits().filter((u) => u.defId === defId).length
  }

  benchFull(): boolean {
    return this.bench.length >= BENCH_CAPACITY
  }

  benchFree(): number {
    return BENCH_CAPACITY - this.bench.length
  }

  slotsFree(): number {
    return this.slotsOwned - this.towers.length
  }

  find(uid: number): UnitInstance | undefined {
    return this.allUnits().find((u) => u.uid === uid)
  }

  /**
   * 소유한 슬롯의 자리 목록 — 렌더러가 빈 자리를 그릴 때 쓴다.
   * 슬롯을 사면 링을 따라 자리가 하나씩 늘어나는 게 눈에 보여야 한다.
   */
  ownedSlots(): readonly TileCoord[] {
    return SLOT_POSITIONS.slice(0, this.slotsOwned)
  }

  /**
   * 배치될 다음 자리. 없으면 null — 이게 곧 "공간이 없다" 판정이다.
   *
   * 소유한 슬롯 **앞쪽부터** 채운다. `SLOT_POSITIONS` 가 코어를 시계방향으로 도는
   * 순서라 연달아 배치한 타워끼리 인접하고, 버프 오라가 자연스럽게 걸린다.
   */
  nextFreeSlot(): TileCoord | null {
    for (const pos of this.ownedSlots()) {
      if (!this.occupied.has(tileKey(pos.tx, pos.ty))) return pos
    }
    return null
  }

  // ── 획득 / 제거 ─────────────────────────────────────────

  /** 벤치에 유닛을 넣는다. 정원 초과면 null — 뽑기 쪽에서 이걸 보고 거부한다. */
  grant(defId: string, awakened = false, paid = GACHA_COST): UnitInstance | null {
    if (this.benchFull()) return null
    const unit: UnitInstance = { uid: this.nextUid++, defId, awakened, paid }
    this.bench.push(unit)
    return unit
  }

  /** 빈 슬롯에 직접 배치한다 (합성 결과가 필드 자리를 물려받을 때 사용). */
  grantToField(defId: string, awakened: boolean, paid: number): Tower | null {
    const spot = this.nextFreeSlot()
    if (!spot) return null
    const tower: Tower = {
      uid: this.nextUid++,
      defId,
      awakened,
      paid,
      tx: spot.tx,
      ty: spot.ty,
      cooldown: 0,
    }
    this.towers.push(tower)
    this.occupied.add(tileKey(spot.tx, spot.ty))
    return tower
  }

  /** uid 목록을 필드·벤치 어디에 있든 제거한다 (합성 재료 소모용). */
  remove(uids: readonly number[]): void {
    const set = new Set(uids)
    this.towers = this.towers.filter((t) => {
      if (!set.has(t.uid)) return true
      this.occupied.delete(tileKey(t.tx, t.ty))
      return false
    })
    this.bench = this.bench.filter((b) => !set.has(b.uid))
  }

  /** 판매 — 실제로 낸 골드의 50% 환급. 없는 uid 면 0. */
  sell(uid: number): number {
    const unit = this.find(uid)
    if (!unit) return 0
    this.remove([uid])
    return sellValue(unit.paid)
  }

  // ── 이동 ────────────────────────────────────────────────

  /**
   * 벤치 → 필드. 자리는 자동으로 정해진다.
   *
   * 좌표를 받지 않는 게 핵심이다 — 폰에서 20px 타일을 정확히 탭하는 게 불가능해서
   * 입력 방식 자체를 없앴다. 빈 슬롯이 없으면 `no-slot` 하나만 돌려준다.
   */
  place(uid: number): PlaceResult {
    const idx = this.bench.findIndex((b) => b.uid === uid)
    if (idx < 0) return { ok: false, reason: 'not-found' }
    const spot = this.nextFreeSlot()
    if (!spot) return { ok: false, reason: 'no-slot' }

    const [unit] = this.bench.splice(idx, 1)
    this.towers.push({ ...unit!, tx: spot.tx, ty: spot.ty, cooldown: 0 })
    this.occupied.add(tileKey(spot.tx, spot.ty))
    return { ok: true, at: spot }
  }

  /** 필드 → 벤치. 슬롯은 소유물이라 유닛을 빼도 유지된다. */
  returnToBench(uid: number): boolean {
    const idx = this.towers.findIndex((t) => t.uid === uid)
    if (idx < 0) return false
    if (this.benchFull()) return false
    const [tower] = this.towers.splice(idx, 1)
    this.occupied.delete(tileKey(tower!.tx, tower!.ty))
    this.bench.push({
      uid: tower!.uid,
      defId: tower!.defId,
      awakened: tower!.awakened,
      paid: tower!.paid,
    })
    return true
  }

  // ── 슬롯 ────────────────────────────────────────────────

  nextSlotCost(): number | null {
    return nextSlotPrice(this.slotsOwned)
  }

  /** 슬롯 1개 구매. 성공하면 비용을 돌려주고 호출자가 골드를 깎는다. */
  buySlot(gold: number): BuySlotResult {
    if (this.slotsOwned >= MAX_SLOTS) return { ok: false, reason: 'max-slots' }
    const cost = this.nextSlotCost()
    if (cost === null) return { ok: false, reason: 'max-slots' }
    if (gold < cost) return { ok: false, reason: 'insufficient-gold' }
    this.slotsOwned += 1
    return { ok: true, cost, owned: this.slotsOwned }
  }

  // ── 잠금 ────────────────────────────────────────────────

  isLocked(defId: string): boolean {
    return this.lockedDefIds.has(defId)
  }

  toggleLock(defId: string): boolean {
    if (this.lockedDefIds.has(defId)) {
      this.lockedDefIds.delete(defId)
      return false
    }
    this.lockedDefIds.add(defId)
    return true
  }
}
