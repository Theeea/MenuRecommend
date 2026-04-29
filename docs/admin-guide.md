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
