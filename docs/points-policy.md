# 포인트 정책

## 기본 원칙

- 업로드 직후 포인트를 지급하지 않습니다.
- Proof가 `PASS`가 된 뒤에만 포인트를 지급합니다.
- 포인트 지급은 반드시 idempotent해야 합니다.

## Proof 상태별 표시

- `PENDING`: `+0점 (검토중)` 또는 `+0점 (진행중)`
- `HOLD`: `+0점 (보류)`
- `PASS`: 실제 지급 포인트
- `FAIL`: `+0점 (거절)`

## 지급 금액

환경변수:

```env
PROOF_PASS_BONUS=40
```

기본값:

- `40`

## PointLedger

중요 필드:

- `kind`
- `source`
- `sourceId`
- `proofId`
- `points`
- `balanceAfter`
- `note`
- `dedupeKey`

주의:

- `amount` 필드는 없습니다.
- 포인트 변동값은 `points`입니다.

## 중복 지급 방지

Proof 보상은 `dedupeKey`를 사용합니다.

권장 형식:

```text
PROOF:PASS:<proofId>
```

중복 지급이 발생하면 안 되는 상황:

- AI worker 재실행
- 관리자 PASS 버튼 중복 클릭
- 네트워크 재시도
- 같은 Proof에 대해 worker와 admin review가 모두 호출되는 경우

## 모바일 표시 정책

포인트 탭은 Proof와 Ledger를 합쳐 타임라인으로 보여줍니다.

중복 방지:

- Proof PASS 후 PointLedger도 생깁니다.
- Proof 카드와 ledger 카드가 중복될 수 있습니다.
- 모바일에서는 `source=PROOF` ledger row를 제외합니다.

## 추후 포인트 사용

예상 API:

- `GET /shop/items`
- `POST /shop/purchase`
- `GET /me/purchases`

구현 시 필요한 정책:

- 잔액 부족 방지
- 중복 구매 방지
- 구매 내역 저장
- `PointLedger`에 `SPEND` 내역 기록
- 환불 또는 취소 정책
