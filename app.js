const pct = (value, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const TENNIS_BALL_DRAG = 0.009;
const CONTACT_PRESETS = {
  groundstroke: { height: 1.1, depth: -0.7 },
  serve: { height: 2.65, depth: 0.4 },
};

function gameWinProbability(pointProbability) {
  const p = clamp(pointProbability, 0.001, 0.999);
  const q = 1 - p;
  const beforeDeuce =
    p ** 4 +
    4 * p ** 4 * q +
    10 * p ** 4 * q ** 2;
  const deuceChance = 20 * p ** 3 * q ** 3;
  const deuceWin = p ** 2 / (p ** 2 + q ** 2);
  return beforeDeuce + deuceChance * deuceWin;
}

function tiebreakWinProbability(pointProbability) {
  const p = clamp(pointProbability, 0.001, 0.999);
  const q = 1 - p;
  const memo = new Map();
  const deuceWin = p ** 2 / (p ** 2 + q ** 2);

  function visit(a, b) {
    if (a >= 7 && a - b >= 2) return 1;
    if (b >= 7 && b - a >= 2) return 0;
    if (a === 6 && b === 6) return deuceWin;

    const key = `${a}:${b}`;
    if (memo.has(key)) return memo.get(key);
    const value = p * visit(a + 1, b) + q * visit(a, b + 1);
    memo.set(key, value);
    return value;
  }

  return visit(0, 0);
}

function setWinFromGameProbabilities(holdProbability, breakProbability, tiebreakProbability) {
  const memo = new Map();

  function visit(playerGames, opponentGames, playerServesNext) {
    if (playerGames >= 6 && playerGames - opponentGames >= 2) return 1;
    if (opponentGames >= 6 && opponentGames - playerGames >= 2) return 0;
    if (playerGames === 7) return 1;
    if (opponentGames === 7) return 0;
    if (playerGames === 6 && opponentGames === 6) return tiebreakProbability;

    const key = `${playerGames}:${opponentGames}:${playerServesNext ? 1 : 0}`;
    if (memo.has(key)) return memo.get(key);

    const gameWin = playerServesNext ? holdProbability : breakProbability;
    const value =
      gameWin * visit(playerGames + 1, opponentGames, !playerServesNext) +
      (1 - gameWin) * visit(playerGames, opponentGames + 1, !playerServesNext);
    memo.set(key, value);
    return value;
  }

  return visit(0, 0, true);
}

function setScoreDistributionForStart(holdProbability, breakProbability, tiebreakProbability, playerServesFirst) {
  const results = new Map();
  let active = new Map([[`0:0:${playerServesFirst ? 1 : 0}`, 1]]);

  for (let gamesPlayed = 0; gamesPlayed <= 12; gamesPlayed += 1) {
    const next = new Map();

    for (const [key, chance] of active) {
      const [playerGames, opponentGames, servesNext] = key.split(":").map(Number);

      if (playerGames === 6 && opponentGames === 6) {
        results.set("7-6", (results.get("7-6") ?? 0) + chance * tiebreakProbability);
        results.set("6-7", (results.get("6-7") ?? 0) + chance * (1 - tiebreakProbability));
        continue;
      }

      const gameWin = servesNext ? holdProbability : breakProbability;
      const nextServer = servesNext ? 0 : 1;
      const winScore = [playerGames + 1, opponentGames];
      const loseScore = [playerGames, opponentGames + 1];

      [
        { score: winScore, probability: chance * gameWin },
        { score: loseScore, probability: chance * (1 - gameWin) },
      ].forEach(({ score, probability }) => {
        const [playerNextGames, opponentNextGames] = score;
        const isPlayerSet =
          playerNextGames >= 6 &&
          playerNextGames - opponentNextGames >= 2;
        const isOpponentSet =
          opponentNextGames >= 6 &&
          opponentNextGames - playerNextGames >= 2;

        if (isPlayerSet || isOpponentSet) {
          const scoreKey = `${playerNextGames}-${opponentNextGames}`;
          results.set(scoreKey, (results.get(scoreKey) ?? 0) + probability);
        } else {
          const stateKey = `${playerNextGames}:${opponentNextGames}:${nextServer}`;
          next.set(stateKey, (next.get(stateKey) ?? 0) + probability);
        }
      });
    }

    active = next;
  }

  return results;
}

function neutralSetScoreDistribution(holdProbability, breakProbability, tiebreakProbability) {
  const serveStartDistribution = setScoreDistributionForStart(holdProbability, breakProbability, tiebreakProbability, true);
  const receiveFirst = setScoreDistributionForStart(holdProbability, breakProbability, tiebreakProbability, false);
  const allScores = new Set([...serveStartDistribution.keys(), ...receiveFirst.keys()]);
  const averaged = new Map();

  allScores.forEach((score) => {
    averaged.set(score, ((serveStartDistribution.get(score) ?? 0) + (receiveFirst.get(score) ?? 0)) / 2);
  });

  return averaged;
}

function renderSetScoreDistribution(distribution) {
  const scoreOrder = [
    "6-0",
    "6-1",
    "6-2",
    "6-3",
    "6-4",
    "7-5",
    "7-6",
    "6-7",
    "5-7",
    "4-6",
    "3-6",
    "2-6",
    "1-6",
    "0-6",
  ];
  const rows = scoreOrder.map((score) => ({
    score,
    probability: distribution.get(score) ?? 0,
    won: Number(score.split("-")[0]) > Number(score.split("-")[1]),
  }));
  const maxProbability = Math.max(...rows.map((row) => row.probability), 0.001);

  document.getElementById("setScoreDistribution").innerHTML = rows
    .map(
      (row) => `
        <div class="score-distribution-row ${row.won ? "win" : "loss"}">
          <span>${row.score}</span>
          <div class="score-probability-bar">
            <span style="width: ${(row.probability / maxProbability) * 100}%"></span>
          </div>
          <strong>${pct(row.probability)}</strong>
        </div>
      `,
    )
    .join("");
}

function readNumber(id) {
  return Number(document.getElementById(id).value);
}

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function setWidth(id, value) {
  document.getElementById(id).style.width = `${clamp(value * 100, 0, 100)}%`;
}

function setInputValue(id, value) {
  document.getElementById(id).value = String(value);
}

function formatCourtDepth(value) {
  if (Math.abs(value) < 0.05) return "0.0 m";
  return value > 0 ? `内側 ${value.toFixed(1)} m` : `後方 ${Math.abs(value).toFixed(1)} m`;
}

function setContactPresetValue(value) {
  const input = document.querySelector(`input[name="contactPreset"][value="${value}"]`);
  if (input) input.checked = true;
}

function applyContactPreset(value) {
  const preset = CONTACT_PRESETS[value];
  if (!preset) return;

  setInputValue("contactHeight", preset.height);
  setInputValue("contactDepth", preset.depth);
  drawTrajectory();
}

function updateProbability() {
  const firstServeIn = readNumber("firstServeIn") / 100;
  const firstServeWon = readNumber("firstServeWon") / 100;
  const secondServeWon = readNumber("secondServeWon") / 100;
  const opponentFirstServeIn = readNumber("opponentFirstServeIn") / 100;
  const opponentFirstServeWon = readNumber("opponentFirstServeWon") / 100;
  const opponentSecondServeWon = readNumber("opponentSecondServeWon") / 100;

  const servePointWon = firstServeIn * firstServeWon + (1 - firstServeIn) * secondServeWon;
  const opponentServePointWon =
    opponentFirstServeIn * opponentFirstServeWon +
    (1 - opponentFirstServeIn) * opponentSecondServeWon;
  const returnPointWon = 1 - opponentServePointWon;
  const pointWin = (servePointWon + returnPointWon) / 2;
  const hold = gameWinProbability(servePointWon);
  const breakRate = gameWinProbability(returnPointWon);
  const gameWin = (hold + breakRate) / 2;
  const tiebreak = tiebreakWinProbability(pointWin);
  const setWin = setWinFromGameProbabilities(hold, breakRate, tiebreak);

  setText("firstServeInOut", pct(firstServeIn, 0));
  setText("firstServeWonOut", pct(firstServeWon, 0));
  setText("secondServeWonOut", pct(secondServeWon, 0));
  setText("opponentFirstServeInOut", pct(opponentFirstServeIn, 0));
  setText("opponentFirstServeWonOut", pct(opponentFirstServeWon, 0));
  setText("opponentSecondServeWonOut", pct(opponentSecondServeWon, 0));

  setText("ownServePointValue", pct(servePointWon));
  setText("opponentServePointValue", pct(opponentServePointWon));
  setText("pointWinValue", pct(pointWin));
  setText("gameWinValue", pct(gameWin));
  setText("setWinValue", pct(setWin));
  setText("holdValue", pct(hold));
  setText("breakValue", pct(breakRate));
  setText("tiebreakValue", pct(tiebreak));
  setText("servePointValue", `サーブ時得点率 ${pct(servePointWon)}`);
  setText("returnPointValue", `リターン時得点率 ${pct(returnPointWon)}`);
  setWidth("setWinBar", setWin);
  setWidth("ownServePointBar", servePointWon);
  setWidth("opponentServePointBar", opponentServePointWon);
  setWidth("pointWinBar", pointWin);
  setWidth("gameWinBar", gameWin);
  setWidth("holdBar", hold);
  setWidth("breakBar", breakRate);
  setWidth("tiebreakBar", tiebreak);
  renderSetScoreDistribution(neutralSetScoreDistribution(hold, breakRate, tiebreak));
}

function simulateTrajectory() {
  const speed = readNumber("ballSpeed") / 3.6;
  const angle = (readNumber("launchAngle") * Math.PI) / 180;
  const startHeight = readNumber("contactHeight");
  const contactDepth = readNumber("contactDepth");
  const topspin = readNumber("topspin");
  const drag = TENNIS_BALL_DRAG;
  const spinDrop = (topspin / 4200) * 3.4;
  const gravity = 9.81 + spinDrop;

  let x = contactDepth;
  let y = startHeight;
  let vx = speed * Math.cos(angle);
  let vy = speed * Math.sin(angle);
  const dt = 0.01;
  const points = [{ x, y }];
  let netHeightAtCrossing = null;
  let landingX = null;

  for (let step = 0; step < 900; step += 1) {
    const velocity = Math.hypot(vx, vy);
    const ax = -drag * velocity * vx;
    const ay = -gravity - drag * velocity * vy;

    vx += ax * dt;
    vy += ay * dt;
    x += vx * dt;
    y += vy * dt;

    points.push({ x, y: Math.max(y, 0) });

    if (netHeightAtCrossing === null && x >= 11.885) {
      const prev = points[points.length - 2];
      const ratio = (11.885 - prev.x) / (x - prev.x);
      netHeightAtCrossing = prev.y + (y - prev.y) * ratio;
    }

    if (y <= 0) {
      landingX = x;
      break;
    }
  }

  return {
    points,
    landingX: landingX ?? x,
    netClearance: (netHeightAtCrossing ?? 0) - 0.914,
  };
}

function drawTrajectory() {
  const canvas = document.getElementById("trajectoryCanvas");
  const context = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  context.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const pad = { left: 42, right: 26, top: 26, bottom: 58 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const minX = -3.5;
  const maxX = 26;
  const maxY = 7;
  const scaleX = (x) => pad.left + ((x - minX) / (maxX - minX)) * chartW;
  const scaleY = (y) => pad.top + chartH - (y / maxY) * chartH;

  const result = simulateTrajectory();
  context.clearRect(0, 0, width, height);

  context.fillStyle = "#f8faf6";
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#256c52";
  context.fillRect(scaleX(0), scaleY(0), scaleX(23.77) - scaleX(0), 18);
  context.fillStyle = "#1d5440";
  context.fillRect(scaleX(0), scaleY(0) + 18, scaleX(23.77) - scaleX(0), 10);

  context.strokeStyle = "rgba(255, 255, 255, 0.82)";
  context.lineWidth = 2;
  [0, 5.485, 11.885, 18.285, 23.77].forEach((mark) => {
    context.beginPath();
    context.moveTo(scaleX(mark), scaleY(0));
    context.lineTo(scaleX(mark), scaleY(0) + 28);
    context.stroke();
  });

  context.strokeStyle = "#14201b";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(scaleX(11.885), scaleY(0));
  context.lineTo(scaleX(11.885), scaleY(0.914));
  context.stroke();

  context.fillStyle = "#14201b";
  context.font = "700 12px system-ui";
  context.textAlign = "center";
  context.fillText("ネット", scaleX(11.885), scaleY(0.914) - 8);
  context.fillText("打点側ベースライン", scaleX(0), scaleY(0) + 44);
  context.fillText("相手ベースライン", scaleX(23.77), scaleY(0) + 44);

  context.strokeStyle = "#d8ad38";
  context.lineWidth = 4;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  result.points.forEach((point, index) => {
    const px = scaleX(point.x);
    const py = scaleY(point.y);
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  });
  context.stroke();

  const last = result.points[result.points.length - 1];
  context.fillStyle = "#c25e3b";
  context.beginPath();
  context.arc(scaleX(last.x), scaleY(last.y), 6, 0, Math.PI * 2);
  context.fill();

  const inCourt = result.landingX <= 23.77 && result.netClearance > 0;
  const status = document.getElementById("trajectoryStatus");
  status.classList.toggle("out", !inCourt);
  status.textContent = inCourt
    ? "ベースライン内に着地します"
    : result.netClearance <= 0
      ? "ネットにかかる軌道です"
      : "ベースラインを越える軌道です";

  setText("landingLabel", `${result.landingX.toFixed(1)} m`);
  setText("clearanceLabel", `${result.netClearance >= 0 ? "+" : ""}${result.netClearance.toFixed(2)} m`);

  setText("ballSpeedOut", `${readNumber("ballSpeed")} km/h`);
  setText("launchAngleOut", `${readNumber("launchAngle").toFixed(1)}°`);
  setText("contactHeightOut", `${readNumber("contactHeight").toFixed(2)} m`);
  setText("contactDepthOut", formatCourtDepth(readNumber("contactDepth")));
  setText("topspinOut", `${readNumber("topspin")} rpm`);
}

function bindInputs(selector, handler) {
  document.querySelectorAll(selector).forEach((element) => {
    element.addEventListener("input", handler);
    element.addEventListener("change", handler);
  });
}

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
    button.classList.add("active");
    document.getElementById(button.dataset.panel).classList.add("active");
    drawTrajectory();
  });
});

bindInputs("#probabilityForm input", updateProbability);
bindInputs("#trajectoryForm input", drawTrajectory);
document.querySelectorAll('input[name="contactPreset"]').forEach((input) => {
  input.addEventListener("change", () => applyContactPreset(input.value));
});
["contactHeight", "contactDepth"].forEach((id) => {
  document.getElementById(id).addEventListener("input", () => setContactPresetValue("custom"));
});
window.addEventListener("resize", drawTrajectory);

applyContactPreset("groundstroke");
updateProbability();
drawTrajectory();
