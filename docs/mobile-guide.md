# 모바일 앱 가이드

## 주요 경로

```text
apps/mobile/
  app/
    _layout.tsx
    proof.tsx
    blocked.tsx
    (tabs)/
      index.tsx
      ingredients.tsx
      points.tsx
  src/
    api/
    auth/
    ingredients/
```

## 홈 탭

파일:

- `apps/mobile/app/(tabs)/index.tsx`

역할:

- 추천 요청
- 추천 수락
- 인증 화면 이동
- 추천 quota 표시
- 차단 메뉴 관리 화면 이동
- 추천 카드에서 `싫어요 / 다시 추천` 처리

중요 정책:

- 차단 API는 `POST /me/blocked-menus/:menuId`입니다.
- 차단 성공 후 현재 추천을 제거하고 새 추천을 요청할 수 있습니다.
- 이미 `ACCEPTED`된 세션에서는 차단 후 재추천을 허용하지 않습니다.

## 인증 화면

파일:

- `apps/mobile/app/proof.tsx`

역할:

- 세션별 proof 상태 조회
- 카메라 촬영
- 이미지 업로드
- Proof 큐 등록
- 서버 정책 에러 코드 안내

주의:

- `refreshProofStatus()`는 최신 응답을 반환해야 합니다.
- 업로드 직전 중복 검사는 React state가 아니라 반환된 최신 응답으로 판단합니다.
- `PENDING` 또는 `HOLD`이면 업로드를 막고 포인트 내역 이동을 안내합니다.

## 포인트 탭

파일:

- `apps/mobile/app/(tabs)/points.tsx`

역할:

- 보유 포인트 표시
- 포인트 사용 탭 표시
- Proof와 PointLedger를 합친 타임라인 표시
- Proof 이미지 썸네일과 확대 모달 표시

정책:

- 유저 이미지는 `rawUrl || imageUrl` 순서로 사용합니다.
- Proof 카드를 별도로 보여주므로 `source=PROOF` ledger는 제외합니다.
- `PENDING` Proof가 있으면 폴링합니다.

## 취향 탭

파일:

- `apps/mobile/app/(tabs)/ingredients.tsx`

역할:

- 싫어하는 재료 선택
- 저장
- 차단 메뉴 관리 화면 진입

차단 메뉴 진입:

```ts
router.push("/blocked")
```

## 차단 메뉴 화면

파일:

- `apps/mobile/app/blocked.tsx`

역할:

- 차단 메뉴 목록 조회
- 단건 해제
- 전체 초기화

API:

- `GET /me/blocked-menus`
- `DELETE /me/blocked-menus/:menuId`
- `DELETE /me/blocked-menus`

## 토큰 처리

주의:

- 수동 fetch를 사용할 때 `Bearer Bearer <token>`이 되지 않게 정규화합니다.
- axios client를 쓰는 경우 `src/api/client.ts`의 interceptor를 확인합니다.

## 현재 알려진 모바일 타입체크 이슈

전체 `tsc --noEmit`은 레거시 경로 때문에 실패할 수 있습니다.

관련 경로:

- `src/navigation`
- `src/screens`
- `src/api/recommend.ts`
- `app/points.tsx`

변경 파일 확인은 우선 아래처럼 수행합니다.

```bash
pnpm --filter mobile exec eslint --no-cache app/proof.tsx 'app/(tabs)/index.tsx' 'app/(tabs)/points.tsx'
```
