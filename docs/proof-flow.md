# Proof 인증 플로우

이 문서는 음식 인증 업로드, 큐잉, AI worker, 관리자 리뷰 흐름을 정리합니다.

## 핵심 원칙

- 인증은 비동기입니다.
- `POST /proofs`에서 OpenAI를 호출하지 않습니다.
- 업로드 직후 포인트는 `0`점입니다.
- 포인트는 `PASS` 이후에만 지급합니다.
- 유저 화면은 raw 이미지를 보여줍니다.
- 어드민 화면은 QR/워터마크 proof 이미지를 보여줍니다.

## 모바일 업로드 흐름

파일:

- `apps/mobile/app/proof.tsx`

흐름:

1. 화면 진입 시 `GET /me/proof-status/:sessionId` 호출
2. 기존 Proof가 `PENDING` 또는 `HOLD`이면 업로드 비활성화
3. 카메라 권한 요청
4. 사진 촬영
5. `POST /uploads/proof`로 multipart 업로드
6. 서버 응답에서 `imageUrl` 또는 `proofUrl`, `rawUrl` 추출
7. `POST /proofs`로 큐 등록
8. 성공 후 포인트 탭으로 이동 유도

주의:

- `refreshProofStatus()` 호출 직후 React state를 바로 읽으면 stale state가 될 수 있습니다.
- 업로드 직전 검사는 `const latest = await refreshProofStatus()` 결과를 사용해야 합니다.

## 서버 큐잉 정책

파일:

- `apps/api/src/proof/proof.service.ts`

`createQueued()`가 해야 할 일:

- `sessionId`, `imageUrl`, `rawUrl`, `challengeCode` 검증
- 세션 존재 확인
- 본인 세션인지 확인
- 세션 상태가 `ACCEPTED` 또는 `PROOF_SUBMITTED`인지 확인
- `challengeCode` 일치 확인
- 같은 `sessionId` Proof가 있으면 idempotent 반환
- 기존 `PENDING` 또는 `HOLD` Proof가 있으면 신규 업로드 차단
- 쿨타임 적용
- KST 기준 일일 제한 적용
- `aiResult: PENDING`
- `aiScore: 0`
- `imageUrl`에는 워터마크 proof 이미지 저장
- `aiMeta.rawUrl`에 raw 이미지 저장
- `aiMeta.queuedAt`, `processingAt`, `processedAt`, `attempts` 기록
- 세션 상태를 `PROOF_SUBMITTED`로 변경

정책 에러:

- `PROOF_PENDING`
- `PROOF_COOLDOWN`
- `PROOF_DAILY_LIMIT`

## AI Worker

실행:

```bash
pnpm --filter api proof:ai
```

`processPendingBatch()` 기대 동작:

1. `PENDING` Proof 조회
2. `aiMeta.processingAt` 기록
3. `aiMeta.rawUrl` 확인
4. raw URL이 없으면 `HOLD`
5. proof 이미지에서 QR 검증
6. raw 이미지로 OpenAI Vision 판정
7. 판정 결과 변환
8. `PASS`이면 포인트 지급
9. `PASS` 또는 `FAIL`이면 세션 `DONE`
10. `HOLD`이면 관리자 리뷰 대기
11. `processingAt: null`, `processedAt` 기록
12. `attempts` 증가

## 결과 기준

현재 AI 판정 기준:

- `match=true`
- `realPhotoLikely=false`가 아니어야 함
- `screenOrPrintSuspicion=true`가 아니어야 함
- `stockOrWebImageSuspicion=true`가 아니어야 함
- `confidence >= PROOF_PASS_CONFIDENCE`
  - 기본값: `0.92`
  - 허용 범위: `0.75` ~ `0.99`
- 위 조건을 모두 만족하면 `PASS`

거절 기준:

- `match=false`
- `confidence >= 0.80`
- 위 조건을 만족하면 `FAIL`

수동 검토 기준:

- 메뉴는 맞아 보이지만 confidence가 낮음
- 실제 촬영 사진인지 불확실함
- 검색 이미지, 스톡 이미지, 블로그/배달앱/상품 사진처럼 보임
- 화면을 다시 찍은 사진 또는 인쇄물을 찍은 사진처럼 보임
- QR 검증 실패
- raw 이미지 누락
- OpenAI quota/429 오류
- 기타 worker가 확정 판정을 내리기 어려운 경우

검색 이미지 또는 웹에서 저장한 사진은 메뉴가 맞더라도 `PASS`가 아니라 `HOLD`가 되어야 합니다.
관리자는 어드민 리뷰 화면에서 proof 이미지, QR/워터마크, AI 요약, `aiMeta`를 보고 최종 승인/거절합니다.

OpenAI 또는 파일 오류:

- 429/quota: `HOLD` 또는 retry 정책 적용
- 파일 없음: `HOLD`
- QR 실패: `HOLD`
- 일시 오류: attempts 증가 후 retry 가능
- attempts 최대 초과: `HOLD`

## 관리자 리뷰 상태 변경 정책

현재 구현:

- `PENDING` 또는 `HOLD` 상태의 Proof만 관리자 수동 리뷰 대상입니다.
- 관리자가 `PASS` 처리하면 포인트를 지급하고 세션을 `DONE`으로 종료합니다.
- 관리자가 `FAIL` 처리하면 포인트를 지급하지 않고 세션을 `DONE`으로 종료합니다.
- 일반 리뷰 엔드포인트 `POST /proofs/:id/review`는 이미 `PASS` 또는 `FAIL`인 Proof를 idempotent하게 반환합니다.
- 최종 판정 정정은 별도 엔드포인트 `POST /proofs/:id/correct-review`를 사용합니다.

정정 정책:

- `PASS` → `FAIL` 가능
- `FAIL` → `PASS` 가능
- 정정 사유는 필수입니다.
- `Proof.aiResult`를 최종 상태로 변경합니다.
- `Proof.aiMeta.corrections`에 변경 전/후 상태, 사유, 시각, 관리자 정보를 append합니다.
- `RecommendSession`은 `DONE` 상태를 유지합니다.

포인트 보정:

- `PASS` → `FAIL`
  - 기존 지급 ledger는 삭제하지 않습니다.
  - `PointLedger`에 `ADJUST` / `ADMIN` / 음수 points 회수 내역을 추가합니다.
  - 유저 `pointBalance`를 같은 트랜잭션에서 차감합니다.
- `FAIL` → `PASS`
  - `PointLedger`에 `ADJUST` / `ADMIN` / 양수 points 재지급 내역을 추가합니다.
  - 유저 `pointBalance`를 같은 트랜잭션에서 증가시킵니다.

정정 ledger의 `source`는 `ADMIN`입니다.
그래야 모바일 포인트 내역에서 Proof 카드와 중복 제거되는 `source=PROOF` 필터에 걸리지 않고, 관리자 정정 내역이 사용자에게 보입니다.

중복 방지:

- 정정 ledger는 `PROOF:CORRECTION:<proofId>:<sequence>:<FROM>_TO_<TO>` 형태의 `dedupeKey`를 사용합니다.
- sequence는 `Proof.aiMeta.corrections.length + 1` 기준입니다.

## 상태별 유저 표시

- `PENDING`: `+0점 (검토중)` 또는 `+0점 (진행중)`
- `HOLD`: `+0점 (보류)`
- `PASS`: 실제 지급 포인트 표시
- `FAIL`: `+0점 (거절)`

## 이미지 정책

유저:

- `rawUrl || imageUrl`

어드민:

- `imageUrl`

구버전 Proof:

- `aiMeta.rawUrl`이 없을 수 있습니다.
- 이 경우 유저 화면에서 fallback으로 `imageUrl`이 보이는 것은 허용합니다.

## 업로드 보안

상세 정책은 [업로드 보안 정책](upload-security.md)을 확인합니다.

현재 proof 업로드는 JPEG, PNG, WebP만 허용하며 파일 크기는 10MB로 제한합니다.
저장 파일명은 원본 파일명이 아니라 서버 생성 UUID를 사용합니다.
