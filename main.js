const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const titleEl = document.getElementById("game-title");
const tagsEl = document.getElementById("game-tags");
const descEl = document.getElementById("game-description");
const statsEl = document.getElementById("hud-stats");
const controlsEl = document.getElementById("hud-controls");
const tabEls = [...document.querySelectorAll(".game-tab")];
const roomBarEl = document.getElementById("room-bar");
const roomIdEl = document.getElementById("room-id");
const roomRoleEl = document.getElementById("room-role");
const inviteBtnEl = document.getElementById("invite-btn");
const playerQueueEl = document.getElementById("player-queue");

const keysDown = new Set();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function formatCountdown(ms) {
  const safe = Math.max(0, ms);
  const totalSeconds = Math.ceil(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function drawRoundedRect(x, y, w, h, r, fillStyle, strokeStyle) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  }
}

function fitCanvas() {
  const parent = canvas.parentElement;
  const rect = parent.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

const GAME_META = {
  tetris: {
    title: "俄罗斯方块",
    tags: ["房间 PK", "队列守擂", "双分屏观战"],
    description: [
      ["目标", "队列前两名自动上场 PK，时间结束时以高分决胜。"],
      ["房间", "复制邀请链接让其他玩家加入，同步昵称、队列和比赛状态。"],
      ["流转", "胜者守擂留在左侧，败者自动掉到队尾继续排队。"],
    ],
    controls: [
      ["移动", "← / →"],
      ["旋转", "↑"],
      ["软降", "↓"],
      ["硬降", "Space"],
      ["投降", "R"],
    ],
  },
  snake: {
    title: "贪吃蛇",
    tags: ["冲刺转向", "障碍增长", "连吃拿分"],
    description: [
      ["目标", "收集能量核心，避免撞墙和撞到自己。"],
      ["控制", "方向键转向，空格可快速推进。"],
      ["压力", "分数越高，刷新障碍越密集。"],
    ],
    controls: [
      ["方向", "↑ ↓ ← →"],
      ["冲刺", "Space"],
      ["重开", "R"],
    ],
  },
  tank: {
    title: "坦克大战",
    tags: ["双摇杆感", "敌人巡逻", "子弹反压"],
    description: [
      ["目标", "清除所有敌方坦克并守住生命值。"],
      ["控制", "方向键移动并转向，空格发射炮弹。"],
      ["挑战", "敌人会主动瞄准并回击。"],
    ],
    controls: [
      ["移动", "↑ ↓ ← →"],
      ["开火", "Space"],
      ["重开", "R"],
    ],
  },
  cat: {
    title: "围住神经猫",
    tags: ["六边形网格", "BFS 寻路", "逐步围堵"],
    description: [
      ["目标", "点击灰色圆点生成障碍，阻止神经猫逃到边缘外。"],
      ["机制", "每次点击后神经猫立即移动一步，并优先走最短逃生路径。"],
      ["胜负", "围死神经猫即胜利，若它从边缘成功跳出则失败。"],
    ],
    controls: [
      ["落子", "鼠标点击"],
      ["重开", "R"],
      ["提示", "观察猫下一步的逃生方向"],
    ],
  },
};

class TetrisEngine {
  constructor() {
    this.cols = 10;
    this.rows = 20;
    this.shapeDefs = {
      I: [[1, 1, 1, 1]],
      O: [
        [1, 1],
        [1, 1],
      ],
      T: [
        [0, 1, 0],
        [1, 1, 1],
      ],
      L: [
        [1, 0],
        [1, 0],
        [1, 1],
      ],
      J: [
        [0, 1],
        [0, 1],
        [1, 1],
      ],
      S: [
        [0, 1, 1],
        [1, 1, 0],
      ],
      Z: [
        [1, 1, 0],
        [0, 1, 1],
      ],
    };
    this.palette = {
      I: "#5df4c7",
      O: "#ffd86b",
      T: "#ff6f91",
      L: "#ff9e5d",
      J: "#79a8ff",
      S: "#6bf17f",
      Z: "#ff5d73",
    };
    this.reset();
  }

  reset() {
    this.board = Array.from({ length: this.rows }, () => Array(this.cols).fill(""));
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.gameOver = false;
    this.dropAccumulator = 0;
    this.moveCooldown = 0;
    this.softDrop = false;
    this.current = this.spawnPiece();
    this.next = this.randomPiece();
  }

  randomPiece() {
    const names = Object.keys(this.shapeDefs);
    const type = names[randomInt(0, names.length - 1)];
    return { type, matrix: this.shapeDefs[type].map((row) => [...row]) };
  }

  spawnPiece() {
    const piece = this.next || this.randomPiece();
    const matrix = piece.matrix.map((row) => [...row]);
    const x = Math.floor((this.cols - matrix[0].length) / 2);
    const spawned = { type: piece.type, matrix, x, y: 0 };
    if (this.collides(spawned, x, 0)) this.gameOver = true;
    return spawned;
  }

  rotate(matrix) {
    return matrix[0].map((_, index) => matrix.map((row) => row[index]).reverse());
  }

  collides(piece, nextX = piece.x, nextY = piece.y, nextMatrix = piece.matrix) {
    for (let y = 0; y < nextMatrix.length; y += 1) {
      for (let x = 0; x < nextMatrix[y].length; x += 1) {
        if (!nextMatrix[y][x]) continue;
        const boardX = nextX + x;
        const boardY = nextY + y;
        if (boardX < 0 || boardX >= this.cols || boardY >= this.rows) return true;
        if (boardY >= 0 && this.board[boardY][boardX]) return true;
      }
    }
    return false;
  }

  lockPiece() {
    const { matrix, x, y, type } = this.current;
    matrix.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (cell && y + rowIndex >= 0) this.board[y + rowIndex][x + colIndex] = type;
      });
    });
    this.clearLines();
    this.current = this.spawnPiece();
    this.next = this.randomPiece();
  }

  clearLines() {
    let cleared = 0;
    this.board = this.board.filter((row) => {
      const full = row.every(Boolean);
      if (full) cleared += 1;
      return !full;
    });
    while (this.board.length < this.rows) this.board.unshift(Array(this.cols).fill(""));
    if (cleared) {
      this.lines += cleared;
      this.score += [0, 100, 250, 450, 700][cleared] * this.level;
      this.level = 1 + Math.floor(this.lines / 8);
    }
  }

  hardDrop() {
    if (this.gameOver) return;
    while (!this.collides(this.current, this.current.x, this.current.y + 1)) {
      this.current.y += 1;
      this.score += 2;
    }
    this.lockPiece();
  }

  handleInput(dt) {
    this.moveCooldown -= dt;
    if (this.moveCooldown > 0 || this.gameOver) return;
    let acted = false;
    if (keysDown.has("ArrowLeft") && !this.collides(this.current, this.current.x - 1, this.current.y)) {
      this.current.x -= 1;
      acted = true;
    }
    if (keysDown.has("ArrowRight") && !this.collides(this.current, this.current.x + 1, this.current.y)) {
      this.current.x += 1;
      acted = true;
    }
    if (keysDown.has("ArrowUp")) {
      const rotated = this.rotate(this.current.matrix);
      if (!this.collides(this.current, this.current.x, this.current.y, rotated)) this.current.matrix = rotated;
      keysDown.delete("ArrowUp");
      acted = true;
    }
    if (keysDown.has(" ")) {
      this.hardDrop();
      keysDown.delete(" ");
      acted = true;
    }
    this.softDrop = keysDown.has("ArrowDown");
    if (acted) this.moveCooldown = 0.1;
  }

  update(dt, allowInput = true) {
    if (allowInput) this.handleInput(dt);
    if (this.gameOver) return;
    const speed = Math.max(0.08, 0.62 - (this.level - 1) * 0.045);
    this.dropAccumulator += dt;
    const dropEvery = this.softDrop ? 0.045 : speed;
    if (this.dropAccumulator >= dropEvery) {
      this.dropAccumulator = 0;
      if (!this.collides(this.current, this.current.x, this.current.y + 1)) {
        this.current.y += 1;
        if (this.softDrop) this.score += 1;
      } else {
        this.lockPiece();
      }
    }
  }

  drawPreview(piece, x, y, cellSize = 24) {
    piece.matrix.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (!cell) return;
        drawRoundedRect(
          x + colIndex * cellSize,
          y + rowIndex * cellSize,
          cellSize - 4,
          cellSize - 4,
          6,
          this.palette[piece.type],
          "rgba(255,255,255,0.24)"
        );
      });
    });
  }
  getSnapshot() {
    return {
      score: this.score,
      lines: this.lines,
      level: this.level,
      gameOver: this.gameOver,
      activePiece: this.current
        ? {
            type: this.current.type,
            x: this.current.x,
            y: this.current.y,
            matrix: this.current.matrix.map((row) => [...row]),
          }
        : null,
      nextPiece: this.next?.type ?? null,
      filledCells: this.board.flatMap((row, y) =>
        row.map((cell, x) => (cell ? { x, y, type: cell } : null)).filter(Boolean)
      ),
    };
  }
}

class TetrisGame {
  constructor() {
    this.engine = new TetrisEngine();
    this.playerColors = ["#5df4c7", "#ffd86b", "#ff8aa7", "#79a8ff", "#c9ff70", "#ffb86b"];
    this.storageKeyPrefix = "arcadia-grid-room";
    this.roomTtlMs = 20000;
    this.heartbeatMs = 2500;
    this.matchDurationMs = 5 * 60 * 1000;
    this.localPlayerId = sessionStorage.getItem("arcadia-player-id") || createId();
    sessionStorage.setItem("arcadia-player-id", this.localPlayerId);
    this.roomId = this.resolveRoomId();
    this.channel = "BroadcastChannel" in window ? new BroadcastChannel(`arcadia-room-${this.roomId}`) : null;
    this.channel?.addEventListener("message", (event) => this.handleRemoteState(event.data));
    window.addEventListener("storage", (event) => this.handleStorageEvent(event));
    window.addEventListener("beforeunload", () => this.leaveRoom());
    this.queueRenderState = null;
    this.lastRoundSeen = null;
    this.lastPublishedState = "";
    this.publishAccumulator = 0;
    this.roomState = this.readState();
    this.registerLocalPlayer();
    this.bindRoomUi();
    this.heartbeat = window.setInterval(() => this.refreshPresence(), this.heartbeatMs);
  }

  resolveRoomId() {
    const url = new URL(window.location.href);
    const existing = url.searchParams.get("room");
    if (existing) return existing.toUpperCase();
    const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
    url.searchParams.set("room", roomId);
    window.history.replaceState({}, "", url);
    return roomId;
  }

  bindRoomUi() {
    inviteBtnEl.addEventListener("click", async () => {
      const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${this.roomId}`;
      try {
        await navigator.clipboard.writeText(inviteUrl);
        inviteBtnEl.textContent = "已复制邀请链接";
      } catch {
        inviteBtnEl.textContent = inviteUrl;
      }
      window.setTimeout(() => {
        inviteBtnEl.textContent = "复制邀请链接";
      }, 1800);
    });

    playerQueueEl.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-action='rename-player']");
      if (!trigger) return;
      this.renameLocalPlayer();
    });
  }

  randomName() {
    const prefixes = ["霓虹", "量子", "回声", "流火", "折线", "极光", "向量", "蓝移"];
    const suffixes = ["方块手", "守擂者", "清行机", "挑战者", "跳帧猫", "偏移体", "控场员", "反应堆"];
    return `${prefixes[randomInt(0, prefixes.length - 1)]}${suffixes[randomInt(0, suffixes.length - 1)]}`;
  }

  makePlayer() {
    return {
      id: this.localPlayerId,
      name: localStorage.getItem(`arcadia-player-name-${this.roomId}`) || this.randomName(),
      color: this.playerColors[randomInt(0, this.playerColors.length - 1)],
      joinedAt: Date.now(),
      lastSeen: Date.now(),
    };
  }

  get storageKey() {
    return `${this.storageKeyPrefix}-${this.roomId}`;
  }

  getEmptyState() {
    return {
      roomId: this.roomId,
      players: [],
      queue: [],
      snapshots: {},
      activeMatch: null,
      roundCounter: 0,
      lastEvent: "等待第二位玩家加入后自动开赛",
      updatedAt: 0,
    };
  }

  readState() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return this.getEmptyState();
      return this.reconcileState(JSON.parse(raw));
    } catch {
      return this.getEmptyState();
    }
  }

  writeState(state) {
    const next = this.reconcileState(state);
    next.updatedAt = Date.now();
    localStorage.setItem(this.storageKey, JSON.stringify(next));
    this.roomState = next;
    this.channel?.postMessage(next);
    this.renderRoomUi();
  }

  handleRemoteState(remoteState) {
    if (!remoteState || remoteState.roomId !== this.roomId) return;
    if ((remoteState.updatedAt || 0) < (this.roomState.updatedAt || 0)) return;
    this.roomState = this.reconcileState(remoteState);
    this.renderRoomUi();
  }

  handleStorageEvent(event) {
    if (event.key !== this.storageKey || !event.newValue) return;
    this.handleRemoteState(JSON.parse(event.newValue));
  }

  reconcileState(state) {
    const now = Date.now();
    const next = state ? deepClone(state) : this.getEmptyState();
    next.players = (next.players || []).filter((player, index, list) => list.findIndex((item) => item.id === player.id) === index);
    next.players = next.players.filter((player) => now - (player.lastSeen || 0) < this.roomTtlMs);
    next.queue = (next.queue || []).filter((id, index, list) => list.indexOf(id) === index && next.players.some((player) => player.id === id));
    next.players
      .slice()
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .forEach((player) => {
        if (!next.queue.includes(player.id)) next.queue.push(player.id);
      });
    Object.keys(next.snapshots || {}).forEach((playerId) => {
      if (!next.players.some((player) => player.id === playerId)) delete next.snapshots[playerId];
    });
    if (
      next.activeMatch &&
      (!next.queue.includes(next.activeMatch.defenderId) || !next.queue.includes(next.activeMatch.challengerId))
    ) {
      next.activeMatch = null;
    }
    if (!next.activeMatch && next.queue.length >= 2) {
      next.roundCounter = (next.roundCounter || 0) + 1;
      next.activeMatch = {
        round: next.roundCounter,
        defenderId: next.queue[0],
        challengerId: next.queue[1],
        startedAt: now,
        durationMs: this.matchDurationMs,
      };
      next.lastEvent = `${this.getPlayerName(next, next.queue[0])} 守擂，迎战 ${this.getPlayerName(next, next.queue[1])}`;
    }
    return next;
  }

  mutateState(mutator) {
    const draft = this.readState();
    mutator(draft);
    this.writeState(draft);
  }

  registerLocalPlayer() {
    const localPlayer = this.makePlayer();
    this.mutateState((state) => {
      const existing = state.players.find((player) => player.id === this.localPlayerId);
      if (existing) {
        existing.lastSeen = Date.now();
        existing.name = localPlayer.name;
      } else {
        state.players.push(localPlayer);
        state.queue.push(localPlayer.id);
      }
    });
  }

  refreshPresence() {
    this.mutateState((state) => {
      const local = state.players.find((player) => player.id === this.localPlayerId);
      if (!local) {
        state.players.push(this.makePlayer());
        state.queue.push(this.localPlayerId);
      } else {
        local.lastSeen = Date.now();
      }
    });
  }

  leaveRoom() {
    window.clearInterval(this.heartbeat);
    this.mutateState((state) => {
      state.players = state.players.filter((player) => player.id !== this.localPlayerId);
      state.queue = state.queue.filter((id) => id !== this.localPlayerId);
      delete state.snapshots[this.localPlayerId];
      if (
        state.activeMatch &&
        (state.activeMatch.defenderId === this.localPlayerId || state.activeMatch.challengerId === this.localPlayerId)
      ) {
        state.activeMatch = null;
      }
    });
  }

  renameLocalPlayer() {
    const current = this.getLocalPlayer()?.name || "";
    const nextName = window.prompt("输入新的昵称", current);
    if (!nextName) return;
    const trimmed = nextName.trim().slice(0, 12);
    if (!trimmed) return;
    localStorage.setItem(`arcadia-player-name-${this.roomId}`, trimmed);
    this.mutateState((state) => {
      const local = state.players.find((player) => player.id === this.localPlayerId);
      if (local) local.name = trimmed;
      state.lastEvent = `${trimmed} 已更新昵称`;
    });
  }

  getLocalPlayer() {
    return this.roomState.players.find((player) => player.id === this.localPlayerId) || null;
  }

  getPlayerName(state, playerId) {
    return state.players.find((player) => player.id === playerId)?.name || "待加入玩家";
  }

  getPlayer(playerId) {
    return this.roomState.players.find((player) => player.id === playerId) || null;
  }

  getLocalRole() {
    const match = this.roomState.activeMatch;
    if (!match) return this.roomState.queue[0] === this.localPlayerId ? "waiting" : "spectator";
    if (match.defenderId === this.localPlayerId) return "defender";
    if (match.challengerId === this.localPlayerId) return "challenger";
    return "spectator";
  }

  isLocalActive() {
    return ["defender", "challenger"].includes(this.getLocalRole());
  }

  getRemainingMs() {
    const match = this.roomState.activeMatch;
    if (!match) return this.matchDurationMs;
    return match.startedAt + match.durationMs - Date.now();
  }

  resetForNewRound() {
    const match = this.roomState.activeMatch;
    if (!match) return;
    if (this.lastRoundSeen === match.round) return;
    this.lastRoundSeen = match.round;
    this.engine.reset();
    this.publishSnapshot(true);
  }

  resolveMatch(winnerId, reason) {
    this.mutateState((state) => {
      const match = state.activeMatch;
      if (!match) return;
      if (![match.defenderId, match.challengerId].includes(winnerId)) return;
      const loserId = winnerId === match.defenderId ? match.challengerId : match.defenderId;
      const middle = state.queue.filter((id) => id !== winnerId && id !== loserId);
      state.queue = [winnerId, ...middle, loserId];
      state.activeMatch = null;
      state.lastEvent = `${this.getPlayerName(state, winnerId)} 胜出，原因：${reason}`;
    });
  }

  publishSnapshot(force = false) {
    if (!this.isLocalActive()) return;
    const snapshot = {
      ...this.engine.getSnapshot(),
      playerId: this.localPlayerId,
      timestamp: Date.now(),
      name: this.getLocalPlayer()?.name || "玩家",
    };
    const serialized = JSON.stringify(snapshot);
    if (!force && serialized === this.lastPublishedState) return;
    this.lastPublishedState = serialized;
    this.mutateState((state) => {
      state.snapshots[this.localPlayerId] = snapshot;
    });
  }

  getRenderedSnapshot(playerId) {
    if (!playerId) return null;
    if (playerId === this.localPlayerId) {
      return {
        ...this.engine.getSnapshot(),
        playerId,
        name: this.getLocalPlayer()?.name || "玩家",
      };
    }
    return this.roomState.snapshots[playerId] || null;
  }

  maybeResolveByTimer() {
    const match = this.roomState.activeMatch;
    if (!match || this.getRemainingMs() > 0) return;
    const defender = this.getRenderedSnapshot(match.defenderId);
    const challenger = this.getRenderedSnapshot(match.challengerId);
    const defenderScore = defender?.score || 0;
    const challengerScore = challenger?.score || 0;
    const winnerId = defenderScore >= challengerScore ? match.defenderId : match.challengerId;
    this.resolveMatch(winnerId, "5 分钟倒计时结束，按分数判定");
  }

  update(dt) {
    this.roomState = this.readState();
    this.resetForNewRound();
    if (this.isLocalActive()) {
      if (keysDown.has("r") || keysDown.has("R")) {
        keysDown.delete("r");
        keysDown.delete("R");
        const match = this.roomState.activeMatch;
        const winnerId = match?.defenderId === this.localPlayerId ? match.challengerId : match?.defenderId;
        if (winnerId) this.resolveMatch(winnerId, "对手投降");
        return;
      }
      this.engine.update(dt, true);
      this.publishAccumulator += dt;
      if (this.publishAccumulator >= 0.08) {
        this.publishAccumulator = 0;
        this.publishSnapshot();
      }
      if (this.engine.gameOver) {
        const match = this.roomState.activeMatch;
        const winnerId = match?.defenderId === this.localPlayerId ? match.challengerId : match?.defenderId;
        if (winnerId) this.resolveMatch(winnerId, "对手提前 Game Over");
      }
    }
    this.maybeResolveByTimer();
  }

  drawBoardShell(label, player, snapshot, x, y, width, height, accentColor, controlled) {
    drawRoundedRect(x, y, width, height, 26, "rgba(7,14,26,0.88)", "rgba(255,255,255,0.08)");
    ctx.fillStyle = accentColor;
    ctx.font = "700 13px 'Space Grotesk'";
    ctx.fillText(label, x + 22, y + 30);
    ctx.fillStyle = "#eef4ff";
    ctx.font = "700 22px 'Noto Sans SC'";
    ctx.fillText(player?.name || "等待玩家", x + 22, y + 62);
    ctx.fillStyle = "#ffd86b";
    ctx.font = "700 22px 'Space Grotesk'";
    ctx.fillText(String(snapshot?.score || 0), x + width - 84, y + 62);
    ctx.font = "600 12px 'Space Grotesk'";
    ctx.fillText("SCORE", x + width - 92, y + 34);
    ctx.fillStyle = "#8ea4cb";
    ctx.font = "500 14px 'Noto Sans SC'";
    ctx.fillText(controlled ? "你正在操作该棋盘" : "观战同步视角", x + 22, y + 88);

    const boardTop = y + 112;
    const boardMaxHeight = height - 150;
    const boardMaxWidth = width * 0.46;
    const cell = Math.min(boardMaxHeight / this.engine.rows, boardMaxWidth / this.engine.cols);
    const boardWidth = cell * this.engine.cols;
    const boardHeight = cell * this.engine.rows;
    const boardX = x + 22;
    const nextX = boardX + boardWidth + 24;
    const nextWidth = Math.max(112, width - (nextX - x) - 22);

    drawRoundedRect(boardX - 14, boardTop - 14, boardWidth + 28, boardHeight + 28, 22, "rgba(3,8,18,0.82)", "rgba(255,255,255,0.06)");
    for (let row = 0; row < this.engine.rows; row += 1) {
      for (let col = 0; col < this.engine.cols; col += 1) {
        const filled = snapshot?.filledCells?.find((cellData) => cellData.x === col && cellData.y === row);
        drawRoundedRect(
          boardX + col * cell,
          boardTop + row * cell,
          cell - 2,
          cell - 2,
          7,
          filled ? this.engine.palette[filled.type] : "rgba(255,255,255,0.04)",
          "rgba(255,255,255,0.05)"
        );
      }
    }

    snapshot?.activePiece?.matrix?.forEach((row, rowIndex) => {
      row.forEach((filled, colIndex) => {
        if (!filled) return;
        drawRoundedRect(
          boardX + (snapshot.activePiece.x + colIndex) * cell,
          boardTop + (snapshot.activePiece.y + rowIndex) * cell,
          cell - 2,
          cell - 2,
          7,
          this.engine.palette[snapshot.activePiece.type],
          "rgba(255,255,255,0.22)"
        );
      });
    });

    drawRoundedRect(nextX, boardTop + 18, nextWidth, 120, 22, "rgba(255,255,255,0.05)", "rgba(255,255,255,0.08)");
    ctx.fillStyle = "#ffb86b";
    ctx.font = "700 13px 'Space Grotesk'";
    ctx.fillText("NEXT", nextX + 18, boardTop + 44);
    if (snapshot?.nextPiece) {
      this.engine.drawPreview(
        { type: snapshot.nextPiece, matrix: this.engine.shapeDefs[snapshot.nextPiece] },
        nextX + 18,
        boardTop + 62,
        20
      );
    } else {
      ctx.fillStyle = "#8ea4cb";
      ctx.font = "500 13px 'Noto Sans SC'";
      ctx.fillText("等待同步", nextX + 18, boardTop + 88);
    }

    ctx.fillStyle = "#8ea4cb";
    ctx.font = "500 13px 'Noto Sans SC'";
    ctx.fillText(`消行 ${snapshot?.lines || 0} 级别 ${snapshot?.level || 1}`, nextX + 18, boardTop + 168);
    if (snapshot?.gameOver) {
      drawRoundedRect(x + width / 2 - 110, y + height / 2 - 44, 220, 88, 20, "rgba(5,9,18,0.9)", "rgba(255,111,145,0.38)");
      ctx.fillStyle = "#ff6f91";
      ctx.font = "700 24px 'Space Grotesk'";
      ctx.fillText("GAME OVER", x + width / 2 - 74, y + height / 2 + 4);
    }
  }

  render(width, height) {
    this.renderRoomUi();
    ctx.fillStyle = "#08101d";
    ctx.fillRect(0, 0, width, height);

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "rgba(93,244,199,0.16)");
    gradient.addColorStop(1, "rgba(255,111,145,0.08)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const shellX = 28;
    const shellY = 24;
    const shellWidth = width - 56;
    const shellHeight = height - 48;
    const innerGap = 20;
    const panelWidth = (shellWidth - 56 - innerGap) / 2;
    const panelHeight = shellHeight - 64;
    const match = this.roomState.activeMatch;
    const defenderId = match?.defenderId || this.roomState.queue[0];
    const challengerId = match?.challengerId || this.roomState.queue[1];

    drawRoundedRect(shellX, shellY, shellWidth, shellHeight, 34, "rgba(4,8,18,0.78)", "rgba(255,255,255,0.08)");
    this.drawBoardShell(
      "CURRENT DEFENDER",
      this.getPlayer(defenderId),
      this.getRenderedSnapshot(defenderId),
      shellX + 18,
      shellY + 18,
      panelWidth,
      panelHeight,
      "#5df4c7",
      this.getLocalRole() === "defender"
    );
    this.drawBoardShell(
      "CURRENT CHALLENGER",
      this.getPlayer(challengerId),
      this.getRenderedSnapshot(challengerId),
      shellX + 18 + panelWidth + innerGap,
      shellY + 18,
      panelWidth,
      panelHeight,
      "#ffd86b",
      this.getLocalRole() === "challenger"
    );

    ctx.fillStyle = "#eef4ff";
    ctx.font = "700 16px 'Space Grotesk'";
    ctx.fillText(formatCountdown(this.getRemainingMs()), width / 2 - 34, shellY + 30);
    ctx.fillStyle = "#8ea4cb";
    ctx.font = "500 13px 'Noto Sans SC'";
    ctx.fillText(this.roomState.lastEvent || "等待比赛开始", shellX + 26, shellY + shellHeight - 16);
  }

  renderRoomUi() {
    roomIdEl.textContent = `ROOM ${this.roomId}`;
    const roleLabels = {
      defender: "你是当前擂主",
      challenger: "你是当前挑战者",
      spectator: "正在观战",
      waiting: "等待下一位玩家",
    };
    roomRoleEl.textContent = roleLabels[this.getLocalRole()] || "等待排位";
    const active = this.roomState.activeMatch;
    playerQueueEl.innerHTML = this.roomState.queue
      .map((playerId, index) => {
        const player = this.getPlayer(playerId);
        const isSelf = playerId === this.localPlayerId;
        const role =
          active?.defenderId === playerId ? "擂主" : active?.challengerId === playerId ? "挑战者" : `排队 ${index + 1}`;
        const actionAttr = isSelf ? `data-action="rename-player"` : "";
        const roleClass =
          active?.defenderId === playerId
            ? "is-active is-defender"
            : active?.challengerId === playerId
              ? "is-active is-challenger"
              : "";
        return `
          <div class="queue-player ${isSelf ? "is-self" : ""} ${roleClass}">
            <div class="queue-avatar" style="background:${player?.color || "#5df4c7"}">${(player?.name || "?").slice(0, 1)}</div>
            <button type="button" ${actionAttr}>
              <strong>${player?.name || "待加入玩家"}${isSelf ? " · 我" : ""}</strong>
              <small>${role}</small>
            </button>
          </div>
        `;
      })
      .join("");
  }

  getHudStats() {
    const match = this.roomState.activeMatch;
    return [
      ["房间号", this.roomId],
      ["在线人数", this.roomState.players.length],
      ["当前回合", match?.round || 0],
      ["剩余时间", formatCountdown(this.getRemainingMs())],
      ["当前状态", match ? this.roomState.lastEvent : "等待第二位玩家加入"],
      ["你的身份", roomRoleEl.textContent],
    ];
  }

  getTextState() {
    const match = this.roomState.activeMatch;
    return {
      mode: "tetris-multiplayer",
      coordinateSystem: "origin top-left, x right, y down, each board 10x20",
      roomId: this.roomId,
      localPlayerId: this.localPlayerId,
      role: this.getLocalRole(),
      queue: this.roomState.queue.map((playerId) => ({
        id: playerId,
        name: this.getPlayer(playerId)?.name || "待加入玩家",
      })),
      activeMatch: match
        ? {
            round: match.round,
            defenderId: match.defenderId,
            challengerId: match.challengerId,
            remainingMs: Math.max(0, this.getRemainingMs()),
          }
        : null,
      boards: {
        defender: this.getRenderedSnapshot(match?.defenderId || this.roomState.queue[0]) || null,
        challenger: this.getRenderedSnapshot(match?.challengerId || this.roomState.queue[1]) || null,
      },
    };
  }
}

class SnakeGame {
  constructor() {
    this.cols = 20;
    this.rows = 20;
    this.reset();
  }

  reset() {
    this.snake = [
      { x: 9, y: 10 },
      { x: 8, y: 10 },
      { x: 7, y: 10 },
    ];
    this.direction = { x: 1, y: 0 };
    this.pendingDirection = { x: 1, y: 0 };
    this.food = this.randomFreeCell();
    this.obstacles = [];
    this.score = 0;
    this.best = Number(localStorage.getItem("arcadia-snake-best") || 0);
    this.gameOver = false;
    this.moveAccumulator = 0;
  }

  randomFreeCell() {
    while (true) {
      const cell = { x: randomInt(0, this.cols - 1), y: randomInt(0, this.rows - 1) };
      const occupiedBySnake = this.snake?.some((part) => part.x === cell.x && part.y === cell.y);
      const occupiedByObstacle = this.obstacles?.some((part) => part.x === cell.x && part.y === cell.y);
      if (!occupiedBySnake && !occupiedByObstacle) return cell;
    }
  }

  addObstacle() {
    if (this.obstacles.length >= 18) return;
    this.obstacles.push(this.randomFreeCell());
  }

  handleInput() {
    const mapping = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    };
    Object.entries(mapping).forEach(([key, dir]) => {
      if (!keysDown.has(key)) return;
      if (this.direction.x + dir.x === 0 && this.direction.y + dir.y === 0) return;
      this.pendingDirection = dir;
    });
  }

  step() {
    if (this.gameOver) return;
    this.direction = this.pendingDirection;
    const nextHead = {
      x: this.snake[0].x + this.direction.x,
      y: this.snake[0].y + this.direction.y,
    };

    const hitWall = nextHead.x < 0 || nextHead.y < 0 || nextHead.x >= this.cols || nextHead.y >= this.rows;
    const hitBody = this.snake.some((part) => part.x === nextHead.x && part.y === nextHead.y);
    const hitObstacle = this.obstacles.some((part) => part.x === nextHead.x && part.y === nextHead.y);
    if (hitWall || hitBody || hitObstacle) {
      this.gameOver = true;
      return;
    }

    this.snake.unshift(nextHead);
    if (nextHead.x === this.food.x && nextHead.y === this.food.y) {
      this.score += 10;
      if (this.score % 30 === 0) this.addObstacle();
      this.food = this.randomFreeCell();
      this.best = Math.max(this.best, this.score);
      localStorage.setItem("arcadia-snake-best", String(this.best));
    } else {
      this.snake.pop();
    }
  }

  update(dt) {
    if (keysDown.has("r") || keysDown.has("R")) {
      keysDown.delete("r");
      keysDown.delete("R");
      this.reset();
      return;
    }
    this.handleInput();
    const tick = keysDown.has(" ") ? 0.05 : Math.max(0.08, 0.18 - this.score / 450);
    this.moveAccumulator += dt;
    if (this.moveAccumulator >= tick) {
      this.moveAccumulator = 0;
      this.step();
    }
  }

  render(width, height) {
    ctx.fillStyle = "#05101d";
    ctx.fillRect(0, 0, width, height);

    const shellX = 28;
    const shellY = 24;
    const shellWidth = width - 56;
    const shellHeight = height - 48;
    const boardSize = Math.min(shellHeight - 92, shellWidth - 96);
    const startX = shellX + (shellWidth - boardSize) / 2;
    const startY = shellY + 48;
    const cell = boardSize / this.cols;

    drawRoundedRect(shellX, shellY, shellWidth, shellHeight, 32, "rgba(8,18,35,0.84)", "rgba(255,255,255,0.08)");
    drawRoundedRect(startX - 16, startY - 16, boardSize + 32, boardSize + 32, 28, "rgba(8,18,35,0.68)", "rgba(255,255,255,0.05)");

    for (let y = 0; y < this.rows; y += 1) {
      for (let x = 0; x < this.cols; x += 1) {
        drawRoundedRect(
          startX + x * cell,
          startY + y * cell,
          cell - 2,
          cell - 2,
          8,
          (x + y) % 2 ? "rgba(93,244,199,0.06)" : "rgba(255,255,255,0.03)",
          null
        );
      }
    }

    this.obstacles.forEach((block) => {
      drawRoundedRect(
        startX + block.x * cell + 2,
        startY + block.y * cell + 2,
        cell - 6,
        cell - 6,
        10,
        "#ff6f91",
        "rgba(255,255,255,0.18)"
      );
    });

    drawRoundedRect(
      startX + this.food.x * cell + 4,
      startY + this.food.y * cell + 4,
      cell - 10,
      cell - 10,
      12,
      "#ffd86b",
      "rgba(255,255,255,0.24)"
    );

    this.snake.forEach((part, index) => {
      drawRoundedRect(
        startX + part.x * cell + 3,
        startY + part.y * cell + 3,
        cell - 8,
        cell - 8,
        10,
        index === 0 ? "#5df4c7" : "#79a8ff",
        "rgba(255,255,255,0.14)"
      );
    });

    drawRoundedRect(shellX + 26, shellY + shellHeight - 78, shellWidth - 52, 48, 18, "rgba(255,255,255,0.05)", "rgba(255,255,255,0.08)");
    ctx.fillStyle = "#ffd86b";
    ctx.font = "700 15px 'Space Grotesk'";
    ctx.fillText("FLOW", shellX + 48, shellY + shellHeight - 48);
    ctx.fillStyle = "#eef4ff";
    ctx.font = "500 14px 'Noto Sans SC'";
    ctx.fillText("吃到能量核心会变长，按 Space 可短时冲刺。", shellX + 120, shellY + shellHeight - 48);

    if (this.gameOver) {
      drawRoundedRect(width / 2 - 160, height / 2 - 80, 320, 150, 28, "rgba(5,9,18,0.88)", "rgba(255,111,145,0.4)");
      ctx.fillStyle = "#ff6f91";
      ctx.font = "700 30px 'Space Grotesk'";
      ctx.fillText("RUN ENDED", width / 2 - 86, height / 2 - 14);
      ctx.fillStyle = "#eef4ff";
      ctx.font = "500 16px 'Noto Sans SC'";
      ctx.fillText("按 R 再来一局", width / 2 - 56, height / 2 + 26);
    }
  }

  getHudStats() {
    return [
      ["分数", this.score],
      ["最高分", this.best],
      ["长度", this.snake.length],
      ["障碍数", this.obstacles.length],
      ["状态", this.gameOver ? "已结束" : "进行中"],
    ];
  }

  getTextState() {
    return {
      mode: "snake",
      coordinateSystem: "origin top-left, x right, y down, board 20x20",
      score: this.score,
      best: this.best,
      gameOver: this.gameOver,
      direction: this.direction,
      snake: this.snake,
      food: this.food,
      obstacles: this.obstacles,
    };
  }
}

class TankGame {
  constructor() {
    this.reset();
  }

  reset() {
    this.width = 960;
    this.height = 720;
    this.player = { x: 140, y: 360, size: 22, angle: 0, hp: 5, cooldown: 0 };
    this.enemies = Array.from({ length: 5 }, (_, index) => ({
      id: index + 1,
      x: 620 + (index % 2) * 120,
      y: 140 + index * 100,
      size: 22,
      angle: Math.PI,
      hp: 2,
      cooldown: 0.6 + index * 0.18,
      patrolDir: index % 2 === 0 ? 1 : -1,
    }));
    this.projectiles = [];
    this.score = 0;
    this.flash = 0;
    this.gameOver = false;
    this.win = false;
  }

  spawnBullet(owner, x, y, angle, speed) {
    this.projectiles.push({
      owner,
      x,
      y,
      angle,
      speed,
      life: 2.2,
      r: 5,
    });
  }

  updatePlayer(dt) {
    const speed = 190;
    let moveX = 0;
    let moveY = 0;
    if (keysDown.has("ArrowUp")) moveY -= 1;
    if (keysDown.has("ArrowDown")) moveY += 1;
    if (keysDown.has("ArrowLeft")) moveX -= 1;
    if (keysDown.has("ArrowRight")) moveX += 1;
    if (moveX || moveY) {
      this.player.angle = Math.atan2(moveY, moveX);
      const len = Math.hypot(moveX, moveY) || 1;
      this.player.x = clamp(this.player.x + (moveX / len) * speed * dt, 80, this.width - 80);
      this.player.y = clamp(this.player.y + (moveY / len) * speed * dt, 80, this.height - 80);
    }
    this.player.cooldown -= dt;
    if (keysDown.has(" ") && this.player.cooldown <= 0 && !this.gameOver && !this.win) {
      this.spawnBullet("player", this.player.x, this.player.y, this.player.angle, 380);
      this.player.cooldown = 0.35;
    }
  }

  updateEnemies(dt) {
    this.enemies.forEach((enemy) => {
      enemy.y += enemy.patrolDir * 48 * dt;
      if (enemy.y < 110 || enemy.y > this.height - 110) enemy.patrolDir *= -1;
      enemy.angle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
      enemy.cooldown -= dt;
      if (enemy.cooldown <= 0 && !this.gameOver && !this.win) {
        this.spawnBullet("enemy", enemy.x, enemy.y, enemy.angle, 260);
        enemy.cooldown = randomInt(9, 15) / 10;
      }
    });
  }

  updateProjectiles(dt) {
    this.projectiles.forEach((shot) => {
      shot.x += Math.cos(shot.angle) * shot.speed * dt;
      shot.y += Math.sin(shot.angle) * shot.speed * dt;
      shot.life -= dt;
    });
    this.projectiles = this.projectiles.filter((shot) => {
      if (shot.life <= 0 || shot.x < 0 || shot.y < 0 || shot.x > this.width || shot.y > this.height) return false;
      if (shot.owner === "player") {
        const hitEnemy = this.enemies.find((enemy) => Math.hypot(enemy.x - shot.x, enemy.y - shot.y) < enemy.size + shot.r);
        if (hitEnemy) {
          hitEnemy.hp -= 1;
          this.flash = 0.12;
          if (hitEnemy.hp <= 0) {
            this.score += 100;
            this.enemies = this.enemies.filter((enemy) => enemy.id !== hitEnemy.id);
          }
          return false;
        }
      } else {
        const hitPlayer = Math.hypot(this.player.x - shot.x, this.player.y - shot.y) < this.player.size + shot.r;
        if (hitPlayer) {
          this.player.hp -= 1;
          this.flash = 0.16;
          if (this.player.hp <= 0) this.gameOver = true;
          return false;
        }
      }
      return true;
    });
    if (!this.enemies.length) this.win = true;
  }

  update(dt) {
    if (keysDown.has("r") || keysDown.has("R")) {
      keysDown.delete("r");
      keysDown.delete("R");
      this.reset();
      return;
    }
    this.flash = Math.max(0, this.flash - dt);
    if (this.gameOver || this.win) return;
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
  }

  drawTank(unit, bodyColor, turretColor) {
    ctx.save();
    ctx.translate(unit.x, unit.y);
    ctx.rotate(unit.angle);
    drawRoundedRect(-unit.size, -unit.size + 4, unit.size * 2, unit.size * 2 - 8, 10, bodyColor, "rgba(255,255,255,0.2)");
    drawRoundedRect(-4, -6, unit.size + 18, 12, 5, turretColor, null);
    drawRoundedRect(-10, -10, 20, 20, 8, "rgba(255,255,255,0.1)", null);
    ctx.restore();
  }

  render(width, height) {
    ctx.fillStyle = this.flash > 0 ? "rgba(255,111,145,0.14)" : "#091321";
    ctx.fillRect(0, 0, width, height);

    const shellX = 28;
    const shellY = 24;
    const shellWidth = width - 56;
    const shellHeight = height - 48;

    for (let x = 0; x < width; x += 64) {
      for (let y = 0; y < height; y += 64) {
        drawRoundedRect(x + 8, y + 8, 48, 48, 12, (x + y) % 128 ? "rgba(255,255,255,0.03)" : "rgba(93,244,199,0.05)", null);
      }
    }

    drawRoundedRect(shellX, shellY, shellWidth, shellHeight, 32, "rgba(7,14,26,0.22)", "rgba(255,255,255,0.08)");

    this.drawTank(this.player, "#5df4c7", "#c2fff0");
    this.enemies.forEach((enemy) => this.drawTank(enemy, "#ff6f91", "#ffd7e1"));

    this.projectiles.forEach((shot) => {
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, shot.r, 0, Math.PI * 2);
      ctx.fillStyle = shot.owner === "player" ? "#ffd86b" : "#ff8aa7";
      ctx.fill();
    });

    ctx.fillStyle = "#eef4ff";
    ctx.font = "700 16px 'Space Grotesk'";
    ctx.fillText("COMBAT FIELD", shellX + 28, shellY + 28);
    ctx.font = "500 17px 'Noto Sans SC'";
    ctx.fillStyle = "#8ea4cb";
    ctx.fillText("边移动边开火，清空敌方单位。", shellX + 28, shellY + 56);

    drawRoundedRect(shellX + 24, shellY + shellHeight - 72, shellWidth - 48, 44, 18, "rgba(255,255,255,0.05)", "rgba(255,255,255,0.08)");
    ctx.fillStyle = "#ffd86b";
    ctx.font = "700 15px 'Space Grotesk'";
    ctx.fillText("TACTIC", shellX + 46, shellY + shellHeight - 44);
    ctx.fillStyle = "#eef4ff";
    ctx.font = "500 14px 'Noto Sans SC'";
    ctx.fillText("保持移动避免被集火，冷却结束后立即压制敌方火力。", shellX + 122, shellY + shellHeight - 44);

    if (this.win || this.gameOver) {
      drawRoundedRect(width / 2 - 170, height / 2 - 90, 340, 170, 28, "rgba(5,9,18,0.88)", this.win ? "rgba(93,244,199,0.45)" : "rgba(255,111,145,0.45)");
      ctx.fillStyle = this.win ? "#5df4c7" : "#ff6f91";
      ctx.font = "700 30px 'Space Grotesk'";
      ctx.fillText(this.win ? "AREA CLEARED" : "BASE LOST", width / 2 - 100, height / 2 - 18);
      ctx.fillStyle = "#eef4ff";
      ctx.font = "500 16px 'Noto Sans SC'";
      ctx.fillText("按 R 重新部署", width / 2 - 50, height / 2 + 20);
    }
  }

  getHudStats() {
    return [
      ["生命值", this.player.hp],
      ["敌人数量", this.enemies.length],
      ["分数", this.score],
      ["状态", this.win ? "胜利" : this.gameOver ? "失败" : "交战中"],
    ];
  }

  getTextState() {
    return {
      mode: "tank",
      coordinateSystem: "origin top-left, x right, y down, arena 960x720",
      score: this.score,
      gameOver: this.gameOver,
      win: this.win,
      player: {
        x: Number(this.player.x.toFixed(1)),
        y: Number(this.player.y.toFixed(1)),
        angle: Number(this.player.angle.toFixed(2)),
        hp: this.player.hp,
      },
      enemies: this.enemies.map((enemy) => ({
        id: enemy.id,
        x: Number(enemy.x.toFixed(1)),
        y: Number(enemy.y.toFixed(1)),
        angle: Number(enemy.angle.toFixed(2)),
        hp: enemy.hp,
      })),
      projectiles: this.projectiles.map((shot) => ({
        owner: shot.owner,
        x: Number(shot.x.toFixed(1)),
        y: Number(shot.y.toFixed(1)),
      })),
    };
  }
}

class CircleTheCatGame {
  constructor() {
    this.size = 11;
    this.radius = 18;
    this.verticalSpacing = 30;
    this.offsetX = 140;
    this.offsetY = 120;
    this.palette = {
      open: "#b8c5da",
      blocked: "#ff9f43",
      cat: "#1d2a44",
      catFace: "#f3f7ff",
      win: "#5df4c7",
      lose: "#ff6f91",
    };
    this.pointer = null;
    this.lastClicked = null;
    this.reset();
  }

  reset() {
    this.grid = Array.from({ length: this.size }, () => Array(this.size).fill(0));
    this.cat = { row: Math.floor(this.size / 2), col: Math.floor(this.size / 2) };
    this.status = "playing";
    this.message = "点击灰色圆点，围住神经猫。";
    this.turns = 0;
    this.lastEscapeRoute = [];
    this.lastMove = null;
    this.hoverCell = null;
    this.placeInitialBlocks();
  }

  placeInitialBlocks() {
    const blockedCount = randomInt(8, 12);
    let placed = 0;
    while (placed < blockedCount) {
      const row = randomInt(0, this.size - 1);
      const col = randomInt(0, this.size - 1);
      if ((row === this.cat.row && col === this.cat.col) || this.grid[row][col] === 1) continue;
      this.grid[row][col] = 1;
      placed += 1;
    }
  }

  isInside(row, col) {
    return row >= 0 && row < this.size && col >= 0 && col < this.size;
  }

  isEdge(row, col) {
    return row === 0 || col === 0 || row === this.size - 1 || col === this.size - 1;
  }

  getNeighbors(row, col) {
    this.updateLayout();
    const origin = this.getCellCenter(row, col);
    const maxNeighborDistance = this.radius * 2.12;
    const neighbors = [];

    for (let nextRow = Math.max(0, row - 1); nextRow <= Math.min(this.size - 1, row + 1); nextRow += 1) {
      for (let nextCol = Math.max(0, col - 1); nextCol <= Math.min(this.size - 1, col + 1); nextCol += 1) {
        if (nextRow === row && nextCol === col) continue;
        const center = this.getCellCenter(nextRow, nextCol);
        const distance = Math.hypot(center.x - origin.x, center.y - origin.y);
        if (distance <= maxNeighborDistance) neighbors.push({ row: nextRow, col: nextCol, distance });
      }
    }

    return neighbors
      .sort((a, b) => a.distance - b.distance || a.row - b.row || a.col - b.col)
      .slice(0, 6)
      .map(({ row: nextRow, col: nextCol }) => ({ row: nextRow, col: nextCol }));
  }

  isNeighbor(from, to) {
    return this.getNeighbors(from.row, from.col).some((cell) => cell.row === to.row && cell.col === to.col);
  }

  findShortestEscapePath() {
    const start = this.cat;
    const queue = [{ row: start.row, col: start.col, path: [{ row: start.row, col: start.col }] }];
    const visited = new Set([`${start.row},${start.col}`]);
    const edgePaths = [];

    while (queue.length) {
      const current = queue.shift();
      if (this.isEdge(current.row, current.col)) {
        edgePaths.push(current.path);
        continue;
      }

      this.getNeighbors(current.row, current.col).forEach((next) => {
        const key = `${next.row},${next.col}`;
        if (visited.has(key) || this.grid[next.row][next.col] === 1) return;
        visited.add(key);
        queue.push({
          row: next.row,
          col: next.col,
          path: [...current.path, next],
        });
      });
    }

    if (!edgePaths.length) return null;
    edgePaths.sort((a, b) => a.length - b.length || this.distanceToNearestEdge(a[a.length - 1]) - this.distanceToNearestEdge(b[b.length - 1]));
    return edgePaths[0];
  }

  distanceToNearestEdge(cell) {
    return Math.min(cell.row, cell.col, this.size - 1 - cell.row, this.size - 1 - cell.col);
  }

  chooseFallbackMove() {
    const moves = this.getNeighbors(this.cat.row, this.cat.col).filter(({ row, col }) => this.grid[row][col] === 0);
    if (!moves.length) return null;

    const scored = moves
      .map((move) => ({ move, score: this.distanceToNearestEdge(move) }))
      .sort((a, b) => a.score - b.score || Math.random() - 0.5);

    return scored[0].move;
  }

  moveCat() {
    const current = { ...this.cat };
    const path = this.findShortestEscapePath();
    this.lastEscapeRoute = path ? path.slice(1) : [];

    if (path && path.length > 1) {
      const next = path[1];
      if (!this.isNeighbor(current, next) || this.grid[next.row][next.col] === 1) {
        this.status = "trapped";
        this.lastMove = null;
        this.message = "检测到异常路径，已阻止神经猫穿墙。";
        return;
      }
      this.lastMove = next;
      this.cat = next;
      if (this.isEdge(next.row, next.col)) {
        this.status = "escaped";
        this.message = "神经猫冲到边缘并跳出了网格。";
      } else {
        this.message = "神经猫沿最短路径继续逃跑。";
      }
      return;
    }

    const fallback = this.chooseFallbackMove();
    if (fallback) {
      if (!this.isNeighbor(current, fallback) || this.grid[fallback.row][fallback.col] === 1) {
        this.status = "trapped";
        this.lastMove = null;
        this.message = "检测到异常路径，已阻止神经猫穿墙。";
        return;
      }
      this.lastMove = fallback;
      this.cat = fallback;
      this.message = "主路径封死，神经猫改走最后的活路。";
      if (this.isEdge(fallback.row, fallback.col)) {
        this.status = "escaped";
        this.message = "神经猫从边缘找到缺口，成功逃脱。";
      }
      return;
    }

    this.status = "trapped";
    this.lastMove = null;
    this.message = "神经猫被彻底围住了。";
  }

  getCellCenter(row, col) {
    this.updateLayout();
    const x = this.offsetX + col * this.radius * 2 + (row % 2 === 0 ? this.radius : 0);
    const y = this.offsetY + row * this.verticalSpacing;
    return { x, y };
  }

  updateLayout(width = canvas.getBoundingClientRect().width, height = canvas.getBoundingClientRect().height) {
    this.shellX = 28;
    this.shellY = 24;
    this.shellWidth = width - 56;
    this.shellHeight = height - 48;

    this.boardPanelX = this.shellX + 26;
    this.boardPanelY = this.shellY + 26;
    this.boardPanelWidth = this.shellWidth - 52;
    this.boardPanelHeight = this.shellHeight - 52;

    this.headerX = this.boardPanelX + 22;
    this.headerY = this.boardPanelY + 24;
    this.footerHeight = 68;
    this.gridAreaX = this.boardPanelX + 20;
    this.gridAreaY = this.boardPanelY + 84;
    this.gridAreaWidth = this.boardPanelWidth - 40;
    this.gridAreaHeight = this.boardPanelHeight - 124 - this.footerHeight;

    const horizontalPadding = 20;
    const verticalPadding = 20;
    const radiusByWidth = (this.gridAreaWidth - horizontalPadding * 2) / (this.size * 2 + 1);
    const radiusByHeight = (this.gridAreaHeight - verticalPadding * 2) / (2 + (this.size - 1) * 1.56);
    this.radius = Math.max(14, Math.min(19, radiusByWidth, radiusByHeight));
    this.verticalSpacing = this.radius * 1.56;

    const boardWidth = this.radius * (this.size * 2 + 1);
    const boardHeight = this.radius * 2 + (this.size - 1) * this.verticalSpacing;
    this.offsetX = this.gridAreaX + (this.gridAreaWidth - boardWidth) / 2 + this.radius;
    this.offsetY = this.gridAreaY + (this.gridAreaHeight - boardHeight) / 2 + this.radius;
  }

  findCellAtPoint(x, y) {
    this.updateLayout();
    for (let row = 0; row < this.size; row += 1) {
      for (let col = 0; col < this.size; col += 1) {
        const center = this.getCellCenter(row, col);
        if (Math.hypot(center.x - x, center.y - y) <= this.radius - 1) return { row, col };
      }
    }
    return null;
  }

  handlePointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    this.pointer = { x: localX, y: localY };
    this.hoverCell = this.findCellAtPoint(localX, localY);
  }

  handleClick(event) {
    if (activeGameId !== "cat" || this.status !== "playing") return;
    const rect = canvas.getBoundingClientRect();
    const cell = this.findCellAtPoint(event.clientX - rect.left, event.clientY - rect.top);
    if (!cell) return;
    if ((cell.row === this.cat.row && cell.col === this.cat.col) || this.grid[cell.row][cell.col] === 1) return;

    this.grid[cell.row][cell.col] = 1;
    this.lastClicked = cell;
    this.turns += 1;
    this.moveCat();
  }

  update() {
    if (keysDown.has("r") || keysDown.has("R")) {
      keysDown.delete("r");
      keysDown.delete("R");
      this.reset();
    }
  }

  render(width, height) {
    this.updateLayout(width, height);

    ctx.fillStyle = "#0a1425";
    ctx.fillRect(0, 0, width, height);

    const bgGradient = ctx.createRadialGradient(width * 0.5, height * 0.4, 80, width * 0.5, height * 0.4, width * 0.55);
    bgGradient.addColorStop(0, "rgba(93,244,199,0.16)");
    bgGradient.addColorStop(1, "rgba(10,20,37,0)");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    drawRoundedRect(
      this.shellX,
      this.shellY,
      this.shellWidth,
      this.shellHeight,
      34,
      "rgba(4,10,20,0.64)",
      "rgba(255,255,255,0.08)"
    );
    drawRoundedRect(
      this.boardPanelX,
      this.boardPanelY,
      this.boardPanelWidth,
      this.boardPanelHeight,
      30,
      "rgba(6,12,24,0.88)",
      "rgba(255,255,255,0.06)"
    );

    for (let row = 0; row < this.size; row += 1) {
      for (let col = 0; col < this.size; col += 1) {
        const center = this.getCellCenter(row, col);
        const isHover = this.hoverCell && this.hoverCell.row === row && this.hoverCell.col === col;
        const isCat = this.cat.row === row && this.cat.col === col;
        const blocked = this.grid[row][col] === 1;

        ctx.beginPath();
        ctx.arc(center.x, center.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = blocked ? this.palette.blocked : isHover && !isCat ? "#dbe5f4" : this.palette.open;
        ctx.fill();
        ctx.lineWidth = isHover && !blocked ? 3 : 1.5;
        ctx.strokeStyle = blocked ? "rgba(255,234,205,0.28)" : "rgba(14,24,40,0.18)";
        ctx.stroke();

        if (isCat) {
          ctx.beginPath();
          ctx.arc(center.x, center.y, this.radius - 5, 0, Math.PI * 2);
          ctx.fillStyle = this.status === "trapped" ? this.palette.win : this.palette.cat;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(center.x - 6, center.y - 3, 2.6, 0, Math.PI * 2);
          ctx.arc(center.x + 6, center.y - 3, 2.6, 0, Math.PI * 2);
          ctx.fillStyle = this.palette.catFace;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(center.x, center.y + 4, 5.5, 0, Math.PI);
          ctx.strokeStyle = this.palette.catFace;
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(center.x - 10, center.y - 12);
          ctx.lineTo(center.x - 5, center.y - 22);
          ctx.lineTo(center.x - 1, center.y - 12);
          ctx.moveTo(center.x + 10, center.y - 12);
          ctx.lineTo(center.x + 5, center.y - 22);
          ctx.lineTo(center.x + 1, center.y - 12);
          ctx.strokeStyle = this.palette.catFace;
          ctx.stroke();
        }
      }
    }

    ctx.fillStyle = "#eef4ff";
    ctx.font = "700 16px 'Space Grotesk'";
    ctx.fillText("TACTICAL BOARD", this.headerX, this.headerY);
    ctx.font = "500 17px 'Noto Sans SC'";
    ctx.fillStyle = "#90a5ca";
    ctx.fillText("点击灰色圆点布置障碍，猫每回合只会走一步。", this.headerX, this.headerY + 28);

    drawRoundedRect(
      this.boardPanelX + 18,
      this.boardPanelY + this.boardPanelHeight - this.footerHeight - 18,
      this.boardPanelWidth - 36,
      this.footerHeight,
      22,
      "rgba(255,255,255,0.05)",
      "rgba(255,255,255,0.08)"
    );
    ctx.fillStyle = this.status === "trapped" ? this.palette.win : this.status === "escaped" ? this.palette.lose : "#ffd86b";
    ctx.font = "700 16px 'Space Grotesk'";
    ctx.fillText(
      this.status === "trapped" ? "CAT TRAPPED" : this.status === "escaped" ? "CAT ESCAPED" : "NEXT DECISION",
      this.boardPanelX + 42,
      this.boardPanelY + this.boardPanelHeight - 48
    );
    ctx.fillStyle = "#eef4ff";
    ctx.font = "500 15px 'Noto Sans SC'";
    this.wrapText(
      this.message,
      this.boardPanelX + 196,
      this.boardPanelY + this.boardPanelHeight - 48,
      this.boardPanelWidth - 250,
      24
    );
  }

  wrapText(text, x, y, maxWidth, lineHeight) {
    let current = "";
    for (const char of text) {
      const next = current + char;
      if (ctx.measureText(next).width > maxWidth && current) {
        ctx.fillText(current, x, y);
        current = char;
        y += lineHeight;
      } else {
        current = next;
      }
    }
    if (current) ctx.fillText(current, x, y);
  }

  getHudStats() {
    const freeNeighbors = this.getNeighbors(this.cat.row, this.cat.col).filter(({ row, col }) => this.grid[row][col] === 0).length;
    return [
      ["回合数", this.turns],
      ["猫位置", `${this.cat.row}, ${this.cat.col}`],
      ["可走邻点", freeNeighbors],
      ["状态", this.status === "playing" ? "围堵中" : this.status === "trapped" ? "玩家获胜" : "神经猫逃脱"],
    ];
  }

  getTextState() {
    return {
      mode: "cat",
      coordinateSystem: "offset hex grid 11x11, row major, even rows shifted right by half cell",
      status: this.status,
      turns: this.turns,
      cat: this.cat,
      lastMove: this.lastMove,
      lastClicked: this.lastClicked,
      shortestEscapeRoute: this.lastEscapeRoute,
      blockedCells: this.grid.flatMap((row, rowIndex) =>
        row.map((cell, colIndex) => (cell === 1 ? { row: rowIndex, col: colIndex } : null)).filter(Boolean)
      ),
    };
  }
}

const games = {
  tetris: new TetrisGame(),
  snake: new SnakeGame(),
  tank: new TankGame(),
  cat: new CircleTheCatGame(),
};

let activeGameId = "tetris";
let lastTime = performance.now();
let layoutFrame = 0;

function renderInfo(gameId) {
  const meta = GAME_META[gameId];
  titleEl.textContent = meta.title;
  tagsEl.innerHTML = meta.tags.map((tag) => `<span>${tag}</span>`).join("");
  descEl.innerHTML = meta.description
    .map(([label, text]) => `<div class="desc-line"><strong>${label}</strong><span>${text}</span></div>`)
    .join("");
  controlsEl.innerHTML = meta.controls
    .map(([label, text]) => `<div class="control-line"><strong>${label}</strong><span>${text}</span></div>`)
    .join("");
  tabEls.forEach((tab) => tab.classList.toggle("active", tab.dataset.game === gameId));
  roomBarEl.hidden = gameId !== "tetris";
  if (gameId === "tetris") games.tetris.renderRoomUi();
}

function updateHud() {
  const stats = games[activeGameId].getHudStats();
  statsEl.innerHTML = stats
    .map(([label, value]) => `<div class="stat-line"><strong>${label}</strong><span>${value}</span></div>`)
    .join("");
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  games[activeGameId].render(rect.width, rect.height);
  updateHud();
}

function refreshLayout() {
  layoutFrame = 0;
  fitCanvas();
  draw();
}

function scheduleLayoutRefresh() {
  if (layoutFrame) return;
  layoutFrame = requestAnimationFrame(refreshLayout);
}

function tick(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  games[activeGameId].update(dt);
  draw();
  requestAnimationFrame(tick);
}

function switchGame(gameId) {
  activeGameId = gameId;
  renderInfo(gameId);
  draw();
}

tabEls.forEach((tab) => {
  tab.addEventListener("click", () => switchGame(tab.dataset.game));
});

canvas.addEventListener("mousemove", (event) => {
  const game = games.cat;
  game.handlePointerMove(event);
});

canvas.addEventListener("click", (event) => {
  const game = games.cat;
  game.handleClick(event);
  if (activeGameId === "cat") draw();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "f" || event.key === "F") {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    return;
  }
  keysDown.add(event.key);
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
});

window.addEventListener("keyup", (event) => {
  keysDown.delete(event.key);
});

window.addEventListener("resize", () => {
  scheduleLayoutRefresh();
});

window.addEventListener("fullscreenchange", () => {
  scheduleLayoutRefresh();
});

window.addEventListener("load", () => {
  scheduleLayoutRefresh();
});

document.fonts?.ready?.then(() => {
  scheduleLayoutRefresh();
});

if ("ResizeObserver" in window) {
  const resizeObserver = new ResizeObserver(() => {
    scheduleLayoutRefresh();
  });
  resizeObserver.observe(canvas.parentElement);
}

window.render_game_to_text = () => JSON.stringify(games[activeGameId].getTextState());
window.advanceTime = (ms) => {
  const step = 1000 / 60;
  const loops = Math.max(1, Math.round(ms / step));
  for (let i = 0; i < loops; i += 1) {
    games[activeGameId].update(step / 1000);
  }
  draw();
};
window.arcadia = {
  switchGame,
  games,
  getRoomState() {
    return games.tetris.getTextState();
  },
  getCatCellCenter(row, col) {
    return games.cat.getCellCenter(row, col);
  },
};

renderInfo(activeGameId);
scheduleLayoutRefresh();
requestAnimationFrame(tick);
