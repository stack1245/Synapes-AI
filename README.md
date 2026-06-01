# 시냅스 AI

지식 트리 기반 AI 수학 오답 노트 챗봇을 위한 Node.js 백엔드 프로젝트입니다. Express 서버와 SQLite 데이터베이스를 사용해 개념 트리 조회와 AI 튜터링 API를 제공합니다.

## 기술 스택

- Node.js
- Express
- SQLite

## 주요 API

- POST /api/auth/send-verification
- POST /api/auth/verify-code
- POST /api/auth/signup
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me
- PUT /api/auth/me
- DELETE /api/auth/me
- GET /api/concepts
- POST /api/chat/rooms
- DELETE /api/chat/rooms
- PATCH /api/chat/rooms/:roomId
- PATCH /api/chat/rooms/:roomId/pin
- DELETE /api/chat/rooms/:roomId
- GET /api/chat/rooms
- GET /api/chat/rooms/:roomId/messages
- POST /api/chat/message

채팅방 및 메시지 관련 API는 JWT 기반 httpOnly 쿠키 인증이 적용되며, 로그인한 사용자 기준으로만 조회 및 생성됩니다.

## 필수 가이드

### 1. 패키지 설치

```bash
npm install express sqlite sqlite3 @google/generative-ai dotenv bcryptjs jsonwebtoken cookie-parser nodemailer
```

### 2. 환경 변수 설정

프로젝트 루트의 .env.example을 복사해 .env 파일을 만든 뒤 아래 값을 채웁니다.

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
JWT_SECRET=replace_with_a_long_random_secret
EMAIL_USER=your_gmail_address@gmail.com
EMAIL_PASS=your_gmail_app_password
PORT=3000
```

AI 응답 생성은 Google Gemini API를 사용하며, `GEMINI_MODEL`을 지정하지 않으면 기본값으로 gemini-2.5-flash를 사용합니다. 서버는 Gemini 응답을 JSON으로 파싱하기 전에 마크다운 코드펜스와 비이스케이프 줄바꿈/탭 문자를 정제하고, 응답 앞뒤에 잡음이 섞여 있어도 첫 번째로 파싱 가능한 JSON 객체만 추출합니다.

로그인에 성공하면 서버가 JWT를 httpOnly 쿠키로 설정합니다. 이후 `/api/chat/rooms`, `/api/chat/rooms/:roomId/messages`, `/api/chat/message` 호출은 해당 쿠키를 기준으로 인증됩니다.

이메일 인증번호 전송 API는 Gmail SMTP 기준 `EMAIL_USER`, `EMAIL_PASS`를 사용합니다. `/api/auth/send-verification`은 6자리 OTP를 발급해 정확히 3분 뒤 만료되도록 저장하고 메일로 전송하며, `/api/auth/verify-code`는 이메일과 인증번호를 검증한 뒤 성공 시 해당 OTP 레코드를 삭제합니다. 회원가입 API는 `passwordConfirm`이 `password`와 일치하는지도 서버에서 다시 검증합니다.

로그인된 사용자는 `/api/auth/me`에 `PUT` 요청을 보내 닉네임을 바꾸거나 현재 비밀번호 검증 후 새 비밀번호로 변경할 수 있습니다. `/api/auth/me`에 `DELETE` 요청을 보내면 계정이 삭제되고, 연결된 채팅방과 메시지도 함께 정리된 뒤 로그아웃 처리됩니다.

로그인된 사용자는 `/api/chat/rooms`로 자신의 모든 채팅 세션을 한 번에 초기화할 수 있고, `/api/chat/rooms/:roomId` 계열 API로 개별 채팅방 이름 변경, 고정 토글, 삭제도 수행할 수 있습니다. 방 목록 조회는 `is_pinned DESC` 기준이 먼저 적용되어 고정된 방이 항상 최상단에 표시됩니다.

프론트엔드의 설정(Settings) 모달에서는 닉네임 변경, 비밀번호 변경, 모든 대화 초기화, 계정 탈퇴를 한 곳에서 처리할 수 있습니다.

### 3. 서버 실행

```bash
npm start
```

개발 중 자동 재시작이 필요하면 아래 스크립트를 사용할 수 있습니다.

```bash
npm run dev
```

서버가 시작되면 schema.sql을 읽어 database.db를 자동 초기화하고, 기본 포트 3000에서 실행됩니다.

브라우저에서는 http://localhost:3000 으로 접속하면 기본 프론트엔드 화면을 사용할 수 있습니다.

프론트엔드는 `manifest.json`과 `sw.js`를 통해 PWA 설치를 지원하며, 브라우저가 설치 프롬프트를 허용하는 환경에서는 헤더의 앱 설치 버튼이 노출됩니다.

프론트엔드는 첫 진입 시 로그인/회원가입 통합 오버레이를 먼저 표시합니다. `GET /api/auth/me`로 로그인 상태를 확인한 뒤 인증된 사용자만 세션 목록과 채팅 기록을 불러오며, 회원가입 성공 시에는 즉시 로그인까지 이어집니다.

회원가입 모드에서는 이메일 인증번호 발송과 3분 카운트다운 타이머, 6자리 OTP 확인, 비밀번호 확인 입력란이 함께 표시됩니다. 프론트엔드는 이메일 인증이 완료되지 않았거나 비밀번호 확인이 일치하지 않으면 회원가입 요청을 보내지 않습니다.

세션 목록의 각 방 우측에는 케밥 메뉴가 있으며, 여기서 대화 내역 공유, 고정/고정 해제, 이름 변경, 삭제를 바로 실행할 수 있습니다. 고정된 방은 압정 아이콘으로 표시되고 목록 최상단에 유지됩니다.

첫 진입 시 기존 세션이 없으면 프론트엔드가 자동으로 첫 오답 세션을 만들고 온보딩 메시지를 표시합니다. AI가 추천한 conceptId가 응답되면 개념 트리도 해당 노드로 부드럽게 포커스 이동합니다.

채팅 입력창에서는 문제 사진을 업로드할 수 있고, 첨부 이미지는 Base64 데이터 URL 형태로 `/api/chat/message`에 함께 전송되어 멀티모달 답변에 사용됩니다. PC에서는 `Enter`로 즉시 전송되고 `Shift + Enter`로 줄바꿈되며, 모바일 환경에서는 기본 줄바꿈 입력을 유지합니다.

프론트엔드는 라이트/다크 모드 토글을 지원하며, 사용자의 선택은 localStorage에 저장됩니다. 테마가 바뀌면 오른쪽 Cytoscape 개념 트리도 색상과 가독성이 실시간으로 함께 갱신됩니다.
