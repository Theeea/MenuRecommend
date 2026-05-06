# 유지보수 규칙

앞으로 이 프로젝트 작업 시 아래 규칙을 기본으로 적용합니다.

## 1. 실제 파일 먼저 확인

작업 전 확인 순서:

1. `git status --short`
2. 관련 파일 검색
3. `apps/api/prisma/schema.prisma`
4. 관련 controller/service/screen

추측으로 없는 필드나 없는 라우트를 만들지 않습니다.

## 2. schema 기준으로 개발

금지 필드:

- `Proof.rawUrl`
- `Proof.userId`
- `RecommendSession.challengeCodeExpiresAt`
- `PointLedger.amount`

대체:

- raw URL: `Proof.aiMeta.rawUrl`
- Proof user: `Proof -> RecommendSession -> userId`
- point amount: `PointLedger.points`

## 3. Proof는 비동기

`POST /proofs`는 큐잉만 합니다.
OpenAI Vision 호출은 worker에서만 합니다.

## 4. 서버가 최종 방어선

모바일 UX 제한만 믿지 않습니다.
서버에서 반드시 막아야 하는 것:

- 다른 유저 세션 접근
- challengeCode 불일치
- `PENDING`/`HOLD` 중복 업로드
- 쿨타임 미충족
- 일일 제한 초과
- 포인트 중복 지급

## 5. 이미지 정책 준수

유저:

- `rawUrl || imageUrl`

어드민:

- `imageUrl`

## 6. 라우트 중복 금지

기존 라우트를 우선 사용합니다.

- 차단 메뉴: `/me/blocked-menus`
- Proof 목록: `/me/proofs`
- Proof 상태: `/me/proof-status/:sessionId`

## 7. 포인트는 idempotent

Proof 보상 지급은 `dedupeKey`를 사용합니다.
재시도와 중복 클릭으로 포인트가 중복 지급되면 안 됩니다.

## 8. 작은 단위로 수정

권장 단위:

- API 정책
- 모바일 UX
- 어드민 화면
- worker 처리
- 문서

큰 리팩터링과 기능 수정을 섞지 않습니다.

## 9. 검증 명령 실행

API 변경:

```bash
pnpm --filter api typecheck
```

모바일 변경:

```bash
pnpm --filter mobile exec eslint --no-cache <changed files>
```

## 10. 관리자 키 정책

관리자 키는 헤더로만 받습니다.

```text
x-admin-key: <ADMIN_REVIEW_KEY>
```

query param으로 관리자 키를 추가하지 않습니다.

## 11. 문서 동기화

다음 변경 시 docs도 함께 수정합니다.

- API route 변경
- DB schema 변경
- Proof 정책 변경
- 포인트 지급 정책 변경
- 모바일 화면 흐름 변경
- 운영 명령 변경

## 12. 운영 액션은 감사로그를 남긴다

포인트, 구매, 인증 판정, 메뉴 초안처럼 운영상 추적이 필요한 액션은 `AuditLog`에 기록합니다.

대표 액션:

- `PROOF_REVIEWED`
- `PROOF_REVIEW_CORRECTED`
- `POINTS_ADJUSTED`
- `SHOP_PURCHASE_REQUESTED`
- `SHOP_PURCHASE_SENT`
- `SHOP_PURCHASE_CANCELLED`
- `SHOP_PURCHASE_USED_TOGGLED`
- `MENU_DRAFT_APPROVED`
- `MENU_DRAFT_REJECTED`

원칙:

- 상태 변경과 감사로그 기록은 가능한 한 같은 트랜잭션 안에서 처리합니다.
- `PointLedger`는 잔액 변동 원장이고, `AuditLog`는 운영 추적 로그입니다.
- 관리자 키는 감사로그 조회에서도 `x-admin-key` 헤더만 사용합니다.

## 13. enum/상태 라벨은 공통 패키지 기준

모바일과 어드민에서 enum 값을 사용자에게 직접 노출하지 않습니다.
표시 문구는 `packages/shared`의 라벨 맵과 헬퍼 함수를 사용합니다.

공통 대상:

- `Cuisine`
- `DishType`
- `ProofResult`
- `MenuDraftStatus`
- `RecommendStatus`
- `PointKind`
- `PointSource`
- `IngredientRole`
- `Removable`

새 enum 값이나 화면 표시 문구를 추가할 때 확인할 것:

1. Prisma enum 또는 API 응답 값 확인
2. `packages/shared/index.js` 라벨/옵션 추가
3. `packages/shared/index.d.ts` 타입 선언 추가
4. 모바일 화면에서 shared import 사용
5. 어드민 HTML 템플릿에서 shared 라벨 맵 사용
6. API/mobile 타입체크 실행

예외:

- DB 조회 조건, API 요청 payload, 테스트 fixture처럼 시스템 값 자체가 필요한 곳은 enum 원문 값을 사용합니다.
- 사용자에게 보이는 버튼/탭/배지/상태 문구는 공통 라벨을 사용합니다.
