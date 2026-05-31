PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nickname TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '새 오답 노트',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS concept_nodes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id INTEGER,
  FOREIGN KEY (parent_id) REFERENCES concept_nodes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  concept_node_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (concept_node_id) REFERENCES concept_nodes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_rooms_user_id
  ON chat_rooms(user_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id
  ON chat_messages(room_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_concept_node_id
  ON chat_messages(concept_node_id);

CREATE INDEX IF NOT EXISTS idx_concept_nodes_parent_id
  ON concept_nodes(parent_id);

INSERT OR IGNORE INTO concept_nodes (id, name, parent_id) VALUES
  (1, '대수', NULL),
  (2, '식 연산 흐름', 1),
  (3, '중1-소인수분해', 2),
  (4, '중2-식의 계산', 3),
  (5, '중3-인수분해', 4),
  (6, '고등-다항식의 연산', 5),
  (7, '방정식 흐름', 1),
  (8, '중1-일차방정식', 7),
  (9, '중2-연립방정식', 8),
  (10, '중3-이차방정식', 9),
  (11, '고등-복소수', 10),
  (12, '고등-이차방정식', 11);

COMMIT;