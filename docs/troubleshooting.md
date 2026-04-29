# 디버깅 가이드

## 유저 화면에 워터마크 이미지가 보임

확인 순서:

1. `/me/proofs` 응답에 `rawUrl`이 있는지 확인
2. `rawUrl`이 `aiMeta.rawUrl`에서 추출되는지 확인
3. 모바일 points 화면이 `rawUrl || imageUrl` 순서로 쓰는지 확인
4. 이미지 모달도 같은 우선순위를 쓰는지 확인
5. 구버전 Proof라면 rawUrl이 없어 fallback으로 워터마크가 보일 수 있음

## Proof가 PENDING/HOLD인데 추가 업로드 가능

확인 순서:

1. `PROOF_BLOCK_WHILE_PENDING=1`인지 확인
2. `ProofService.createQueued()`에서 `PENDING`과 `HOLD`를 모두 조회하는지 확인
3. 세션 idempotent 반환과 신규 업로드 정책 순서가 맞는지 확인
4. 모바일 버튼 비활성화만 믿고 있지 않은지 확인

## 포인트 중복 지급

확인 순서:

1. `PointLedger.dedupeKey` 값 확인
2. `givePassBonus()`가 기존 ledger를 먼저 조회하는지 확인
3. worker와 admin review가 같은 지급 함수를 쓰는지 확인
4. 이미 `PASS` 또는 `FAIL`인 Proof를 다시 처리하지 않는지 확인

## 차단 메뉴가 다시 추천됨

확인 순서:

1. `UserMenuBlock` row 확인
2. 추천 쿼리에 `blocks: { none: { userId } }` 확인
3. 모바일이 올바른 `menuId`로 차단 API를 호출하는지 확인
4. 로그인 유저가 다른 계정인지 확인

## `/me/points` 또는 `/me/proofs` 401

확인 순서:

1. `EXPO_PUBLIC_API_BASE_URL` 확인
2. JWT 토큰 존재 여부 확인
3. `Authorization` 헤더가 `Bearer Bearer ...`가 아닌지 확인
4. API 서버의 `JWT_SECRET`이 로그인 시점과 같은지 확인

## OpenAI worker 실패

확인 순서:

1. `OPENAI_API_KEY` 확인
2. `OPENAI_VISION_MODEL` 확인
3. raw 파일이 실제 경로에 있는지 확인
4. `aiMeta.rawUrl` 존재 여부 확인
5. 429/quota 에러 여부 확인
6. 파일 없음이면 `HOLD`로 보내고 관리자 리뷰 대상 처리

## QR 검증 실패

확인 순서:

1. proof 이미지가 `imageUrl`에 저장됐는지 확인
2. `PROOF_QR_SECRET`이 업로드 시점과 검증 시점에 같은지 확인
3. `sessionId`와 `challengeCode`가 QR payload와 일치하는지 확인
4. QR decode 실패면 `HOLD`로 보내 수동 리뷰

## 모바일 전체 타입체크 실패

현재 기준으로 아래 명령은 통과해야 합니다.

```bash
pnpm --filter mobile exec tsc --noEmit
```

실패하면 먼저 확인할 것:

1. 새로 추가한 `app/**` 라우트 파일의 타입 오류
2. 새로 추가한 `src/**` 파일의 import/export 불일치
3. `apps/mobile/tsconfig.json`의 `exclude` 설정 변경 여부
4. expo-router에서 사용하지 않는 이전 React Navigation 파일을 다시 include했는지 여부

현재 제외된 레거시 경로:

- `App.tsx`
- `src/navigation/**`
- `src/screens/**`
