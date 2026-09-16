# 재고관리 PoC — 에이전트 진입점

**모든 문서를 한꺼번에 읽지 않는다.** 질문/작업 성격에 맞춰 아래 표로 필요한 절만 먼저 읽고,
그것만으로 판단이 안 될 때만 "탐색 범위 넓히기" 순서를 따라 범위를 넓힌다.

원본(SSOT): [`docs/harness/01-ssot.md`](docs/harness/01-ssot.md)

## 질문 유형별 라우팅

| 질문 · 작업 유형 | 먼저 읽을 곳 |
|---|---|
| 기능이 뭘 해야 하는지, 사유 코드, 비기능 요구, 범위 제외, 완료 기준(DoD) | SSOT §1 요구사항 |
| 데이터 모델, 재고 변경 로직(FEFO/LEFO·applyMovement·정산·취소), 스택, 인증, 동시성, 불변식 목록 | SSOT §2 아키텍처 |
| 문서·Issue·계획이 서로 다른 말을 할 때 무엇을 따라야 하는지 | SSOT §0 문서 충돌 시 판단 규칙 |
| 이 변경을 AI가 직접 결정해도 되는지, 사람 승인이 필요한지 | SSOT §0-1 보호 영역과 소유권 |
| 테스트·불변식이 실제로 통과했는지, `npm run verify`·CI 구성, QA 결과 | SSOT §3 검증 → [`docs/harness/02-verification.md`](docs/harness/02-verification.md) |
| 구현 루프 시도 횟수·세션 복구(코멘트) 정책, 마일스톤 진행 상황, 알려진 함정 | SSOT §4 구현 루프 → [`docs/harness/03-loop.md`](docs/harness/03-loop.md) · 마일스톤 현황은 `docs/HANDOVER.md` |

## 탐색 범위 넓히기 (라우팅된 절로 판단이 안 될 때만)

1. **SSOT가 인용한 원본 절** — 각 SSOT 섹션은 `01-requirements.md` / `06-architecture.md`의 해당 절을 명시한다. 그 절을 읽는다
2. **서사·과정 문서** — `02-personas.md`(사용자 맥락) · `03-scenarios.md`(시나리오) · `04-engagement.md`(차별화 장치) · `05-design.md`(디자인 스펙) · `07-plan.md`(마일스톤·QA 체크리스트)
3. 그래도 판단이 안 서면 SSOT §0 충돌 규칙에 따라 **사람에게 넘긴다** — 임의로 하나를 골라 넘어가지 않는다

---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
