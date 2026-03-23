import { CircleTheCatGame } from "./games/CircleTheCatGame.js";
import { SnakeGame } from "./games/SnakeGame.js";
import { TankGame } from "./games/TankGame.js";
import { TetrisGame } from "./games/TetrisGame.js";
import { GAME_META, GAME_STORAGE_KEY, MODE_STORAGE_KEY } from "./shared/constants.js";
import { getDomRefs } from "./shared/dom.js";
import { fitCanvas, getMappedKeys, readStoredValue, storeValue } from "./shared/utils.js";

const dom = getDomRefs();
const { canvas, ctx, titleEl, tagsEl, descEl, statsEl, controlsEl, tabEls, roomBarEl } = dom;
const keysDown = new Set();
const state = {
  activeGameId: "tetris",
  lastTime: performance.now(),
  layoutFrame: 0,
};

const draw = () => {
  const rect = canvas.getBoundingClientRect();
  games[state.activeGameId].render(rect.width, rect.height);
  updateHud();
};

const games = {
  tetris: new TetrisGame({ canvas, ctx, keysDown, ui: dom, requestRender: draw }),
  snake: new SnakeGame({ ctx, keysDown }),
  tank: new TankGame({ ctx, keysDown }),
  cat: new CircleTheCatGame({ canvas, ctx, keysDown, getActiveGameId: () => state.activeGameId }),
};

const initialGameId = readStoredValue(GAME_STORAGE_KEY, "tetris");
state.activeGameId = GAME_META[initialGameId] ? initialGameId : "tetris";
storeValue(GAME_STORAGE_KEY, state.activeGameId);
storeValue(MODE_STORAGE_KEY, games.tetris.mode);

function renderInfo(gameId) {
  const meta = GAME_META[gameId];
  titleEl.textContent = meta.title;
  tagsEl.innerHTML = meta.tags.map((tag) => `<span>${tag}</span>`).join("");
  descEl.innerHTML = meta.description.map(([label, text]) => `<div class="desc-line"><strong>${label}</strong><span>${text}</span></div>`).join("");
  controlsEl.innerHTML = meta.controls.map(([label, text]) => `<div class="control-line"><strong>${label}</strong><span>${text}</span></div>`).join("");
  tabEls.forEach((tab) => tab.classList.toggle("active", tab.dataset.game === gameId));
  roomBarEl.hidden = gameId !== "tetris";
  if (gameId === "tetris") games.tetris.renderRoomUi();
}

function updateHud() {
  const stats = games[state.activeGameId].getHudStats();
  statsEl.innerHTML = stats.map(([label, value]) => `<div class="stat-line"><strong>${label}</strong><span>${value}</span></div>`).join("");
}

function refreshLayout() {
  state.layoutFrame = 0;
  fitCanvas(canvas, ctx);
  draw();
}

function scheduleLayoutRefresh() {
  if (state.layoutFrame) return;
  state.layoutFrame = requestAnimationFrame(refreshLayout);
}

function tick(now) {
  const dt = Math.min(0.05, (now - state.lastTime) / 1000);
  state.lastTime = now;
  games[state.activeGameId].update(dt);
  draw();
  requestAnimationFrame(tick);
}

function switchGame(gameId) {
  if (!GAME_META[gameId]) return;
  state.activeGameId = gameId;
  storeValue(GAME_STORAGE_KEY, gameId);
  renderInfo(gameId);
  draw();
}

tabEls.forEach((tab) => tab.addEventListener("click", () => switchGame(tab.dataset.game)));
canvas.addEventListener("mousemove", (event) => games.cat.handlePointerMove(event));
canvas.addEventListener("click", (event) => {
  games.cat.handleClick(event);
  if (state.activeGameId === "cat") draw();
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
  const mappedKeys = getMappedKeys(event);
  mappedKeys.forEach((key) => keysDown.add(key));
  if (mappedKeys.some((key) => ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(key))) event.preventDefault();
});

window.addEventListener("keyup", (event) => {
  getMappedKeys(event).forEach((key) => keysDown.delete(key));
});
window.addEventListener("resize", scheduleLayoutRefresh);
window.addEventListener("fullscreenchange", scheduleLayoutRefresh);
window.addEventListener("load", scheduleLayoutRefresh);
document.fonts?.ready?.then(scheduleLayoutRefresh);

if ("ResizeObserver" in window) {
  const resizeObserver = new ResizeObserver(scheduleLayoutRefresh);
  resizeObserver.observe(canvas.parentElement);
}

window.render_game_to_text = () => JSON.stringify(games[state.activeGameId].getTextState());
window.advanceTime = (ms) => {
  const step = 1000 / 60;
  const loops = Math.max(1, Math.round(ms / step));
  for (let index = 0; index < loops; index += 1) {
    games[state.activeGameId].update(step / 1000);
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

renderInfo(state.activeGameId);
scheduleLayoutRefresh();
requestAnimationFrame(tick);
