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

인증:

- `x-admin-key` 헤더

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

모바일 정책:

- Proof 카드를 별도로 보여주므로 `source=PROOF` ledger는 클라이언트에서 제외해 중복 표시를 막습니다.

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

## 라우트 변경 규칙

- 새 라우트를 만들기 전 기존 controller를 먼저 확인합니다.
- 같은 기능의 중복 라우트를 만들지 않습니다.
- 모바일 호출부와 API route decorator를 함께 확인합니다.
- 관리자 인증은 query param이 아니라 header만 사용합니다.
