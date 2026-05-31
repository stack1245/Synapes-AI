# 시냅스 AI

지식 트리 기반 AI 수학 오답 노트 챗봇을 위한 Node.js 백엔드 프로젝트입니다. Express 서버와 SQLite 데이터베이스를 사용해 개념 트리 조회와 AI 튜터링 API를 제공합니다.

## 기술 스택

- Node.js
- Express
- SQLite

## 주요 API

- GET /api/concepts
- POST /api/chat/rooms
- GET /api/chat/rooms
- GET /api/chat/rooms/:roomId/messages
- POST /api/chat/message

현재 채팅방 관련 API는 인증 시스템이 없으므로 임시로 user_id = 1 더미 사용자를 기준으로 동작합니다.

## 필수 가이드

### 1. 패키지 설치

```bash
npm install express sqlite sqlite3 openai dotenv
```

### 2. 환경 변수 설정

프로젝트 루트에 .env 파일을 만들고 아래 값을 넣습니다.

```env
OPENAI_API_KEY=your_openai_api_key
```

### 3. 서버 실행

```bash
node server.js
```

서버가 시작되면 schema.sql을 읽어 database.db를 자동 초기화하고, 기본 포트 3000에서 실행됩니다.

브라우저에서는 http://localhost:3000 으로 접속하면 기본 프론트엔드 화면을 사용할 수 있습니다.

첫 진입 시 기존 세션이 없으면 프론트엔드가 자동으로 첫 오답 세션을 만들고 온보딩 메시지를 표시합니다. AI가 추천한 conceptId가 응답되면 개념 트리도 해당 노드로 부드럽게 포커스 이동합니다.

채팅 입력창에서는 문제 사진을 업로드할 수 있고, 첨부 이미지는 Base64 데이터 URL 형태로 `/api/chat/message`에 함께 전송되어 멀티모달 답변에 사용됩니다.

프론트엔드는 라이트/다크 모드 토글을 지원하며, 사용자의 선택은 localStorage에 저장됩니다. 테마가 바뀌면 오른쪽 Cytoscape 개념 트리도 색상과 가독성이 실시간으로 함께 갱신됩니다.
