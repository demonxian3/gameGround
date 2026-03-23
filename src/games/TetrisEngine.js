export class TetrisEngine {
  constructor({ randomInt, drawRoundedRect }) {
    this.randomInt = randomInt;
    this.drawRoundedRect = drawRoundedRect;
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
    const type = names[this.randomInt(0, names.length - 1)];
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
    while (this.board.length < this.rows) {
      this.board.unshift(Array(this.cols).fill(""));
    }
    if (!cleared) return;
    this.lines += cleared;
    this.score += [0, 100, 300, 500, 800][cleared] * this.level;
    this.level = 1 + Math.floor(this.lines / 8);
  }

  move(dx) {
    if (this.gameOver || this.collides(this.current, this.current.x + dx, this.current.y)) return;
    this.current.x += dx;
  }

  tryRotate() {
    if (this.gameOver) return;
    const rotated = this.rotate(this.current.matrix);
    const offsets = [0, -1, 1, -2, 2];
    for (const offset of offsets) {
      if (!this.collides(this.current, this.current.x + offset, this.current.y, rotated)) {
        this.current.matrix = rotated;
        this.current.x += offset;
        return;
      }
    }
  }

  hardDrop() {
    if (this.gameOver) return;
    while (!this.collides(this.current, this.current.x, this.current.y + 1)) {
      this.current.y += 1;
    }
    this.lockPiece();
  }

  softStep() {
    if (this.gameOver) return;
    if (!this.collides(this.current, this.current.x, this.current.y + 1)) {
      this.current.y += 1;
    } else {
      this.lockPiece();
    }
  }

  handleInput(keysDown) {
    this.moveCooldown = Math.max(0, this.moveCooldown);
    if (this.moveCooldown > 0) return;
    if (keysDown.has("ArrowLeft")) {
      this.move(-1);
      this.moveCooldown = 0.08;
    } else if (keysDown.has("ArrowRight")) {
      this.move(1);
      this.moveCooldown = 0.08;
    } else if (keysDown.has("ArrowUp")) {
      keysDown.delete("ArrowUp");
      this.tryRotate();
      this.moveCooldown = 0.12;
    } else if (keysDown.has(" ")) {
      keysDown.delete(" ");
      this.hardDrop();
      this.moveCooldown = 0.12;
    }
    this.softDrop = keysDown.has("ArrowDown");
  }

  update(dt, keysDown, interactive = true) {
    if (interactive) {
      this.moveCooldown -= dt;
      this.handleInput(keysDown);
    }
    if (this.gameOver) return;
    this.dropAccumulator += dt;
    const interval = this.softDrop ? 0.04 : Math.max(0.08, 0.7 - (this.level - 1) * 0.05);
    if (this.dropAccumulator >= interval) {
      this.dropAccumulator = 0;
      this.softStep();
    }
  }

  drawPreview(ctx, piece, x, y, cell) {
    piece.matrix.forEach((row, rowIndex) => {
      row.forEach((filled, colIndex) => {
        if (!filled) return;
        this.drawRoundedRect(
          ctx,
          x + colIndex * cell,
          y + rowIndex * cell,
          cell - 2,
          cell - 2,
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
