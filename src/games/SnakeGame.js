import { drawRoundedRect, randomInt } from "../shared/utils.js";

export class SnakeGame {
  constructor({ ctx, keysDown }) {
    this.ctx = ctx;
    this.keysDown = keysDown;
    this.cols = 20;
    this.rows = 20;
    this.reset();
  }

  reset() {
    this.snake = [{ x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }];
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
    if (this.obstacles.length < 18) this.obstacles.push(this.randomFreeCell());
  }

  handleInput() {
    const mapping = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    };
    Object.entries(mapping).forEach(([key, dir]) => {
      if (this.keysDown.has(key) && !(this.direction.x + dir.x === 0 && this.direction.y + dir.y === 0)) {
        this.pendingDirection = dir;
      }
    });
  }

  step() {
    if (this.gameOver) return;
    this.direction = this.pendingDirection;
    const nextHead = { x: this.snake[0].x + this.direction.x, y: this.snake[0].y + this.direction.y };
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
    if (this.keysDown.has("r") || this.keysDown.has("R")) {
      this.keysDown.delete("r");
      this.keysDown.delete("R");
      this.reset();
      return;
    }
    this.handleInput();
    const tick = this.keysDown.has(" ") ? 0.05 : Math.max(0.08, 0.18 - this.score / 450);
    this.moveAccumulator += dt;
    if (this.moveAccumulator >= tick) {
      this.moveAccumulator = 0;
      this.step();
    }
  }

  render(width, height) {
    this.ctx.fillStyle = "#05101d";
    this.ctx.fillRect(0, 0, width, height);
    const shellX = 28;
    const shellY = 24;
    const shellWidth = width - 56;
    const shellHeight = height - 48;
    const boardSize = Math.min(shellHeight - 92, shellWidth - 96);
    const startX = shellX + (shellWidth - boardSize) / 2;
    const startY = shellY + 48;
    const cell = boardSize / this.cols;

    drawRoundedRect(this.ctx, shellX, shellY, shellWidth, shellHeight, 32, "rgba(8,18,35,0.84)", "rgba(255,255,255,0.08)");
    drawRoundedRect(this.ctx, startX - 16, startY - 16, boardSize + 32, boardSize + 32, 28, "rgba(8,18,35,0.68)", "rgba(255,255,255,0.05)");

    for (let y = 0; y < this.rows; y += 1) {
      for (let x = 0; x < this.cols; x += 1) {
        drawRoundedRect(this.ctx, startX + x * cell, startY + y * cell, cell - 2, cell - 2, 8, (x + y) % 2 ? "rgba(93,244,199,0.06)" : "rgba(255,255,255,0.03)", null);
      }
    }

    this.obstacles.forEach((block) => {
      drawRoundedRect(this.ctx, startX + block.x * cell + 2, startY + block.y * cell + 2, cell - 6, cell - 6, 10, "#ff6f91", "rgba(255,255,255,0.18)");
    });
    drawRoundedRect(this.ctx, startX + this.food.x * cell + 4, startY + this.food.y * cell + 4, cell - 10, cell - 10, 12, "#ffd86b", "rgba(255,255,255,0.24)");
    this.snake.forEach((part, index) => {
      drawRoundedRect(this.ctx, startX + part.x * cell + 3, startY + part.y * cell + 3, cell - 8, cell - 8, 10, index === 0 ? "#5df4c7" : "#79a8ff", "rgba(255,255,255,0.14)");
    });

    if (this.gameOver) {
      drawRoundedRect(this.ctx, width / 2 - 160, height / 2 - 80, 320, 150, 28, "rgba(5,9,18,0.88)", "rgba(255,111,145,0.4)");
      this.ctx.fillStyle = "#ff6f91";
      this.ctx.font = "700 30px 'Space Grotesk'";
      this.ctx.fillText("RUN ENDED", width / 2 - 86, height / 2 - 14);
      this.ctx.fillStyle = "#eef4ff";
      this.ctx.font = "500 16px 'Noto Sans SC'";
      this.ctx.fillText("按 R 再来一局", width / 2 - 56, height / 2 + 26);
    }
  }

  getHudStats() {
    return [
      ["分数", this.score],
      ["最高分", this.best],
      ["长度", this.snake.length],
      ["障碍数", this.obstacles.length],
      ["冲刺", "Space 短时加速"],
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
