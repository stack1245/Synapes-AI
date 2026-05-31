(function () {
  const state = {
    rooms: [],
    concepts: [],
    currentRoomId: null,
    currentConceptId: null,
    cy: null,
    isSending: false,
    toastTimer: null,
    uiOnlyMessagesByRoomId: {},
  };

  const ui = {};
  const ONBOARDING_MESSAGE =
    "안녕하세요! 저는 시냅스 AI 튜터입니다. 헷갈리는 문제나 개념을 물어보세요.";

  document.addEventListener("DOMContentLoaded", initializeApp);

  async function initializeApp() {
    cacheElements();
    bindEvents();
    renderRoomList();
    renderMessageList([]);
    updateModeChip();
    updateSelectedRoomChip();
    updateSelectedConceptChip();

    await Promise.all([loadConcepts(), loadRooms()]);
  }

  function cacheElements() {
    ui.roomList = document.getElementById("room-list");
    ui.roomCount = document.getElementById("room-count");
    ui.newRoomButton = document.getElementById("new-room-button");
    ui.messageList = document.getElementById("message-list");
    ui.chatForm = document.getElementById("chat-form");
    ui.messageInput = document.getElementById("message-input");
    ui.sendButton = document.getElementById("send-button");
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
  }

  function bindEvents() {
    ui.newRoomButton.addEventListener("click", handleCreateRoom);
    ui.chatForm.addEventListener("submit", handleSendMessage);
    ui.modeSelect.addEventListener("change", updateModeChip);
    ui.messageInput.addEventListener("input", autoResizeTextarea);
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
    window.addEventListener("resize", handleWindowResize);
  }

  function getUiOnlyMessages(roomId) {
    if (!roomId) {
      return [];
    }

    return state.uiOnlyMessagesByRoomId[roomId] || [];
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
      setUiOnlyMessages(room.id, [createOnboardingMessage()]);
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

  async function loadRooms() {
    try {
      const result = await requestJson("/api/chat/rooms");
      state.rooms = Array.isArray(result.data) ? result.data : [];
      renderRoomList();

      if (state.rooms.length === 0) {
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

  async function loadMessages(roomId) {
    if (!roomId) {
      renderMessageList([]);
      return;
    }

    try {
      renderLoadingMessages();
      const result = await requestJson(`/api/chat/rooms/${roomId}/messages`);
      const persistedMessages = Array.isArray(result.data) ? result.data : [];
      const mergedMessages = [
        ...getUiOnlyMessages(roomId),
        ...persistedMessages,
      ];
      renderMessageList(mergedMessages);
    } catch (error) {
      console.error(error);
      renderMessageList(
        [],
        error.message || "메시지 내역을 불러오지 못했습니다.",
      );
      showToast(error.message || "메시지 내역을 불러오지 못했습니다.");
    }
  }

  async function handleCreateRoom() {
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

    const message = ui.messageInput.value.trim();
    if (!message || state.isSending) {
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

      appendPendingUserMessage(message);
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
        }),
      });

      if (result.conceptId) {
        selectConcept(result.conceptId, { animate: true });
      }

      await loadMessages(roomId);
      await refreshRoomsPreservingSelection();
    } catch (error) {
      console.error(error);
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
      renderRoomList();
      updateSelectedRoomChip();
    } catch (error) {
      console.error(error);
    }
  }

  function handleRoomListClick(event) {
    const button = event.target.closest("button[data-room-id]");
    if (!button) {
      return;
    }

    const roomId = Number.parseInt(button.dataset.roomId, 10);
    if (!Number.isNaN(roomId) && roomId !== state.currentRoomId) {
      setActiveRoom(roomId);
    }
  }

  function renderRoomList() {
    const rooms = state.rooms;
    ui.roomCount.textContent = String(rooms.length);

    if (rooms.length === 0) {
      ui.roomList.innerHTML = `
        <li class="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm leading-7 text-slate-400">
          아직 세션이 없습니다. 새 오답 세션 버튼을 눌러 첫 대화를 시작하세요.
        </li>
      `;
      return;
    }

    ui.roomList.innerHTML = rooms
      .map((room) => {
        const activeClass = room.id === state.currentRoomId ? "is-active" : "";

        return `
          <li>
            <button class="room-button ${activeClass}" type="button" data-room-id="${room.id}">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate font-medium text-white">${escapeHtml(room.title || "새 오답 노트")}</p>
                  <p class="mt-1 text-xs text-slate-400">${escapeHtml(formatDateLabel(room.created_at))}</p>
                </div>
                <span class="mt-0.5 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                  #${room.id}
                </span>
              </div>
            </button>
          </li>
        `;
      })
      .join("");
  }

  function renderLoadingMessages() {
    ui.messageList.innerHTML = `
      <div class="mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-4 rounded-[32px] border border-white/10 bg-white/[0.03] px-6 py-12 text-center text-slate-400">
        <div class="typing-dots"><span></span><span></span><span></span></div>
        <p>대화 기록을 불러오는 중입니다.</p>
      </div>
    `;
  }

  function renderMessageList(messages, errorMessage) {
    if (errorMessage) {
      ui.messageList.innerHTML = `
        <div class="mx-auto flex w-full max-w-3xl flex-col items-center justify-center rounded-[32px] border border-signal/25 bg-signal/10 px-6 py-12 text-center text-slate-200">
          <i class="fa-solid fa-triangle-exclamation text-2xl text-signal"></i>
          <p class="mt-4 text-base font-medium">${escapeHtml(errorMessage)}</p>
        </div>
      `;
      return;
    }

    if (!messages || messages.length === 0) {
      ui.messageList.innerHTML = `
        <div class="mx-auto flex w-full max-w-3xl flex-col items-center justify-center rounded-[32px] border border-white/10 bg-white/[0.03] px-6 py-12 text-center">
          <span class="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <i class="fa-solid fa-brain text-xl"></i>
          </span>
          <h3 class="mt-5 font-display text-2xl font-semibold text-white">대화를 시작할 준비가 됐습니다</h3>
          <p class="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
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
          <div class="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span class="font-display font-semibold uppercase tracking-[0.18em] text-slate-300">${roleLabel}</span>
            <span>${escapeHtml(dateLabel)}</span>
            ${conceptName ? `<span class="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">${escapeHtml(conceptName)}</span>` : ""}
          </div>
          <div class="message-body text-[15px] text-slate-100">${escapeHtml(message.content || "")}</div>
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
            <div class="mb-3 text-xs font-display font-semibold uppercase tracking-[0.18em] text-slate-300">AI 튜터</div>
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
        style: [
          {
            selector: "node",
            style: {
              label: "data(label)",
              width: 42,
              height: 42,
              "text-wrap": "wrap",
              "text-max-width": 112,
              "font-size": 11,
              color: "#e2e8f0",
              "text-valign": "bottom",
              "text-margin-y": 8,
              "background-color": "#162133",
              "border-width": 1.5,
              "border-color": "rgba(255,255,255,0.14)",
            },
          },
          {
            selector: "edge",
            style: {
              width: 2,
              "line-color": "rgba(148,163,184,0.35)",
              "target-arrow-shape": "triangle",
              "target-arrow-color": "rgba(148,163,184,0.35)",
              "curve-style": "bezier",
            },
          },
          {
            selector: "node.selected",
            style: {
              "background-color": "#2dd4bf",
              "border-color": "#99f6e4",
              color: "#ffffff",
            },
          },
          {
            selector: "edge.active-path",
            style: {
              width: 3,
              "line-color": "rgba(45,212,191,0.72)",
              "target-arrow-color": "rgba(45,212,191,0.72)",
            },
          },
        ],
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
    focusConceptNode(targetNode, options.animate === true);
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
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.success === false) {
      const message = payload.message || "요청 처리 중 오류가 발생했습니다.";
      throw new Error(message);
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
