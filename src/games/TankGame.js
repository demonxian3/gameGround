import { clamp, drawRoundedRect, randomInt } from "../shared/utils.js";

export class TankGame {
  constructor({ ctx, keysDown }) {
    this.ctx = ctx;
    this.keysDown = keysDown;
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
    this.projectiles.push({ owner, x, y, angle, speed, life: 2.2, r: 5 });
  }

  updatePlayer(dt) {
    const speed = 190;
    let moveX = 0;
    let moveY = 0;
    if (this.keysDown.has("ArrowUp")) moveY -= 1;
    if (this.keysDown.has("ArrowDown")) moveY += 1;
    if (this.keysDown.has("ArrowLeft")) moveX -= 1;
    if (this.keysDown.has("ArrowRight")) moveX += 1;
    if (moveX || moveY) {
      this.player.angle = Math.atan2(moveY, moveX);
      const len = Math.hypot(moveX, moveY) || 1;
      this.player.x = clamp(this.player.x + (moveX / len) * speed * dt, 80, this.width - 80);
      this.player.y = clamp(this.player.y + (moveY / len) * speed * dt, 80, this.height - 80);
    }
    this.player.cooldown -= dt;
    if (this.keysDown.has(" ") && this.player.cooldown <= 0 && !this.gameOver && !this.win) {
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
      } else if (Math.hypot(this.player.x - shot.x, this.player.y - shot.y) < this.player.size + shot.r) {
        this.player.hp -= 1;
        this.flash = 0.16;
        if (this.player.hp <= 0) this.gameOver = true;
        return false;
      }
      return true;
    });
    if (!this.enemies.length) this.win = true;
  }

  update(dt) {
    if (this.keysDown.has("r") || this.keysDown.has("R")) {
      this.keysDown.delete("r");
      this.keysDown.delete("R");
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
    this.ctx.save();
    this.ctx.translate(unit.x, unit.y);
    this.ctx.rotate(unit.angle);
    drawRoundedRect(this.ctx, -unit.size, -unit.size + 4, unit.size * 2, unit.size * 2 - 8, 10, bodyColor, "rgba(255,255,255,0.2)");
    drawRoundedRect(this.ctx, -4, -6, unit.size + 18, 12, 5, turretColor, null);
    drawRoundedRect(this.ctx, -10, -10, 20, 20, 8, "rgba(255,255,255,0.1)", null);
    this.ctx.restore();
  }

  render(width, height) {
    this.ctx.fillStyle = this.flash > 0 ? "rgba(255,111,145,0.14)" : "#091321";
    this.ctx.fillRect(0, 0, width, height);
    const shellX = 28;
    const shellY = 24;
    const shellWidth = width - 56;
    const shellHeight = height - 48;

    for (let x = 0; x < width; x += 64) {
      for (let y = 0; y < height; y += 64) {
        drawRoundedRect(this.ctx, x + 8, y + 8, 48, 48, 12, (x + y) % 128 ? "rgba(255,255,255,0.03)" : "rgba(93,244,199,0.05)", null);
      }
    }

    drawRoundedRect(this.ctx, shellX, shellY, shellWidth, shellHeight, 32, "rgba(7,14,26,0.22)", "rgba(255,255,255,0.08)");
    this.drawTank(this.player, "#5df4c7", "#c2fff0");
    this.enemies.forEach((enemy) => this.drawTank(enemy, "#ff6f91", "#ffd7e1"));
    this.projectiles.forEach((shot) => {
      this.ctx.beginPath();
      this.ctx.arc(shot.x, shot.y, shot.r, 0, Math.PI * 2);
      this.ctx.fillStyle = shot.owner === "player" ? "#ffd86b" : "#ff8aa7";
      this.ctx.fill();
    });

    this.ctx.fillStyle = "#eef4ff";
    this.ctx.font = "700 16px 'Space Grotesk'";
    this.ctx.fillText("COMBAT FIELD", shellX + 28, shellY + 28);
    this.ctx.font = "500 17px 'Noto Sans SC'";
    this.ctx.fillStyle = "#8ea4cb";
    this.ctx.fillText("边移动边开火，清空敌方单位。", shellX + 28, shellY + 56);
    drawRoundedRect(this.ctx, shellX + 24, shellY + shellHeight - 72, shellWidth - 48, 44, 18, "rgba(255,255,255,0.05)", "rgba(255,255,255,0.08)");
    this.ctx.fillStyle = "#ffd86b";
    this.ctx.font = "700 15px 'Space Grotesk'";
    this.ctx.fillText("TACTIC", shellX + 46, shellY + shellHeight - 44);
    this.ctx.fillStyle = "#eef4ff";
    this.ctx.font = "500 14px 'Noto Sans SC'";
    this.ctx.fillText("保持移动避免被集火，冷却结束后立即压制敌方火力。", shellX + 122, shellY + shellHeight - 44);

    if (this.win || this.gameOver) {
      drawRoundedRect(this.ctx, width / 2 - 170, height / 2 - 90, 340, 170, 28, "rgba(5,9,18,0.88)", this.win ? "rgba(93,244,199,0.45)" : "rgba(255,111,145,0.45)");
      this.ctx.fillStyle = this.win ? "#5df4c7" : "#ff6f91";
      this.ctx.font = "700 30px 'Space Grotesk'";
      this.ctx.fillText(this.win ? "AREA CLEARED" : "BASE LOST", width / 2 - 100, height / 2 - 18);
      this.ctx.fillStyle = "#eef4ff";
      this.ctx.font = "500 16px 'Noto Sans SC'";
      this.ctx.fillText("按 R 重新部署", width / 2 - 50, height / 2 + 20);
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
