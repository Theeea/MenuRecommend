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

### `UserMenuBlock`

역할:

- 유저가 차단한 메뉴

정책:

- 추천 후보에서 제외합니다.
- unique 기준은 `userId_menuId`입니다.

## DB 변경 규칙

- schema 변경 전 관련 코드에서 실제 사용하는 필드를 먼저 검색합니다.
- migration 후 generated client를 갱신합니다.
- schema 변경 문서는 이 파일에 반영합니다.
- 없는 필드를 코드에서 우회적으로 사용하지 않습니다.
