# 구현 루프 — 재고관리 PoC

> SSOT §4의 원본. "구현 루프"는 유지보수 Issue 하나를 시작부터 종료(검증 통과 또는
> `NEED_HUMAN`)까지 진행하는 절차 전체를 말한다. [`02-verification.md`](02-verification.md)(§3
> 검증)가 "지금 결과가 참인지 거짓인지"만 판정한다면, 이 문서는 "실패했을 때 다시
> 시도할지, 몇 번째 시도인지, 세션이 끊겼을 때 어디서 이어갈지"를 다룬다 — **판정과
> 재시도 관리를 서로 다른 책임으로 분리한다.**

---

## 0. 책임 분리

| 관심사 | 담당 | 산출물 |
|---|---|---|
| 지금 결과가 통과인지 실패인지, 어느 단계에서 실패했는지 | §3 검증 (`npm run verify`) | 종료 코드, 실패 단계 이름 |
| 실패 시 다시 시도할지, 몇 번째 시도인지, 세션이 끊기면 어디서 이어갈지 | §4 구현 루프 (본 문서) | GitHub Issue 코멘트 |

검증은 재시도 여부를 스스로 판단하지 않는다. 검증은 판정만 하고, 그 판정을 받아
재시도·중단·`NEED_HUMAN` 전환을 결정하는 것은 전부 이 문서의 규칙을 따른다.

---

## 1. 시도(attempt)의 정의

**"코드 수정 + `npm run verify` 1회 실행"까지를 묶어 1시도로 센다.**

- 코드만 고치고 `npm run verify`를 아직 실행하지 않은 상태는 시도로 세지 않는다
- `npm run verify`를 실행한 순간 그 시도는 소모된 것으로 기록한다 — 통과든 실패든 무관하다
- 같은 시도 안에서 여러 파일을 고쳐도 좋다. **verify 실행 1회당 1시도**이지, 파일
  수정 횟수나 커밋 횟수가 아니다

최대 시도 횟수는 Issue-SSOT 규칙(SSOT §0)에 따라 **그 Issue Form §6("구현 루프 최대
횟수")이 정한 값**을 그대로 쓴다. 이 문서는 횟수를 세는 방법과 기록하는 방법만
정의하고, 몇 회가 적절한지는 Issue마다 다르게 정한다.

---

## 2. 세션 복구 — GitHub Issue 코멘트가 SSOT

에이전트 세션이 끊기면 대화 컨텍스트 안에 있던 "지금까지 몇 번 시도했다"는 정보도
함께 사라진다. 하네스 자체에는 이를 대신 저장하는 상태 파일·DB가 없다. 이 문제를
풀기 위해 **진행 상황의 SSOT를 대화가 아니라 그 Issue의 코멘트로 둔다.**

### 2.1 시작할 때 — 이어서 할지 새로 시작할지 판단

이슈 작업을 시작하기 전, 에이전트는 항상 먼저 그 Issue의 코멘트를 조회한다.

```
gh issue view {번호} --comments
```

`<!-- agent-loop:issue-{번호} ... -->` 마커가 붙은 코멘트가 있으면, 그중 **가장
최근 것**을 마지막 상태로 본다.

- `result=pass|fail`이면 그 `attempt` 값 다음 번호부터 이어서 센다
- `result=reset`이면 그 코멘트가 이미 시도 횟수를 0으로 되돌린 것이므로, 다음 시도를
  1로 보고 이어서 센다
- `result=need_human`이면 **사람의 새 지시 없이는 재시도하지 않는다.** `reason`이
  `ssot_conflict`/`scope_ambiguous`이고 사람이 이미 새 지시를 줬다면 §2.4에 따라
  초기화 코멘트를 먼저 남긴 뒤 시도 1부터 재개한다. `reason`이 `attempts_exhausted`면
  Issue Form §6 값이 사람 손으로 바뀌기 전까지 재시도하지 않는다
- 마커가 하나도 없으면 시도 0부터 새로 시작한다

### 2.2 매 시도 직후 — 결과를 코멘트로 남긴다

`npm run verify`를 실행한 직후(통과·실패 관계없이) 아래 형식으로 그 Issue에 코멘트를
남긴다. 첫 줄의 HTML 주석은 화면에는 보이지 않고 다음 세션이 파싱해 이어가기 위한
마커다.

```
<!-- agent-loop:issue-{번호} attempt={k} max={max} result={pass|fail} -->
### 구현 루프 — 시도 {k}/{max}
- 실행: `npm run verify`
- 결과: 통과 / 실패 (실패 단계: typecheck|lint|architecture|test|build)
- 실패 원인: {한두 줄 요약, 실패라면}
- 다음 조치: 재시도 / NEED_HUMAN ({사유})
```

### 2.3 종료 조건과 NEED_HUMAN 사유

- **통과** → 마지막 코멘트로 완료를 기록하고 루프를 끝낸다 (이후 PR 등 다음 단계로)
- **실패했고 시도 횟수가 남아 있다** → 원인을 분석해 코드를 수정하고 다음 시도로
  넘어간다
- **더 진행할 수 없어 `NEED_HUMAN`으로 전환한다** → 아래 두 갈래를 구분해 코멘트에
  사유를 명시한다. 임의로 최대 횟수를 늘리거나 조용히 계속 시도하지 않는다 (SSOT §0)

  | 사유 | 언제 | `reason` 값 |
  |---|---|---|
  | SSOT·이슈 해석 문제 | SSOT §0 문서 충돌, 또는 이 Issue의 종료 조건(Form §3)·범위 해석이 모호해 임의로 진행할 수 없는 경우 | `ssot_conflict` / `scope_ambiguous` |
  | 반복 실패로 소진 | 검증이 계속 실패하고 최대 시도 횟수를 다 쓴 경우 | `attempts_exhausted` |

  ```
  <!-- agent-loop:issue-{번호} attempt={k} max={max} result=need_human reason={ssot_conflict|scope_ambiguous|attempts_exhausted} -->
  ### NEED_HUMAN — 시도 {k}/{max}
  - 사유: {ssot_conflict | scope_ambiguous | attempts_exhausted}
  - 무엇이 왜 갈렸는지: {요약}
  - 필요한 결정: {사람이 정해줘야 하는 것}
  ```

### 2.4 사람이 새 지시를 내리면 — 시도 횟수 초기화

`reason`이 **`ssot_conflict` 또는 `scope_ambiguous`**였던 `NEED_HUMAN` 뒤에 사람이 새
지시(요구사항 해석·범위 확정 등)를 내리면, 그 지시는 이전까지의 시도들이 풀지 못했던
**판단 문제를 해소한 것**이지 "코드를 더 고쳐보라"는 뜻이 아니다. 그래서 이 경우
에이전트는 **다음 시도부터 시도 횟수를 0으로 초기화**하고, 다시 최대 횟수만큼 시도할
수 있다.

- `reason`이 **`attempts_exhausted`**인 경우는 초기화하지 않는다 — 이미 코드 수정
  기회를 다 쓴 것이므로, 사람이 새 지시를 주더라도 이 문서의 규칙만으로 자동
  초기화하지 않는다. 최대 횟수 자체를 늘려야 한다면 그 Issue Form §6 값을 사람이
  고쳐야 한다 (Issue-SSOT 규칙, SSOT §0)
- **초기화도 반드시 코멘트로 남긴다** — 다음 세션이 마지막 코멘트만 보고도 "왜 시도
  횟수가 다시 0부터인지" 알 수 있어야 한다

  ```
  <!-- agent-loop:issue-{번호} attempt=0 max={max} result=reset reason={ssot_conflict|scope_ambiguous} -->
  ### 구현 루프 — 시도 횟수 초기화
  - 이전 상태: NEED_HUMAN (사유: {ssot_conflict|scope_ambiguous}, 시도 {k}/{max}였음)
  - 사람의 새 지시: {요약}
  - 시도 횟수를 0/{max}으로 초기화하고 재개한다
  ```

- 초기화 이후 다음 verify 실행은 다시 **시도 1/{max}**부터 코멘트를 남긴다

---

## 3. 이 문서가 다루지 않는 것

- 무엇을 통과로 볼지(불변식·Issue 종료 조건 판정) → §3 검증, [`02-verification.md`](02-verification.md)
- 최대 시도 횟수가 몇 회여야 하는지 → 개별 Issue Form §6
- 코드 변경 범위·건드리면 안 되는 것 → 개별 Issue Form §5·§5-1
- 마일스톤별 구현 현황·알려진 함정 → [`docs/HANDOVER.md`](../HANDOVER.md)
