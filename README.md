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
- GET /api/concepts
- POST /api/chat/rooms
- GET /api/chat/rooms
- GET /api/chat/rooms/:roomId/messages
- POST /api/chat/message

채팅방 및 메시지 관련 API는 JWT 기반 httpOnly 쿠키 인증이 적용되며, 로그인한 사용자 기준으로만 조회 및 생성됩니다.

## 필수 가이드

### 1. 패키지 설치

```bash
npm install express sqlite sqlite3 openai dotenv bcryptjs jsonwebtoken cookie-parser nodemailer
```

### 2. 환경 변수 설정

프로젝트 루트의 .env.example을 복사해 .env 파일을 만든 뒤 아래 값을 채웁니다.

```env
OPENAI_API_KEY=your_openai_api_key_here
JWT_SECRET=replace_with_a_long_random_secret
EMAIL_USER=your_gmail_address@gmail.com
EMAIL_PASS=your_gmail_app_password
OPENAI_MODEL=gpt-4o-mini
PORT=3000
```

로그인에 성공하면 서버가 JWT를 httpOnly 쿠키로 설정합니다. 이후 `/api/chat/rooms`, `/api/chat/rooms/:roomId/messages`, `/api/chat/message` 호출은 해당 쿠키를 기준으로 인증됩니다.

이메일 인증번호 전송 API는 Gmail SMTP 기준 `EMAIL_USER`, `EMAIL_PASS`를 사용합니다. `/api/auth/send-verification`은 6자리 OTP를 발급해 정확히 3분 뒤 만료되도록 저장하고 메일로 전송하며, `/api/auth/verify-code`는 이메일과 인증번호를 검증한 뒤 성공 시 해당 OTP 레코드를 삭제합니다. 회원가입 API는 `passwordConfirm`이 `password`와 일치하는지도 서버에서 다시 검증합니다.

### 3. 서버 실행

```bash
node server.js
```

서버가 시작되면 schema.sql을 읽어 database.db를 자동 초기화하고, 기본 포트 3000에서 실행됩니다.

브라우저에서는 http://localhost:3000 으로 접속하면 기본 프론트엔드 화면을 사용할 수 있습니다.

프론트엔드는 첫 진입 시 로그인/회원가입 통합 오버레이를 먼저 표시합니다. `GET /api/auth/me`로 로그인 상태를 확인한 뒤 인증된 사용자만 세션 목록과 채팅 기록을 불러오며, 회원가입 성공 시에는 즉시 로그인까지 이어집니다.

첫 진입 시 기존 세션이 없으면 프론트엔드가 자동으로 첫 오답 세션을 만들고 온보딩 메시지를 표시합니다. AI가 추천한 conceptId가 응답되면 개념 트리도 해당 노드로 부드럽게 포커스 이동합니다.

채팅 입력창에서는 문제 사진을 업로드할 수 있고, 첨부 이미지는 Base64 데이터 URL 형태로 `/api/chat/message`에 함께 전송되어 멀티모달 답변에 사용됩니다.

프론트엔드는 라이트/다크 모드 토글을 지원하며, 사용자의 선택은 localStorage에 저장됩니다. 테마가 바뀌면 오른쪽 Cytoscape 개념 트리도 색상과 가독성이 실시간으로 함께 갱신됩니다.
