# 어드민 리뷰 가이드

## 기본 원칙

- MVP에서는 별도 어드민 프론트엔드 프레임워크를 사용하지 않습니다.
- NestJS Controller에서 HTML 문자열을 렌더링합니다.
- 관리자 인증은 `x-admin-key` 헤더만 사용합니다.
- query param 관리자 키는 사용하지 않습니다.

## 주요 경로

- `GET /admin/review`
- `GET /admin/points`
- `GET /admin/api/review/list`
- `GET /admin/proofs`
- `GET /admin/shop/page`
- `POST /proofs/:id/review`

## 이미지 정책

어드민은 `Proof.imageUrl`을 사용합니다.

이유:

- QR 검증
- 워터마크 확인
- 증빙 이미지 확인
- 부정 업로드 의심 검토

유저 화면과 다르게 raw 이미지를 우선하지 않습니다.

## 리뷰 상태

리뷰 화면에서 확인해야 할 상태:

- `PENDING`
- `HOLD`
- `PASS`
- `FAIL`

진행중 표시:

- `aiMeta.processingAt`이 있고 `processedAt`이 없으면 진행중으로 볼 수 있습니다.

HOLD 사유 카테고리:

- `QUOTA`
- `FILE`
- `QR`
- `REVIEW`

## HOLD 필터

어드민 리뷰 화면은 HOLD 사유별 필터를 제공합니다.

필터 값:

- 전체
- `QUOTA`: OpenAI quota, 429, rate limit 계열
- `FILE`: raw/proof 파일 없음
- `QR`: QR decode, sessionId, challengeCode, signature 검증 실패
- `REVIEW`: 저신뢰도 또는 기타 수동 검토

목록 API는 아래 두 경로를 지원합니다.

```text
GET /admin/api/review/list
GET /admin/proofs
```

`/admin/api/review/list`는 어드민 HTML 화면에서 사용하는 호환 라우트입니다.

## 수동 리뷰

API:

```text
POST /proofs/:id/review
```

헤더:

```text
x-admin-key: <ADMIN_REVIEW_KEY>
```

body:

```json
{
  "result": "PASS",
  "score": 90,
  "model": "admin",
  "meta": {}
}
```

정책:

- `result`는 `PASS` 또는 `FAIL`만 허용합니다.
- `PASS`면 포인트를 지급합니다.
- `PASS` 또는 `FAIL`이면 세션을 `DONE`으로 변경합니다.
- 이미 최종 상태면 idempotent하게 응답해야 합니다.

## 포인트 상품 관리

화면:

```text
GET /admin/shop/page
```

기능:

- 상품 등록
- 상품 수정
- 상품 삭제/숨김
- 상품 상태 필터: 전체 / 판매중 / 숨김
- 이미지 URL 등록
- 가격 포인트 설정
- 재고 설정
- 노출 순서 설정
- 구매 요청 조회
- 구매 요청 상태 필터: 발송 대기 / 발송 완료 / 취소 / 전체
- 구매 요청 검색: 유저 ID, 유저 이메일, 상품명, 구매 ID
- 구매 요청 조회 건수 선택
- 모바일교환권 발송 완료 처리
- 구매 요청 취소/환불 처리
- 취소 사유 확인
- 발송 코드/메모 확인
- 소비자 사용/미사용 표시 확인

MVP 정책:

- 상품 삭제는 실제 삭제가 아니라 `INACTIVE` 숨김 처리입니다.
- 기존 구매 내역 보존을 위해 `ShopItem` row를 제거하지 않습니다.
- 이미지 파일 업로드는 아직 붙이지 않고 `imageUrl` 입력으로 관리합니다.
- 구매 요청은 `REQUESTED` 상태로 쌓이고, 관리자가 발송 후 `SENT`로 변경합니다.
- `REQUESTED` 상태 구매 요청은 취소 사유 입력 후 `CANCELLED`로 변경하고 포인트를 환불할 수 있습니다.
- 이미 `SENT` 또는 `CANCELLED`인 요청은 취소/환불하지 않습니다.
- 유저가 교환권을 `사용/미사용`으로 표시해도 구매 상태는 `SENT`로 유지됩니다.

## 감사로그

화면:

```text
GET /admin/audit/page
```

API:

```text
GET /admin/audit-logs
```

화면 정책:

- 상단 필터로 액션, 대상 타입, 유저 ID, 조회 건수를 바꿀 수 있습니다.
- 결과는 표 형태로 보고, 행을 누르면 상세 JSON이 펼쳐집니다.
- 상단 요약은 조회 로그 수와 주요 Shop 액션 수를 보여줍니다.

현재 기록하는 액션:

- `SHOP_ITEM_CREATED`: 포인트 상품 등록
- `SHOP_ITEM_UPDATED`: 포인트 상품 수정
- `SHOP_ITEM_HIDDEN`: 포인트 상품 숨김
- `SHOP_PURCHASE_REQUESTED`: 유저 구매 요청
- `SHOP_PURCHASE_SENT`: 어드민 모바일교환권 발송
- `SHOP_PURCHASE_CANCELLED`: 유저/어드민 구매 취소 및 환불
- `SHOP_PURCHASE_USED_TOGGLED`: 유저 사용/미사용 표시 변경
- `PROOF_REVIEWED`: 어드민 인증 PASS/FAIL 수동 판정
- `PROOF_REVIEW_CORRECTED`: 어드민 인증 판정 정정
- `POINTS_ADJUSTED`: 어드민 포인트 수동 조정
- `MENU_DRAFT_APPROVED`: AI 메뉴 초안 승인
- `MENU_DRAFT_REJECTED`: AI 메뉴 초안 거절

운영 원칙:

- 포인트, 인증, 구매, 메뉴 초안 같은 관리자 액션은 가능한 한 같은 트랜잭션 안에서 `AuditLog`를 남깁니다.
- 감사로그는 상태 변경의 부가 정보가 아니라 운영 추적의 기준으로 봅니다.

## Template string 주의

어드민 HTML은 TypeScript template string 안에 들어갑니다.
브라우저에서 실행될 JS 코드에 `${...}`가 필요하면 TypeScript가 서버에서 먼저 해석하지 않도록 escaping을 확인합니다.

## 추후 개선

- HOLD 사유별 필터
- 날짜 필터
- 페이지네이션
- PASS/FAIL 처리 후 리스트 갱신
- 관리자 액션 audit log
- 포인트 수동 조정 로그
