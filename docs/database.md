# DB와 Prisma 주의사항

DB 작업 전에는 항상 `apps/api/prisma/schema.prisma`를 직접 확인합니다.

## Prisma generated client

이 프로젝트는 Prisma client output이 일반적인 `@prisma/client`가 아니라 generated path입니다.

예시:

```ts
import {
  Cuisine,
  DishType,
  IngredientRole,
  RecommendStatus,
  ProofResult,
  PointKind,
  PointSource,
} from "../../generated/prisma/client";
```

파일 위치에 따라 상대 경로가 달라질 수 있습니다.

## 없는 필드

아래 필드는 현재 schema에 없습니다.
절대 임의로 사용하지 않습니다.

- `Proof.rawUrl`
- `Proof.userId`
- `RecommendSession.challengeCodeExpiresAt`
- `PointLedger.amount`

대체 방법:

- raw URL: `Proof.aiMeta.rawUrl`
- Proof 소유 유저: `Proof -> RecommendSession -> userId`
- 포인트 금액: `PointLedger.points`

## 핵심 모델 개념

### `User`

역할:

- 추천, 인증, 포인트 ledger의 기준 유저

중요 필드:

- `id`
- `email`
- `password`
- `pointBalance`

### `Menu`

역할:

- 추천 대상 메뉴

관계:

- `ingredients`
- `sessions`
- `blocks`

### `RecommendSession`

역할:

- 추천 1회 세션

상태:

- `RECOMMENDED`
- `ACCEPTED`
- `PROOF_SUBMITTED`
- `DONE`
- `CANCELLED`

주의:

- `challengeCodeExpiresAt`은 없습니다.
- `challengeCode` 검증은 현재 존재하는 필드 기준으로만 합니다.

### `Proof`

역할:

- 음식 인증 1건

중요 필드:

- `sessionId`
- `imageUrl`
- `aiResult`
- `aiScore`
- `aiModel`
- `aiMeta`
- `createdAt`
- `reviewedAt`

주의:

- `aiScore`는 nullable이 아닙니다.
- queued Proof는 `aiScore: 0`으로 생성합니다.
- raw URL은 `aiMeta.rawUrl`에 저장합니다.

### `PointLedger`

역할:

- 포인트 적립/사용/조정 내역

중요 필드:

- `points`
- `balanceAfter`
- `source`
- `sourceId`
- `proofId`
- `dedupeKey`

주의:

- `amount`가 아니라 `points`입니다.
- Proof 보상은 `dedupeKey`로 중복 지급을 막아야 합니다.

### `ShopItem`

역할:

- 포인트 사용 탭에서 구매할 수 있는 상품입니다.

중요 필드:

- `name`
- `description`
- `category`
- `pricePoints`
- `imageUrl`
- `status`
- `stock`
- `sortOrder`

정책:

- 삭제는 실제 삭제가 아니라 `status: INACTIVE` 숨김 처리입니다.
- `stock`이 `null`이면 무제한 재고로 봅니다.
- 모바일 `GET /shop/items`는 `ACTIVE` 상품만 내려줍니다.

### `UserPurchase`

역할:

- 유저의 포인트 상품 구매 요청입니다.

상태:

- `REQUESTED`
- `SENT`
- `CANCELLED`

중요 필드:

- `points`
- `status`
- `itemSnapshot`
- `fulfillmentMeta`
- `fulfilledAt`
- `cancelledAt`

정책:

- 구매 즉시 포인트를 차감하고 `REQUESTED`로 생성합니다.
- 어드민 발송 완료 시 `SENT`가 됩니다.
- 유저 또는 어드민 취소/환불 시 `CANCELLED`가 됩니다.
- 교환권 코드, 메모, 취소 사유, 사용/미사용 표시는 `fulfillmentMeta`에 저장합니다.

### `AuditLog`

역할:

- 관리자/유저의 운영상 중요한 액션을 추적합니다.

중요 필드:

- `actorType`
- `actorId`
- `action`
- `targetType`
- `targetId`
- `userId`
- `metadata`
- `createdAt`

정책:

- 포인트, 구매, 인증 판정, 메뉴 초안 승인/거절 같은 액션은 가능한 한 상태 변경과 같은 트랜잭션 안에서 기록합니다.
- `PointLedger`는 잔액 변동 원장이고, `AuditLog`는 운영 추적 로그입니다.

### `UserMenuBlock`

역할:

- 유저가 차단한 메뉴

정책:

- 추천 후보에서 제외합니다.
- unique 기준은 `userId_menuId`입니다.

## DB 변경 규칙

- schema 변경 전 관련 코드에서 실제 사용하는 필드를 먼저 검색합니다.
- migration 후 generated client를 갱신합니다.
- 운영/로컬 DB에는 `pnpm --filter api prisma:deploy` 또는 개발 상황에 맞는 migrate 명령을 적용합니다.
- schema 변경 문서는 이 파일에 반영합니다.
- 없는 필드를 코드에서 우회적으로 사용하지 않습니다.
