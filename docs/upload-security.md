# 업로드 보안 정책

대상:

- `POST /uploads/proof`
- `apps/api/src/uploads/uploads.controller.ts`
- `apps/api/src/uploads/uploads.service.ts`

## 현재 정책

허용 MIME:

- `image/jpeg`
- `image/png`
- `image/webp`

파일 크기 제한:

- 10MB

저장 방식:

- raw 파일은 `uploads/raw/`에 저장합니다.
- proof 파일은 `uploads/proof/`에 저장합니다.
- 저장 파일명은 서버에서 `randomUUID()` 또는 서버 생성 이름으로 만듭니다.
- 원본 파일명은 저장 경로와 파일명으로 사용하지 않습니다.
- 확장자는 MIME 기준으로 서버가 결정합니다.

이미지 검증:

- Multer `fileFilter`에서 MIME allowlist를 먼저 검사합니다.
- `UploadsService`에서도 MIME을 다시 검사합니다.
- sharp가 이미지를 읽고 normalize하지 못하면 `400 BadRequest`를 반환합니다.
- sharp 처리 실패 시 업로드된 raw 파일은 best-effort로 삭제합니다.

## QR payload

proof 이미지에는 QR이 합성됩니다.

현재 payload 형식:

```text
MR1|sid=<sessionId>|code=<challengeCode>|ts=<timestamp>|sig=<hmac>
```

서명 기준 문자열:

```text
MR1|sid=<sessionId>|code=<challengeCode>|ts=<timestamp>
```

서명:

- HMAC-SHA256
- secret: `PROOF_QR_SECRET`
- hex digest 사용

주의:

- `ProofService.parseQrPayload()`와 `UploadsService`의 QR payload 형식이 반드시 일치해야 합니다.
- QR 형식을 바꾸면 worker의 QR 검증 테스트도 함께 갱신해야 합니다.

## 아직 남은 운영 전 개선

- raw 이미지 접근을 signed URL 또는 인증 proxy로 전환할지 결정
- `/uploads/**` 정적 서빙 범위 제한 검토
- 업로드 실패 파일 cleanup 로그 추가
- 파일별 처리 실패 카운트/모니터링 추가
