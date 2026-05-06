# 프로젝트 개요와 구조

## 앱 목적

MenuReward는 유저가 메뉴를 추천받고, 실제로 해당 메뉴를 먹은 뒤 음식 사진을 업로드하면 인증 상태를 기록하고, AI 또는 관리자의 판정에 따라 포인트를 지급하는 MVP 앱입니다.

핵심 기능:

- 메뉴 추천
- 추천 수락과 `RecommendSession` 생성
- 음식 사진 업로드
- raw 이미지와 워터마크 proof 이미지 저장
- 비동기 AI 인증 처리
- 어드민 수동 리뷰
- 포인트 적립 내역
- 포인트 상품 구매 요청
- 모바일교환권 발송 관리
- 운영 감사로그
- 싫어요 재료 관리
- 차단 메뉴 관리
- 추천 횟수 제한

## 핵심 흐름

```text
추천 요청
  -> 메뉴 추천
  -> 유저 수락
  -> RecommendSession ACCEPTED
  -> challengeCode 발급
  -> 음식 사진 업로드
  -> raw/proof 이미지 저장
  -> Proof PENDING 큐잉
  -> proof:ai 비동기 처리
  -> PASS/FAIL/HOLD
  -> 포인트 지급 또는 관리자 리뷰
```

## 레포 구조

```text
menu-reward/
  apps/
    api/
      prisma/schema.prisma
      src/
        admin/
        cron/
        me/
        points/
        proof/
        recommend/
        shop/
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
```

## 기술 스택

API:

- NestJS
- Prisma
- PostgreSQL
- JWT
- Multer
- sharp
- qrcode
- jsQR
- OpenAI SDK Vision

Mobile:

- Expo
- React Native
- expo-router
- AsyncStorage
- expo-image-picker
- expo-haptics

Admin:

- NestJS Controller HTML 문자열 렌더링
- 관리자 키는 `x-admin-key` 헤더 기반

## 중요한 기획 결정

- 인증은 비동기입니다.
- 업로드 직후 포인트를 지급하지 않습니다.
- 유저 화면은 raw 이미지를 우선 표시합니다.
- 어드민 화면은 QR/워터마크 proof 이미지를 표시합니다.
- `PENDING`/`HOLD` 상태에서는 서버에서 추가 업로드를 막습니다.
- 차단 메뉴 API는 `/me/blocked-menus`를 유지합니다.
- 포인트 사용은 상품 구매 요청 방식이며, 구매 즉시 포인트를 차감하고 어드민이 모바일교환권을 발송합니다.
- 포인트/구매/인증/메뉴 초안 관련 운영 액션은 `AuditLog`에 기록합니다.
