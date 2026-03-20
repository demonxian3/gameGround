const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const titleEl = document.getElementById("game-title");
const tagsEl = document.getElementById("game-tags");
const descEl = document.getElementById("game-description");
const statsEl = document.getElementById("hud-stats");
const controlsEl = document.getElementById("hud-controls");
const tabEls = [...document.querySelectorAll(".game-tab")];

const keysDown = new Set();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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
    tags: ["消行加速", "经典 10x20", "预览下一个方块"],
    description: [
      ["目标", "尽可能消行并维持场面整洁。"],
      ["控制", "左右移动、上旋转、下加速、空格硬降。"],
      ["节奏", "分数越高，下落速度越快。"],
    ],
    controls: [
      ["移动", "← / →"],
      ["旋转", "↑"],
      ["软降", "↓"],
      ["硬降", "Space"],
      ["重开", "R"],
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
};

class TetrisGame {
  constructor() {
    this.cols = 10;
    this.rows = 20;
    this.cell = 28;
    this.offsetX = 140;
    this.offsetY = 90;
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

  update(dt) {
    if (keysDown.has("r") || keysDown.has("R")) {
      keysDown.delete("r");
      keysDown.delete("R");
      this.reset();
      return;
    }
    this.handleInput(dt);
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

  drawPreview(piece, x, y) {
    piece.matrix.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (!cell) return;
        drawRoundedRect(
          x + colIndex * 24,
          y + rowIndex * 24,
          20,
          20,
          6,
          this.palette[piece.type],
          "rgba(255,255,255,0.24)"
        );
      });
    });
  }

  render(width, height) {
    ctx.fillStyle = "#08101d";
    ctx.fillRect(0, 0, width, height);

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "rgba(93,244,199,0.18)");
    gradient.addColorStop(1, "rgba(255,111,145,0.08)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    drawRoundedRect(this.offsetX - 24, this.offsetY - 24, 344, 624, 28, "rgba(4,8,18,0.78)", "rgba(255,255,255,0.08)");

    for (let y = 0; y < this.rows; y += 1) {
      for (let x = 0; x < this.cols; x += 1) {
        drawRoundedRect(
          this.offsetX + x * this.cell,
          this.offsetY + y * this.cell,
          this.cell - 2,
          this.cell - 2,
          8,
          this.board[y][x] ? this.palette[this.board[y][x]] : "rgba(255,255,255,0.04)",
          "rgba(255,255,255,0.06)"
        );
      }
    }

    if (this.current) {
      this.current.matrix.forEach((row, rowIndex) => {
        row.forEach((cell, colIndex) => {
          if (!cell) return;
          drawRoundedRect(
            this.offsetX + (this.current.x + colIndex) * this.cell,
            this.offsetY + (this.current.y + rowIndex) * this.cell,
            this.cell - 2,
            this.cell - 2,
            8,
            this.palette[this.current.type],
            "rgba(255,255,255,0.25)"
          );
        });
      });
    }

    ctx.fillStyle = "#eef4ff";
    ctx.font = "700 40px 'Space Grotesk'";
    ctx.fillText("TETRIS", 510, 130);
    ctx.font = "500 18px 'Noto Sans SC'";
    ctx.fillStyle = "#8ea4cb";
    ctx.fillText("保持版面整洁，快速消行。", 510, 164);

    drawRoundedRect(500, 210, 250, 150, 24, "rgba(255,255,255,0.05)", "rgba(255,255,255,0.08)");
    ctx.fillStyle = "#ffb86b";
    ctx.font = "600 14px 'Space Grotesk'";
    ctx.fillText("NEXT", 526, 244);
    this.drawPreview(this.next, 530, 268);

    const stats = [
      ["Score", this.score],
      ["Lines", this.lines],
      ["Level", this.level],
    ];
    stats.forEach(([label, value], index) => {
      drawRoundedRect(500, 392 + index * 72, 250, 56, 20, "rgba(255,255,255,0.05)", "rgba(255,255,255,0.08)");
      ctx.fillStyle = "#8ea4cb";
      ctx.font = "500 15px 'Space Grotesk'";
      ctx.fillText(label, 526, 426 + index * 72);
      ctx.fillStyle = "#eef4ff";
      ctx.font = "700 24px 'Space Grotesk'";
      ctx.fillText(String(value), 650, 426 + index * 72);
    });

    if (this.gameOver) {
      drawRoundedRect(150, 280, 300, 120, 24, "rgba(5,9,18,0.85)", "rgba(255,111,145,0.5)");
      ctx.fillStyle = "#ff6f91";
      ctx.font = "700 30px 'Space Grotesk'";
      ctx.fillText("GAME OVER", 188, 335);
      ctx.fillStyle = "#eef4ff";
      ctx.font = "500 16px 'Noto Sans SC'";
      ctx.fillText("按 R 重新开始", 234, 368);
    }
  }

  getHudStats() {
    return [
      ["分数", this.score],
      ["消除行数", this.lines],
      ["等级", this.level],
      ["状态", this.gameOver ? "已结束" : "进行中"],
    ];
  }

  getTextState() {
    return {
      mode: "tetris",
      coordinateSystem: "origin top-left, x right, y down, board 10x20",
      score: this.score,
      lines: this.lines,
      level: this.level,
      gameOver: this.gameOver,
      activePiece: this.current ? { type: this.current.type, x: this.current.x, y: this.current.y } : null,
      nextPiece: this.next?.type ?? null,
      filledCells: this.board.flatMap((row, y) =>
        row.map((cell, x) => (cell ? { x, y, type: cell } : null)).filter(Boolean)
      ),
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

    const boardSize = Math.min(height - 120, width - 280);
    const startX = 110;
    const startY = 70;
    const cell = boardSize / this.cols;

    drawRoundedRect(startX - 20, startY - 20, boardSize + 40, boardSize + 40, 30, "rgba(8,18,35,0.84)", "rgba(255,255,255,0.08)");

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

    ctx.fillStyle = "#eef4ff";
    ctx.font = "700 40px 'Space Grotesk'";
    ctx.fillText("SNAKE", width - 280, 140);
    ctx.font = "500 17px 'Noto Sans SC'";
    ctx.fillStyle = "#8ea4cb";
    ctx.fillText("保持路线清晰，抢吃能量。", width - 280, 172);

    [
      ["Score", this.score],
      ["Best", this.best],
      ["Length", this.snake.length],
      ["Obstacles", this.obstacles.length],
    ].forEach(([label, value], index) => {
      drawRoundedRect(width - 300, 220 + index * 82, 210, 60, 20, "rgba(255,255,255,0.05)", "rgba(255,255,255,0.08)");
      ctx.fillStyle = "#8ea4cb";
      ctx.font = "500 15px 'Space Grotesk'";
      ctx.fillText(label, width - 272, 255 + index * 82);
      ctx.fillStyle = "#eef4ff";
      ctx.font = "700 26px 'Space Grotesk'";
      ctx.fillText(String(value), width - 150, 255 + index * 82);
    });

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

    for (let x = 0; x < width; x += 64) {
      for (let y = 0; y < height; y += 64) {
        drawRoundedRect(x + 8, y + 8, 48, 48, 12, (x + y) % 128 ? "rgba(255,255,255,0.03)" : "rgba(93,244,199,0.05)", null);
      }
    }

    drawRoundedRect(60, 60, width - 120, height - 120, 32, "rgba(7,14,26,0.22)", "rgba(255,255,255,0.08)");

    this.drawTank(this.player, "#5df4c7", "#c2fff0");
    this.enemies.forEach((enemy) => this.drawTank(enemy, "#ff6f91", "#ffd7e1"));

    this.projectiles.forEach((shot) => {
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, shot.r, 0, Math.PI * 2);
      ctx.fillStyle = shot.owner === "player" ? "#ffd86b" : "#ff8aa7";
      ctx.fill();
    });

    ctx.fillStyle = "#eef4ff";
    ctx.font = "700 38px 'Space Grotesk'";
    ctx.fillText("TANK ARENA", 90, 120);
    ctx.font = "500 17px 'Noto Sans SC'";
    ctx.fillStyle = "#8ea4cb";
    ctx.fillText("边移动边开火，清空敌方单位。", 92, 152);

    [
      ["HP", this.player.hp],
      ["Enemies", this.enemies.length],
      ["Score", this.score],
      ["Cooldown", this.player.cooldown > 0 ? this.player.cooldown.toFixed(2) : "Ready"],
    ].forEach(([label, value], index) => {
      drawRoundedRect(710, 92 + index * 72, 160, 54, 18, "rgba(255,255,255,0.05)", "rgba(255,255,255,0.08)");
      ctx.fillStyle = "#8ea4cb";
      ctx.font = "500 14px 'Space Grotesk'";
      ctx.fillText(label, 734, 124 + index * 72);
      ctx.fillStyle = "#eef4ff";
      ctx.font = "700 22px 'Space Grotesk'";
      ctx.fillText(String(value), 810, 124 + index * 72);
    });

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

const games = {
  tetris: new TetrisGame(),
  snake: new SnakeGame(),
  tank: new TankGame(),
};

let activeGameId = "tetris";
let lastTime = performance.now();

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
  fitCanvas();
  draw();
});

window.addEventListener("fullscreenchange", () => {
  fitCanvas();
  draw();
});

window.render_game_to_text = () => JSON.stringify(games[activeGameId].getTextState());
window.advanceTime = (ms) => {
  const step = 1000 / 60;
  const loops = Math.max(1, Math.round(ms / step));
  for (let i = 0; i < loops; i += 1) {
    games[activeGameId].update(step / 1000);
  }
  draw();
};
window.arcadia = { switchGame };

fitCanvas();
renderInfo(activeGameId);
draw();
requestAnimationFrame(tick);
