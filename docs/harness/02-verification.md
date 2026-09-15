# 검증 — 재고관리 PoC

> SSOT §3의 원본. 여기서 "검증"은 코드 변경이 요구사항(01)·아키텍처(06)를
> 실제로 지키는지 확인하는 절차 전체를 말한다. **자동 검증**(로컬·CI에서
> 명령 하나로 반복 가능한 것)과 **수동 검증**(사람이 화면을 보고 판단해야
> 하는 것)으로 나눈다. 이 문서가 최신이 아니면 `package.json`의 스크립트와
> `.github/workflows/verify.yml`을 실제 기준으로 삼는다.

---

## 0. 한 줄 요약

```
npm run verify
```

`prepare → typecheck → lint → architecture → test → build` 순서로 실행되고,
한 단계라도 실패하면 다음 단계로 넘어가지 않는다. PR을 올리거나 `main`에
push하면 GitHub Actions(`.github/workflows/verify.yml`)가 같은 명령을
`ubuntu-latest`에서 그대로 돌린다 — **로컬에서 통과하면 CI에서도 통과한다**가
설계 원칙이다.

---

## 1. 자동 검증 파이프라인 (`npm run verify`)

| 순서 | 단계 | 명령 | 확인하는 것 |
|---|---|---|---|
| 1 | prepare | `verify:prepare` (`seed:reset`의 별칭) | `prisma/dev.db`를 지우고 같은 시드로 다시 채운다. 기존 로컬 조작 상태와 무관하게 항상 동일한 데이터에서 검증을 시작한다 |
| 2 | types | `typecheck` (`tsc --noEmit`) | 타입 오류 0 |
| 3 | lint | `lint` (`eslint`) | 정적 규칙 (예: React 훅/컴포넌트 순수성 — 렌더 중 `Date.now()` 직접 호출 금지) |
| 4 | architecture | `verify:architecture` (`scripts/verify-architecture.ts`) | 06-architecture.md가 정한 "정해진 통로"를 코드가 우회하지 않았는지 — 아래 §3 |
| 5 | test | `test` (`vitest run`) | SSOT INV-1~7 불변식 — 아래 §2 |
| 6 | build | `build` (`prisma generate && next build`) | 프로덕션 빌드가 실제로 성공하는지 |

`verify:prepare`가 로컬 `dev.db`를 지운다는 점에 주의한다 — `npm run dev`로
수동 조작해둔 데이터가 있다면 `npm run verify` 실행 후 사라진다. 의도된
동작이다(동일 시드 기준 검증).

---

## 2. 자동 테스트 ↔ SSOT 불변식 (INV-1~7)

> 원본: SSOT §2.6, [`06-architecture.md`](../06-architecture.md) §9

| ID | 불변식 | 테스트 파일 |
|---|---|---|
| INV-1 | FEFO는 항상 임박 로트부터 배분한다 | `tests/fefo.test.ts` |
| INV-2 | 여러 로트에 걸친 수량은 정확히 쪼개 배분한다 | `tests/fefo.test.ts` |
| INV-3 | 재고 초과 출고는 예외를 던지고 아무것도 바뀌지 않는다 | `tests/stock-invariant.test.ts` |
| INV-4 | 발송→도착확인 전후 총 재고 합계가 같다 | `tests/stock-invariant.test.ts` |
| INV-5 | 팝업 정산은 누적 반출 기준으로 역산된다 | `tests/popup-settle.test.ts` |
| INV-6 | 시식 수량이 차감분보다 크면 저장되지 않는다 | `tests/popup-settle.test.ts` |
| INV-7 | 취소(상쇄) 후 로트 수량이 원복된다 | `tests/stock-invariant.test.ts` |

`tests/`는 `prisma/dev.db`를 그대로 공유해서 쓴다. 새 테스트를 추가할 때도
자기가 만든 데이터만 앞뒤로 정리하는 기존 방식을 지킨다(`docs/HANDOVER.md`
§4 참고).

---

## 3. architecture 단계가 강제하는 규칙

`scripts/verify-architecture.ts`는 DB 연결 없이 `src/**/*.{ts,tsx}` 소스만
읽어 06-architecture.md의 두 규칙을 정적으로 검사한다. 위반이 있으면
`파일:줄`과 함께 실패 종료(`exit 1`)한다.

| 규칙 | 원본 | 검사 방법 |
|---|---|---|
| 재고 변경은 `applyMovement()` 한 곳만 통과한다 | 06 §2 / §4.1 | `src/lib/stock.ts` 밖에서 `*.lot.update/upsert/create(Many)(` 호출이 있으면 위반 |
| Prisma는 서버 영역에서만 쓴다 | 06 §7.5 | `'use client'` 파일이 `@/lib/db` · `@/generated/prisma/client` · `@prisma/client`를 import하면 위반 |

**한계**: FEFO/LEFO 배분이 반드시 `lib/fefo.ts`의 `planAllocation()`을
거치는지는 자동 검사하지 않는다. 화면 표시용 정렬(유통기한순 토글 등)과
실제 배분 로직을 grep만으로 구분하기 어려워 오탐 위험이 크다고 판단해
보류했다. 필요해지면 사람이 먼저 검사 기준을 정한다(SSOT §0-1 — 검증
스크립트 정책 변경은 사람 승인 필요).

---

## 4. CI (`.github/workflows/verify.yml`)

- **트리거**: 모든 Pull Request + `main` 브랜치 push
- **실행 환경**: `ubuntu-latest`, Node 24, `npm ci`로 잠금 파일 그대로 설치
- **실행 내용**: `npm run verify` 그대로 — 로컬과 다른 명령을 쓰지 않는다
- **환경변수**: `DATABASE_URL` · `SESSION_SECRET`을 CI 전용 값으로 워크플로에
  직접 넣는다(운영 비밀값 아님, `.env.example`과 같은 변수명)

CI가 매번 `verify:prepare`부터 시작하므로, 체크아웃 직후 `prisma/dev.db`와
`src/generated/prisma`가 없는 상태(둘 다 `.gitignore` 대상)에서도 전체
파이프라인이 스스로 DB 마이그레이션·클라이언트 생성·시드까지 끝내고
검증한다 — 별도 CI 전용 셋업 스텝이 필요 없다.

---

## 5. 수동 검증 (자동화하지 않는 영역)

| 항목 | 원본 | 비고 |
|---|---|---|
| QA 체크리스트 B~D (페르소나 시나리오·반응형·엣지케이스) | `07-plan.md` §2 | 한글 IME, 동시 출고 WAL 충돌 등은 브라우저로 직접 확인해야 한다 |
| DB 육안 확인 | — | `npm run db:studio` (localhost:5555) |
| 시드/화면 회귀 확인용 스크립트 | `scripts/verify-m1.ts`, `scripts/verify-headline.ts`, `scripts/snapshot.ts` | 사람이 읽고 판단하는 보조 스크립트라 `verify` 파이프라인에는 포함하지 않는다 |

---

## 6. 알려진 한계

- FEFO/LEFO가 `planAllocation()`을 우회하지 않는지는 미검증 (§3 참고)
- QA 체크리스트 B~E는 여전히 전부 수동
- CI는 검증만 한다 — 배포 파이프라인은 Out of Scope (01 §6)
