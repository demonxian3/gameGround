import { drawRoundedRect, randomInt } from "../shared/utils.js";

export class CircleTheCatGame {
  constructor({ canvas, ctx, keysDown, getActiveGameId }) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.keysDown = keysDown;
    this.getActiveGameId = getActiveGameId;
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

  isEdge(row, col) {
    return row === 0 || col === 0 || row === this.size - 1 || col === this.size - 1;
  }

  getCellCenter(row, col) {
    this.updateLayout();
    const x = this.offsetX + col * this.radius * 2 + (row % 2 === 0 ? this.radius : 0);
    const y = this.offsetY + row * this.verticalSpacing;
    return { x, y };
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
    const queue = [{ row: this.cat.row, col: this.cat.col, path: [{ row: this.cat.row, col: this.cat.col }] }];
    const visited = new Set([`${this.cat.row},${this.cat.col}`]);
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
        queue.push({ row: next.row, col: next.col, path: [...current.path, next] });
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
    const scored = moves.map((move) => ({ move, score: this.distanceToNearestEdge(move) })).sort((a, b) => a.score - b.score || Math.random() - 0.5);
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

  updateLayout(width = this.canvas.getBoundingClientRect().width, height = this.canvas.getBoundingClientRect().height) {
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
    const rect = this.canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    this.pointer = { x: localX, y: localY };
    this.hoverCell = this.findCellAtPoint(localX, localY);
  }

  handleClick(event) {
    if (this.getActiveGameId() !== "cat" || this.status !== "playing") return;
    const rect = this.canvas.getBoundingClientRect();
    const cell = this.findCellAtPoint(event.clientX - rect.left, event.clientY - rect.top);
    if (!cell || (cell.row === this.cat.row && cell.col === this.cat.col) || this.grid[cell.row][cell.col] === 1) return;
    this.grid[cell.row][cell.col] = 1;
    this.lastClicked = cell;
    this.turns += 1;
    this.moveCat();
  }

  update() {
    if (this.keysDown.has("r") || this.keysDown.has("R")) {
      this.keysDown.delete("r");
      this.keysDown.delete("R");
      this.reset();
    }
  }

  render(width, height) {
    this.updateLayout(width, height);
    this.ctx.fillStyle = "#0a1425";
    this.ctx.fillRect(0, 0, width, height);
    const bgGradient = this.ctx.createRadialGradient(width * 0.5, height * 0.4, 80, width * 0.5, height * 0.4, width * 0.55);
    bgGradient.addColorStop(0, "rgba(93,244,199,0.16)");
    bgGradient.addColorStop(1, "rgba(10,20,37,0)");
    this.ctx.fillStyle = bgGradient;
    this.ctx.fillRect(0, 0, width, height);
    drawRoundedRect(this.ctx, this.shellX, this.shellY, this.shellWidth, this.shellHeight, 34, "rgba(4,10,20,0.64)", "rgba(255,255,255,0.08)");
    drawRoundedRect(this.ctx, this.boardPanelX, this.boardPanelY, this.boardPanelWidth, this.boardPanelHeight, 30, "rgba(6,12,24,0.88)", "rgba(255,255,255,0.06)");

    for (let row = 0; row < this.size; row += 1) {
      for (let col = 0; col < this.size; col += 1) {
        const center = this.getCellCenter(row, col);
        const isHover = this.hoverCell && this.hoverCell.row === row && this.hoverCell.col === col;
        const isCat = this.cat.row === row && this.cat.col === col;
        const blocked = this.grid[row][col] === 1;
        this.ctx.beginPath();
        this.ctx.arc(center.x, center.y, this.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = blocked ? this.palette.blocked : isHover && !isCat ? "#dbe5f4" : this.palette.open;
        this.ctx.fill();
        this.ctx.lineWidth = isHover && !blocked ? 3 : 1.5;
        this.ctx.strokeStyle = blocked ? "rgba(255,234,205,0.28)" : "rgba(14,24,40,0.18)";
        this.ctx.stroke();

        if (isCat) {
          this.ctx.beginPath();
          this.ctx.arc(center.x, center.y, this.radius - 5, 0, Math.PI * 2);
          this.ctx.fillStyle = this.status === "trapped" ? this.palette.win : this.palette.cat;
          this.ctx.fill();
          this.ctx.beginPath();
          this.ctx.arc(center.x - 6, center.y - 3, 2.6, 0, Math.PI * 2);
          this.ctx.arc(center.x + 6, center.y - 3, 2.6, 0, Math.PI * 2);
          this.ctx.fillStyle = this.palette.catFace;
          this.ctx.fill();
          this.ctx.beginPath();
          this.ctx.arc(center.x, center.y + 4, 5.5, 0, Math.PI);
          this.ctx.strokeStyle = this.palette.catFace;
          this.ctx.lineWidth = 2;
          this.ctx.stroke();
          this.ctx.beginPath();
          this.ctx.moveTo(center.x - 10, center.y - 12);
          this.ctx.lineTo(center.x - 5, center.y - 22);
          this.ctx.lineTo(center.x - 1, center.y - 12);
          this.ctx.moveTo(center.x + 10, center.y - 12);
          this.ctx.lineTo(center.x + 5, center.y - 22);
          this.ctx.lineTo(center.x + 1, center.y - 12);
          this.ctx.strokeStyle = this.palette.catFace;
          this.ctx.stroke();
        }
      }
    }

    this.ctx.fillStyle = "#eef4ff";
    this.ctx.font = "700 16px 'Space Grotesk'";
    this.ctx.fillText("TACTICAL BOARD", this.headerX, this.headerY);
    this.ctx.font = "500 17px 'Noto Sans SC'";
    this.ctx.fillStyle = "#90a5ca";
    this.ctx.fillText("点击灰色圆点布置障碍，猫每回合只会走一步。", this.headerX, this.headerY + 28);
    drawRoundedRect(this.ctx, this.boardPanelX + 18, this.boardPanelY + this.boardPanelHeight - this.footerHeight - 18, this.boardPanelWidth - 36, this.footerHeight, 22, "rgba(255,255,255,0.05)", "rgba(255,255,255,0.08)");
    this.ctx.fillStyle = this.status === "trapped" ? this.palette.win : this.status === "escaped" ? this.palette.lose : "#ffd86b";
    this.ctx.font = "700 16px 'Space Grotesk'";
    this.ctx.fillText(this.status === "trapped" ? "CAT TRAPPED" : this.status === "escaped" ? "CAT ESCAPED" : "NEXT DECISION", this.boardPanelX + 42, this.boardPanelY + this.boardPanelHeight - 48);
    this.ctx.fillStyle = "#eef4ff";
    this.ctx.font = "500 15px 'Noto Sans SC'";
    this.wrapText(this.message, this.boardPanelX + 196, this.boardPanelY + this.boardPanelHeight - 48, this.boardPanelWidth - 250, 24);
  }

  wrapText(text, x, y, maxWidth, lineHeight) {
    let current = "";
    for (const char of text) {
      const next = current + char;
      if (this.ctx.measureText(next).width > maxWidth && current) {
        this.ctx.fillText(current, x, y);
        current = char;
        y += lineHeight;
      } else {
        current = next;
      }
    }
    if (current) this.ctx.fillText(current, x, y);
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
