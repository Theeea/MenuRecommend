# AI 메뉴 초안 운영 규칙

## 목적

AI는 운영 `Menu`를 직접 수정하지 않는다.

AI의 역할은 기존 메뉴 DB를 읽고, 중복되지 않는 메뉴 후보를 `MenuDraft`에 저장하는 것이다. 실제 추천에 사용되는 `Menu`, `Ingredient`, `MenuIngredient` 반영은 어드민 승인 후에만 수행한다.

## 중복 방지 기준

AI 생성 전 서버가 먼저 아래 데이터를 읽는다.

- 운영 메뉴: `Menu`
- 검수 중이거나 승인된 초안: `MenuDraft` 중 `PENDING`, `APPROVED`

중복 판정 키:

```text
cuisine + normalizedName
```

`normalizedName`은 메뉴명을 NFKC 정규화하고, 공백/일부 구두점을 제거하고, 소문자로 변환한 값이다.

예:

```text
김치 볶음밥
김치볶음밥
```

두 값은 같은 후보로 본다.

## 상태 흐름

```text
AI 생성
→ MenuDraft(PENDING)
→ 어드민 검수
→ 승인 시 Menu / Ingredient / MenuIngredient 생성
→ MenuDraft(APPROVED)
```

거절 시:

```text
MenuDraft(REJECTED)
```

## API

모든 API는 `x-admin-key` 헤더가 필요하다.

관리 화면:

```text
GET /admin/menu-drafts/page
```

이 화면에서 AI 후보 생성, 초안 목록 조회, 승인, 거절을 처리한다.

```text
GET  /admin/menu-drafts?status=PENDING&cuisine=KOREAN&take=50
POST /admin/menu-drafts/generate
POST /admin/menu-drafts/:id/approve
POST /admin/menu-drafts/:id/reject
```

생성 요청 예:

```json
{
  "cuisine": "KOREAN",
  "count": 10,
  "memo": "혼밥에 적합하고 대중적인 메뉴 위주"
}
```

## 중요한 유지보수 규칙

- AI 응답을 바로 `Menu`에 넣지 않는다.
- `MenuDraft` 승인 시점에도 기존 `Menu`와 normalized 중복을 다시 검사한다.
- 싫어하는 식재료 필터링을 위해 `MAIN` 재료가 최소 1개 이상 포함되도록 AI 프롬프트와 어드민 검수를 유지한다.
- 추천 로직은 계속 승인된 `Menu`만 사용한다.
- AI가 생성한 `Ingredient`는 승인 시 `Ingredient.name` 기준으로 upsert한다.

## 화면 사용 순서

1. API 서버 실행 후 `/admin/menu-drafts/page` 접속
2. `ADMIN_REVIEW_KEY` 입력
3. cuisine과 생성 개수 선택
4. `AI 생성` 클릭
5. PENDING 초안의 재료와 MAIN/SUB/OPTIONAL 확인
6. 적합하면 승인, 부적합하면 거절

승인된 초안만 실제 추천 메뉴 DB에 반영된다.
