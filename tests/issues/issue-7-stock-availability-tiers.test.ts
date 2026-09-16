import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, ids } from '../helpers'
import { applyMovement } from '@/lib/stock'
import { getProductDetail } from '@/lib/inventory'
import { dateOnly, today, addDays } from '@/lib/date'

/**
 * Issue #7 — 재고 상세 화면의 즉시 출고·가용·전체 재고 구분.
 *
 * Issue 본문(§2)이 준 관계를 그대로 종료 조건으로 삼는다:
 *   즉시 출고 가능 = 자사창고
 *   가용 재고     = 자사창고 + 풀필먼트
 *   전체 재고     = 자사창고 + 풀필먼트 + 오프라인 팝업
 * 배송 중·폐기는 가상 거점(01 §1)이라 세 수치 어디에도 들어가지 않는다.
 */

const NAME = '__이슈7 테스트 팝업 거점'
const EXPIRY = dateOnly(addDays(today(), 900))

async function cleanup() {
  await db.movement.deleteMany({ where: { expiryDate: EXPIRY } })
  await db.lot.deleteMany({ where: { expiryDate: EXPIRY } })
  await db.location.deleteMany({ where: { name: NAME } })
}

describe('Issue #7 — 즉시 출고·가용·전체 재고 구분', () => {
  beforeAll(cleanup)
  afterAll(async () => {
    await cleanup()
    await db.$disconnect()
  })

  it('자사창고만 즉시 출고 가능에 들어가고, 팝업은 전체 재고에만, 배송 중은 어디에도 안 들어간다', async () => {
    const { own, ff, user, product } = await ids()
    const transit = await db.location.findFirstOrThrow({ where: { type: 'TRANSIT' } })
    const popup = await db.location.create({ data: { name: NAME, type: 'POPUP' } })

    const before = await getProductDetail(product.id)
    expect(before).not.toBeNull()

    await db.$transaction(async (tx) => {
      // 자사창고 입고 40 → 그중 15는 풀필먼트로 발송(내부 이동, 가용 합계는 불변)
      await applyMovement(tx, {
        type: 'INBOUND',
        reason: 'PURCHASE',
        productId: product.id,
        expiryDate: EXPIRY,
        quantity: 40,
        toLocationId: own.id,
        userId: user.id,
      })
      await applyMovement(tx, {
        type: 'TRANSFER',
        productId: product.id,
        expiryDate: EXPIRY,
        quantity: 15,
        fromLocationId: own.id,
        toLocationId: ff.id,
        userId: user.id,
      })
      // 팝업 재고 7, 배송 중 재고 9 — 둘 다 자사창고·풀필먼트와 무관하게 별도로 존재
      await applyMovement(tx, {
        type: 'INBOUND',
        reason: 'PURCHASE',
        productId: product.id,
        expiryDate: EXPIRY,
        quantity: 7,
        toLocationId: popup.id,
        userId: user.id,
      })
      await applyMovement(tx, {
        type: 'INBOUND',
        reason: 'PURCHASE',
        productId: product.id,
        expiryDate: EXPIRY,
        quantity: 9,
        toLocationId: transit.id,
        userId: user.id,
      })
    })

    const after = await getProductDetail(product.id)
    expect(after).not.toBeNull()

    // 즉시 출고 가능 = 자사창고: 입고 40 − 발송 15 = 순증 25
    expect(after!.immediate - before!.immediate).toBe(25)
    // 가용 재고 = 자사창고 + 풀필먼트: 내부 발송은 합계를 안 바꾸므로 신규 입고 40만 순증
    expect(after!.available - before!.available).toBe(40)
    // 전체 재고 = 가용 재고 + 팝업(7). 배송 중(9)은 포함하지 않는다
    expect(after!.total - before!.total).toBe(47)
    expect(after!.total - before!.total).not.toBe(56) // 배송 중까지 셌다면 나올 값(47+9)과 다르다
  })
})
