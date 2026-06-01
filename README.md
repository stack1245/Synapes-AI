# 🧠 Synapes AI (시냅스 AI)

> **Gemini API 기반 인터랙티브 지식 그래프 & 맞춤형 학습 오답 노트 플랫폼**

![Node.js](https://img.shields.io/badge/Node.js-20.18.0-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.19.2-000000?logo=express&logoColor=white)
![SQLite3](https://img.shields.io/badge/SQLite3-3.x-003B57?logo=sqlite&logoColor=white)
![Google Gemini](https://img.shields.io/badge/Google%20Gemini-2.5--flash-4285F4?logo=googlegemini&logoColor=white)
![Render](https://img.shields.io/badge/Render-Live-46E3B7?logo=render&logoColor=white)

Synapes AI는 학습자가 개념 간의 유기적인 연결 관계를 시각적으로 이해하고, 맞춤형 AI 피드백을 통해 오답을 주도적으로 복습할 수 있도록 돕는 풀스택 웹 애플리케이션입니다. 지식의 단절을 막고 개념 트리(Concept Tree) 형태의 동적 그래프 인터페이스를 제공합니다.

---

## 🚀 Key Features (주요 기능)

* **Interactive Knowledge Graph:** 학습 단원과 개념 간의 연관 관계를 시각적인 노드(Node) 구조로 시각화 및 동적 경로 하이라이팅 기능 제공
* **AI-Powered Concept Explanation:** Google Gemini 2.5 Flash 모델을 연동하여 학습자가 특정 개념을 클릭할 때마다 실시간 맞춤형 퀴즈 및 개념 심화 설명 제공
* **Secure Auth Pipeline:** JWT(JSON Web Token) 기반의 세션 관리 및 Nodemailer를 통한 Gmail SMTP 기반 6자리 보안 OTP 이메일 인증 회원가입 체계 구축
* **Progress Tracking & Review:** SQLite 데이터베이스를 연동하여 유저별 학습 진척도, 오답 데이터 및 AI 피드백 이력을 영속적으로 저장하고 관리

---

## 🛠 Tech Stack (기술 스택)

### Architecture

* **Frontend:** Vanilla JavaScript (ES6+), CSS3 (Modern UI Flex/Grid Architecture), HTML5 Canvas-based Node Rendering
* **Backend:** Node.js, Express.js (RESTful API Architecture)
* **Database:** SQLite3 (ORM-less Native Driver / Persistence Layer)
* **AI Integration:** Google Gen AI SDK (`@google/generative-ai`)

---

## ⚙️ Environment Variables (환경 변수 설정)

프로젝트 루트 디렉토리에 `.env` 파일을 생성하고 아래의 환경 변수들을 정의해야 합니다.

```env
PORT=3000
GEMINI_API_KEY=your_google_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
JWT_SECRET=your_secure_jwt_random_string
EMAIL_USER=your_gmail_address@gmail.com
EMAIL_PASS=your_gmail_16_digit_app_password
```
