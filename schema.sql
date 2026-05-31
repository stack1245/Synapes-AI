-- 1. 사용자 테이블
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nickname TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 이메일 인증 테이블 (3분 타이머용)
CREATE TABLE IF NOT EXISTS email_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_email
ON email_verifications(email);

-- 3. 채팅방 (오답 세션) 테이블 - is_pinned 추가됨
CREATE TABLE IF NOT EXISTS chat_rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. 채팅 메시지 테이블
CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    sender_role TEXT NOT NULL, -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,
    concept_node_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (concept_node_id) REFERENCES concept_nodes(id) ON DELETE SET NULL
);

-- 5. 지식 트리 (개념 노드) 테이블
CREATE TABLE IF NOT EXISTS concept_nodes (
    id INTEGER PRIMARY KEY,
    parent_id INTEGER,
    name TEXT NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES concept_nodes(id) ON DELETE CASCADE
);

-- 6. 초기 수학 커리큘럼 데이터 삽입 (기존 데이터 초기화 후 삽입)
DELETE FROM concept_nodes;

INSERT INTO concept_nodes (id, parent_id, name) VALUES
(1, NULL, '수학 커리큘럼 전체'),
(10, 1, '중등 수학'),
(20, 1, '고등 수학'),
(11, 10, '중1 수학'),
(12, 10, '중2 수학'),
(13, 10, '중3 수학'),
(21, 20, '공통수학 (상/하)'),
(22, 20, '수학 I'),
(23, 20, '수학 II'),
(24, 20, '미적분'),
(25, 20, '확률과 통계'),
(26, 20, '기하'),
(111, 11, '소인수분해'),
(112, 11, '정수와 유리수'),
(113, 11, '문자와 식'),
(114, 11, '일차방정식'),
(115, 11, '좌표평면과 그래프'),
(116, 11, '기본 도형과 다각형'),
(121, 12, '유리수와 순환소수'),
(122, 12, '식의 계산'),
(123, 12, '일차부등식'),
(124, 12, '연립방정식'),
(125, 12, '일차함수'),
(126, 12, '도형의 성질과 닮음'),
(131, 13, '제곱근과 실수'),
(132, 13, '인수분해'),
(133, 13, '이차방정식'),
(134, 13, '이차함수'),
(135, 13, '삼각비'),
(136, 13, '원의 성질'),
(211, 21, '다항식'),
(212, 21, '방정식과 부등식'),
(213, 21, '도형의 방정식'),
(214, 21, '집합과 명제'),
(215, 21, '함수와 그래프'),
(216, 21, '경우의 수'),
(221, 22, '지수와 로그'),
(222, 22, '지수함수와 로그함수'),
(223, 22, '삼각함수'),
(224, 22, '수열'),
(231, 23, '함수의 극한과 연속'),
(232, 23, '미분법 (다항함수)'),
(233, 23, '적분법 (다항함수)'),
(241, 24, '수열의 극한'),
(242, 24, '미분법 (초월함수)'),
(243, 24, '적분법 (초월함수)'),
(251, 25, '순열과 조합'),
(252, 25, '확률'),
(253, 25, '통계'),
(261, 26, '이차곡선'),
(262, 26, '평면벡터'),
(263, 26, '공간도형과 공간좌표');