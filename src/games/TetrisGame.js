import { TetrisEngine } from "./TetrisEngine.js";
import { MODE_STORAGE_KEY, MULTI_MODE, SINGLE_MODE } from "../shared/constants.js";
import {
  createId,
  deepClone,
  drawRoundedRect,
  formatCountdown,
  normalizeMode,
  randomInt,
  readStoredValue,
  storeValue,
} from "../shared/utils.js";

export class TetrisGame {
  constructor({ canvas, ctx, keysDown, ui, requestRender }) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.keysDown = keysDown;
    this.ui = ui;
    this.requestRender = requestRender;
    this.engine = new TetrisEngine({ randomInt, drawRoundedRect });
    this.playerColors = ["#5df4c7", "#ffd86b", "#ff8aa7", "#79a8ff", "#c9ff70", "#ffb86b"];
    this.storageKeyPrefix = "arcadia-grid-room";
    this.roomTtlMs = 20000;
    this.heartbeatMs = 2500;
    this.matchDurationMs = 5 * 60 * 1000;
    this.localPlayerId = sessionStorage.getItem("arcadia-player-id") || createId();
    sessionStorage.setItem("arcadia-player-id", this.localPlayerId);
    this.mode = normalizeMode(readStoredValue(MODE_STORAGE_KEY, SINGLE_MODE), MULTI_MODE, SINGLE_MODE);
    this.roomId = null;
    this.channel = null;
    this.heartbeat = null;
    this.isMultiplayer = false;
    this.lastRoundSeen = null;
    this.lastPublishedState = "";
    this.publishAccumulator = 0;
    window.addEventListener("storage", (event) => this.handleStorageEvent(event));
    window.addEventListener("beforeunload", () => this.handleBeforeUnload());
    this.bindRoomUi();
    this.roomState = this.getEmptyState();
    if (this.mode === MULTI_MODE) this.connectMultiplayer();
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
    this.ui.inviteBtnEl.addEventListener("click", async () => {
      const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${this.roomId}`;
      try {
        await navigator.clipboard.writeText(inviteUrl);
        this.ui.inviteBtnEl.textContent = "已复制邀请链接";
      } catch {
        this.ui.inviteBtnEl.textContent = inviteUrl;
      }
      window.setTimeout(() => {
        this.ui.inviteBtnEl.textContent = "复制邀请链接";
      }, 1800);
    });

    this.ui.playerQueueEl.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-action='rename-player']");
      if (trigger) this.renameLocalPlayer();
    });

    this.ui.modeSegmentEl?.addEventListener("click", (event) => {
      const option = event.target.closest("[data-mode]");
      if (option) this.setMode(option.dataset.mode);
    });
  }

  handleBeforeUnload() {
    if (this.isMultiplayer) this.leaveRoom();
  }

  connectMultiplayer() {
    if (this.isMultiplayer) return;
    this.mode = MULTI_MODE;
    this.isMultiplayer = true;
    this.roomId = this.resolveRoomId();
    this.roomState = this.readState();
    this.channel = "BroadcastChannel" in window ? new BroadcastChannel(`arcadia-room-${this.roomId}`) : null;
    this.channel?.addEventListener("message", (event) => this.handleRemoteState(event.data));
    this.registerLocalPlayer();
    this.heartbeat = window.setInterval(() => this.refreshPresence(), this.heartbeatMs);
    this.renderRoomUi();
  }

  disconnectMultiplayer() {
    if (!this.isMultiplayer) return;
    this.leaveRoom();
    this.channel?.close();
    this.channel = null;
    this.isMultiplayer = false;
    this.heartbeat = null;
    this.roomState = this.getEmptyState();
    this.lastRoundSeen = null;
    this.lastPublishedState = "";
    this.publishAccumulator = 0;
    this.renderRoomUi();
  }

  setMode(nextMode) {
    const normalized = normalizeMode(nextMode, MULTI_MODE, SINGLE_MODE);
    if (normalized === this.mode) return;
    if (normalized === MULTI_MODE) {
      this.connectMultiplayer();
    } else {
      this.disconnectMultiplayer();
      this.mode = SINGLE_MODE;
      this.engine.reset();
    }
    storeValue(MODE_STORAGE_KEY, this.mode);
    this.renderRoomUi();
    this.requestRender();
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
    return this.roomId ? `${this.storageKeyPrefix}-${this.roomId}` : null;
  }

  getEmptyState() {
    return {
      roomId: this.roomId || "LOCAL",
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
    if (!this.storageKey) return this.getEmptyState();
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? this.reconcileState(JSON.parse(raw)) : this.getEmptyState();
    } catch {
      return this.getEmptyState();
    }
  }

  writeState(state) {
    if (!this.storageKey) return;
    const next = this.reconcileState(state);
    next.updatedAt = Date.now();
    localStorage.setItem(this.storageKey, JSON.stringify(next));
    this.roomState = next;
    this.channel?.postMessage(next);
    this.renderRoomUi();
  }

  handleRemoteState(remoteState) {
    if (!this.isMultiplayer || !remoteState || remoteState.roomId !== this.roomId) return;
    if ((remoteState.updatedAt || 0) < (this.roomState.updatedAt || 0)) return;
    this.roomState = this.reconcileState(remoteState);
    this.renderRoomUi();
  }

  handleStorageEvent(event) {
    if (!this.isMultiplayer || !this.storageKey) return;
    if (event.key === this.storageKey && event.newValue) this.handleRemoteState(JSON.parse(event.newValue));
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
    if (!this.isMultiplayer) return;
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
    if (!this.isMultiplayer) return;
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
    if (!this.isMultiplayer) return;
    if (this.heartbeat) window.clearInterval(this.heartbeat);
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
    if (!this.isMultiplayer) return;
    const current = this.getLocalPlayer()?.name || "";
    const nextName = window.prompt("输入新的昵称", current);
    const trimmed = nextName?.trim().slice(0, 12);
    if (!trimmed) return;
    localStorage.setItem(`arcadia-player-name-${this.roomId}`, trimmed);
    this.mutateState((state) => {
      const local = state.players.find((player) => player.id === this.localPlayerId);
      if (local) local.name = trimmed;
      state.lastEvent = `${trimmed} 已更新昵称`;
    });
  }

  getLocalPlayer() {
    if (!this.isMultiplayer) return { id: "single-player", name: "单人玩家" };
    return this.roomState.players.find((player) => player.id === this.localPlayerId) || null;
  }

  getPlayerName(state, playerId) {
    return state.players.find((player) => player.id === playerId)?.name || "待加入玩家";
  }

  getPlayer(playerId) {
    if (!this.isMultiplayer) return playerId ? { id: playerId, name: "单人玩家" } : null;
    return this.roomState.players.find((player) => player.id === playerId) || null;
  }

  getLocalRole() {
    if (!this.isMultiplayer) return "single";
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
    if (!this.isMultiplayer) return 0;
    const match = this.roomState.activeMatch;
    if (!match) return this.matchDurationMs;
    return match.startedAt + match.durationMs - Date.now();
  }

  resetForNewRound() {
    if (!this.isMultiplayer) return;
    const match = this.roomState.activeMatch;
    if (!match || this.lastRoundSeen === match.round) return;
    this.lastRoundSeen = match.round;
    this.engine.reset();
    this.publishSnapshot(true);
  }

  resolveMatch(winnerId, reason) {
    this.mutateState((state) => {
      const match = state.activeMatch;
      if (!match || ![match.defenderId, match.challengerId].includes(winnerId)) return;
      const loserId = winnerId === match.defenderId ? match.challengerId : match.defenderId;
      const middle = state.queue.filter((id) => id !== winnerId && id !== loserId);
      state.queue = [winnerId, ...middle, loserId];
      state.activeMatch = null;
      state.lastEvent = `${this.getPlayerName(state, winnerId)} 胜出，原因：${reason}`;
    });
  }

  publishSnapshot(force = false) {
    if (!this.isMultiplayer || !this.isLocalActive()) return;
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
    if (!this.isMultiplayer) return { ...this.engine.getSnapshot(), playerId: "single-player", name: "单人玩家" };
    if (!playerId) return null;
    if (playerId === this.localPlayerId) {
      return { ...this.engine.getSnapshot(), playerId, name: this.getLocalPlayer()?.name || "玩家" };
    }
    return this.roomState.snapshots[playerId] || null;
  }

  maybeResolveByTimer() {
    if (!this.isMultiplayer) return;
    const match = this.roomState.activeMatch;
    if (!match || this.getRemainingMs() > 0) return;
    const defender = this.getRenderedSnapshot(match.defenderId);
    const challenger = this.getRenderedSnapshot(match.challengerId);
    const winnerId = (defender?.score || 0) >= (challenger?.score || 0) ? match.defenderId : match.challengerId;
    this.resolveMatch(winnerId, "5 分钟倒计时结束，按分数判定");
  }

  update(dt) {
    if (!this.isMultiplayer) {
      if (this.keysDown.has("r") || this.keysDown.has("R")) {
        this.keysDown.delete("r");
        this.keysDown.delete("R");
        this.engine.reset();
        return;
      }
      this.engine.update(dt, this.keysDown, true);
      return;
    }
    this.roomState = this.readState();
    this.resetForNewRound();
    if (this.isLocalActive()) {
      if (this.keysDown.has("r") || this.keysDown.has("R")) {
        this.keysDown.delete("r");
        this.keysDown.delete("R");
        const match = this.roomState.activeMatch;
        const winnerId = match?.defenderId === this.localPlayerId ? match.challengerId : match?.defenderId;
        if (winnerId) this.resolveMatch(winnerId, "对手投降");
        return;
      }
      this.engine.update(dt, this.keysDown, true);
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
    drawRoundedRect(this.ctx, x, y, width, height, 26, "rgba(7,14,26,0.88)", "rgba(255,255,255,0.08)");
    this.ctx.fillStyle = accentColor;
    this.ctx.font = "700 13px 'Space Grotesk'";
    this.ctx.fillText(label, x + 22, y + 30);
    this.ctx.fillStyle = "#eef4ff";
    this.ctx.font = "700 22px 'Noto Sans SC'";
    this.ctx.fillText(player?.name || "等待玩家", x + 22, y + 62);
    this.ctx.fillStyle = "#ffd86b";
    this.ctx.font = "700 22px 'Space Grotesk'";
    this.ctx.fillText(String(snapshot?.score || 0), x + width - 84, y + 62);
    this.ctx.font = "600 12px 'Space Grotesk'";
    this.ctx.fillText("SCORE", x + width - 92, y + 34);
    this.ctx.fillStyle = "#8ea4cb";
    this.ctx.font = "500 14px 'Noto Sans SC'";
    this.ctx.fillText(controlled ? "你正在操作该棋盘" : "观战同步视角", x + 22, y + 88);

    const boardTop = y + 112;
    const boardMaxHeight = height - 150;
    const boardMaxWidth = width * 0.46;
    const cell = Math.min(boardMaxHeight / this.engine.rows, boardMaxWidth / this.engine.cols);
    const boardWidth = cell * this.engine.cols;
    const boardHeight = cell * this.engine.rows;
    const boardX = x + 22;
    const nextX = boardX + boardWidth + 24;
    const nextWidth = Math.max(112, width - (nextX - x) - 22);

    drawRoundedRect(this.ctx, boardX - 14, boardTop - 14, boardWidth + 28, boardHeight + 28, 22, "rgba(3,8,18,0.82)", "rgba(255,255,255,0.06)");
    for (let row = 0; row < this.engine.rows; row += 1) {
      for (let col = 0; col < this.engine.cols; col += 1) {
        const filled = snapshot?.filledCells?.find((cellData) => cellData.x === col && cellData.y === row);
        drawRoundedRect(
          this.ctx,
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
          this.ctx,
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

    drawRoundedRect(this.ctx, nextX, boardTop + 18, nextWidth, 120, 22, "rgba(255,255,255,0.05)", "rgba(255,255,255,0.08)");
    this.ctx.fillStyle = "#ffb86b";
    this.ctx.font = "700 13px 'Space Grotesk'";
    this.ctx.fillText("NEXT", nextX + 18, boardTop + 44);
    if (snapshot?.nextPiece) {
      this.engine.drawPreview(this.ctx, { type: snapshot.nextPiece, matrix: this.engine.shapeDefs[snapshot.nextPiece] }, nextX + 18, boardTop + 62, 20);
    } else {
      this.ctx.fillStyle = "#8ea4cb";
      this.ctx.font = "500 13px 'Noto Sans SC'";
      this.ctx.fillText("等待同步", nextX + 18, boardTop + 88);
    }

    this.ctx.fillStyle = "#8ea4cb";
    this.ctx.font = "500 13px 'Noto Sans SC'";
    this.ctx.fillText(`消行 ${snapshot?.lines || 0} 级别 ${snapshot?.level || 1}`, nextX + 18, boardTop + 168);
    if (snapshot?.gameOver) {
      drawRoundedRect(this.ctx, x + width / 2 - 110, y + height / 2 - 44, 220, 88, 20, "rgba(5,9,18,0.9)", "rgba(255,111,145,0.38)");
      this.ctx.fillStyle = "#ff6f91";
      this.ctx.font = "700 24px 'Space Grotesk'";
      this.ctx.fillText("GAME OVER", x + width / 2 - 74, y + height / 2 + 4);
    }
  }

  render(width, height) {
    this.renderRoomUi();
    this.ctx.fillStyle = "#08101d";
    this.ctx.fillRect(0, 0, width, height);
    const gradient = this.ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "rgba(93,244,199,0.16)");
    gradient.addColorStop(1, "rgba(255,111,145,0.08)");
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, width, height);
    const shellX = 28;
    const shellY = 24;
    const shellWidth = width - 56;
    const shellHeight = height - 48;

    if (!this.isMultiplayer) {
      drawRoundedRect(this.ctx, shellX, shellY, shellWidth, shellHeight, 34, "rgba(4,8,18,0.78)", "rgba(255,255,255,0.08)");
      const panelWidth = Math.min(shellWidth - 36, 760);
      const panelHeight = shellHeight - 36;
      const panelX = shellX + (shellWidth - panelWidth) / 2;
      const panelY = shellY + 18;
      this.drawBoardShell("SINGLE PLAYER", { id: "single-player", name: "单人玩家" }, this.engine.getSnapshot(), panelX, panelY, panelWidth, panelHeight, "#5df4c7", true);
      this.ctx.fillStyle = "#8ea4cb";
      this.ctx.font = "500 13px 'Noto Sans SC'";
      this.ctx.fillText("本地练习模式，刷新后会保留你的模式选择。", shellX + 26, shellY + shellHeight - 16);
      return;
    }

    const innerGap = 20;
    const panelWidth = (shellWidth - 56 - innerGap) / 2;
    const panelHeight = shellHeight - 64;
    const match = this.roomState.activeMatch;
    const defenderId = match?.defenderId || this.roomState.queue[0];
    const challengerId = match?.challengerId || this.roomState.queue[1];
    drawRoundedRect(this.ctx, shellX, shellY, shellWidth, shellHeight, 34, "rgba(4,8,18,0.78)", "rgba(255,255,255,0.08)");
    this.drawBoardShell("CURRENT DEFENDER", this.getPlayer(defenderId), this.getRenderedSnapshot(defenderId), shellX + 18, shellY + 18, panelWidth, panelHeight, "#5df4c7", this.getLocalRole() === "defender");
    this.drawBoardShell("CURRENT CHALLENGER", this.getPlayer(challengerId), this.getRenderedSnapshot(challengerId), shellX + 18 + panelWidth + innerGap, shellY + 18, panelWidth, panelHeight, "#ffd86b", this.getLocalRole() === "challenger");
    this.ctx.fillStyle = "#eef4ff";
    this.ctx.font = "700 16px 'Space Grotesk'";
    this.ctx.fillText(formatCountdown(this.getRemainingMs()), width / 2 - 34, shellY + 30);
    this.ctx.fillStyle = "#8ea4cb";
    this.ctx.font = "500 13px 'Noto Sans SC'";
    this.ctx.fillText(this.roomState.lastEvent || "等待比赛开始", shellX + 26, shellY + shellHeight - 16);
  }

  renderRoomUi() {
    this.ui.modeOptionEls.forEach((option) => option.classList.toggle("active", option.dataset.mode === this.mode));
    this.ui.inviteBtnEl.hidden = this.mode !== MULTI_MODE;
    if (!this.isMultiplayer) {
      this.ui.roomIdEl.textContent = "SINGLE PLAYER";
      this.ui.roomRoleEl.textContent = "本地练习";
      this.ui.playerQueueEl.innerHTML = `
        <div class="queue-player is-self">
          <div class="queue-avatar" style="background:#5df4c7">单</div>
          <button type="button" disabled>
            <strong>单人模式</strong>
            <small>本地游戏，不加入房间</small>
          </button>
        </div>
      `;
      return;
    }

    this.ui.roomIdEl.textContent = `ROOM ${this.roomId}`;
    const roleLabels = {
      defender: "你是当前擂主",
      challenger: "你是当前挑战者",
      spectator: "正在观战",
      waiting: "等待下一位玩家",
    };
    this.ui.roomRoleEl.textContent = roleLabels[this.getLocalRole()] || "等待排位";
    const active = this.roomState.activeMatch;
    this.ui.playerQueueEl.innerHTML = this.roomState.queue
      .map((playerId, index) => {
        const player = this.getPlayer(playerId);
        const isSelf = playerId === this.localPlayerId;
        const role = active?.defenderId === playerId ? "擂主" : active?.challengerId === playerId ? "挑战者" : `排队 ${index + 1}`;
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
    if (!this.isMultiplayer) {
      const snapshot = this.engine.getSnapshot();
      return [
        ["模式", "单人模式"],
        ["分数", snapshot.score],
        ["消行", snapshot.lines],
        ["等级", snapshot.level],
        ["状态", snapshot.gameOver ? "已失败，按 R 重开" : "本地练习中"],
        ["控制", "方向键 / WASD"],
      ];
    }
    const match = this.roomState.activeMatch;
    return [
      ["房间号", this.roomId],
      ["在线人数", this.roomState.players.length],
      ["当前回合", match?.round || 0],
      ["剩余时间", formatCountdown(this.getRemainingMs())],
      ["当前状态", match ? this.roomState.lastEvent : "等待第二位玩家加入"],
      ["你的身份", this.ui.roomRoleEl.textContent],
    ];
  }

  getTextState() {
    if (!this.isMultiplayer) {
      return {
        mode: "tetris-single",
        coordinateSystem: "origin top-left, x right, y down, board 10x20",
        board: this.engine.getSnapshot(),
      };
    }
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
