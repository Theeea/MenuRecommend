# MenuReward 문서 목차

이 디렉토리는 `/Users/beng/Project/private/menu-reward` 프로젝트 유지보수 문서입니다.
작업 전에는 아래 문서를 먼저 확인합니다.

## 빠른 시작

- [프로젝트 유지보수 가이드](project-maintenance-guide.md): 전체 흐름, 정책, 주의사항을 한 파일로 정리한 종합 문서
- [유지보수 규칙](maintenance-rules.md): 앞으로 작업할 때 지켜야 할 공통 규칙
- [로컬 실행과 검증](operations.md): 실행 명령, 타입체크, lint, worker 실행 방법

## 영역별 문서

- [프로젝트 개요와 구조](project-overview.md): 앱 목적, 레포 구조, 기술 스택
- [API 명세와 라우트](api-reference.md): 주요 엔드포인트, 라우트 정책
- [DB와 Prisma 주의사항](database.md): schema 기준, 없는 필드, generated client import
- [Proof 인증 플로우](proof-flow.md): 업로드, 큐잉, AI worker, 상태 전이
- [모바일 앱 가이드](mobile-guide.md): 화면별 책임, raw 이미지 표시, 토큰 주의사항
- [어드민 리뷰 가이드](admin-guide.md): 어드민 리뷰 화면, 관리자 키, 이미지 정책
- [포인트 정책](points-policy.md): 지급 조건, ledger, dedupeKey
- [차단 메뉴 정책](blocked-menus.md): `/me/blocked-menus`, 추천 제외 정책
- [업로드 보안 정책](upload-security.md): proof 이미지 업로드 제한, 저장 방식, QR payload
- [디버깅 가이드](troubleshooting.md): 자주 나는 문제와 확인 순서

## 문서 관리 규칙

- 정책이나 API를 바꾸면 관련 문서도 같이 수정합니다.
- schema를 바꾸면 [DB와 Prisma 주의사항](database.md)을 확인하고 갱신합니다.
- proof 정책을 바꾸면 [Proof 인증 플로우](proof-flow.md)와 [포인트 정책](points-policy.md)을 함께 확인합니다.
- 업로드 정책을 바꾸면 [업로드 보안 정책](upload-security.md)을 갱신합니다.
- 모바일 UX를 바꾸면 [모바일 앱 가이드](mobile-guide.md)를 갱신합니다.
- 운영 명령이나 환경변수가 바뀌면 [로컬 실행과 검증](operations.md)을 갱신합니다.
