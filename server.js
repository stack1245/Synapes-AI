require("dotenv").config();

const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const express = require("express");
const fs = require("fs/promises");
const jwt = require("jsonwebtoken");
const OpenAI = require("openai");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DB_PATH = path.join(__dirname, "database.db");
const PUBLIC_DIR = path.join(__dirname, "public");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const DEFAULT_ROOM_TITLE = "새 오답 노트";
const JWT_COOKIE_NAME = "synapes_auth_token";
const JWT_EXPIRES_IN = "7d";
const JWT_COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 7;
const BCRYPT_SALT_ROUNDS = 10;

let db;
let openaiClient;

const tutorModePrompts = {
  hint: "너는 친절한 수학 튜터야. 정답을 절대 먼저 말하지 말고, 공식이나 개념적 힌트만 주며 학생이 스스로 생각하도록 소크라테스식 질문을 던져라.",
  solve:
    "너는 완벽한 수학 튜터야. 풀이 과정을 단계별로 상세하고 친절하게 설명해 줘.",
};

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(express.static(PUBLIC_DIR));

function normalizeRoomTitle(title) {
  if (typeof title !== "string") {
    return DEFAULT_ROOM_TITLE;
  }

  const trimmedTitle = title.trim();
  return trimmedTitle || DEFAULT_ROOM_TITLE;
}

function parseOptionalInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsedValue = Number.parseInt(value, 10);
  return Number.isNaN(parsedValue) ? null : parsedValue;
}

function normalizeEmail(email) {
  if (typeof email !== "string") {
    return "";
  }

  return email.trim().toLowerCase();
}

function normalizeNickname(nickname) {
  if (typeof nickname !== "string") {
    return "";
  }

  return nickname.trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    const error = new Error("JWT_SECRET이 설정되지 않았습니다.");
    error.statusCode = 500;
    throw error;
  }

  return process.env.JWT_SECRET;
}

function getAuthCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: JWT_COOKIE_MAX_AGE,
  };
}

function toPublicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

function createAuthToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
    },
    getJwtSecret(),
    {
      expiresIn: JWT_EXPIRES_IN,
    },
  );
}

function setAuthCookie(res, user) {
  res.cookie(JWT_COOKIE_NAME, createAuthToken(user), getAuthCookieOptions());
}

function clearAuthCookie(res) {
  res.clearCookie(JWT_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

function isImageDataUrl(value) {
  return (
    typeof value === "string" &&
    /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value.trim())
  );
}

function buildStoredUserMessage(message, hasImageAttachment) {
  if (message && hasImageAttachment) {
    return `${message}\n[문제 이미지 첨부]`;
  }

  if (message) {
    return message;
  }

  return "문제 이미지가 첨부되었습니다.";
}

function buildOpenAIUserContent(message, imageBase64) {
  const promptText =
    message || "첨부된 문제 이미지를 보고 수학 풀이 또는 힌트를 제공해 줘.";

  if (!imageBase64) {
    return promptText;
  }

  return [
    {
      type: "text",
      text: promptText,
    },
    {
      type: "image_url",
      image_url: {
        url: imageBase64,
      },
    },
  ];
}

function applyLatestUserImageToMessages(messages, message, imageBase64) {
  if (!imageBase64) {
    return messages;
  }

  const nextMessages = [...messages];

  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    if (nextMessages[index].role === "user") {
      nextMessages[index] = {
        role: "user",
        content: buildOpenAIUserContent(message, imageBase64),
      };
      return nextMessages;
    }
  }

  nextMessages.push({
    role: "user",
    content: buildOpenAIUserContent(message, imageBase64),
  });

  return nextMessages;
}

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
    error.statusCode = 500;
    throw error;
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return openaiClient;
}

function buildSystemPrompt(mode) {
  const modePrompt = tutorModePrompts[mode] || tutorModePrompts.solve;

  return [
    modePrompt,
    "반드시 JSON 객체만 응답해라.",
    '응답 형식은 {"reply":"학생에게 보여줄 답변","conceptId":추천할 개념 노드 ID} 이다.',
    "reply는 한국어 문자열로 작성해라.",
    "conceptId는 반드시 제공된 개념 노드 목록에 있는 정수 ID 하나만 반환해라.",
    "JSON 이외의 설명, 코드블록, 머리말은 절대 추가하지 마라.",
  ].join(" ");
}

function buildConceptGuide(concepts, currentConceptId) {
  const currentConcept = concepts.find(
    (concept) => concept.id === currentConceptId,
  );
  const conceptSummary = concepts
    .map((concept) => {
      const parentId = concept.parent_id === null ? "null" : concept.parent_id;
      return `- ${concept.id}: ${concept.name} (parent_id: ${parentId})`;
    })
    .join("\n");

  return [
    "아래는 사용 가능한 수학 개념 노드 목록이다.",
    conceptSummary,
    currentConcept
      ? `현재 사용자가 학습 중인 개념은 ID ${currentConcept.id} (${currentConcept.name}) 이다.`
      : "현재 사용자가 선택한 개념 ID는 없다.",
    "대화 문맥을 보고 다음 학습 개념으로 가장 적절한 conceptId를 하나 추천해라.",
  ].join("\n");
}

function parseAssistantJson(content) {
  if (!content || typeof content !== "string") {
    throw new Error("AI 응답이 비어 있습니다.");
  }

  try {
    return JSON.parse(content);
  } catch (parseError) {
    const jsonStart = content.indexOf("{");
    const jsonEnd = content.lastIndexOf("}");

    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      return JSON.parse(content.slice(jsonStart, jsonEnd + 1));
    }

    throw parseError;
  }
}

function getFallbackConceptId(currentConceptId, concepts) {
  if (currentConceptId !== null) {
    const childConcept = concepts.find(
      (concept) => concept.parent_id === currentConceptId,
    );
    if (childConcept) {
      return childConcept.id;
    }

    const currentConcept = concepts.find(
      (concept) => concept.id === currentConceptId,
    );
    if (currentConcept) {
      return currentConcept.id;
    }
  }

  return concepts[0] ? concepts[0].id : null;
}

function resolveConceptId(candidateConceptId, currentConceptId, concepts) {
  const parsedConceptId = parseOptionalInteger(candidateConceptId);
  const validConceptIds = new Set(concepts.map((concept) => concept.id));

  if (parsedConceptId !== null && validConceptIds.has(parsedConceptId)) {
    return parsedConceptId;
  }

  return getFallbackConceptId(currentConceptId, concepts);
}

async function saveChatMessage(roomId, senderRole, content, conceptNodeId) {
  return db.run(
    `INSERT INTO chat_messages (room_id, sender_role, content, concept_node_id)
     VALUES (?, ?, ?, ?)`,
    [roomId, senderRole, content, conceptNodeId],
  );
}

async function getConversationMessages(roomId) {
  const messages = await db.all(
    `SELECT sender_role, content
     FROM chat_messages
     WHERE room_id = ?
     ORDER BY id ASC`,
    [roomId],
  );

  return messages.map((message) => ({
    role: message.sender_role,
    content: message.content,
  }));
}

async function getPublicUserById(userId) {
  const user = await db.get(
    `SELECT id, email, nickname, created_at, updated_at
     FROM users
     WHERE id = ?`,
    [userId],
  );

  return toPublicUser(user);
}

async function getUserByEmail(email) {
  return db.get(
    `SELECT id, email, password_hash, nickname, created_at, updated_at
     FROM users
     WHERE email = ?`,
    [email],
  );
}

async function getRoomByIdForUser(roomId, userId) {
  return db.get(
    `SELECT id, user_id, title, created_at, updated_at
     FROM chat_rooms
     WHERE id = ? AND user_id = ?`,
    [roomId, userId],
  );
}

async function authenticateToken(req, res, next) {
  const token = req.cookies?.[JWT_COOKIE_NAME];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "로그인이 필요합니다.",
    });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    const userId = parseOptionalInteger(decoded?.id);

    if (userId === null) {
      clearAuthCookie(res);
      return res.status(401).json({
        success: false,
        message: "유효하지 않은 인증 정보입니다.",
      });
    }

    const user = await getPublicUserById(userId);

    if (!user) {
      clearAuthCookie(res);
      return res.status(401).json({
        success: false,
        message: "존재하지 않는 사용자입니다.",
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    clearAuthCookie(res);
    return res.status(401).json({
      success: false,
      message: "인증이 만료되었거나 유효하지 않습니다.",
    });
  }
}

async function initializeDatabase() {
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  const schemaSql = await fs.readFile(SCHEMA_PATH, "utf8");
  await db.exec(schemaSql);
}

app.get("/api/concepts", async (req, res) => {
  try {
    const concepts = await db.all(
      `SELECT id, name, parent_id
       FROM concept_nodes
       ORDER BY id ASC`,
    );

    res.json({
      success: true,
      data: concepts,
    });
  } catch (error) {
    console.error("Failed to fetch concepts:", error);
    res.status(500).json({
      success: false,
      message: "개념 노드 조회 중 오류가 발생했습니다.",
    });
  }
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    const nickname = normalizeNickname(req.body?.nickname);

    if (!isValidEmail(email) || !password || !nickname) {
      return res.status(400).json({
        success: false,
        message: "유효한 이메일, 비밀번호, 닉네임이 필요합니다.",
      });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const result = await db.run(
      `INSERT INTO users (email, password_hash, nickname)
       VALUES (?, ?, ?)`,
      [email, passwordHash, nickname],
    );
    const user = await getPublicUserById(result.lastID);

    return res.status(201).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Failed to sign up user:", error);

    if (error.code === "SQLITE_CONSTRAINT") {
      return res.status(409).json({
        success: false,
        message: "이미 사용 중인 이메일입니다.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "회원가입 중 오류가 발생했습니다.",
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";

    if (!isValidEmail(email) || !password) {
      return res.status(400).json({
        success: false,
        message: "유효한 이메일과 비밀번호가 필요합니다.",
      });
    }

    const user = await getUserByEmail(email);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "이메일 또는 비밀번호가 올바르지 않습니다.",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "이메일 또는 비밀번호가 올바르지 않습니다.",
      });
    }

    setAuthCookie(res, user);

    return res.json({
      success: true,
      data: toPublicUser(user),
    });
  } catch (error) {
    console.error("Failed to log in user:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: "로그인 중 오류가 발생했습니다.",
    });
  }
});

app.post("/api/auth/logout", (req, res) => {
  clearAuthCookie(res);

  return res.json({
    success: true,
    message: "로그아웃되었습니다.",
  });
});

app.get("/api/auth/me", authenticateToken, (req, res) => {
  return res.json({
    success: true,
    data: req.user,
  });
});

app.post("/api/chat/rooms", authenticateToken, async (req, res) => {
  try {
    const title = normalizeRoomTitle(req.body?.title);
    const result = await db.run(
      `INSERT INTO chat_rooms (user_id, title)
       VALUES (?, ?)`,
      [req.user.id, title],
    );
    const room = await getRoomByIdForUser(result.lastID, req.user.id);

    return res.status(201).json({
      success: true,
      data: room,
    });
  } catch (error) {
    console.error("Failed to create chat room:", error);

    return res.status(500).json({
      success: false,
      message: "채팅방 생성 중 오류가 발생했습니다.",
    });
  }
});

app.get("/api/chat/rooms", authenticateToken, async (req, res) => {
  try {
    const rooms = await db.all(
      `SELECT id, user_id, title, created_at, updated_at
       FROM chat_rooms
       WHERE user_id = ?
       ORDER BY datetime(created_at) DESC, id DESC`,
      [req.user.id],
    );

    return res.json({
      success: true,
      data: rooms,
    });
  } catch (error) {
    console.error("Failed to fetch chat rooms:", error);

    return res.status(500).json({
      success: false,
      message: "채팅방 목록 조회 중 오류가 발생했습니다.",
    });
  }
});

app.get(
  "/api/chat/rooms/:roomId/messages",
  authenticateToken,
  async (req, res) => {
    try {
      const parsedRoomId = parseOptionalInteger(req.params.roomId);

      if (parsedRoomId === null) {
        return res.status(400).json({
          success: false,
          message: "유효한 roomId가 필요합니다.",
        });
      }

      const room = await getRoomByIdForUser(parsedRoomId, req.user.id);

      if (!room) {
        return res.status(404).json({
          success: false,
          message: "존재하지 않는 채팅방입니다.",
        });
      }

      const messages = await db.all(
        `SELECT id, room_id, sender_role, content, concept_node_id, created_at
       FROM chat_messages
       WHERE room_id = ?
       ORDER BY datetime(created_at) ASC, id ASC`,
        [parsedRoomId],
      );

      return res.json({
        success: true,
        data: messages,
      });
    } catch (error) {
      console.error("Failed to fetch chat room messages:", error);

      return res.status(500).json({
        success: false,
        message: "채팅 메시지 조회 중 오류가 발생했습니다.",
      });
    }
  },
);

app.post("/api/chat/message", authenticateToken, async (req, res) => {
  try {
    const { roomId, message, mode, currentConceptId, imageBase64 } = req.body;
    const parsedRoomId = parseOptionalInteger(roomId);
    const parsedCurrentConceptId = parseOptionalInteger(currentConceptId);
    const trimmedMessage = typeof message === "string" ? message.trim() : "";
    const normalizedImageBase64 =
      typeof imageBase64 === "string" ? imageBase64.trim() : "";
    const hasImageAttachment = Boolean(normalizedImageBase64);

    if (parsedRoomId === null) {
      return res.status(400).json({
        success: false,
        message: "유효한 roomId가 필요합니다.",
      });
    }

    if (!trimmedMessage && !hasImageAttachment) {
      return res.status(400).json({
        success: false,
        message: "message 또는 imageBase64 중 하나는 필요합니다.",
      });
    }

    if (hasImageAttachment && !isImageDataUrl(normalizedImageBase64)) {
      return res.status(400).json({
        success: false,
        message: "imageBase64는 유효한 이미지 데이터 URL이어야 합니다.",
      });
    }

    if (!["hint", "solve"].includes(mode)) {
      return res.status(400).json({
        success: false,
        message: "mode는 hint 또는 solve여야 합니다.",
      });
    }

    const room = await getRoomByIdForUser(parsedRoomId, req.user.id);

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "존재하지 않는 채팅방입니다.",
      });
    }

    await saveChatMessage(
      parsedRoomId,
      "user",
      buildStoredUserMessage(trimmedMessage, hasImageAttachment),
      parsedCurrentConceptId,
    );

    const concepts = await db.all(
      `SELECT id, name, parent_id
       FROM concept_nodes
       ORDER BY id ASC`,
    );
    const conversationMessages = await getConversationMessages(parsedRoomId);
    const openAiMessages = applyLatestUserImageToMessages(
      [
        {
          role: "system",
          content: buildSystemPrompt(mode),
        },
        {
          role: "system",
          content: buildConceptGuide(concepts, parsedCurrentConceptId),
        },
        ...conversationMessages,
      ],
      trimmedMessage,
      normalizedImageBase64,
    );
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: mode === "hint" ? 0.7 : 0.2,
      messages: openAiMessages,
    });

    const rawAssistantContent = completion.choices[0]?.message?.content || "";
    const parsedAssistantResponse = parseAssistantJson(rawAssistantContent);
    const reply =
      typeof parsedAssistantResponse.reply === "string"
        ? parsedAssistantResponse.reply.trim()
        : "";

    if (!reply) {
      throw new Error("AI 답변 텍스트를 생성하지 못했습니다.");
    }

    const recommendedConceptId = resolveConceptId(
      parsedAssistantResponse.conceptId,
      parsedCurrentConceptId,
      concepts,
    );

    await saveChatMessage(
      parsedRoomId,
      "assistant",
      reply,
      recommendedConceptId,
    );

    return res.json({
      reply,
      conceptId: recommendedConceptId,
    });
  } catch (error) {
    console.error("Failed to process chat message:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: "AI 오답 노트 응답 생성 중 오류가 발생했습니다.",
    });
  }
});

app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);
  res.status(500).json({
    success: false,
    message: "서버 내부 오류가 발생했습니다.",
  });
});

async function startServer() {
  try {
    getJwtSecret();
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
      console.log(`SQLite database connected: ${DB_PATH}`);
      console.log(`Database initialized from: ${SCHEMA_PATH}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

async function shutdownServer(signal) {
  try {
    if (db) {
      await db.close();
    }
    console.log(`${signal} received. Server shutdown complete.`);
    process.exit(0);
  } catch (error) {
    console.error("Failed to close database connection:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  shutdownServer("SIGINT");
});

process.on("SIGTERM", () => {
  shutdownServer("SIGTERM");
});

startServer();
