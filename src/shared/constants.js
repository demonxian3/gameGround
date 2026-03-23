export const GAME_STORAGE_KEY = "arcadia-active-game";
export const MODE_STORAGE_KEY = "arcadia-run-mode";
export const MULTI_MODE = "multi";
export const SINGLE_MODE = "single";

export const GAME_META = {
  tetris: {
    title: "俄罗斯方块",
    tags: ["房间 PK", "队列守擂", "双分屏观战"],
    description: [
      ["目标", "队列前两名自动上场 PK，时间结束时以高分决胜。"],
      ["房间", "复制邀请链接让其他玩家加入，同步昵称、队列和比赛状态。"],
      ["流转", "胜者守擂留在左侧，败者自动掉到队尾继续排队。"],
    ],
    controls: [
      ["移动", "← / → / A / D"],
      ["旋转", "↑ / W"],
      ["软降", "↓ / S"],
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
      ["方向", "↑ ↓ ← → / WASD"],
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
      ["移动", "↑ ↓ ← → / WASD"],
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
