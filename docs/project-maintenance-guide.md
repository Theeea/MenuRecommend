# MenuReward 프로젝트 유지보수 가이드

마지막 정리일: 2026-04-29

이 문서는 `/Users/beng/Project/private/menu-reward` 프로젝트의 유지보수 기준 문서입니다.
API, 모바일, 어드민, DB, 인증 처리, 포인트 로직을 수정하기 전에 먼저 이 문서를 확인합니다.

## 1. 프로젝트 개요

MenuReward는 메뉴 추천, 음식 인증, 포인트 적립, 어드민 리뷰, 차단 메뉴 관리를 제공하는 MVP 앱입니다.

핵심 흐름:

1. 유저가 메뉴 추천을 요청합니다.
2. API가 추천 가능한 메뉴 중 하나를 반환합니다.
3. 유저가 추천 메뉴를 수락합니다.
4. API가 `RecommendSession`을 만들고 `challengeCode`를 발급합니다.
5. 유저가 음식 사진을 업로드합니다.
6. 업로드 파이프라인이 raw 이미지와 QR/텍스트 워터마크가 포함된 proof 이미지를 저장합니다.
7. `POST /proofs`는 `Proof`를 `PENDING` 상태로 큐잉합니다.
8. 업로드 요청 안에서는 OpenAI 판정을 실행하지 않습니다.
9. `pnpm --filter api proof:ai` 워커가 `PENDING` Proof를 비동기로 처리합니다.
10. 판정 결과는 `PASS`, `FAIL`, `HOLD`, `PENDING` 중 하나입니다.
11. 유저는 포인트 탭의 내역 타임라인에서 인증 상태를 확인합니다.
12. 관리자는 `PENDING` 또는 `HOLD` Proof를 확인하고 수동으로 `PASS` 또는 `FAIL` 처리할 수 있습니다.

중요한 기획 결정:

- 음식 인증은 비동기입니다.
- 업로드 성공은 포인트 지급 성공이 아닙니다.
- 포인트는 `PASS` 이후에만 지급합니다.
- 유저 화면에서는 raw 이미지를 우선 표시합니다.
- 어드민 화면에서는 QR/워터마크가 포함된 proof 이미지를 표시합니다.
- `PENDING`과 `HOLD` 상태에서는 추가 업로드를 서버에서 막아야 합니다.
- 차단 메뉴는 `/me/blocked-menus`에서 관리합니다.
- `/blocks` 같은 새 라우트를 만들지 않습니다.

## 2. 레포 구조

```text
menu-reward/
  apps/
    api/
      prisma/
        schema.prisma
      src/
        admin/
        cron/
        me/
        points/
        proof/
        recommend/
        uploads/
    mobile/
      app/
        (tabs)/
        blocked.tsx
        proof.tsx
      src/
        api/
        auth/
        ingredients/
    admin/
  docs/
    project-maintenance-guide.md
```

워크스페이스 기준:

- 패키지 매니저: `pnpm`
- 워크스페이스 파일: `pnpm-workspace.yaml`
- 워크스페이스 패키지: `apps/*`

## 3. 기술 스택

API:

- NestJS
- Prisma
- PostgreSQL
- JWT 인증
- Multer 업로드
- sharp 이미지 처리
- qrcode
- jsQR
- OpenAI SDK Vision
- ServeStatic 기반 `/uploads/**` 정적 서빙

Mobile:

- Expo
- React Native
- expo-router
- zustand 및 AsyncStorage 사용 구간 존재
- react-native-safe-area-context
- expo-image-picker
- expo-haptics

Admin:

- NestJS Controller에서 HTML 문자열 렌더링
- MVP에서는 별도 어드민 프론트엔드 프레임워크를 두지 않습니다.
- 관리자 키는 `x-admin-key` 헤더로만 전달합니다.
- `?k=...` 같은 query param 관리자 키는 사용하지 않습니다.

## 4. DB 모델 관련 주의사항

Prisma 모델을 건드리기 전에는 반드시 `apps/api/prisma/schema.prisma`를 먼저 확인합니다.
이 프로젝트는 Prisma generated client가 `apps/api/generated/prisma` 아래에 생성됩니다.
따라서 일반적인 `@prisma/client` import를 무조건 사용하면 안 됩니다.

현재까지 확인된 중요한 제약:

- `Proof.rawUrl` 컬럼은 없습니다.
- `Proof.userId` 컬럼은 없습니다.
- `RecommendSession.challengeCodeExpiresAt` 컬럼은 없습니다.
- `PointLedger.amount` 컬럼은 없습니다. `points`를 사용합니다.
- `Proof.aiScore`는 nullable이 아닙니다. 큐잉 시 기본값은 `0`을 사용합니다.
- Proof의 유저 소유권은 `Proof -> RecommendSession -> userId` 관계로 확인합니다.
- raw 이미지 URL은 `Proof.aiMeta.rawUrl`에 저장합니다.

generated client import 예시:

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

상대 경로는 현재 파일 위치 기준으로 조정해야 합니다.

## 5. 주요 API

추천:

- `POST /recommend`
- `POST /recommend/:sessionId/accept`

Proof:

- `POST /uploads/proof`
- `POST /proofs`
- `POST /proofs/:id/review`

Me:

- `GET /me`
- `PUT /me/disliked-ingredients`
- `GET /me/proof-status/:sessionId`
- `GET /me/proofs`
- `GET /me/points`
- `GET /me/points/ledger`
- `GET /me/blocked-menus`
- `POST /me/blocked-menus/:menuId`
- `DELETE /me/blocked-menus/:menuId`
- `DELETE /me/blocked-menus`
- `GET /me/recommend-quota`
- `POST /me/recommend-quota/watch-ad`

Admin:

- `GET /admin/review`
- `GET /admin/points`
- `GET /admin/api/review/list`
- `POST /proofs/:id/review`

라우트를 수정하거나 모바일에서 호출할 때는 반드시 실제 controller decorator를 다시 확인합니다.

## 6. Proof 라이프사이클

모바일 인증 업로드 흐름:

1. `app/proof.tsx`가 `sessionId`, `challengeCode`를 받습니다.
2. 화면 진입 시 `GET /me/proof-status/:sessionId`를 호출합니다.
3. 기존 Proof가 `PENDING` 또는 `HOLD`이면 업로드 버튼을 비활성화합니다.
4. 유저가 사진을 촬영합니다.
5. 모바일이 `POST /uploads/proof`로 multipart 업로드를 수행합니다.
6. API가 proof 이미지 URL과 raw 이미지 URL을 반환합니다.
7. 모바일이 `POST /proofs`를 호출합니다.
8. API는 Proof를 `PENDING`으로 생성합니다.
9. 유저는 포인트 내역에서 진행 상태를 확인합니다.

`ProofService.createQueued` 서버 정책:

- `sessionId`, `imageUrl`, `rawUrl`, `challengeCode`를 검증합니다.
- 세션 존재 여부를 확인합니다.
- 세션 소유자가 현재 유저인지 확인합니다.
- 세션 상태는 `ACCEPTED` 또는 `PROOF_SUBMITTED`만 허용합니다.
- `challengeCode`가 세션과 일치해야 합니다.
- 같은 `sessionId`의 Proof가 이미 있으면 idempotent하게 기존 Proof를 반환합니다.
- 유저에게 `PENDING` 또는 `HOLD` Proof가 있으면 추가 업로드를 막습니다.
- 쿨타임을 적용합니다.
- KST 기준 일일 인증 제한을 적용합니다.
- raw URL은 `aiMeta.rawUrl`에 저장합니다.
- proof URL은 `imageUrl`에 저장합니다.
- 생성 시 `aiResult: PENDING`, `aiScore: 0`을 사용합니다.
- 세션 상태는 `PROOF_SUBMITTED`로 변경합니다.

서버 정책 에러 코드:

- `PROOF_PENDING`
- `PROOF_COOLDOWN`
- `PROOF_DAILY_LIMIT`

AI 워커 실행:

```bash
pnpm --filter api proof:ai
```

AI 워커 기대 동작:

- `PENDING` Proof를 조회합니다.
- 처리 시작 시 `aiMeta.processingAt`을 기록합니다.
- `aiMeta.rawUrl`을 읽습니다.
- raw URL이 없으면 `HOLD`로 보냅니다.
- proof 이미지에서 QR을 검증합니다.
- raw 이미지로 OpenAI Vision 판정을 수행합니다.
- 결과를 `PASS`, `FAIL`, `HOLD`로 변환합니다.
- `PASS`이면 `dedupeKey` 기반으로 포인트를 지급합니다.
- `PASS` 또는 `FAIL`이면 세션을 `DONE`으로 처리합니다.
- `HOLD`이면 관리자 리뷰를 기다립니다.
- `aiScore`에 `null`을 넣지 않습니다.

## 7. 포인트 정책

포인트 규칙:

- Proof 업로드 직후에는 `0`점입니다.
- `PASS` 시 `PROOF_PASS_BONUS`만큼 지급합니다. 기본값은 `40`입니다.
- `FAIL`, `HOLD`, `PENDING`은 `0`점입니다.
- `PointLedger.points`를 포인트 변동값으로 사용합니다.
- `PointLedger.dedupeKey`로 중복 지급을 방지해야 합니다.

권장 Proof 보상 dedupe key:

```text
PROOF:PASS:<proofId>
```

모바일 포인트 타임라인:

- 파일: `app/(tabs)/points.tsx`
- Proof 상태와 PointLedger를 합쳐 타임라인으로 표시합니다.
- Proof 카드를 따로 보여주므로 `source=PROOF` ledger row는 중복 방지를 위해 제외합니다.
- 유저 이미지에는 `rawUrl || imageUrl` 순서를 사용합니다.
- 이미지 확대 모달도 `rawUrl || imageUrl` 순서를 사용합니다.
- `PENDING` 또는 처리 중인 Proof가 있으면 주기적으로 폴링합니다.

## 8. 차단 메뉴 정책

차단 메뉴 API:

- `GET /me/blocked-menus?take=30&cursor=<id>`
- `POST /me/blocked-menus/:menuId`
- `DELETE /me/blocked-menus/:menuId`
- `DELETE /me/blocked-menus`

규칙:

- 차단한 메뉴는 추천 후보에서 제외해야 합니다.
- 추천 쿼리에는 `blocks: { none: { userId } }` 조건이 있어야 합니다.
- `/blocks` 라우트는 만들지 않습니다.
- 모바일 차단 메뉴 화면 라우트는 `/blocked`입니다.
- 파일은 `apps/mobile/app/blocked.tsx`입니다.

홈 추천 UX:

- 수락 전 추천 카드에 차단 또는 싫어요 액션을 제공합니다.
- 차단 성공 시 현재 추천을 제거하고 가능하면 새 추천을 요청합니다.
- 이미 수락한 세션에서는 차단 후 재추천을 허용하지 않습니다.

## 9. 어드민 리뷰 정책

어드민 리뷰 화면:

- `GET /admin/review`

어드민 이미지 정책:

- `Proof.imageUrl`을 사용합니다.
- 이 이미지는 QR과 워터마크가 있는 proof 이미지입니다.
- 어드민의 주 검토 이미지로 raw 이미지를 사용하지 않습니다.

어드민 인증:

- 헤더: `x-admin-key`
- 환경변수: `ADMIN_REVIEW_KEY`
- query param으로 관리자 키를 받지 않습니다.

수동 리뷰:

- `POST /proofs/:id/review`
- body의 `result`는 `PASS` 또는 `FAIL`이어야 합니다.
- `PASS`이면 보너스 포인트를 지급하고 세션을 `DONE`으로 변경합니다.
- `FAIL`이면 세션을 `DONE`으로 변경합니다.
- 이미 최종 상태인 Proof는 idempotent하게 처리합니다.

## 10. 환경변수

API:

```env
DATABASE_URL=...
JWT_SECRET=...
ADMIN_REVIEW_KEY=...
PROOF_QR_SECRET=...
OPENAI_API_KEY=...
OPENAI_VISION_MODEL=gpt-4.1-mini
PROOF_PASS_BONUS=40
PROOF_BLOCK_WHILE_PENDING=1
PROOF_COOLDOWN_HOURS=3
PROOF_DAILY_LIMIT=3
```

Mobile:

```env
EXPO_PUBLIC_API_BASE_URL=http://<LAN_IP>:3000
```

## 11. 로컬 실행 및 검증 명령

API:

```bash
pnpm --filter api start:dev
pnpm --filter api typecheck
pnpm --filter api build
pnpm --filter api proof:ai
```

Prisma:

```bash
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate
pnpm --filter api prisma:status
```

Mobile:

```bash
pnpm --filter mobile start
pnpm --filter mobile lint
pnpm --filter mobile exec eslint --no-cache app/proof.tsx 'app/(tabs)/index.tsx' 'app/(tabs)/points.tsx'
pnpm --filter mobile exec tsc --noEmit
```

모바일 타입체크 기준:

- 전체 `pnpm --filter mobile exec tsc --noEmit`은 통과해야 합니다.
- expo-router 구조에서 사용하지 않는 이전 `App.tsx`, `src/navigation/**`, `src/screens/**`는 `apps/mobile/tsconfig.json`에서 제외합니다.
- 변경 파일은 ESLint도 함께 확인합니다.

## 12. 유지보수 규칙

앞으로 이 레포에서 작업할 때 아래 규칙을 기본으로 적용합니다.

### 12.1 실제 파일을 먼저 확인한다

수정 전 확인 순서:

1. `apps/api/prisma/schema.prisma` 확인
2. 관련 controller, service, mobile screen 확인
3. `git status --short` 확인
4. 이미 변경된 파일이 있는지 확인

이전 대화나 기억만 보고 구현하지 않습니다.

유용한 검색 명령:

```bash
rg -n "prisma\\.menu\\.findMany|blocks:|proof-status|me/proofs|createQueued|processPendingBatch" apps/api/src
rg -n "rawUrl|imageUrl|proofPointsText|blocked" apps/mobile/app
```

### 12.2 schema에 없는 필드를 만들지 않는다

사용 금지 예시:

- `Proof.rawUrl`
- `Proof.userId`
- `RecommendSession.challengeCodeExpiresAt`
- `PointLedger.amount`

필요하면 기존 relation 또는 `aiMeta` JSON을 사용합니다.

### 12.3 Proof는 비동기로 유지한다

`POST /proofs` 안에서 OpenAI를 호출하지 않습니다.
`POST /proofs`는 큐잉만 담당합니다.
AI 처리는 `proof:ai` 또는 추후 worker 시스템에서 수행합니다.

### 12.4 서버를 최종 정책 경계로 둔다

모바일 제한은 UX일 뿐입니다.
서버는 반드시 아래 정책을 강제해야 합니다.

- 중복 Proof 방지
- `PENDING` 및 `HOLD` 추가 업로드 차단
- 쿨타임
- 일일 제한
- challengeCode 일치
- 소유권 검증
- 포인트 중복 지급 방지

### 12.5 이미지 노출 정책을 지킨다

유저 화면:

- `rawUrl` 우선
- raw URL이 없는 구버전 Proof만 `imageUrl` fallback 허용

어드민 화면:

- `imageUrl` 우선
- QR/워터마크가 검토와 증빙에 필요합니다.

### 12.6 라우트 개념을 중복 생성하지 않는다

예시:

- 차단 메뉴는 `/me/blocked-menus`를 사용합니다.
- Proof 타임라인 데이터는 `/me/proofs`를 사용합니다.
- 업로드 화면의 세션 상태는 `/me/proof-status/:sessionId`를 사용합니다.
- `/blocks` 같은 별도 라우트는 만들지 않습니다.

### 12.7 포인트 지급은 idempotent해야 한다

Proof 보상은 반드시 유니크한 `dedupeKey`를 사용합니다.
워커 재실행, 관리자 더블 클릭, 재시도 상황에서도 포인트가 두 번 지급되면 안 됩니다.

### 12.8 작은 PR 단위로 작업한다

권장 작업 단위:

1. API 정책 또는 라우트
2. 모바일 화면 동작
3. 어드민 리뷰 동작
4. 워커 동작
5. 문서

MVP 흐름을 고치는 중에는 광범위한 리팩터링을 피합니다.

### 12.9 수정 후 검증한다

API 변경 후:

```bash
pnpm --filter api typecheck
```

모바일 화면 변경 후:

```bash
pnpm --filter mobile exec eslint --no-cache <changed files>
```

전체 모바일 타입체크도 함께 통과해야 합니다.

### 12.10 관리자 키는 헤더만 사용한다

허용 형식:

```text
x-admin-key: <ADMIN_REVIEW_KEY>
```

query string으로 관리자 키를 받는 코드를 추가하지 않습니다.

### 12.11 어드민 HTML template string을 주의한다

어드민 HTML은 TypeScript template string 안에서 렌더링됩니다.
브라우저용 JavaScript에서 `${...}`를 써야 할 때는 TypeScript가 서버에서 먼저 해석하지 않도록 escaping을 확인합니다.

### 12.12 모바일 토큰은 Bearer 중복을 막는다

수동 fetch를 작성할 때 `Bearer Bearer <token>` 형태가 되지 않도록 토큰을 정규화합니다.

## 13. 현재 MVP 체크리스트

구현 또는 대부분 구현된 항목:

- 메뉴 추천
- 추천 quota
- 추천 수락
- Proof 업로드 큐
- raw/proof 이미지 분리
- 비동기 AI 워커 명령
- 포인트 타임라인의 Proof 상태 표시
- 유저 화면 raw 이미지 우선 표시
- 어드민 화면 워터마크 이미지 표시
- 차단 메뉴 CRUD
- 추천 쿼리에서 차단 메뉴 제외
- 서버 Proof 정책: pending/hold 차단, 쿨타임, 일일 제한
- 포인트 사용 MVP: 상품 목록, 구매 요청, 구매내역, 취소/환불, 교환권 사용/미사용 표시
- 어드민 Shop 관리: 상품 등록/수정/숨김, 구매 요청 발송/취소
- AuditLog: Shop, Proof 리뷰/정정, 포인트 수동 조정, 메뉴 초안 승인/거절

추가 개선 항목:

- 모바일 변경 후 전체 타입체크 통과 유지
- 어드민 HOLD 필터와 사유 배지 개선
- 운영 worker 방식 결정: OS cron, node-cron, BullMQ
- 운영 전 업로드 보안 강화:
  - signed URL 또는 인증 proxy 검토
  - 정적 서빙 범위 제한
  - 업로드 실패 cleanup 로그
- 포인트 사용 고도화:
  - 상품 이미지 파일 업로드 또는 S3 연동
  - 구매내역 페이지네이션
  - 교환권 실제 바코드/QR 렌더링

## 14. 다음 유지보수 추천 순서

1. ProofService audit log 기대값 테스트 보강
2. Proof worker retry/max attempts 정책 추가
3. 운영 cron 또는 queue 방식 결정
4. 업로드 검증과 raw 이미지 접근 정책 강화
5. Shop 상품 이미지 업로드 또는 S3 연동
6. AuditLog 날짜 필터와 targetId 검색 추가

## 15. 빠른 디버깅 가이드

유저 화면에 워터마크 이미지가 보이는 경우:

- `/me/proofs`가 `rawUrl`을 내려주는지 확인합니다.
- 모바일이 `rawUrl || imageUrl` 순서로 쓰는지 확인합니다.
- 구버전 Proof는 `aiMeta.rawUrl`이 없을 수 있으므로 fallback으로 워터마크가 보일 수 있습니다.

Proof가 pending인데 추가 업로드가 가능한 경우:

- `PROOF_BLOCK_WHILE_PENDING` 값을 확인합니다.
- `ProofService.createQueued`를 확인합니다.
- 서버가 `PENDING`과 `HOLD`를 모두 검색하는지 확인합니다.
- 모바일 버튼 비활성화만으로는 충분하지 않습니다.

포인트가 중복 지급되는 경우:

- `PointLedger.dedupeKey`를 확인합니다.
- `givePassBonus`를 확인합니다.
- 어드민 리뷰와 워커가 동일한 보상 경로를 사용하는지 확인합니다.

차단한 메뉴가 다시 추천되는 경우:

- `recommend.service.ts` 후보 쿼리를 확인합니다.
- `blocks: { none: { userId } }` 조건을 확인합니다.
- `UserMenuBlock` row가 실제 생성되었는지 확인합니다.

어드민 리뷰가 unauthorized인 경우:

- `x-admin-key` 헤더를 확인합니다.
- `ADMIN_REVIEW_KEY` 환경변수를 확인합니다.
- query param 키를 사용하지 않습니다.

모바일 포인트 화면에서 401이 나는 경우:

- `EXPO_PUBLIC_API_BASE_URL`을 확인합니다.
- 토큰에 `Bearer`가 중복되지 않았는지 확인합니다.
- 현재 `authStore` 구조에 맞게 토큰을 읽는지 확인합니다.
