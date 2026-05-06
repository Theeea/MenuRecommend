# 로컬 실행과 검증

## 루트

프로젝트 경로:

```bash
cd /Users/beng/Project/private/menu-reward
```

패키지 매니저:

```bash
pnpm
```

## API 실행

```bash
pnpm --filter api start:dev
```

타입체크:

```bash
pnpm --filter api typecheck
```

빌드:

```bash
pnpm --filter api build
```

AI Proof worker:

```bash
pnpm --filter api proof:ai
```

## Prisma

generate:

```bash
pnpm --filter api prisma:generate
```

migrate:

```bash
pnpm --filter api prisma:migrate
```

deploy:

```bash
pnpm --filter api prisma:deploy
```

status:

```bash
pnpm --filter api prisma:status
```

주의:

- `AuditLog`, `ShopItem`, `UserPurchase` 같은 신규 테이블이 추가된 뒤에는 DB가 켜진 상태에서 migration 적용 여부를 확인합니다.
- `P1001 Can't reach database server at localhost:5432`가 나오면 PostgreSQL이 실행 중인지 먼저 확인합니다.
- schema를 바꾼 뒤에는 `pnpm --filter api prisma:generate`를 실행합니다.

## Mobile

실행:

```bash
pnpm --filter mobile start
```

lint:

```bash
pnpm --filter mobile lint
```

변경 파일만 lint:

```bash
pnpm --filter mobile exec eslint --no-cache app/proof.tsx 'app/(tabs)/index.tsx' 'app/(tabs)/points.tsx'
```

typecheck:

```bash
pnpm --filter mobile exec tsc --noEmit
```

주의:

- 현재 모바일 전체 typecheck는 통과해야 합니다.
- expo-router 구조에서 사용하지 않는 이전 `App.tsx`, `src/navigation/**`, `src/screens/**`는 `apps/mobile/tsconfig.json`의 `exclude`에 포함되어 있습니다.
- 새 모바일 코드는 `app/**`와 실제 사용 중인 `src/**` 기준으로 작성합니다.

## 환경변수

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

## 작업 전 확인 명령

```bash
git status --short
rg -n "createQueued|processPendingBatch|proof-status|me/proofs" apps/api/src
rg -n "rawUrl|imageUrl|blocked|proofPointsText" apps/mobile/app
```

## 감사로그 확인

어드민 화면:

```text
GET /admin/audit/page
```

API:

```bash
curl --silent --show-error --request GET http://localhost:3000/admin/audit-logs -H "x-admin-key: <ADMIN_REVIEW_KEY>"
```

특정 대상/기간 확인:

```bash
curl --silent --show-error --request GET "http://localhost:3000/admin/audit-logs?targetType=Proof&targetId=<proofId>&from=2026-05-01&to=2026-05-06" -H "x-admin-key: <ADMIN_REVIEW_KEY>"
```

확인할 대표 액션:

- `SHOP_PURCHASE_REQUESTED`
- `SHOP_PURCHASE_SENT`
- `SHOP_PURCHASE_CANCELLED`
- `PROOF_REVIEWED`
- `PROOF_REVIEW_CORRECTED`
- `POINTS_ADJUSTED`
- `MENU_DRAFT_APPROVED`
- `MENU_DRAFT_REJECTED`
