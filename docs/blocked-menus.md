# 차단 메뉴 정책

## 목적

유저가 원하지 않는 메뉴를 차단하면 이후 추천 후보에서 제외합니다.

## API

- `GET /me/blocked-menus?take=30&cursor=<id>`
- `POST /me/blocked-menus/:menuId`
- `DELETE /me/blocked-menus/:menuId`
- `DELETE /me/blocked-menus`

## 금지 라우트

아래 라우트는 만들지 않습니다.

```text
/blocks
```

현재 구조는 `/me/blocked-menus`입니다.

## DB 모델

모델:

- `UserMenuBlock`

중요 조건:

- `@@unique([userId, menuId])`

## 추천 제외 정책

추천 후보 조회 시 차단 메뉴를 제외해야 합니다.

핵심 조건:

```ts
blocks: { none: { userId } }
```

## 모바일 화면

차단 메뉴 관리 화면:

- `apps/mobile/app/blocked.tsx`
- route: `/blocked`

취향 탭 진입:

- `apps/mobile/app/(tabs)/ingredients.tsx`
- `router.push("/blocked")`

홈 추천 카드:

- `apps/mobile/app/(tabs)/index.tsx`
- 수락 전 메뉴에 `싫어요 / 다시 추천` 제공
- 차단 성공 후 새 추천 요청 가능
- 이미 수락한 세션은 차단 후 재추천을 허용하지 않음

## 디버깅

차단한 메뉴가 다시 추천되면 확인할 것:

1. `UserMenuBlock` row가 생성됐는지 확인
2. 추천 쿼리에 `blocks: { none: { userId } }`가 있는지 확인
3. 모바일이 올바른 `menuId`로 `POST /me/blocked-menus/:menuId`를 호출하는지 확인
4. 로그인 토큰이 다른 유저의 토큰이 아닌지 확인
