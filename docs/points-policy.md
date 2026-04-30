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

## 포인트 사용 MVP

API:

- `GET /shop/items`
- `POST /shop/purchase`
- `GET /me/purchases`

포인트 사용 MVP는 상품 구매 요청 방식입니다.

흐름:

1. 유저가 포인트 사용 탭에서 상품을 선택합니다.
2. `POST /shop/purchase`를 호출합니다.
3. 서버가 잔액과 재고를 확인합니다.
4. 포인트를 즉시 차감합니다.
5. `UserPurchase`를 `REQUESTED` 상태로 생성합니다.
6. `PointLedger`에 `SPEND / REDEEM` 차감 내역을 기록합니다.
7. 관리자가 추후 모바일교환권을 발송하고 상태를 `SENT`로 변경합니다.

현재 상태:

- `REQUESTED`: 구매 요청 완료, 발송 대기
- `SENT`: 발송 완료
- `CANCELLED`: 취소

주의:

- 포인트 차감과 구매 요청 생성은 같은 트랜잭션에서 처리합니다.
- 잔액 부족이면 구매 요청을 만들지 않습니다.
- 재고가 0이면 구매 요청을 만들지 않습니다.
- 인증 판정 정정과 달리 구매 ledger는 `source=REDEEM`이므로 모바일 내역에 그대로 표시합니다.

## 구매 취소/환불

어드민과 유저는 `REQUESTED` 상태의 구매 요청만 취소할 수 있습니다.

취소 시 처리:

- `UserPurchase.status`를 `CANCELLED`로 변경
- `cancelledAt` 기록
- 취소 사유를 `fulfillmentMeta.cancelReason`에 저장
- 사용 포인트를 `User.pointBalance`에 환불
- `PointLedger`에 `ADJUST / ADMIN` 양수 환불 내역 생성
- 재고가 있는 상품이면 `ShopItem.stock`을 1개 복구

이미 `SENT` 또는 `CANCELLED` 상태인 구매 요청은 취소하지 않습니다.

발송/취소 경쟁 조건:

- 어드민 발송 완료와 유저 취소가 동시에 요청될 수 있습니다.
- 서버는 `REQUESTED` 상태 조건으로 update를 수행해서 한쪽만 성공하게 해야 합니다.
- 유저 취소가 먼저 성공하면 어드민 발송 완료는 실패해야 합니다.
- 어드민 발송 완료가 먼저 성공하면 유저 취소는 실패해야 합니다.

모바일 표시:

- `CANCELLED` 구매 요청은 취소 사유를 표시합니다.
- `SENT` 구매 요청은 관리자가 입력한 교환권 코드와 메모를 표시합니다.
