require("dotenv").config();

const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const express = require("express");
const fs = require("fs/promises");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

// -----------------------------------------------------------------------------
// Application configuration and middleware
// -----------------------------------------------------------------------------

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DB_PATH = path.join(__dirname, "database.db");
const PUBLIC_DIR = path.join(__dirname, "public");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");
const GEMINI_MODEL =
  typeof process.env.GEMINI_MODEL === "string" &&
  process.env.GEMINI_MODEL.trim()
    ? process.env.GEMINI_MODEL.trim()
    : "gemini-2.5-flash";
const DEFAULT_ROOM_TITLE = "새 오답 노트";
const JWT_COOKIE_NAME = "synapes_auth_token";
const JWT_EXPIRES_IN = "7d";
const JWT_COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 7;
const BCRYPT_SALT_ROUNDS = 10;
const EMAIL_VERIFICATION_EXPIRES_MINUTES = 3;

let db;
let emailTransporter;

const tutorModePrompts = {
  hint: "너는 친절한 수학 튜터야. 정답을 절대 먼저 말하지 말고, 공식이나 개념적 힌트만 주며 학생이 스스로 생각하도록 소크라테스식 질문을 던져라.",
  solve:
    "너는 완벽한 수학 튜터야. 풀이 과정을 단계별로 상세하고 친절하게 설명해 줘.",
};

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(express.static(PUBLIC_DIR));

// -----------------------------------------------------------------------------
// Shared response and error helpers
// -----------------------------------------------------------------------------

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sendDataResponse(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

function sendMessageResponse(res, message, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
  });
}

function sendErrorResponse(res, statusCode, message) {
  return res.status(statusCode).json({
    success: false,
    message,
  });
}

function handleRouteError(res, error, logMessage, fallbackMessage) {
  console.error(logMessage, error);
  return sendErrorResponse(res, error.statusCode || 500, fallbackMessage);
}

// -----------------------------------------------------------------------------
// Input normalization and validation helpers
// -----------------------------------------------------------------------------

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

function normalizeVerificationCode(code) {
  if (code === null || code === undefined) {
    return "";
  }

  return String(code).trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidVerificationCode(code) {
  return /^\d{6}$/.test(code);
}

// -----------------------------------------------------------------------------
// Authentication and environment helpers
// -----------------------------------------------------------------------------

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw createHttpError(500, "JWT_SECRET이 설정되지 않았습니다.");
  }

  return process.env.JWT_SECRET;
}

function getEmailCredentials() {
  const emailUser =
    typeof process.env.EMAIL_USER === "string"
      ? process.env.EMAIL_USER.trim()
      : "";
  const emailPass =
    typeof process.env.EMAIL_PASS === "string"
      ? process.env.EMAIL_PASS.trim()
      : "";

  if (!emailUser || !emailPass) {
    throw createHttpError(
      500,
      "EMAIL_USER와 EMAIL_PASS가 설정되지 않았습니다.",
    );
  }

  return {
    emailUser,
    emailPass,
  };
}

function getGeminiApiKey() {
  const geminiApiKey =
    typeof process.env.GEMINI_API_KEY === "string"
      ? process.env.GEMINI_API_KEY.trim()
      : "";

  if (!geminiApiKey) {
    throw createHttpError(500, "GEMINI_API_KEY가 설정되지 않았습니다.");
  }

  return geminiApiKey;
}

function getBaseAuthCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

function getAuthCookieOptions() {
  return {
    ...getBaseAuthCookieOptions(),
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
  res.clearCookie(JWT_COOKIE_NAME, getBaseAuthCookieOptions());
}

function getEmailTransporter() {
  if (!emailTransporter) {
    const { emailUser, emailPass } = getEmailCredentials();

    emailTransporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: emailUser,
        pass: emailPass,
      },
      localAddress: "0.0.0.0",
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  return emailTransporter;
}

function buildVerificationExpiresAt() {
  return new Date(
    Date.now() + EMAIL_VERIFICATION_EXPIRES_MINUTES * 60 * 1000,
  ).toISOString();
}

function isExpiredTimestamp(value) {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return true;
  }

  return timestamp <= Date.now();
}

function isImageDataUrl(value) {
  return (
    typeof value === "string" &&
    /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value.trim())
  );
}

// -----------------------------------------------------------------------------
// AI prompt and response assembly helpers
// -----------------------------------------------------------------------------

function buildStoredUserMessage(message, hasImageAttachment) {
  if (message && hasImageAttachment) {
    return `${message}\n[문제 이미지 첨부]`;
  }

  if (message) {
    return message;
  }

  return "문제 이미지가 첨부되었습니다.";
}

function buildGeminiPromptText(message) {
  return (
    message || "첨부된 문제 이미지를 보고 수학 풀이 또는 힌트를 제공해 줘."
  );
}

function buildGeminiInlineImagePart(imageBase64) {
  if (!imageBase64) {
    return null;
  }

  const matchedImageData = imageBase64
    .trim()
    .match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);

  if (!matchedImageData) {
    const error = new Error(
      "imageBase64는 유효한 이미지 데이터 URL이어야 합니다.",
    );
    error.statusCode = 400;
    throw error;
  }

  return {
    inlineData: {
      mimeType: matchedImageData[1],
      data: matchedImageData[2].replace(/\s+/g, ""),
    },
  };
}

function buildGeminiUserParts(message, imageBase64) {
  const parts = [{ text: buildGeminiPromptText(message) }];
  const imagePart = buildGeminiInlineImagePart(imageBase64);

  if (imagePart) {
    parts.push(imagePart);
  }

  return parts;
}

function mapConversationRoleToGemini(role) {
  return role === "assistant" ? "model" : "user";
}

function buildGeminiMessages(conversationMessages, message, imageBase64) {
  const geminiMessages = conversationMessages.map((conversationMessage) => ({
    role: mapConversationRoleToGemini(conversationMessage.role),
    parts: [
      {
        text:
          typeof conversationMessage.content === "string"
            ? conversationMessage.content
            : "",
      },
    ],
  }));

  if (!imageBase64) {
    return geminiMessages;
  }

  const nextMessages = [...geminiMessages];

  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    if (nextMessages[index].role === "user") {
      nextMessages[index] = {
        role: "user",
        parts: buildGeminiUserParts(message, imageBase64),
      };
      return nextMessages;
    }
  }

  nextMessages.push({
    role: "user",
    parts: buildGeminiUserParts(message, imageBase64),
  });

  return nextMessages;
}

function buildSystemPrompt(mode) {
  const modePrompt = tutorModePrompts[mode] || tutorModePrompts.solve;

  return [
    modePrompt,
    "반드시 JSON 객체만 응답해라.",
    '응답 형식은 {"reply":"학생에게 보여줄 답변","conceptId":추천할 개념 노드 ID} 이다.',
    "reply는 한국어 문자열로 작성해라.",
    "conceptId는 반드시 제공된 개념 노드 목록에 있는 정수 ID 하나만 반환해라.",
    "★중요★ reply 내용에 줄바꿈이 필요할 경우 실제 줄바꿈(엔터)은 절대 사용하지 말고, 반드시 '\\n' 기호를 사용해서 이스케이프 처리해라.",
    "마크다운(```json 등) 포맷팅이나 부가 설명은 절대 추가하지 말고 오직 순수한 JSON 객체만 반환해라.",
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

  const normalizeCandidate = (value) =>
    value
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

  const sanitizeJsonStrings = (value) => {
    let result = "";
    let isInsideString = false;
    let isEscaped = false;

    for (const char of value) {
      if (isEscaped) {
        result += char;
        isEscaped = false;
        continue;
      }

      if (char === "\\") {
        result += char;
        if (isInsideString) {
          isEscaped = true;
        }
        continue;
      }

      if (char === '"') {
        result += char;
        isInsideString = !isInsideString;
        continue;
      }

      if (isInsideString && char === "\n") {
        result += "\\n";
        continue;
      }

      if (isInsideString && char === "\r") {
        result += "\\r";
        continue;
      }

      if (isInsideString && char === "\t") {
        result += "\\t";
        continue;
      }

      result += char;
    }

    return result;
  };

  const tryParseJsonObject = (value) => {
    try {
      const parsedValue = JSON.parse(
        sanitizeJsonStrings(normalizeCandidate(value)),
      );

      if (
        parsedValue &&
        typeof parsedValue === "object" &&
        !Array.isArray(parsedValue)
      ) {
        return { ok: true, value: parsedValue };
      }

      return {
        ok: false,
        error: new Error("AI 응답 JSON은 객체 형태여야 합니다."),
      };
    } catch (error) {
      return { ok: false, error };
    }
  };

  const extractJsonObjectCandidates = (value) => {
    const candidates = [];

    for (let startIndex = 0; startIndex < value.length; startIndex += 1) {
      if (value[startIndex] !== "{") {
        continue;
      }

      let depth = 0;
      let isInsideString = false;
      let isEscaped = false;

      for (let index = startIndex; index < value.length; index += 1) {
        const char = value[index];

        if (isEscaped) {
          isEscaped = false;
          continue;
        }

        if (char === "\\") {
          if (isInsideString) {
            isEscaped = true;
          }
          continue;
        }

        if (char === '"') {
          isInsideString = !isInsideString;
          continue;
        }

        if (isInsideString) {
          continue;
        }

        if (char === "{") {
          depth += 1;
          continue;
        }

        if (char === "}") {
          depth -= 1;

          if (depth === 0) {
            candidates.push(value.slice(startIndex, index + 1));
            break;
          }
        }
      }
    }

    return candidates;
  };

  const normalizedContent = normalizeCandidate(content);
  const directParseResult = tryParseJsonObject(normalizedContent);

  if (directParseResult.ok) {
    return directParseResult.value;
  }

  let lastError = directParseResult.error;

  for (const candidate of extractJsonObjectCandidates(normalizedContent)) {
    const parsedCandidate = tryParseJsonObject(candidate);

    if (parsedCandidate.ok) {
      return parsedCandidate.value;
    }

    lastError = parsedCandidate.error;
  }

  throw lastError || new Error("AI 응답에서 JSON 객체를 찾지 못했습니다.");
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

// -----------------------------------------------------------------------------
// Data access helpers
// -----------------------------------------------------------------------------

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

async function getUserById(userId) {
  return db.get(
    `SELECT id, email, password_hash, nickname, created_at, updated_at
     FROM users
     WHERE id = ?`,
    [userId],
  );
}

async function getUserByEmail(email) {
  return db.get(
    `SELECT id, email, password_hash, nickname, created_at, updated_at
     FROM users
     WHERE email = ?`,
    [email],
  );
}

async function saveEmailVerification(email, code, expiresAt) {
  await db.run(
    `DELETE FROM email_verifications
     WHERE email = ? OR expires_at <= ?`,
    [email, new Date().toISOString()],
  );

  return db.run(
    `INSERT INTO email_verifications (email, code, expires_at)
     VALUES (?, ?, ?)`,
    [email, code, expiresAt],
  );
}

async function getEmailVerificationByEmail(email) {
  return db.get(
    `SELECT id, email, code, expires_at
     FROM email_verifications
     WHERE email = ?
     ORDER BY id DESC
     LIMIT 1`,
    [email],
  );
}

async function deleteEmailVerificationById(id) {
  return db.run(
    `DELETE FROM email_verifications
     WHERE id = ?`,
    [id],
  );
}

async function sendVerificationEmail(email, code) {
  const transporter = getEmailTransporter();
  const { emailUser } = getEmailCredentials();

  return transporter.sendMail({
    from: emailUser,
    to: email,
    subject: "시냅스 AI 인증번호",
    text: `시냅스 AI 인증번호: ${code}`,
  });
}

async function getRoomByIdForUser(roomId, userId) {
  return db.get(
    `SELECT id, user_id, title, is_pinned, created_at, updated_at
     FROM chat_rooms
     WHERE id = ? AND user_id = ?`,
    [roomId, userId],
  );
}

async function requireOwnedRoom(res, roomIdValue, userId) {
  const roomId = parseOptionalInteger(roomIdValue);

  if (roomId === null) {
    sendErrorResponse(res, 400, "유효한 roomId가 필요합니다.");
    return null;
  }

  const room = await getRoomByIdForUser(roomId, userId);

  if (!room) {
    sendErrorResponse(res, 404, "존재하지 않는 채팅방입니다.");
    return null;
  }

  return { roomId, room };
}

async function ensureChatRoomsPinnedColumn() {
  const columns = await db.all(`PRAGMA table_info(chat_rooms)`);
  const hasPinnedColumn = columns.some((column) => column.name === "is_pinned");

  if (!hasPinnedColumn) {
    await db.exec(`
      ALTER TABLE chat_rooms
      ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0
    `);
  }
}

// -----------------------------------------------------------------------------
// Authentication middleware and database bootstrap
// -----------------------------------------------------------------------------

async function authenticateToken(req, res, next) {
  const token = req.cookies?.[JWT_COOKIE_NAME];

  if (!token) {
    return sendErrorResponse(res, 401, "로그인이 필요합니다.");
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    const userId = parseOptionalInteger(decoded?.id);

    if (userId === null) {
      clearAuthCookie(res);
      return sendErrorResponse(res, 401, "유효하지 않은 인증 정보입니다.");
    }

    const user = await getPublicUserById(userId);

    if (!user) {
      clearAuthCookie(res);
      return sendErrorResponse(res, 401, "존재하지 않는 사용자입니다.");
    }

    req.user = user;
    return next();
  } catch (error) {
    clearAuthCookie(res);
    return sendErrorResponse(
      res,
      401,
      "인증이 만료되었거나 유효하지 않습니다.",
    );
  }
}

async function initializeDatabase() {
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.verbose().Database,
  });

  const schemaSql = await fs.readFile(SCHEMA_PATH, "utf8");
  await db.exec(schemaSql);
  await ensureChatRoomsPinnedColumn();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS email_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_email_verifications_email
      ON email_verifications(email);
  `);
}

// -----------------------------------------------------------------------------
// Route handlers
// -----------------------------------------------------------------------------

app.get("/api/concepts", async (req, res) => {
  try {
    const concepts = await db.all(
      `SELECT id, name, parent_id
       FROM concept_nodes
       ORDER BY id ASC`,
    );

    return sendDataResponse(res, concepts);
  } catch (error) {
    return handleRouteError(
      res,
      error,
      "Failed to fetch concepts:",
      "개념 노드 조회 중 오류가 발생했습니다.",
    );
  }
});

// Demo-safe email verification flow. Keep the mocked 123456 flow unchanged.

app.post("/api/auth/send-verification", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "유효한 이메일이 필요합니다.",
      });
    }

    const verificationCode = "123456";
    const expiresAt = buildVerificationExpiresAt();

    await saveEmailVerification(email, verificationCode, expiresAt);

    return res.json({
      success: true,
      message: "인증번호가 발송되었습니다. (시연용 고정 번호: 123456)",
    });
  } catch (error) {
    console.error("Failed to send mock verification code:", error);

    return res.status(500).json({
      success: false,
      message: "인증번호 처리 중 오류가 발생했습니다.",
    });
  }
});

app.post("/api/auth/verify-code", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = normalizeVerificationCode(req.body?.code);

    if (!isValidEmail(email) || !isValidVerificationCode(code)) {
      return res.status(400).json({
        success: false,
        message: "유효한 이메일과 6자리 인증번호가 필요합니다.",
      });
    }

    const verification = await getEmailVerificationByEmail(email);

    if (!verification) {
      return res.status(400).json({
        success: false,
        message: "인증번호를 먼저 요청해 주세요.",
      });
    }

    if (isExpiredTimestamp(verification.expires_at)) {
      await deleteEmailVerificationById(verification.id);

      return res.status(400).json({
        success: false,
        message: "인증번호가 만료되었습니다. 다시 요청해 주세요.",
      });
    }

    if (verification.code !== code) {
      return res.status(400).json({
        success: false,
        message: "인증번호가 올바르지 않습니다.",
      });
    }

    await deleteEmailVerificationById(verification.id);

    return res.json({
      success: true,
      message: "이메일 인증이 완료되었습니다.",
    });
  } catch (error) {
    console.error("Failed to verify email code:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: "인증번호 확인 중 오류가 발생했습니다.",
    });
  }
});

// Authentication routes

app.post("/api/auth/signup", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    const passwordConfirm =
      typeof req.body?.passwordConfirm === "string"
        ? req.body.passwordConfirm
        : "";
    const nickname = normalizeNickname(req.body?.nickname);

    if (!isValidEmail(email) || !password || !passwordConfirm || !nickname) {
      return res.status(400).json({
        success: false,
        message: "유효한 이메일, 비밀번호, 비밀번호 확인, 닉네임이 필요합니다.",
      });
    }

    if (password !== passwordConfirm) {
      return res.status(400).json({
        success: false,
        message: "비밀번호와 비밀번호 확인이 일치하지 않습니다.",
      });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const result = await db.run(
      `INSERT INTO users (email, password_hash, nickname)
       VALUES (?, ?, ?)`,
      [email, passwordHash, nickname],
    );
    const user = await getPublicUserById(result.lastID);

    return sendDataResponse(res, user, 201);
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT") {
      return sendErrorResponse(res, 409, "이미 사용 중인 이메일입니다.");
    }

    return handleRouteError(
      res,
      error,
      "Failed to sign up user:",
      "회원가입 중 오류가 발생했습니다.",
    );
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";

    if (!isValidEmail(email) || !password) {
      return sendErrorResponse(
        res,
        400,
        "유효한 이메일과 비밀번호가 필요합니다.",
      );
    }

    const user = await getUserByEmail(email);

    if (!user) {
      return sendErrorResponse(
        res,
        401,
        "이메일 또는 비밀번호가 올바르지 않습니다.",
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return sendErrorResponse(
        res,
        401,
        "이메일 또는 비밀번호가 올바르지 않습니다.",
      );
    }

    setAuthCookie(res, user);

    return sendDataResponse(res, toPublicUser(user));
  } catch (error) {
    return handleRouteError(
      res,
      error,
      "Failed to log in user:",
      "로그인 중 오류가 발생했습니다.",
    );
  }
});

app.post("/api/auth/logout", (req, res) => {
  clearAuthCookie(res);

  return sendMessageResponse(res, "로그아웃되었습니다.");
});

app.get("/api/auth/me", authenticateToken, (req, res) => {
  return sendDataResponse(res, req.user);
});

app.put("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const nicknameProvided = typeof req.body?.nickname === "string";
    const nickname = normalizeNickname(req.body?.nickname);
    const currentPassword =
      typeof req.body?.currentPassword === "string"
        ? req.body.currentPassword
        : "";
    const newPassword =
      typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    const newPasswordConfirm =
      typeof req.body?.newPasswordConfirm === "string"
        ? req.body.newPasswordConfirm
        : "";
    const user = await getUserById(req.user.id);
    const shouldUpdateNickname =
      nicknameProvided && nickname !== user?.nickname;
    const shouldUpdatePassword = Boolean(newPassword);

    if (!user) {
      clearAuthCookie(res);
      return sendErrorResponse(res, 404, "존재하지 않는 사용자입니다.");
    }

    if (nicknameProvided && !nickname) {
      return sendErrorResponse(res, 400, "닉네임은 비워 둘 수 없습니다.");
    }

    if (!newPassword && (currentPassword || newPasswordConfirm)) {
      return sendErrorResponse(res, 400, "새 비밀번호를 함께 입력해 주세요.");
    }

    if (shouldUpdatePassword) {
      if (!currentPassword) {
        return sendErrorResponse(res, 400, "현재 비밀번호를 입력해 주세요.");
      }

      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        user.password_hash,
      );

      if (!isCurrentPasswordValid) {
        return sendErrorResponse(
          res,
          400,
          "현재 비밀번호가 올바르지 않습니다.",
        );
      }

      if (newPassword !== newPasswordConfirm) {
        return sendErrorResponse(
          res,
          400,
          "새 비밀번호와 비밀번호 확인이 일치하지 않습니다.",
        );
      }

      const nextPasswordHash = await bcrypt.hash(
        newPassword,
        BCRYPT_SALT_ROUNDS,
      );

      await db.run(
        `UPDATE users
         SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nextPasswordHash, req.user.id],
      );
    }

    if (shouldUpdateNickname) {
      await db.run(
        `UPDATE users
         SET nickname = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nickname, req.user.id],
      );
    }

    const updatedUser = await getPublicUserById(req.user.id);
    setAuthCookie(res, updatedUser);

    return sendDataResponse(res, updatedUser);
  } catch (error) {
    return handleRouteError(
      res,
      error,
      "Failed to update current user:",
      "내 정보 수정 중 오류가 발생했습니다.",
    );
  }
});

app.delete("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    await db.run(
      `DELETE FROM email_verifications
       WHERE email = ?`,
      [req.user.email],
    );

    const result = await db.run(
      `DELETE FROM users
       WHERE id = ?`,
      [req.user.id],
    );

    if (!result.changes) {
      clearAuthCookie(res);
      return sendErrorResponse(res, 404, "존재하지 않는 사용자입니다.");
    }

    clearAuthCookie(res);

    return sendMessageResponse(res, "회원 탈퇴가 완료되었습니다.");
  } catch (error) {
    return handleRouteError(
      res,
      error,
      "Failed to delete current user:",
      "회원 탈퇴 중 오류가 발생했습니다.",
    );
  }
});

// Chat routes

app.post("/api/chat/rooms", authenticateToken, async (req, res) => {
  try {
    const title = normalizeRoomTitle(req.body?.title);
    const result = await db.run(
      `INSERT INTO chat_rooms (user_id, title)
       VALUES (?, ?)`,
      [req.user.id, title],
    );
    const room = await getRoomByIdForUser(result.lastID, req.user.id);

    return sendDataResponse(res, room, 201);
  } catch (error) {
    return handleRouteError(
      res,
      error,
      "Failed to create chat room:",
      "채팅방 생성 중 오류가 발생했습니다.",
    );
  }
});

app.patch("/api/chat/rooms/:roomId", authenticateToken, async (req, res) => {
  try {
    const roomContext = await requireOwnedRoom(
      res,
      req.params.roomId,
      req.user.id,
    );

    if (!roomContext) {
      return;
    }

    const { roomId } = roomContext;

    const title = normalizeRoomTitle(req.body?.title);

    await db.run(
      `UPDATE chat_rooms
       SET title = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [title, roomId, req.user.id],
    );

    const updatedRoom = await getRoomByIdForUser(roomId, req.user.id);

    return sendDataResponse(res, updatedRoom);
  } catch (error) {
    return handleRouteError(
      res,
      error,
      "Failed to rename chat room:",
      "채팅방 이름 변경 중 오류가 발생했습니다.",
    );
  }
});

app.patch(
  "/api/chat/rooms/:roomId/pin",
  authenticateToken,
  async (req, res) => {
    try {
      const roomContext = await requireOwnedRoom(
        res,
        req.params.roomId,
        req.user.id,
      );

      if (!roomContext) {
        return;
      }

      const { roomId, room } = roomContext;

      const nextPinnedValue = Number(room.is_pinned) === 1 ? 0 : 1;

      await db.run(
        `UPDATE chat_rooms
         SET is_pinned = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [nextPinnedValue, roomId, req.user.id],
      );

      const updatedRoom = await getRoomByIdForUser(roomId, req.user.id);

      return sendDataResponse(res, updatedRoom);
    } catch (error) {
      return handleRouteError(
        res,
        error,
        "Failed to toggle chat room pin:",
        "채팅방 고정 상태 변경 중 오류가 발생했습니다.",
      );
    }
  },
);

app.delete("/api/chat/rooms/:roomId", authenticateToken, async (req, res) => {
  try {
    const roomContext = await requireOwnedRoom(
      res,
      req.params.roomId,
      req.user.id,
    );

    if (!roomContext) {
      return;
    }

    const { roomId } = roomContext;

    await db.run(
      `DELETE FROM chat_rooms
         WHERE id = ? AND user_id = ?`,
      [roomId, req.user.id],
    );

    return sendMessageResponse(res, "채팅방이 삭제되었습니다.");
  } catch (error) {
    return handleRouteError(
      res,
      error,
      "Failed to delete chat room:",
      "채팅방 삭제 중 오류가 발생했습니다.",
    );
  }
});

app.delete("/api/chat/rooms", authenticateToken, async (req, res) => {
  try {
    await db.run(
      `DELETE FROM chat_rooms
       WHERE user_id = ?`,
      [req.user.id],
    );

    return sendMessageResponse(res, "모든 채팅 세션이 초기화되었습니다.");
  } catch (error) {
    return handleRouteError(
      res,
      error,
      "Failed to delete all chat rooms:",
      "채팅 세션 초기화 중 오류가 발생했습니다.",
    );
  }
});

app.get("/api/chat/rooms", authenticateToken, async (req, res) => {
  try {
    const rooms = await db.all(
      `SELECT id, user_id, title, is_pinned, created_at, updated_at
       FROM chat_rooms
       WHERE user_id = ?
       ORDER BY is_pinned DESC, datetime(created_at) DESC, id DESC`,
      [req.user.id],
    );

    return sendDataResponse(res, rooms);
  } catch (error) {
    return handleRouteError(
      res,
      error,
      "Failed to fetch chat rooms:",
      "채팅방 목록 조회 중 오류가 발생했습니다.",
    );
  }
});

app.get(
  "/api/chat/rooms/:roomId/messages",
  authenticateToken,
  async (req, res) => {
    try {
      const roomContext = await requireOwnedRoom(
        res,
        req.params.roomId,
        req.user.id,
      );

      if (!roomContext) {
        return;
      }

      const { roomId } = roomContext;

      const messages = await db.all(
        `SELECT id, room_id, sender_role, content, concept_node_id, created_at
       FROM chat_messages
       WHERE room_id = ?
       ORDER BY datetime(created_at) ASC, id ASC`,
        [roomId],
      );

      return sendDataResponse(res, messages);
    } catch (error) {
      return handleRouteError(
        res,
        error,
        "Failed to fetch chat room messages:",
        "채팅 메시지 조회 중 오류가 발생했습니다.",
      );
    }
  },
);

app.post("/api/chat/message", authenticateToken, async (req, res) => {
  try {
    const {
      roomId: requestedRoomId,
      message,
      mode,
      currentConceptId,
      imageBase64,
    } = req.body;
    const parsedRoomId = parseOptionalInteger(requestedRoomId);
    const parsedCurrentConceptId = parseOptionalInteger(currentConceptId);
    const trimmedMessage = typeof message === "string" ? message.trim() : "";
    const normalizedImageBase64 =
      typeof imageBase64 === "string" ? imageBase64.trim() : "";
    const hasImageAttachment = Boolean(normalizedImageBase64);

    const roomContext = await requireOwnedRoom(res, parsedRoomId, req.user.id);

    if (!roomContext) {
      return;
    }

    const { roomId: validatedRoomId } = roomContext;

    if (!trimmedMessage && !hasImageAttachment) {
      return sendErrorResponse(
        res,
        400,
        "message 또는 imageBase64 중 하나는 필요합니다.",
      );
    }

    if (hasImageAttachment && !isImageDataUrl(normalizedImageBase64)) {
      return sendErrorResponse(
        res,
        400,
        "imageBase64는 유효한 이미지 데이터 URL이어야 합니다.",
      );
    }

    if (!["hint", "solve"].includes(mode)) {
      return sendErrorResponse(res, 400, "mode는 hint 또는 solve여야 합니다.");
    }

    await saveChatMessage(
      validatedRoomId,
      "user",
      buildStoredUserMessage(trimmedMessage, hasImageAttachment),
      parsedCurrentConceptId,
    );

    const concepts = await db.all(
      `SELECT id, name, parent_id
       FROM concept_nodes
       ORDER BY id ASC`,
    );
    const conversationMessages = await getConversationMessages(validatedRoomId);
    const geminiApiKey = getGeminiApiKey();

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const modelInstance = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: [
        buildSystemPrompt(mode),
        buildConceptGuide(concepts, parsedCurrentConceptId),
      ].join("\n\n"),
    });
    const geminiMessages = buildGeminiMessages(
      conversationMessages,
      trimmedMessage,
      normalizedImageBase64,
    );
    const response = await modelInstance.generateContent({
      contents: geminiMessages,
    });

    const rawAssistantContent = response.response.text();
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
      validatedRoomId,
      "assistant",
      reply,
      recommendedConceptId,
    );

    return res.json({
      reply,
      conceptId: recommendedConceptId,
    });
  } catch (error) {
    return handleRouteError(
      res,
      error,
      "Failed to process chat message:",
      "AI 오답 노트 응답 생성 중 오류가 발생했습니다.",
    );
  }
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  return handleRouteError(
    res,
    err,
    "Unhandled server error:",
    "서버 내부 오류가 발생했습니다.",
  );
});

// -----------------------------------------------------------------------------
// Application lifecycle
// -----------------------------------------------------------------------------

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
