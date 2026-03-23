export function getDomRefs() {
  const canvas = document.getElementById("game-canvas");
  return {
    canvas,
    ctx: canvas.getContext("2d"),
    titleEl: document.getElementById("game-title"),
    tagsEl: document.getElementById("game-tags"),
    descEl: document.getElementById("game-description"),
    statsEl: document.getElementById("hud-stats"),
    controlsEl: document.getElementById("hud-controls"),
    tabEls: [...document.querySelectorAll(".game-tab")],
    roomBarEl: document.getElementById("room-bar"),
    roomIdEl: document.getElementById("room-id"),
    roomRoleEl: document.getElementById("room-role"),
    inviteBtnEl: document.getElementById("invite-btn"),
    playerQueueEl: document.getElementById("player-queue"),
    modeSegmentEl: document.getElementById("mode-segment"),
    modeOptionEls: [...document.querySelectorAll(".mode-option")],
  };
}
