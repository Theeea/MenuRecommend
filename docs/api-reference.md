# API 명세와 라우트

라우트를 수정하거나 모바일에서 호출하기 전에는 반드시 실제 controller 파일을 확인합니다.

## 추천

### `POST /recommend`

역할:

- 추천 가능한 메뉴 중 하나를 반환합니다.
- 싫어하는 MAIN 재료가 포함된 메뉴를 제외합니다.
- 유저가 차단한 메뉴를 제외합니다.
- 추천 성공 시 추천 quota를 차감합니다.

중요 정책:

- 차단 메뉴 제외 조건은 `blocks: { none: { userId } }`입니다.
- quota는 추천 성공 시에만 차감합니다.

### `POST /recommend/:sessionId/accept`

역할:

- 추천 세션을 수락합니다.
- 세션 상태를 `ACCEPTED`로 변경합니다.
- `acceptedAt`을 기록합니다.
- `challengeCode`를 반환합니다.

주의:

- 본인 세션만 수락할 수 있어야 합니다.
- `RECOMMENDED` 상태에서만 수락할 수 있어야 합니다.

## Proof

### `POST /uploads/proof`

역할:

- multipart 이미지 업로드를 받습니다.
- raw 이미지를 저장합니다.
- QR/텍스트 워터마크가 포함된 proof 이미지를 저장합니다.
- `rawUrl`, `proofUrl` 또는 `imageUrl`을 반환합니다.

### `POST /proofs`

역할:

- 업로드된 이미지 URL을 받아 Proof를 `PENDING`으로 큐잉합니다.
- OpenAI 판정은 수행하지 않습니다.

필수 입력:

- `sessionId`
- `imageUrl`
- `rawUrl`
- `challengeCode`

정책 에러:

- `PROOF_PENDING`
- `PROOF_COOLDOWN`
- `PROOF_DAILY_LIMIT`

### `POST /proofs/:id/review`

역할:

- 관리자 수동 리뷰를 처리합니다.
- `PASS`이면 포인트를 지급합니다.
- `PASS` 또는 `FAIL`이면 세션을 `DONE`으로 변경합니다.
- 이미 `PASS` 또는 `FAIL`인 Proof는 정정하지 않고 idempotent하게 반환합니다.

인증:

- `x-admin-key` 헤더

요청 예시:

```json
{
  "result": "PASS",
  "score": 95,
  "model": "admin",
  "meta": {
    "reason": "관리자 수동 승인"
  }
}
```

### `POST /proofs/:id/correct-review`

역할:

- 최종 판정된 Proof를 관리자 판단으로 정정합니다.
- `PASS -> FAIL`이면 포인트를 회수합니다.
- `FAIL -> PASS`이면 포인트를 재지급합니다.
- 일반 리뷰와 분리된 정정 전용 API입니다.

인증:

- `x-admin-key` 헤더

필수 입력:

- `result`: 정정 후 최종 상태. `PASS` 또는 `FAIL`
- `reason`: 정정 사유. 빈 문자열 불가

선택 입력:

- `score`
- `model`
- `meta`

요청 예시:

```json
{
  "result": "FAIL",
  "reason": "검색 이미지로 확인됨"
}
```

정책:

- 현재 상태가 `PASS` 또는 `FAIL`인 Proof만 정정할 수 있습니다.
- 현재 상태와 같은 `result`를 보내면 변경 없이 반환합니다.
- `Proof.aiMeta.corrections`에 정정 이력을 append합니다.
- `RecommendSession`은 `DONE`을 유지합니다.
- 기존 포인트 ledger는 삭제하지 않습니다.
- 보정 내역은 `PointLedger`에 `kind=ADJUST`, `source=ADMIN`으로 추가합니다.
- 정정 ledger는 `PROOF:CORRECTION:<proofId>:<sequence>:<FROM>_TO_<TO>` dedupeKey를 사용합니다.

응답 개념:

```json
{
  "ok": true,
  "proof": {},
  "correction": {
    "from": "PASS",
    "to": "FAIL",
    "reason": "검색 이미지로 확인됨"
  },
  "pointAdjustment": {
    "ok": true,
    "points": -40,
    "balanceAfter": 120
  }
}
```

## Me

### `GET /me/proof-status/:sessionId`

역할:

- 업로드 화면 진입 시 현재 세션의 Proof 상태를 조회합니다.
- 이미 `PENDING` 또는 `HOLD`이면 모바일에서 업로드 버튼을 막는 데 사용합니다.

### `GET /me/proofs`

역할:

- 유저 포인트 타임라인에서 보여줄 Proof 목록을 반환합니다.

응답 원칙:

- `rawUrl`은 `Proof.aiMeta.rawUrl`에서 꺼내 내려줍니다.
- `aiMeta` 전체를 유저에게 노출하지 않는 방향이 좋습니다.
- `holdReason`은 내부 에러 전문 대신 카테고리만 내려줍니다.

권장 `holdReason`:

- `QUOTA`
- `FILE`
- `QR`
- `REVIEW`

### `GET /me/points`

역할:

- 현재 보유 포인트를 반환합니다.

### `GET /me/points/ledger`

역할:

- 포인트 ledger 목록을 반환합니다.
- `proofId`가 있는 ledger는 연결된 Proof의 메뉴명/인증일을 함께 내려줍니다.

모바일 정책:

- Proof 카드를 별도로 보여주므로 `source=PROOF` ledger는 클라이언트에서 제외해 중복 표시를 막습니다.
- 관리자 판정 정정 ledger는 `source=ADMIN`이므로 제외하지 않습니다.
- 정정 ledger는 `인증 판정 정정 <음식명>/<YY.MM.DD>` 형태로 보여줍니다.

### `GET /me/purchases`

역할:

- 내 포인트 상품 구매 요청 목록을 반환합니다.
- 모바일 포인트 사용 탭의 최근 구매 요청 영역에서 사용합니다.

쿼리:

- `take`
- `cursor`

상태:

- `REQUESTED`: 구매 요청됨, 관리자 발송 대기
- `SENT`: 모바일교환권 발송 완료
- `CANCELLED`: 취소됨

### `POST /me/purchases/:id/cancel`

역할:

- 유저가 본인 구매 요청을 취소합니다.
- `REQUESTED` 상태에서만 가능합니다.
- 취소 사유는 필수입니다.
- 취소되면 포인트를 환불하고 구매 요청 상태를 `CANCELLED`로 변경합니다.
- 이미 어드민이 `SENT` 처리한 요청은 취소할 수 없습니다.

요청:

```json
{
  "reason": "다른 상품으로 다시 구매하려고 함"
}
```

### `/me/blocked-menus`

차단 메뉴 API:

- `GET /me/blocked-menus?take=30&cursor=<id>`
- `POST /me/blocked-menus/:menuId`
- `DELETE /me/blocked-menus/:menuId`
- `DELETE /me/blocked-menus`

주의:

- `/blocks` 라우트를 새로 만들지 않습니다.

## Admin

### `GET /admin/review`

역할:

- Proof 리뷰 화면을 HTML로 렌더링합니다.
- 어드민 이미지는 `imageUrl`을 사용합니다.

### `GET /admin/points`

역할:

- 포인트 관리 또는 조회 화면입니다.

## Shop

### `GET /shop/items`

역할:

- 구매 가능한 포인트 상품 목록을 반환합니다.
- `ACTIVE` 상품만 내려줍니다.

응답 필드:

- `id`
- `name`
- `description`
- `category`
- `pricePoints`
- `imageUrl`
- `stock`

### `POST /shop/purchase`

역할:

- 포인트 상품 구매 요청을 생성합니다.
- 구매 즉시 포인트를 차감합니다.
- `UserPurchase`를 `REQUESTED` 상태로 생성합니다.
- `PointLedger`에 `SPEND / REDEEM` 차감 내역을 남깁니다.

요청:

```json
{
  "itemId": "shop_item_id"
}
```

정책 에러:

- `SHOP_INSUFFICIENT_POINTS`: 포인트 부족
- `SHOP_OUT_OF_STOCK`: 재고 없음

운영 정책:

- MVP에서는 구매 즉시 포인트를 차감하고, 관리자가 나중에 모바일교환권을 발송합니다.
- 발송/취소 관리 화면은 후속 작업입니다.

발송/취소 경쟁 조건:

- 구매 요청은 `REQUESTED` 상태일 때만 발송 또는 취소할 수 있습니다.
- 어드민 발송 완료와 유저 취소가 동시에 요청되면 DB 트랜잭션의 상태 조건으로 한쪽만 성공합니다.
- `SENT`가 된 요청은 유저가 취소할 수 없습니다.
- `CANCELLED`가 된 요청은 어드민이 발송 완료 처리할 수 없습니다.

## 라우트 변경 규칙

- 새 라우트를 만들기 전 기존 controller를 먼저 확인합니다.
- 같은 기능의 중복 라우트를 만들지 않습니다.
- 모바일 호출부와 API route decorator를 함께 확인합니다.
- 관리자 인증은 query param이 아니라 header만 사용합니다.
