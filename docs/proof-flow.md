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

권장 기준:

- match true, confidence 충분함: `PASS`
- match false, confidence 충분함: `FAIL`
- 불확실함: `HOLD`

OpenAI 또는 파일 오류:

- 429/quota: `HOLD` 또는 retry 정책 적용
- 파일 없음: `HOLD`
- QR 실패: `HOLD`
- 일시 오류: attempts 증가 후 retry 가능
- attempts 최대 초과: `HOLD`

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
