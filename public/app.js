(function () {
  const state = {
    rooms: [],
    roomMessagesByRoomId: {},
    concepts: [],
    currentRoomId: null,
    currentConceptId: null,
    currentUser: null,
    authMode: "login",
    openRoomMenuId: null,
    isEmailVerified: false,
    verificationTimer: null,
    verificationRemaining: 0,
    verificationStatus: "idle",
    verifiedEmail: "",
    cy: null,
    isSending: false,
    toastTimer: null,
    uiOnlyMessagesByRoomId: {},
    pendingImageBase64: "",
    pendingImageName: "",
  };

  const ui = {};
  const ONBOARDING_MESSAGE =
    "안녕하세요! 저는 시냅스 AI 튜터입니다. 헷갈리는 문제나 개념을 물어보세요.";
  const THEME_STORAGE_KEY = "synapes-theme";

  document.addEventListener("DOMContentLoaded", initializeApp);

  async function initializeApp() {
    cacheElements();
    initializeTheme();
    bindEvents();
    setAuthMode(state.authMode);
    renderAttachmentPreview();
    renderRoomList();
    renderMessageList([]);
    updateModeChip();
    updateSelectedRoomChip();
    updateSelectedConceptChip();
    updateCurrentUserUi();

    const isAuthenticated = await initializeAuthSession();

    if (!isAuthenticated) {
      return;
    }

    await activateAuthenticatedSession(state.currentUser, {
      reloadData: true,
      focusInput: false,
    });
  }

  function cacheElements() {
    ui.appRoot = document.querySelector(".app-root");
    ui.appShell = document.getElementById("app-shell");
    ui.roomList = document.getElementById("room-list");
    ui.roomCount = document.getElementById("room-count");
    ui.newRoomButton = document.getElementById("new-room-button");
    ui.messageList = document.getElementById("message-list");
    ui.chatForm = document.getElementById("chat-form");
    ui.messageInput = document.getElementById("message-input");
    ui.sendButton = document.getElementById("send-button");
    ui.imageInput = document.getElementById("image-input");
    ui.imageUploadButton = document.getElementById("image-upload-button");
    ui.attachmentPreview = document.getElementById("attachment-preview");
    ui.attachmentThumbnail = document.getElementById("attachment-thumbnail");
    ui.attachmentFilename = document.getElementById("attachment-filename");
    ui.clearImageButton = document.getElementById("clear-image-button");
    ui.modeSelect = document.getElementById("mode-select");
    ui.modeChipLabel = document.getElementById("mode-chip-label");
    ui.selectedRoomChip = document.getElementById("selected-room-chip");
    ui.selectedConceptChip = document.getElementById("selected-concept-chip");
    ui.conceptPanelTitle = document.getElementById("concept-panel-title");
    ui.conceptPanelDescription = document.getElementById(
      "concept-panel-description",
    );
    ui.cyContainer = document.getElementById("cy");
    ui.toast = document.getElementById("toast");
    ui.sidebar = document.getElementById("sidebar");
    ui.sidebarBackdrop = document.getElementById("sidebar-backdrop");
    ui.conceptPanel = document.getElementById("concept-panel");
    ui.conceptBackdrop = document.getElementById("concept-backdrop");
    ui.openSidebarButton = document.getElementById("open-sidebar-button");
    ui.closeSidebarButton = document.getElementById("close-sidebar-button");
    ui.openConceptButton = document.getElementById("open-concept-button");
    ui.closeConceptButton = document.getElementById("close-concept-button");
    ui.settingsButton = document.getElementById("settings-button");
    ui.logoutButton = document.getElementById("logout-button");
    ui.currentUserLabel = document.getElementById("current-user-label");
    ui.themeToggleButton = document.getElementById("theme-toggle-button");
    ui.themeToggleIcon = document.getElementById("theme-toggle-icon");
    ui.themeToggleLabel = document.getElementById("theme-toggle-label");
    ui.authOverlay = document.getElementById("auth-overlay");
    ui.authForm = document.getElementById("auth-form");
    ui.authModeBadge = document.getElementById("auth-mode-badge");
    ui.authTitle = document.getElementById("auth-title");
    ui.authSubtitle = document.getElementById("auth-subtitle");
    ui.authEmailInput = document.getElementById("auth-email-input");
    ui.authSendVerificationButton = document.getElementById(
      "auth-send-verification-button",
    );
    ui.authVerificationField = document.getElementById(
      "auth-verification-field",
    );
    ui.authVerificationCodeInput = document.getElementById(
      "auth-verification-code-input",
    );
    ui.authVerifyCodeButton = document.getElementById(
      "auth-verify-code-button",
    );
    ui.authVerificationTimer = document.getElementById(
      "auth-verification-timer",
    );
    ui.authPasswordInput = document.getElementById("auth-password-input");
    ui.authPasswordConfirmField = document.getElementById(
      "auth-password-confirm-field",
    );
    ui.authPasswordConfirmInput = document.getElementById(
      "auth-password-confirm-input",
    );
    ui.authNicknameField = document.getElementById("auth-nickname-field");
    ui.authNicknameInput = document.getElementById("auth-nickname-input");
    ui.authSubmitButton = document.getElementById("auth-submit-button");
    ui.authModeToggleButton = document.getElementById(
      "auth-mode-toggle-button",
    );
  }

  function bindEvents() {
    ui.newRoomButton.addEventListener("click", handleCreateRoom);
    ui.chatForm.addEventListener("submit", handleSendMessage);
    ui.modeSelect.addEventListener("change", updateModeChip);
    ui.messageInput.addEventListener("input", autoResizeTextarea);
    ui.imageUploadButton.addEventListener("click", () => ui.imageInput.click());
    ui.imageInput.addEventListener("change", handleImageSelection);
    ui.clearImageButton.addEventListener("click", clearPendingImage);
    ui.themeToggleButton.addEventListener("click", handleThemeToggle);
    ui.roomList.addEventListener("click", handleRoomListClick);
    ui.openSidebarButton.addEventListener("click", () => openDrawer("sidebar"));
    ui.closeSidebarButton.addEventListener("click", () =>
      closeDrawer("sidebar"),
    );
    ui.sidebarBackdrop.addEventListener("click", () => closeDrawer("sidebar"));
    ui.openConceptButton.addEventListener("click", () => openDrawer("concept"));
    ui.closeConceptButton.addEventListener("click", () =>
      closeDrawer("concept"),
    );
    ui.conceptBackdrop.addEventListener("click", () => closeDrawer("concept"));
    ui.settingsButton.addEventListener("click", () => {
      showToast("설정 기능은 다음 단계에서 연결할 예정입니다.", "info");
    });
    if (ui.authForm) {
      ui.authForm.addEventListener("submit", handleAuthSubmit);
    }
    if (ui.authSendVerificationButton) {
      ui.authSendVerificationButton.addEventListener(
        "click",
        handleSendVerification,
      );
    }
    if (ui.authVerifyCodeButton) {
      ui.authVerifyCodeButton.addEventListener("click", handleVerifyCode);
    }
    if (ui.authEmailInput) {
      ui.authEmailInput.addEventListener("input", handleAuthEmailInput);
    }
    if (ui.authModeToggleButton) {
      ui.authModeToggleButton.addEventListener("click", handleAuthModeToggle);
    }
    if (ui.logoutButton) {
      ui.logoutButton.addEventListener("click", handleLogout);
    }
    document.addEventListener("click", handleDocumentClick);
    window.addEventListener("resize", handleWindowResize);
  }

  function initializeTheme() {
    applyTheme(getCurrentTheme(), { persist: false });
  }

  function getCurrentTheme() {
    return document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";
  }

  function handleThemeToggle() {
    applyTheme(getCurrentTheme() === "dark" ? "light" : "dark");
  }

  function applyTheme(theme, options = {}) {
    const { persist = true } = options;
    const root = document.documentElement;

    root.classList.toggle("dark", theme === "dark");

    if (persist) {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    }

    updateThemeToggleUi(theme);
    updateCytoscapeTheme(theme);
  }

  function updateThemeToggleUi(theme) {
    if (theme === "dark") {
      ui.themeToggleIcon.className = "fa-solid fa-sun";
      ui.themeToggleLabel.textContent = "라이트 모드";
      return;
    }

    ui.themeToggleIcon.className = "fa-solid fa-moon";
    ui.themeToggleLabel.textContent = "다크 모드";
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function isValidVerificationCode(value) {
    return /^\d{6}$/.test(value);
  }

  async function initializeAuthSession() {
    setAppInteractionLocked(true);
    showAuthOverlay();

    try {
      const result = await requestJson("/api/auth/me", {
        skipAuthHandling: true,
      });

      state.currentUser = result.data || null;
      updateCurrentUserUi();
      return Boolean(state.currentUser);
    } catch (error) {
      console.error(error);

      if (error.status && error.status !== 401) {
        showToast(error.message || "로그인 상태를 확인하지 못했습니다.");
      }

      enterLoggedOutState();
      return false;
    }
  }

  async function activateAuthenticatedSession(user, options = {}) {
    const { reloadData = true, focusInput = true } = options;

    state.currentUser = user;
    resetWorkspaceState();
    updateCurrentUserUi();
    hideAuthOverlay();
    setAppInteractionLocked(false);

    if (reloadData) {
      await Promise.all([loadConcepts(), loadRooms()]);
    }

    if (focusInput) {
      ui.messageInput.focus();
    }
  }

  function enterLoggedOutState() {
    state.currentUser = null;
    state.isSending = false;
    resetWorkspaceState();
    updateCurrentUserUi();
    setAuthMode("login");
    setAppInteractionLocked(true);
    showAuthOverlay();
    closeDrawer("sidebar");
    closeDrawer("concept");

    if (ui.sendButton) {
      ui.sendButton.disabled = false;
    }

    window.requestAnimationFrame(() => {
      if (ui.authEmailInput) {
        ui.authEmailInput.focus();
      }
    });
  }

  function resetWorkspaceState() {
    state.rooms = [];
    state.roomMessagesByRoomId = {};
    state.concepts = [];
    state.currentRoomId = null;
    state.currentConceptId = null;
    state.openRoomMenuId = null;
    state.uiOnlyMessagesByRoomId = {};
    clearPendingImage();
    renderRoomList();
    renderMessageList([]);
    updateSelectedRoomChip();
    updateSelectedConceptChip();

    if (state.cy) {
      state.cy.elements().remove();
      state.cy.resize();
    }
  }

  function stopVerificationTimer() {
    if (state.verificationTimer) {
      window.clearInterval(state.verificationTimer);
      state.verificationTimer = null;
    }
  }

  function formatVerificationTime(totalSeconds) {
    const safeSeconds = Math.max(0, totalSeconds);
    const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
    const seconds = String(safeSeconds % 60).padStart(2, "0");

    return `${minutes}:${seconds}`;
  }

  function updateVerificationUi() {
    const isSignup = state.authMode === "signup";
    const isVerified = state.isEmailVerified;

    if (ui.authVerificationField) {
      ui.authVerificationField.classList.toggle("hidden", !isSignup);
    }

    if (ui.authPasswordConfirmField) {
      ui.authPasswordConfirmField.classList.toggle("hidden", !isSignup);
    }

    if (ui.authPasswordConfirmInput) {
      ui.authPasswordConfirmInput.required = isSignup;
      ui.authPasswordConfirmInput.disabled = !isSignup;
    }

    if (ui.authSendVerificationButton) {
      ui.authSendVerificationButton.classList.toggle("hidden", !isSignup);
      ui.authSendVerificationButton.disabled = !isSignup || isVerified;
      ui.authSendVerificationButton.textContent = isVerified
        ? "인증 완료"
        : state.verificationStatus === "countdown"
          ? "재전송"
          : "인증번호 받기";
    }

    if (ui.authEmailInput) {
      ui.authEmailInput.disabled = isSignup && isVerified;
    }

    if (ui.authVerificationCodeInput) {
      ui.authVerificationCodeInput.disabled = !isSignup || isVerified;
    }

    if (ui.authVerifyCodeButton) {
      ui.authVerifyCodeButton.disabled = !isSignup || isVerified;
      ui.authVerifyCodeButton.textContent = isVerified ? "확인 완료" : "확인";
    }

    if (ui.authVerificationTimer) {
      ui.authVerificationTimer.classList.toggle(
        "is-expired",
        state.verificationStatus === "expired",
      );
      ui.authVerificationTimer.classList.toggle(
        "is-verified",
        state.verificationStatus === "verified",
      );

      if (!isSignup) {
        ui.authVerificationTimer.textContent = "03:00";
      } else if (state.verificationStatus === "verified") {
        ui.authVerificationTimer.textContent = "인증 완료";
      } else if (state.verificationStatus === "expired") {
        ui.authVerificationTimer.textContent = "인증 시간이 초과되었습니다";
      } else {
        ui.authVerificationTimer.textContent = formatVerificationTime(
          state.verificationRemaining || 180,
        );
      }
    }
  }

  function resetEmailVerificationState(options = {}) {
    const { clearCode = true, clearVerifiedEmail = true } = options;

    stopVerificationTimer();
    state.isEmailVerified = false;
    state.verificationRemaining = 0;
    state.verificationStatus = "idle";

    if (clearVerifiedEmail) {
      state.verifiedEmail = "";
    }

    if (clearCode && ui.authVerificationCodeInput) {
      ui.authVerificationCodeInput.value = "";
    }

    if (ui.authEmailInput) {
      ui.authEmailInput.disabled = false;
    }

    updateVerificationUi();
  }

  function startVerificationTimer(totalSeconds) {
    stopVerificationTimer();
    state.verificationRemaining = totalSeconds;
    state.verificationStatus = "countdown";
    updateVerificationUi();

    state.verificationTimer = window.setInterval(() => {
      state.verificationRemaining -= 1;

      if (state.verificationRemaining <= 0) {
        stopVerificationTimer();
        state.verificationRemaining = 0;
        state.verificationStatus = "expired";
        state.isEmailVerified = false;
        state.verifiedEmail = "";
        updateVerificationUi();
        return;
      }

      updateVerificationUi();
    }, 1000);
  }

  function setAppInteractionLocked(isLocked) {
    if (ui.appRoot) {
      ui.appRoot.classList.toggle("is-auth-locked", isLocked);
    }

    if (ui.appShell) {
      ui.appShell.setAttribute("aria-hidden", isLocked ? "true" : "false");
    }

    const interactiveTargets = [
      ui.newRoomButton,
      ui.messageInput,
      ui.sendButton,
      ui.imageUploadButton,
      ui.modeSelect,
      ui.settingsButton,
      ui.openSidebarButton,
      ui.openConceptButton,
      ui.logoutButton,
    ];

    interactiveTargets.forEach((element) => {
      if (!element) {
        return;
      }

      if (element === ui.logoutButton) {
        element.disabled = isLocked || !state.currentUser;
        return;
      }

      element.disabled = isLocked;
    });
  }

  function showAuthOverlay() {
    if (!ui.authOverlay) {
      return;
    }

    ui.authOverlay.hidden = false;
    ui.authOverlay.classList.add("is-visible");
  }

  function hideAuthOverlay() {
    if (!ui.authOverlay) {
      return;
    }

    ui.authOverlay.classList.remove("is-visible");
    ui.authOverlay.hidden = true;
  }

  function setAuthMode(mode) {
    const previousMode = state.authMode;
    const normalizedMode = mode === "signup" ? "signup" : "login";
    state.authMode = normalizedMode;

    if (!ui.authForm) {
      return;
    }

    const isSignup = normalizedMode === "signup";

    if (ui.authModeBadge) {
      ui.authModeBadge.textContent = isSignup ? "Sign Up" : "Login";
    }

    if (ui.authTitle) {
      ui.authTitle.textContent = isSignup
        ? "처음 시작하는 학습 계정을 만들어 보세요"
        : "이전 학습 세션으로 바로 이어가세요";
    }

    if (ui.authSubtitle) {
      ui.authSubtitle.textContent = isSignup
        ? "이메일과 닉네임을 등록하면 내 오답 세션과 개념 흐름이 개인 계정에 저장됩니다."
        : "로그인하면 저장된 세션과 개념 추천 흐름을 계속 이어서 볼 수 있습니다.";
    }

    if (ui.authNicknameField) {
      ui.authNicknameField.classList.toggle("hidden", !isSignup);
    }

    if (ui.authNicknameInput) {
      ui.authNicknameInput.required = isSignup;
    }

    if (previousMode !== normalizedMode) {
      resetEmailVerificationState();

      if (ui.authPasswordConfirmInput) {
        ui.authPasswordConfirmInput.value = "";
      }
    }

    updateVerificationUi();

    if (ui.authSubmitButton) {
      ui.authSubmitButton.textContent = isSignup
        ? "회원가입 후 시작하기"
        : "로그인하고 계속하기";
    }

    if (ui.authModeToggleButton) {
      ui.authModeToggleButton.textContent = isSignup
        ? "이미 계정이 있으신가요? 로그인"
        : "계정이 없으신가요? 회원가입";
    }
  }

  function updateCurrentUserUi() {
    if (ui.currentUserLabel) {
      ui.currentUserLabel.textContent = state.currentUser
        ? `${state.currentUser.nickname} 님으로 로그인됨`
        : "로그인 후 내 학습 세션을 저장하세요";
    }

    if (ui.logoutButton) {
      ui.logoutButton.disabled = !state.currentUser;
    }
  }

  function handleAuthModeToggle() {
    const nextMode = state.authMode === "login" ? "signup" : "login";
    setAuthMode(nextMode);

    window.requestAnimationFrame(() => {
      if (nextMode === "signup" && ui.authNicknameInput) {
        ui.authNicknameInput.focus();
        return;
      }

      if (ui.authEmailInput) {
        ui.authEmailInput.focus();
      }
    });
  }

  function handleAuthEmailInput() {
    if (!ui.authEmailInput) {
      return;
    }

    const normalizedEmail = ui.authEmailInput.value.trim().toLowerCase();

    if (
      state.isEmailVerified &&
      normalizedEmail &&
      normalizedEmail === state.verifiedEmail
    ) {
      return;
    }

    if (
      state.verificationStatus !== "idle" ||
      state.isEmailVerified ||
      state.verifiedEmail
    ) {
      resetEmailVerificationState({
        clearCode: true,
        clearVerifiedEmail: true,
      });
    }
  }

  async function handleSendVerification() {
    if (state.authMode !== "signup" || !ui.authEmailInput) {
      return;
    }

    const email = ui.authEmailInput.value.trim().toLowerCase();

    if (!isValidEmail(email)) {
      showToast("유효한 이메일을 입력해 주세요.");
      ui.authEmailInput.focus();
      return;
    }

    ui.authSendVerificationButton.disabled = true;

    try {
      await requestJson("/api/auth/send-verification", {
        method: "POST",
        body: JSON.stringify({ email }),
        skipAuthHandling: true,
      });

      state.isEmailVerified = false;
      state.verifiedEmail = "";
      state.verificationStatus = "countdown";

      if (ui.authVerificationCodeInput) {
        ui.authVerificationCodeInput.value = "";
      }

      startVerificationTimer(180);
      showToast("인증번호를 전송했습니다. 이메일을 확인해 주세요.", "success");
    } catch (error) {
      console.error(error);
      state.verificationStatus = "idle";
      updateVerificationUi();
      showToast(error.message || "인증번호 전송에 실패했습니다.");
    } finally {
      if (!state.isEmailVerified) {
        ui.authSendVerificationButton.disabled = false;
      }
      updateVerificationUi();
    }
  }

  async function handleVerifyCode() {
    if (
      state.authMode !== "signup" ||
      !ui.authEmailInput ||
      !ui.authVerificationCodeInput
    ) {
      return;
    }

    const email = ui.authEmailInput.value.trim().toLowerCase();
    const code = ui.authVerificationCodeInput.value.trim();

    if (!isValidEmail(email)) {
      showToast("유효한 이메일을 입력해 주세요.");
      ui.authEmailInput.focus();
      return;
    }

    if (!isValidVerificationCode(code)) {
      showToast("6자리 인증번호를 입력해 주세요.");
      ui.authVerificationCodeInput.focus();
      return;
    }

    ui.authVerifyCodeButton.disabled = true;

    try {
      await requestJson("/api/auth/verify-code", {
        method: "POST",
        body: JSON.stringify({ email, code }),
        skipAuthHandling: true,
      });

      stopVerificationTimer();
      state.isEmailVerified = true;
      state.verifiedEmail = email;
      state.verificationRemaining = 0;
      state.verificationStatus = "verified";
      updateVerificationUi();
      showToast("이메일 인증이 완료되었습니다.", "success");
    } catch (error) {
      console.error(error);
      ui.authVerifyCodeButton.disabled = false;
      updateVerificationUi();
      showToast(error.message || "인증번호 확인에 실패했습니다.");
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();

    const email = ui.authEmailInput.value.trim().toLowerCase();
    const password = ui.authPasswordInput.value;
    const passwordConfirm = ui.authPasswordConfirmInput
      ? ui.authPasswordConfirmInput.value
      : "";
    const nickname = ui.authNicknameInput
      ? ui.authNicknameInput.value.trim()
      : "";
    const isSignup = state.authMode === "signup";

    if (!email || !password || (isSignup && (!nickname || !passwordConfirm))) {
      showToast("이메일과 비밀번호를 입력해 주세요.");
      return;
    }

    if (isSignup && !state.isEmailVerified) {
      showToast("이메일 인증을 완료해 주세요");
      return;
    }

    if (isSignup && state.verifiedEmail !== email) {
      showToast("현재 이메일 기준으로 다시 인증해 주세요");
      return;
    }

    if (isSignup && password !== passwordConfirm) {
      showToast("비밀번호가 일치하지 않습니다");
      return;
    }

    ui.authSubmitButton.disabled = true;

    try {
      if (isSignup) {
        await requestJson("/api/auth/signup", {
          method: "POST",
          body: JSON.stringify({
            email,
            password,
            passwordConfirm,
            nickname,
          }),
          skipAuthHandling: true,
        });
      }

      const loginResult = await requestJson("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
        }),
        skipAuthHandling: true,
      });

      if (ui.authForm) {
        ui.authForm.reset();
      }

      resetEmailVerificationState();
      setAuthMode("login");
      await activateAuthenticatedSession(loginResult.data, {
        reloadData: true,
        focusInput: true,
      });
      showToast(
        isSignup
          ? "회원가입이 완료되어 바로 로그인했습니다."
          : "로그인되었습니다.",
        "success",
      );
    } catch (error) {
      console.error(error);
      showToast(error.message || "인증 처리 중 오류가 발생했습니다.");
    } finally {
      ui.authSubmitButton.disabled = false;
    }
  }

  async function handleLogout() {
    if (!state.currentUser) {
      return;
    }

    ui.logoutButton.disabled = true;

    try {
      await requestJson("/api/auth/logout", {
        method: "POST",
        skipAuthHandling: true,
      });
      window.location.reload();
    } catch (error) {
      console.error(error);
      ui.logoutButton.disabled = false;
      showToast(error.message || "로그아웃 중 오류가 발생했습니다.");
    }
  }

  async function handleImageSelection(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      clearPendingImage();
      showToast("이미지 파일만 첨부할 수 있습니다.");
      return;
    }

    try {
      const imageBase64 = await readFileAsDataUrl(file);
      state.pendingImageBase64 = imageBase64;
      state.pendingImageName = file.name || "첨부 이미지";
      ui.imageInput.value = "";
      renderAttachmentPreview();
      showToast("문제 이미지를 첨부했습니다.", "info");
    } catch (error) {
      console.error(error);
      clearPendingImage();
      showToast("이미지를 읽는 중 오류가 발생했습니다.");
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        resolve(typeof reader.result === "string" ? reader.result : "");
      };

      reader.onerror = () => {
        reject(new Error("파일을 읽을 수 없습니다."));
      };

      reader.readAsDataURL(file);
    });
  }

  function renderAttachmentPreview() {
    const hasImage = Boolean(state.pendingImageBase64);

    ui.attachmentPreview.classList.toggle("hidden", !hasImage);
    ui.attachmentPreview.classList.toggle("flex", hasImage);

    if (!hasImage) {
      ui.attachmentThumbnail.removeAttribute("src");
      ui.attachmentFilename.textContent = "";
      return;
    }

    ui.attachmentThumbnail.src = state.pendingImageBase64;
    ui.attachmentFilename.textContent = state.pendingImageName || "첨부 이미지";
  }

  function clearPendingImage() {
    state.pendingImageBase64 = "";
    state.pendingImageName = "";
    ui.imageInput.value = "";
    renderAttachmentPreview();
  }

  function buildOutgoingPreviewText(message, hasImage) {
    if (message && hasImage) {
      return `${message}\n[문제 이미지 첨부]`;
    }

    if (message) {
      return message;
    }

    return "문제 이미지가 첨부되었습니다.";
  }

  function getUiOnlyMessages(roomId) {
    if (!roomId) {
      return [];
    }

    return state.uiOnlyMessagesByRoomId[roomId] || [];
  }

  function hasCachedRoomMessages(roomId) {
    return Object.prototype.hasOwnProperty.call(
      state.roomMessagesByRoomId,
      roomId,
    );
  }

  function getCachedRoomMessages(roomId) {
    if (!roomId) {
      return [];
    }

    return state.roomMessagesByRoomId[roomId] || [];
  }

  function setCachedRoomMessages(roomId, messages) {
    if (!roomId) {
      return;
    }

    state.roomMessagesByRoomId[roomId] = messages;
  }

  function removeRoomLocalState(roomId) {
    if (!roomId) {
      return;
    }

    delete state.uiOnlyMessagesByRoomId[roomId];
    delete state.roomMessagesByRoomId[roomId];

    if (state.openRoomMenuId === roomId) {
      state.openRoomMenuId = null;
    }
  }

  function setUiOnlyMessages(roomId, messages) {
    if (!roomId) {
      return;
    }

    state.uiOnlyMessagesByRoomId[roomId] = messages;
  }

  function createOnboardingMessage() {
    return {
      sender_role: "system",
      content: ONBOARDING_MESSAGE,
      concept_node_id: null,
      created_at: new Date().toISOString(),
    };
  }

  async function createRoom(options = {}) {
    const { title, withOnboarding = false } = options;
    const payload = {};

    if (typeof title === "string" && title.trim()) {
      payload.title = title.trim();
    }

    const result = await requestJson("/api/chat/rooms", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const room = result.data;
    if (!room) {
      throw new Error("채팅방 생성 결과가 비어 있습니다.");
    }

    if (withOnboarding) {
      const onboardingMessages = [createOnboardingMessage()];
      setUiOnlyMessages(room.id, onboardingMessages);
      setCachedRoomMessages(room.id, onboardingMessages);
    }

    state.rooms = [room, ...state.rooms.filter((item) => item.id !== room.id)];
    renderRoomList();

    return room;
  }

  async function loadConcepts() {
    try {
      ui.conceptPanelTitle.textContent = "개념 트리 불러오는 중";
      const result = await requestJson("/api/concepts");
      state.concepts = Array.isArray(result.data) ? result.data : [];

      if (!state.currentConceptId && state.concepts.length > 0) {
        const rootConcept = state.concepts.find(
          (concept) => concept.parent_id === null,
        );
        state.currentConceptId = rootConcept
          ? rootConcept.id
          : state.concepts[0].id;
      }

      renderConceptTree();
      updateSelectedConceptChip();
    } catch (error) {
      console.error(error);
      ui.conceptPanelTitle.textContent = "개념 트리를 불러오지 못했습니다";
      ui.conceptPanelDescription.textContent =
        "서버 연결을 확인한 뒤 새로고침해 주세요.";
      showToast(error.message || "개념 트리 로딩에 실패했습니다.");
    }
  }

  async function loadRooms(options = {}) {
    const { createOnEmpty = true } = options;

    try {
      const result = await requestJson("/api/chat/rooms");
      state.rooms = Array.isArray(result.data) ? result.data : [];

      if (
        state.openRoomMenuId &&
        !state.rooms.some((room) => room.id === state.openRoomMenuId)
      ) {
        state.openRoomMenuId = null;
      }

      renderRoomList();

      if (state.rooms.length === 0) {
        if (!createOnEmpty) {
          state.currentRoomId = null;
          updateSelectedRoomChip();
          renderMessageList([]);
          return;
        }

        const onboardingRoom = await createRoom({ withOnboarding: true });
        await setActiveRoom(onboardingRoom.id);
        return;
      }

      const activeRoomExists = state.rooms.some(
        (room) => room.id === state.currentRoomId,
      );
      const targetRoomId = activeRoomExists
        ? state.currentRoomId
        : state.rooms[0].id;
      await setActiveRoom(targetRoomId);
    } catch (error) {
      console.error(error);
      renderRoomList();
      showToast(error.message || "채팅방 목록을 불러오지 못했습니다.");
    }
  }

  async function setActiveRoom(roomId) {
    state.currentRoomId = roomId;
    renderRoomList();
    updateSelectedRoomChip();
    closeDrawer("sidebar");
    await loadMessages(roomId);
  }

  async function loadMessages(roomId, options = {}) {
    const { render = true } = options;

    if (!roomId) {
      if (render) {
        renderMessageList([]);
      }
      return [];
    }

    try {
      if (render) {
        renderLoadingMessages();
      }

      const result = await requestJson(`/api/chat/rooms/${roomId}/messages`);
      const persistedMessages = Array.isArray(result.data) ? result.data : [];
      const mergedMessages = [
        ...getUiOnlyMessages(roomId),
        ...persistedMessages,
      ];
      setCachedRoomMessages(roomId, mergedMessages);

      if (render) {
        renderMessageList(mergedMessages);
      }

      return mergedMessages;
    } catch (error) {
      console.error(error);

      if (!render) {
        throw error;
      }

      renderMessageList(
        [],
        error.message || "메시지 내역을 불러오지 못했습니다.",
      );
      showToast(error.message || "메시지 내역을 불러오지 못했습니다.");
      return [];
    }
  }

  async function handleCreateRoom() {
    if (!state.currentUser) {
      enterLoggedOutState();
      return;
    }

    ui.newRoomButton.disabled = true;

    try {
      const room = await createRoom();
      await setActiveRoom(room.id);
      showToast("새 오답 세션을 만들었습니다.", "success");
    } catch (error) {
      console.error(error);
      showToast(error.message || "새 채팅방 생성에 실패했습니다.");
    } finally {
      ui.newRoomButton.disabled = false;
    }
  }

  async function handleSendMessage(event) {
    event.preventDefault();

    if (!state.currentUser) {
      enterLoggedOutState();
      return;
    }

    const message = ui.messageInput.value.trim();
    const imageBase64 = state.pendingImageBase64;
    const hasImage = Boolean(imageBase64);

    if ((!message && !hasImage) || state.isSending) {
      return;
    }

    state.isSending = true;
    ui.sendButton.disabled = true;

    try {
      let roomId = state.currentRoomId;
      if (!roomId) {
        const room = await createRoom({
          withOnboarding: state.rooms.length === 0,
        });
        roomId = room.id;
        await setActiveRoom(roomId);
      }

      appendPendingUserMessage(buildOutgoingPreviewText(message, hasImage));
      appendTypingIndicator();

      ui.messageInput.value = "";
      autoResizeTextarea();

      const result = await requestJson("/api/chat/message", {
        method: "POST",
        body: JSON.stringify({
          roomId,
          message,
          mode: ui.modeSelect.value,
          currentConceptId: state.currentConceptId,
          imageBase64,
        }),
      });

      if (result.conceptId) {
        selectConcept(result.conceptId, { animate: true });
      }

      clearPendingImage();
      await loadMessages(roomId);
      await refreshRoomsPreservingSelection();
    } catch (error) {
      console.error(error);
      if (message && !ui.messageInput.value) {
        ui.messageInput.value = message;
        autoResizeTextarea();
      }
      await loadMessages(state.currentRoomId);
      showToast(error.message || "메시지 전송 중 오류가 발생했습니다.");
    } finally {
      removeTypingIndicator();
      state.isSending = false;
      ui.sendButton.disabled = false;
      ui.messageInput.focus();
    }
  }

  async function refreshRoomsPreservingSelection() {
    try {
      const result = await requestJson("/api/chat/rooms");
      state.rooms = Array.isArray(result.data) ? result.data : [];

      if (
        state.openRoomMenuId &&
        !state.rooms.some((room) => room.id === state.openRoomMenuId)
      ) {
        state.openRoomMenuId = null;
      }

      renderRoomList();
      updateSelectedRoomChip();
    } catch (error) {
      console.error(error);
    }
  }

  async function handleRoomListClick(event) {
    if (!state.currentUser) {
      return;
    }

    const menuActionButton = event.target.closest("[data-room-menu-action]");

    if (menuActionButton) {
      const roomId = Number.parseInt(
        menuActionButton.dataset.roomMenuRoomId,
        10,
      );
      const action = menuActionButton.dataset.roomMenuAction;

      if (!Number.isNaN(roomId) && action) {
        await handleRoomMenuAction(action, roomId);
      }
      return;
    }

    const menuToggleButton = event.target.closest("[data-room-menu-toggle]");

    if (menuToggleButton) {
      const roomId = Number.parseInt(
        menuToggleButton.dataset.roomMenuToggle,
        10,
      );

      if (!Number.isNaN(roomId)) {
        toggleRoomMenu(roomId);
      }
      return;
    }

    const button = event.target.closest("button[data-room-id]");
    if (!button) {
      return;
    }

    const roomId = Number.parseInt(button.dataset.roomId, 10);
    if (!Number.isNaN(roomId) && roomId !== state.currentRoomId) {
      closeRoomMenu({ render: false });
      await setActiveRoom(roomId);
      return;
    }

    closeRoomMenu();
  }

  function handleDocumentClick(event) {
    if (!state.openRoomMenuId) {
      return;
    }

    if (
      event.target.closest("[data-room-menu-toggle]") ||
      event.target.closest("[data-room-menu]")
    ) {
      return;
    }

    closeRoomMenu();
  }

  function toggleRoomMenu(roomId) {
    state.openRoomMenuId = state.openRoomMenuId === roomId ? null : roomId;
    renderRoomList();
  }

  function closeRoomMenu(options = {}) {
    const { render = true } = options;

    if (state.openRoomMenuId === null) {
      return;
    }

    state.openRoomMenuId = null;

    if (render) {
      renderRoomList();
    }
  }

  function findRoomById(roomId) {
    return state.rooms.find((room) => room.id === roomId) || null;
  }

  async function getShareableMessages(roomId) {
    if (hasCachedRoomMessages(roomId)) {
      return getCachedRoomMessages(roomId);
    }

    return loadMessages(roomId, { render: false });
  }

  function buildShareText(room, messages) {
    const lines = messages.map((message) => {
      const senderRole = message.sender_role || message.role || "assistant";
      const roleLabel =
        senderRole === "user"
          ? "나"
          : senderRole === "assistant"
            ? "AI 튜터"
            : "시스템";

      return `${roleLabel}: ${message.content || ""}`.trim();
    });

    const title = room?.title || "새 오답 노트";
    const header = `[${title}]`;

    if (lines.length === 0) {
      return `${header}\n\n아직 저장된 대화가 없습니다.`;
    }

    return `${header}\n\n${lines.join("\n\n")}`;
  }

  async function handleRoomMenuAction(action, roomId) {
    const room = findRoomById(roomId);

    if (!room) {
      closeRoomMenu();
      return;
    }

    closeRoomMenu();

    try {
      if (action === "share") {
        const messages = await getShareableMessages(roomId);

        if (!navigator.clipboard || !navigator.clipboard.writeText) {
          throw new Error("클립보드 복사를 지원하지 않는 환경입니다.");
        }

        await navigator.clipboard.writeText(buildShareText(room, messages));
        showToast("대화 내역이 복사되었습니다", "success");
        await loadRooms({ createOnEmpty: false });
        return;
      }

      if (action === "rename") {
        const nextTitle = window.prompt(
          "새 세션 이름을 입력해 주세요.",
          room.title || "새 오답 노트",
        );

        if (nextTitle === null) {
          return;
        }

        const normalizedTitle = nextTitle.trim();

        if (!normalizedTitle) {
          showToast("세션 이름은 비워 둘 수 없습니다.");
          return;
        }

        await requestJson(`/api/chat/rooms/${roomId}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: normalizedTitle,
          }),
        });
        showToast("세션 이름을 변경했습니다.", "success");
        await loadRooms({ createOnEmpty: false });
        return;
      }

      if (action === "pin") {
        const result = await requestJson(`/api/chat/rooms/${roomId}/pin`, {
          method: "PATCH",
        });
        const isPinned = Number(result.data?.is_pinned) === 1;

        showToast(
          isPinned ? "세션을 고정했습니다." : "세션 고정을 해제했습니다.",
          "success",
        );
        await loadRooms({ createOnEmpty: false });
        return;
      }

      if (action === "delete") {
        const shouldDelete = window.confirm(
          "정말로 이 세션을 삭제하시겠습니까?",
        );

        if (!shouldDelete) {
          return;
        }

        await requestJson(`/api/chat/rooms/${roomId}`, {
          method: "DELETE",
        });

        removeRoomLocalState(roomId);

        if (state.currentRoomId === roomId) {
          state.currentRoomId = null;
        }

        showToast("세션을 삭제했습니다.", "success");
        await loadRooms({ createOnEmpty: false });
      }
    } catch (error) {
      console.error(error);
      showToast(error.message || "세션 관리 작업 중 오류가 발생했습니다.");
    }
  }

  function renderRoomList() {
    const rooms = state.rooms;
    ui.roomCount.textContent = String(rooms.length);

    if (rooms.length === 0) {
      state.openRoomMenuId = null;
    }

    if (rooms.length === 0) {
      ui.roomList.innerHTML = `
        <li class="state-card p-6 text-left">
          <p class="state-description">
            아직 세션이 없습니다. 새 오답 세션 버튼을 누르면 학습 기록이 자동으로 시작됩니다.
          </p>
        </li>
      `;
      return;
    }

    ui.roomList.innerHTML = rooms
      .map((room) => {
        const activeClass = room.id === state.currentRoomId ? "is-active" : "";
        const isPinned = Number(room.is_pinned) === 1;
        const isMenuOpen = state.openRoomMenuId === room.id;

        return `
          <li class="room-list-item">
            <div class="room-item-shell">
              <button class="room-button ${activeClass}" type="button" data-room-id="${room.id}">
                <div class="min-w-0">
                  <div class="room-title-row">
                    <p class="room-title truncate font-medium">${escapeHtml(room.title || "새 오답 노트")}</p>
                    ${isPinned ? '<span class="room-pin-indicator" aria-hidden="true"><i class="fa-solid fa-thumbtack"></i></span>' : ""}
                  </div>
                  <div class="room-meta-row mt-1">
                    <p class="room-meta text-xs">${escapeHtml(formatDateLabel(room.created_at))}</p>
                    <span class="room-id-badge text-[10px] uppercase tracking-[0.18em]">
                      #${room.id}
                    </span>
                  </div>
                </div>
              </button>

              <div class="room-menu-anchor">
                <button
                  class="room-menu-toggle ${isMenuOpen ? "is-open" : ""}"
                  type="button"
                  aria-label="세션 메뉴 열기"
                  aria-haspopup="menu"
                  aria-expanded="${isMenuOpen ? "true" : "false"}"
                  data-room-menu-toggle="${room.id}"
                >
                  <i class="fa-solid fa-ellipsis-vertical"></i>
                </button>

                ${
                  isMenuOpen
                    ? `
                  <div class="room-menu-popover" data-room-menu="${room.id}" role="menu">
                    <button class="room-menu-item" type="button" data-room-menu-action="share" data-room-menu-room-id="${room.id}">
                      <i class="fa-solid fa-share-nodes"></i>
                      <span>공유</span>
                    </button>
                    <button class="room-menu-item" type="button" data-room-menu-action="pin" data-room-menu-room-id="${room.id}">
                      <i class="fa-solid fa-thumbtack"></i>
                      <span>${isPinned ? "고정 해제" : "고정"}</span>
                    </button>
                    <button class="room-menu-item" type="button" data-room-menu-action="rename" data-room-menu-room-id="${room.id}">
                      <i class="fa-solid fa-pen"></i>
                      <span>이름 변경</span>
                    </button>
                    <button class="room-menu-item is-danger" type="button" data-room-menu-action="delete" data-room-menu-room-id="${room.id}">
                      <i class="fa-solid fa-trash"></i>
                      <span>삭제</span>
                    </button>
                  </div>
                `
                    : ""
                }
              </div>
            </div>
          </li>
        `;
      })
      .join("");
  }

  function renderLoadingMessages() {
    ui.messageList.innerHTML = `
      <div class="state-card">
        <div class="typing-dots"><span></span><span></span><span></span></div>
        <p class="state-description">대화 기록을 불러오는 중입니다.</p>
      </div>
    `;
  }

  function renderMessageList(messages, errorMessage) {
    if (errorMessage) {
      ui.messageList.innerHTML = `
        <div class="state-card error">
          <i class="fa-solid fa-triangle-exclamation text-2xl"></i>
          <p class="state-title text-lg">불러오기에 실패했습니다</p>
          <p class="state-description">${escapeHtml(errorMessage)}</p>
        </div>
      `;
      return;
    }

    if (!messages || messages.length === 0) {
      ui.messageList.innerHTML = `
        <div class="state-card">
          <span class="state-icon">
            <i class="fa-solid fa-brain text-xl"></i>
          </span>
          <h3 class="state-title">대화를 시작할 준비가 됐습니다</h3>
          <p class="state-description">
            왼쪽에서 세션을 선택하거나 새로 만든 뒤, 중앙 입력창에 막힌 문제나 개념 질문을 적어 보세요.
          </p>
        </div>
      `;
      return;
    }

    ui.messageList.innerHTML = messages
      .map((message) => buildMessageMarkup(message))
      .join("");

    scrollMessagesToBottom();
  }

  function buildMessageMarkup(message) {
    const senderRole = message.sender_role || message.role || "assistant";
    const roleLabel =
      senderRole === "user"
        ? "나"
        : senderRole === "assistant"
          ? "AI 튜터"
          : "시스템";
    const conceptName = findConceptName(message.concept_node_id);
    const dateLabel = message.created_at
      ? formatTimeLabel(message.created_at)
      : "방금";

    return `
      <article class="message-row ${senderRole}">
        <div class="message-card ${senderRole}">
          <div class="message-meta mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span class="message-role font-display font-semibold uppercase tracking-[0.18em]">${roleLabel}</span>
            <span>${escapeHtml(dateLabel)}</span>
            ${conceptName ? `<span class="message-concept-chip">${escapeHtml(conceptName)}</span>` : ""}
          </div>
          <div class="message-body text-[15px]">${escapeHtml(message.content || "")}</div>
        </div>
      </article>
    `;
  }

  function appendPendingUserMessage(content) {
    if (
      ui.messageList.firstElementChild &&
      ui.messageList.firstElementChild.matches("div")
    ) {
      ui.messageList.innerHTML = "";
    }

    ui.messageList.insertAdjacentHTML(
      "beforeend",
      buildMessageMarkup({
        sender_role: "user",
        content,
        concept_node_id: state.currentConceptId,
        created_at: new Date().toISOString(),
      }),
    );

    scrollMessagesToBottom();
  }

  function appendTypingIndicator() {
    removeTypingIndicator();

    ui.messageList.insertAdjacentHTML(
      "beforeend",
      `
        <article id="typing-indicator" class="message-row assistant">
          <div class="message-card assistant">
            <div class="message-role mb-3 text-xs font-display font-semibold uppercase tracking-[0.18em]">AI 튜터</div>
            <div class="typing-dots"><span></span><span></span><span></span></div>
          </div>
        </article>
      `,
    );

    scrollMessagesToBottom();
  }

  function removeTypingIndicator() {
    const indicator = document.getElementById("typing-indicator");
    if (indicator) {
      indicator.remove();
    }
  }

  function getThemePalette(theme = getCurrentTheme()) {
    if (theme === "dark") {
      return {
        coreBackground: "#2b3038",
        nodeBackground: "#2f3540",
        nodeBorder: "rgba(203, 213, 225, 0.22)",
        nodeText: "#f8fafc",
        edge: "rgba(148, 163, 184, 0.42)",
        selectedNode: "#f4a261",
        selectedBorder: "#ffd3bd",
        selectedText: "#fffaf6",
        activeEdge: "rgba(244, 162, 97, 0.84)",
      };
    }

    return {
      coreBackground: "#f8f5ef",
      nodeBackground: "#ffffff",
      nodeBorder: "rgba(100, 116, 139, 0.26)",
      nodeText: "#334155",
      edge: "rgba(100, 116, 139, 0.38)",
      selectedNode: "#f59b64",
      selectedBorder: "#ea7a3a",
      selectedText: "#fffaf5",
      activeEdge: "rgba(245, 155, 100, 0.82)",
    };
  }

  function buildCytoscapeStyles(palette) {
    return [
      {
        selector: "core",
        style: {
          "outside-texture-bg-color": palette.coreBackground,
          "outside-texture-bg-opacity": 1,
          "selection-box-color": palette.selectedNode,
          "selection-box-border-color": palette.selectedBorder,
          "selection-box-opacity": 0.18,
          "active-bg-color": palette.selectedNode,
          "active-bg-opacity": 0.1,
        },
      },
      {
        selector: "node",
        style: {
          label: "data(label)",
          width: 42,
          height: 42,
          "text-wrap": "wrap",
          "text-max-width": 112,
          "font-size": 11,
          color: palette.nodeText,
          "text-valign": "bottom",
          "text-margin-y": 8,
          "background-color": palette.nodeBackground,
          "border-width": 1.5,
          "border-color": palette.nodeBorder,
        },
      },
      {
        selector: "edge",
        style: {
          width: 2,
          "line-color": palette.edge,
          "target-arrow-shape": "triangle",
          "target-arrow-color": palette.edge,
          "curve-style": "bezier",
        },
      },
      {
        selector: "node.selected",
        style: {
          "background-color": palette.selectedNode,
          "border-color": palette.selectedBorder,
          color: palette.selectedText,
        },
      },
      {
        selector: "edge.active-path",
        style: {
          width: 3,
          "line-color": palette.activeEdge,
          "target-arrow-color": palette.activeEdge,
        },
      },
    ];
  }

  function updateCytoscapeTheme(theme = getCurrentTheme()) {
    if (!state.cy) {
      return;
    }

    const palette = getThemePalette(theme);
    ui.cyContainer.style.backgroundColor = palette.coreBackground;
    state.cy.style().fromJson(buildCytoscapeStyles(palette)).update();
    syncCySelection({ animate: false, focus: false });
  }

  function renderConceptTree() {
    if (!window.cytoscape) {
      ui.conceptPanelTitle.textContent = "Cytoscape 로딩 실패";
      ui.conceptPanelDescription.textContent =
        "네트워크 라이브러리가 로드되지 않았습니다.";
      return;
    }

    const elements = [];
    state.concepts.forEach((concept) => {
      elements.push({
        data: {
          id: String(concept.id),
          label: concept.name,
          parentId: concept.parent_id,
        },
      });

      if (concept.parent_id !== null) {
        elements.push({
          data: {
            id: `edge-${concept.parent_id}-${concept.id}`,
            source: String(concept.parent_id),
            target: String(concept.id),
          },
        });
      }
    });

    if (!state.cy) {
      state.cy = cytoscape({
        container: ui.cyContainer,
        elements,
        style: buildCytoscapeStyles(getThemePalette()),
        layout: {
          name: "breadthfirst",
          directed: true,
          padding: 22,
          spacingFactor: 1.25,
          animate: false,
        },
        minZoom: 0.45,
        maxZoom: 1.8,
      });

      state.cy.on("tap", "node", (event) => {
        const conceptId = Number.parseInt(event.target.id(), 10);
        selectConcept(conceptId, { animate: true });
      });
    } else {
      state.cy.elements().remove();
      state.cy.add(elements);
      updateCytoscapeTheme();
      state.cy
        .layout({
          name: "breadthfirst",
          directed: true,
          padding: 22,
          spacingFactor: 1.25,
          animate: false,
        })
        .run();
    }

    syncCySelection();
    refreshCyViewport();
  }

  function selectConcept(conceptId, options = {}) {
    state.currentConceptId = conceptId;
    updateSelectedConceptChip();
    syncCySelection(options);
  }

  function syncCySelection(options = {}) {
    if (!state.cy) {
      return;
    }

    state.cy.nodes().removeClass("selected");
    state.cy.edges().removeClass("active-path");

    if (state.currentConceptId === null) {
      return;
    }

    const targetNode = state.cy.getElementById(String(state.currentConceptId));
    if (!targetNode || targetNode.empty()) {
      return;
    }

    targetNode.addClass("selected");
    targetNode.connectedEdges().addClass("active-path");
    ui.conceptPanelTitle.textContent = targetNode.data("label");
    ui.conceptPanelDescription.textContent =
      "이 개념을 기준으로 AI 답변의 추천 개념 흐름을 유도합니다.";

    if (options.focus !== false) {
      focusConceptNode(targetNode, options.animate === true);
    }
  }

  function focusConceptNode(targetNode, shouldAnimate) {
    if (!state.cy || !targetNode || targetNode.empty()) {
      return;
    }

    const targetZoom = Math.min(
      state.cy.maxZoom(),
      Math.max(state.cy.zoom(), 1.15),
    );

    state.cy.stop();

    if (shouldAnimate) {
      state.cy.animate({
        center: { eles: targetNode },
        zoom: targetZoom,
        duration: 500,
        easing: "ease-in-out-cubic",
      });
      return;
    }

    state.cy.center(targetNode);
  }

  function updateModeChip() {
    ui.modeChipLabel.textContent =
      ui.modeSelect.value === "solve" ? "풀이 모드" : "힌트 모드";
  }

  function updateSelectedRoomChip() {
    const room = state.rooms.find((item) => item.id === state.currentRoomId);
    ui.selectedRoomChip.textContent = room
      ? `현재 세션: ${room.title}`
      : "세션을 선택하거나 새로 만드세요";
  }

  function updateSelectedConceptChip() {
    const conceptName = findConceptName(state.currentConceptId);

    ui.selectedConceptChip.textContent = conceptName
      ? `현재 개념: ${conceptName}`
      : "개념을 선택하면 추천 흐름이 더 정확해집니다";

    if (!conceptName) {
      ui.conceptPanelTitle.textContent = state.concepts.length
        ? "개념을 선택해 주세요"
        : "개념 로딩 중";
      ui.conceptPanelDescription.textContent =
        "트리에서 노드를 클릭하면 현재 학습 개념으로 선택됩니다.";
    }
  }

  function openDrawer(type) {
    if (type === "sidebar") {
      ui.sidebar.classList.add("is-open");
      ui.sidebarBackdrop.classList.add("is-visible");
      return;
    }

    ui.conceptPanel.classList.add("is-open");
    ui.conceptBackdrop.classList.add("is-visible");
    window.requestAnimationFrame(refreshCyViewport);
  }

  function closeDrawer(type) {
    if (type === "sidebar") {
      ui.sidebar.classList.remove("is-open");
      ui.sidebarBackdrop.classList.remove("is-visible");
      return;
    }

    ui.conceptPanel.classList.remove("is-open");
    ui.conceptBackdrop.classList.remove("is-visible");
  }

  function handleWindowResize() {
    if (window.innerWidth >= 1024) {
      closeDrawer("sidebar");
    }

    if (window.innerWidth >= 1280) {
      closeDrawer("concept");
    }

    refreshCyViewport();
  }

  function refreshCyViewport() {
    if (!state.cy) {
      return;
    }

    state.cy.resize();
    state.cy.fit(undefined, 34);
  }

  function autoResizeTextarea() {
    ui.messageInput.style.height = "0px";
    ui.messageInput.style.height = `${Math.min(ui.messageInput.scrollHeight, 220)}px`;
  }

  function findConceptName(conceptId) {
    if (conceptId === null || conceptId === undefined) {
      return "";
    }

    const concept = state.concepts.find(
      (item) => item.id === Number(conceptId),
    );
    return concept ? concept.name : "";
  }

  async function requestJson(url, options = {}) {
    const { skipAuthHandling = false, headers = {}, ...fetchOptions } = options;
    const response = await fetch(url, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      ...fetchOptions,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.success === false) {
      const message = payload.message || "요청 처리 중 오류가 발생했습니다.";
      const error = new Error(message);
      error.status = response.status;

      if (response.status === 401 && !skipAuthHandling) {
        enterLoggedOutState();
      }

      throw error;
    }

    return payload;
  }

  function showToast(message, type) {
    if (!message) {
      return;
    }

    ui.toast.textContent = message;
    ui.toast.classList.remove("hidden");
    ui.toast.style.borderColor =
      type === "success"
        ? "rgba(45, 212, 191, 0.35)"
        : type === "info"
          ? "rgba(56, 189, 248, 0.35)"
          : "rgba(251, 113, 133, 0.35)";

    if (state.toastTimer) {
      window.clearTimeout(state.toastTimer);
    }

    state.toastTimer = window.setTimeout(() => {
      ui.toast.classList.add("hidden");
    }, 2800);
  }

  function formatDateLabel(value) {
    if (!value) {
      return "방금 생성";
    }

    const date = new Date(value);
    return new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function formatTimeLabel(value) {
    if (!value) {
      return "방금";
    }

    const date = new Date(value);
    return new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function scrollMessagesToBottom() {
    ui.messageList.scrollTop = ui.messageList.scrollHeight;
  }
})();
