import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../helpers'
import { getPopupDetail, getPopupList, popupDisplayStatus } from '@/lib/popup'
import { POPUP_STATUS } from '@/lib/constants'
import { addDays, dateOnly } from '@/lib/date'

/**
 * Issue #4 — 종료 기간이 지난 팝업이 `진행 중`으로 계속 표시되던 상태 판정 오류.
 *
 * DB `Popup.status`는 실제 행위(반출·정산)로만 바뀌지만, 화면 표시는 팝업 기간도
 * 함께 봐야 한다. 여기서는 날짜만 바뀌고 반출/정산 여부는 그대로인 상황을
 * `startAt`/`endAt`/`now` 조합으로 검증한다 — 특정 날짜에 의미를 두지 않는다.
 */

const NAME = '__이슈4 테스트 팝업'
const START = dateOnly(new Date('2026-01-10'))
const END = dateOnly(new Date('2026-01-20'))

async function cleanup() {
  const popups = await db.popup.findMany({ where: { name: NAME } })
  for (const popup of popups) {
    await db.movement.deleteMany({ where: { popupId: popup.id } })
    await db.popupPlan.deleteMany({ where: { popupId: popup.id } })
    await db.popup.delete({ where: { id: popup.id } })
    await db.location.delete({ where: { id: popup.locationId } })
  }
}

async function makePopup(opts: { status: string; settledAt?: Date | null }) {
  const own = await db.location.findFirstOrThrow({ where: { type: 'OWN' } })
  const location = await db.location.create({ data: { name: NAME, type: 'POPUP' } })
  return db.popup.create({
    data: {
      name: NAME,
      status: opts.status,
      startDate: START,
      endDate: END,
      settledAt: opts.settledAt ?? null,
      locationId: location.id,
      sourceLocationId: own.id,
    },
  })
}

describe('Issue #4 — 팝업 기간에 따른 상태 판정', () => {
  beforeAll(cleanup)
  afterEach(async () => {
    vi.useRealTimers()
    await cleanup()
  })
  afterAll(cleanup)

  it('케이스 1: 현재 시각이 시작 시각 이전이면 진행 중으로 표시되지 않는다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(addDays(START, -5))
    const status = popupDisplayStatus({ status: POPUP_STATUS.ACTIVE, startDate: START, endDate: END })
    expect(status).not.toBe(POPUP_STATUS.ACTIVE)
  })

  it('케이스 2: 시작 시각 <= 현재 시각 <= 종료 시각이면 진행 중으로 표시된다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(addDays(START, 3))
    const status = popupDisplayStatus({ status: POPUP_STATUS.ACTIVE, startDate: START, endDate: END })
    expect(status).toBe(POPUP_STATUS.ACTIVE)
  })

  it('케이스 3: 현재 시각이 종료 시각을 지나면 진행 중으로 표시되지 않는다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(addDays(END, 5))
    const status = popupDisplayStatus({ status: POPUP_STATUS.ACTIVE, startDate: START, endDate: END })
    expect(status).not.toBe(POPUP_STATUS.ACTIVE)
  })

  it('케이스 4: 기간 종료 + 미정산이면 기존 SETTLING(정산 중) 상태로 표시된다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(addDays(END, 5))
    const status = popupDisplayStatus({ status: POPUP_STATUS.ACTIVE, startDate: START, endDate: END })
    expect(status).toBe(POPUP_STATUS.SETTLING)
  })

  it('케이스 5: 기간 종료 + 정산 완료면 기존 CLOSED(종료) 상태가 유지된다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(addDays(END, 5))
    const status = popupDisplayStatus({ status: POPUP_STATUS.CLOSED, startDate: START, endDate: END })
    expect(status).toBe(POPUP_STATUS.CLOSED)
  })

  it('케이스 7: 종료 시각까지는 기간 내 규칙, 지난 시점부터 종료 후 규칙을 따른다', () => {
    vi.useFakeTimers()

    vi.setSystemTime(END)
    expect(
      popupDisplayStatus({ status: POPUP_STATUS.ACTIVE, startDate: START, endDate: END })
    ).toBe(POPUP_STATUS.ACTIVE)

    vi.setSystemTime(addDays(END, 1))
    expect(
      popupDisplayStatus({ status: POPUP_STATUS.ACTIVE, startDate: START, endDate: END })
    ).toBe(POPUP_STATUS.SETTLING)
  })

  it('케이스 6: 목록과 상세 화면의 상태 판정 결과가 일치한다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(addDays(END, 5)) // 기간 종료 + 미정산

    const popup = await makePopup({ status: POPUP_STATUS.ACTIVE })

    const list = await getPopupList()
    const listItem = list.find((p) => p.id === popup.id)
    const detail = await getPopupDetail(popup.id)

    expect(listItem?.displayStatus).toBe(POPUP_STATUS.SETTLING)
    expect(detail?.displayStatus).toBe(POPUP_STATUS.SETTLING)
    expect(listItem?.displayStatus).toBe(detail?.displayStatus)
  })

  it('목록 조회는 표시용 상태와 별개로 실제 DB 상태(status)를 그대로 보존한다', async () => {
    // 반출은 이미 됐지만(ACTIVE) 시작일이 아직 안 된 특이 케이스 — 표시는 준비로
    // 바뀌어도, 반출 여부를 판단하는 실제 상태 필드는 왜곡되면 안 된다
    vi.useFakeTimers()
    vi.setSystemTime(addDays(START, -5))

    const popup = await makePopup({ status: POPUP_STATUS.ACTIVE })

    const list = await getPopupList()
    const listItem = list.find((p) => p.id === popup.id)

    expect(listItem?.status).toBe(POPUP_STATUS.ACTIVE)
    expect(listItem?.displayStatus).toBe(POPUP_STATUS.PREP)
  })
})
