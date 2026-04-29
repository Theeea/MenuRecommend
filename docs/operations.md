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

status:

```bash
pnpm --filter api prisma:status
```

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

- 현재 전체 모바일 typecheck는 레거시 파일 때문에 실패할 수 있습니다.
- 변경 파일 lint는 우선 통과시킵니다.

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
