(function () {
  "use strict";

  const GROUP_COLORS = ["group-0", "group-1", "group-2", "group-3"];
  const TOTAL_TIME = 150; // 2:30 in seconds
  const MAX_GUESSES_AFTER_TWO = 3;
  const STORAGE_KEY = "oc_wall_history";
  const DATA_VERSION = 4; // bump this to bust browser cache after data changes

  let wallData = [];
  let currentWall = null;
  let selected = [];
  let solvedGroups = [];
  let guessesLeft = Infinity;
  let timeLeft = TOTAL_TIME;
  let timerInterval = null;
  let gameOver = false;

  // --- History (localStorage) ---

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveResult(episodeIndex, wallIndex, score, extras) {
    const ep = wallData[episodeIndex];
    const key = wallKey(ep, wallIndex);
    const history = getHistory();
    const prev = history[key];
    // Keep the best score
    if (!prev || score > prev.score) {
      history[key] = {
        score: score,
        date: new Date().toISOString().slice(0, 10),
        ...extras,
      };
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }

  function wallKey(ep, wallIndex) {
    return `s${ep.series}e${ep.episodeNumber}_${wallIndex}`;
  }

  function getWallResult(ep, wallIndex) {
    return getHistory()[wallKey(ep, wallIndex)] || null;
  }

  // --- Data Loading ---

  async function loadData() {
    const resp = await fetch("data/walls.json?v=" + DATA_VERSION);
    wallData = await resp.json();
    buildMenu();
  }

  // --- Menu ---

  function buildMenu() {
    const list = document.getElementById("episode-list");
    list.innerHTML = "";

    // Group episodes by series
    const bySeries = {};
    wallData.forEach((ep, ei) => {
      const s = ep.series;
      if (!bySeries[s]) bySeries[s] = [];
      bySeries[s].push({ ep, ei });
    });

    const seriesNums = Object.keys(bySeries)
      .map(Number)
      .sort((a, b) => a - b);

    const history = getHistory();

    seriesNums.forEach((s) => {
      const episodes = bySeries[s];

      // Count completion stats for this series
      let totalWalls = 0;
      let completedWalls = 0;
      episodes.forEach(({ ep }) => {
        ep.walls.forEach((_, wi) => {
          totalWalls++;
          const r = history[wallKey(ep, wi)];
          if (r) completedWalls++;
        });
      });

      const seriesBlock = document.createElement("div");
      seriesBlock.className = "series-block";

      const header = document.createElement("button");
      header.className = "series-header";

      const headerTitle = document.createElement("span");
      headerTitle.textContent = s > 0 ? `Series ${s}` : "Specials";

      const headerStats = document.createElement("span");
      headerStats.className = "series-stats";
      headerStats.textContent = `${completedWalls}/${totalWalls}`;
      if (completedWalls === totalWalls && totalWalls > 0) {
        headerStats.classList.add("complete");
      }

      header.appendChild(headerTitle);
      header.appendChild(headerStats);

      const body = document.createElement("div");
      body.className = "series-body";

      episodes.forEach(({ ep, ei }) => {
        const row = document.createElement("div");
        row.className = "episode-btn";

        const title = document.createElement("span");
        title.className = "episode-title-text";
        title.textContent = `E${ep.episodeNumber}: ${ep.episode}`;

        const labels = document.createElement("div");
        labels.className = "wall-labels";

        ep.walls.forEach((w, wi) => {
          const label = document.createElement("span");
          const result = getWallResult(ep, wi);

          if (result) {
            label.className = `wall-label wall-label-done${result.score === 10 ? " wall-label-perfect" : ""}`;
            label.textContent = `${w.name} ${result.score}/10`;
          } else {
            label.className = "wall-label";
            label.textContent = w.name;
          }

          label.addEventListener("click", (e) => {
            e.stopPropagation();
            startGame(ei, wi);
          });
          labels.appendChild(label);
        });

        row.appendChild(title);
        row.appendChild(labels);
        body.appendChild(row);
      });

      header.addEventListener("click", () => {
        seriesBlock.classList.toggle("open");
      });

      seriesBlock.appendChild(header);
      seriesBlock.appendChild(body);
      list.appendChild(seriesBlock);
    });

    // Stats bar
    updateStatsBar(history);

    // Random button — prefer unplayed walls
    document.getElementById("random-btn").onclick = () => {
      const unplayed = [];
      wallData.forEach((ep, ei) => {
        ep.walls.forEach((_, wi) => {
          if (!history[wallKey(ep, wi)]) {
            unplayed.push({ ei, wi });
          }
        });
      });

      let pick;
      if (unplayed.length > 0) {
        pick = unplayed[Math.floor(Math.random() * unplayed.length)];
      } else {
        const ei = Math.floor(Math.random() * wallData.length);
        const wi = Math.floor(Math.random() * wallData[ei].walls.length);
        pick = { ei, wi };
      }
      startGame(pick.ei, pick.wi);
    };
  }

  function updateStatsBar(history) {
    let bar = document.getElementById("stats-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "stats-bar";
      bar.className = "stats-bar";
      const menuCard = document.querySelector(".menu-card");
      menuCard.insertBefore(bar, document.getElementById("episode-list"));
    }

    let total = 0;
    let played = 0;
    let perfect = 0;
    wallData.forEach((ep) => {
      ep.walls.forEach((_, wi) => {
        total++;
        const r = history[wallKey(ep, wi)];
        if (r) {
          played++;
          if (r.score === 10) perfect++;
        }
      });
    });

    bar.innerHTML = `${played} played · ${perfect} solved · ${total - played} remaining`;
  }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
  }

  // --- Game Start ---

  function startGame(episodeIndex, wallIndex) {
    const ep = wallData[episodeIndex];
    currentWall = {
      episode: ep,
      episodeIndex: episodeIndex,
      wallIndex: wallIndex,
      wall: ep.walls[wallIndex],
    };

    selected = [];
    solvedGroups = [];
    shuffledUnsolved = null;
    renderedGroupCount = 0;
    guessesLeft = Infinity;
    timeLeft = TOTAL_TIME;
    gameOver = false;

    document.getElementById("episode-title").textContent =
      `S${ep.series} E${ep.episodeNumber} — ${ep.episode}`;
    document.getElementById("wall-name").textContent = currentWall.wall.name;
    document.getElementById("message").textContent = "";
    document.getElementById("message").className = "message";
    updatePips();
    updateTimerBar();

    document.getElementById("quit-btn").onclick = () => {
      clearInterval(timerInterval);
      gameOver = true;
      shuffledUnsolved = null;
      buildMenu();
      showScreen("menu-screen");
    };

    showScreen("game-screen");
    buildWall();
    startTimer();
  }

  // We only shuffle once at game start — store the order
  let shuffledUnsolved = null;
  let renderedGroupCount = 0;

  // --- Wall Rendering ---

  function buildWall() {
    const container = document.getElementById("wall");
    container.innerHTML = "";

    // Render solved groups at the top
    solvedGroups.forEach((g, i) => {
      const row = document.createElement("div");
      row.className = i >= renderedGroupCount ? "solved-row" : "solved-row solved-row-static";

      g.clues.forEach((clue) => {
        const tile = document.createElement("div");
        tile.className = `tile solved ${GROUP_COLORS[g.groupIndex]}`;
        tile.textContent = clue;
        row.appendChild(tile);
      });

      container.appendChild(row);
    });

    // Collect unsolved clues, maintaining stable order
    const solvedClues = new Set(solvedGroups.flatMap((g) => g.clues));

    if (shuffledUnsolved === null) {
      // First render — shuffle all 16
      const all = currentWall.wall.groups.flatMap((g) => g.clues);
      shuffle(all);
      shuffledUnsolved = all;
    }

    const unsolved = shuffledUnsolved.filter((c) => !solvedClues.has(c));

    unsolved.forEach((clue) => {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.textContent = clue;
      if (gameOver) {
        tile.classList.add("tile-disabled");
      } else {
        tile.addEventListener("click", () => onTileClick(tile, clue));
      }
      if (selected.includes(clue)) {
        tile.classList.add("selected");
      }
      container.appendChild(tile);
    });

    renderedGroupCount = solvedGroups.length;
  }

  // --- Tile Interaction ---

  function onTileClick(tile, clue) {
    if (gameOver) return;

    const idx = selected.indexOf(clue);
    if (idx !== -1) {
      selected.splice(idx, 1);
      tile.classList.remove("selected");
      return;
    }

    if (selected.length >= 4) return;

    selected.push(clue);
    tile.classList.add("selected");

    if (selected.length === 4) {
      checkGuess();
    }
  }

  function checkGuess() {
    const match = currentWall.wall.groups.find((group) => {
      const set = new Set(group.clues);
      return selected.every((c) => set.has(c));
    });

    if (match) {
      // Correct!
      const groupIndex = currentWall.wall.groups.indexOf(match);
      solvedGroups.push({
        groupIndex: groupIndex,
        clues: [...match.clues],
        connection: match.connection,
      });
      selected = [];

      // After 2 groups solved, switch to limited guesses
      if (solvedGroups.length === 2) {
        guessesLeft = MAX_GUESSES_AFTER_TWO;
        showToast("Three guesses remaining");
      } else if (solvedGroups.length === 3) {
        // Auto-solve the last group
        const solvedIndices = new Set(solvedGroups.map((g) => g.groupIndex));
        const lastGroup = currentWall.wall.groups.find(
          (_, i) => !solvedIndices.has(i)
        );
        const lastIndex = currentWall.wall.groups.indexOf(lastGroup);
        solvedGroups.push({
          groupIndex: lastIndex,
          clues: [...lastGroup.clues],
          connection: lastGroup.connection,
        });
        showMessage("Wall complete!", "success");
        endGame(true);
      } else if (solvedGroups.length === 4) {
        showMessage("Wall complete!", "success");
        endGame(true);
      }

      buildWall();
      updatePips();
    } else {
      // Wrong guess
      if (guessesLeft !== Infinity) {
        guessesLeft--;
        updatePips();
        const labels = ["", "One guess remaining", "Two guesses remaining"];
        if (guessesLeft > 0 && guessesLeft <= 2) {
          showToast(labels[guessesLeft]);
        }
      }

      // Shake the selected tiles
      const tiles = document.querySelectorAll(".tile:not(.solved)");
      tiles.forEach((t) => {
        if (selected.includes(t.textContent)) {
          t.classList.add("wrong");
          setTimeout(() => {
            t.classList.remove("wrong", "selected");
          }, 400);
        }
      });

      if (guessesLeft <= 0) {
        showMessage("Out of guesses!", "fail");
        selected = [];
        endGame(false);
      } else {
        setTimeout(() => {
          selected = [];
          buildWall();
        }, 450);
      }
    }
  }

  // --- Timer ---

  function startTimer() {
    clearInterval(timerInterval);
    updateTimerBar();

    timerInterval = setInterval(() => {
      timeLeft--;
      updateTimerBar();

      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        showMessage("Time's up!", "fail");
        endGame(false);
      }
    }, 1000);
  }

  function updateTimerBar() {
    const bar = document.getElementById("timer-bar");
    const text = document.getElementById("timer-text");
    const pct = (timeLeft / TOTAL_TIME) * 100;
    bar.style.width = pct + "%";
    bar.classList.toggle("warning", timeLeft <= 30);

    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    text.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  function updatePips() {
    const container = document.getElementById("guess-pips");
    container.innerHTML = "";

    // Only show pips once down to last 2 groups
    if (solvedGroups.length < 2 || guessesLeft === Infinity) return;

    for (let i = 0; i < MAX_GUESSES_AFTER_TWO; i++) {
      const pip = document.createElement("div");
      pip.className = "pip";
      if (i >= guessesLeft) {
        pip.classList.add("used");
      }
      container.appendChild(pip);
    }
  }

  // --- End Game ---

  function endGame(won) {
    gameOver = true;
    clearInterval(timerInterval);
    selected = [];

    const timeTaken = TOTAL_TIME - timeLeft;

    // Count groups the player actually found (not auto-solved)
    // If won with 3 solved + 1 auto, the auto-solved 4th still counts
    const found = solvedGroups.length;

    // Linger on completed wall so the user can admire it, shorter pause on failure
    setTimeout(() => showResults(won, found, timeTaken), won ? 3500 : 1200);
  }

  let resultsState = null;

  function showResults(won, groupsFound, timeTaken) {
    const solvedIndices = new Set(solvedGroups.map((g) => g.groupIndex));
    const allGroups = currentWall.wall.groups.map((group, i) => ({
      ...group,
      groupIndex: i,
      found: solvedIndices.has(i),
    }));

    resultsState = {
      groupsFound: groupsFound,
      timeTaken: timeTaken,
      allGroups: allGroups,
      revealed: [false, false, false, false],
      knew: [null, null, null, null],
    };

    const title = document.getElementById("results-title");
    title.textContent = `${groupsFound}/4 groups found — reveal the connections`;

    // Disable action buttons until reveal phase is complete
    const playAgainBtn = document.getElementById("play-again-btn");
    const backMenuBtn = document.getElementById("back-menu-btn");
    playAgainBtn.disabled = true;
    backMenuBtn.disabled = true;

    playAgainBtn.onclick = () => {
      shuffledUnsolved = null;
      startGame(currentWall.episodeIndex, currentWall.wallIndex);
    };

    backMenuBtn.onclick = () => {
      shuffledUnsolved = null;
      buildMenu();
      showScreen("menu-screen");
    };

    renderResultsGroups();
    showScreen("results-screen");
  }

  function renderResultsGroups() {
    const container = document.getElementById("results-groups");
    container.innerHTML = "";

    resultsState.allGroups.forEach((group, i) => {
      const div = document.createElement("div");
      div.className = `result-group ${GROUP_COLORS[group.groupIndex]} ${group.found ? "found" : "missed"}`;

      const clues = document.createElement("div");
      clues.className = "clues";
      clues.textContent = group.clues.join(" \u00b7 ");
      div.appendChild(clues);

      if (!resultsState.revealed[i]) {
        // Show reveal button
        const revealBtn = document.createElement("button");
        revealBtn.className = "reveal-btn";
        revealBtn.textContent = "Reveal connection";
        revealBtn.addEventListener("click", () => {
          resultsState.revealed[i] = true;
          renderResultsGroups();
        });
        div.appendChild(revealBtn);
      } else {
        // Show connection text
        const conn = document.createElement("div");
        conn.className = "connection";
        conn.textContent = group.connection;
        div.appendChild(conn);

        if (resultsState.knew[i] === null) {
          // Show "Did you know?" prompt
          const prompt = document.createElement("div");
          prompt.className = "knew-prompt";

          const label = document.createElement("span");
          label.textContent = "Did you know?";
          prompt.appendChild(label);

          const yesBtn = document.createElement("button");
          yesBtn.className = "knew-btn";
          yesBtn.textContent = "Yes";
          yesBtn.addEventListener("click", () => {
            resultsState.knew[i] = true;
            onKnewAnswered();
          });
          prompt.appendChild(yesBtn);

          const noBtn = document.createElement("button");
          noBtn.className = "knew-btn";
          noBtn.textContent = "No";
          noBtn.addEventListener("click", () => {
            resultsState.knew[i] = false;
            onKnewAnswered();
          });
          prompt.appendChild(noBtn);

          div.appendChild(prompt);
        } else {
          // Show answer indicator
          const answer = document.createElement("div");
          answer.className = "knew-answer";
          answer.textContent = resultsState.knew[i] ? "\u2713 Knew it" : "\u2717 Didn\u2019t know";
          div.appendChild(answer);
        }
      }

      container.appendChild(div);
    });
  }

  function onKnewAnswered() {
    // Check if all groups have been revealed and answered
    const allDone = resultsState.knew.every((k) => k !== null);
    renderResultsGroups();
    if (allDone) {
      finalizeScore();
    }
  }

  function finalizeScore() {
    const knewCount = resultsState.knew.filter((k) => k === true).length;
    const base = resultsState.groupsFound + knewCount;
    const bonus = base === 8 ? 2 : 0;
    const finalScore = base + bonus;

    // Update title
    const title = document.getElementById("results-title");
    if (finalScore === 10) {
      title.textContent = `Perfect! ${finalScore}/10`;
    } else {
      title.textContent = `Score: ${finalScore}/10`;
    }

    // Save result
    saveResult(currentWall.episodeIndex, currentWall.wallIndex, finalScore, {
      time: resultsState.timeTaken,
      groups: resultsState.groupsFound,
    });

    // Enable action buttons
    document.getElementById("play-again-btn").disabled = false;
    document.getElementById("back-menu-btn").disabled = false;
  }

  // --- Stats Page ---

  function buildStats() {
    const history = getHistory();
    const entries = Object.values(history);
    const totalWalls = wallData.reduce((n, ep) => n + ep.walls.length, 0);
    const played = entries.length;

    const container = document.getElementById("stats-content");
    container.innerHTML = "";

    if (played === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--text-dim);padding:24px 0;">No walls played yet.</p>';
      return;
    }

    const scores = entries.map((e) => e.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / played;
    const perfectCount = scores.filter((s) => s === 10).length;
    const timesRecorded = entries.filter((e) => e.time != null);
    const avgTime = timesRecorded.length > 0
      ? timesRecorded.reduce((a, e) => a + e.time, 0) / timesRecorded.length
      : null;
    const fastestTime = timesRecorded.length > 0
      ? Math.min(...timesRecorded.map((e) => e.time))
      : null;
    const groupsRecorded = entries.filter((e) => e.groups != null);
    const wallsClearedCount = groupsRecorded.filter((e) => e.groups === 4).length;

    // --- Overview ---
    const overview = document.createElement("div");
    overview.className = "stat-section";
    overview.innerHTML = '<h3>Overview</h3>';

    const grid = document.createElement("div");
    grid.className = "stat-grid";

    const stats = [
      [played + "/" + totalWalls, "Walls Played"],
      [avgScore.toFixed(1) + "/10", "Avg Score"],
      [String(perfectCount), "Perfect 10s"],
      [avgTime != null ? fmtTime(Math.round(avgTime)) : "—", "Avg Time"],
      [fastestTime != null ? fmtTime(fastestTime) : "—", "Fastest Time"],
      [groupsRecorded.length > 0 ? String(wallsClearedCount) : String(entries.filter((e) => e.score === 10 || (e.groups != null && e.groups === 4)).length), "Walls Cleared (4/4)"],
    ];

    stats.forEach(([value, label]) => {
      const item = document.createElement("div");
      item.className = "stat-item";
      item.innerHTML = `<div class="stat-value">${value}</div><div class="stat-label">${label}</div>`;
      grid.appendChild(item);
    });

    overview.appendChild(grid);
    container.appendChild(overview);

    // --- Score Distribution ---
    const distSection = document.createElement("div");
    distSection.className = "stat-section";
    distSection.innerHTML = '<h3>Score Distribution</h3>';

    const validScores = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const dist = {};
    validScores.forEach((s) => (dist[s] = 0));
    scores.forEach((s) => {
      dist[s] = (dist[s] || 0) + 1;
    });
    const maxCount = Math.max(...Object.values(dist), 1);

    const chart = document.createElement("div");
    chart.className = "score-dist";

    validScores.forEach((s) => {
      const col = document.createElement("div");
      col.className = "score-bar-col";

      const count = document.createElement("div");
      count.className = "score-bar-count";
      count.textContent = dist[s] || "";

      const bar = document.createElement("div");
      bar.className = "score-bar";
      const pct = ((dist[s] || 0) / maxCount) * 100;
      bar.style.height = pct + "%";
      if (pct === 0) bar.style.height = "0";

      const label = document.createElement("div");
      label.className = "score-bar-label";
      label.textContent = s;

      col.appendChild(count);
      col.appendChild(bar);
      col.appendChild(label);
      chart.appendChild(col);
    });

    distSection.appendChild(chart);
    container.appendChild(distSection);

    // --- Series Completion ---
    const seriesSection = document.createElement("div");
    seriesSection.className = "stat-section";
    seriesSection.innerHTML = '<h3>Series Completion</h3>';

    const bySeries = {};
    wallData.forEach((ep) => {
      const s = ep.series;
      if (!bySeries[s]) bySeries[s] = { total: 0, played: 0 };
      ep.walls.forEach((_, wi) => {
        bySeries[s].total++;
        if (history[wallKey(ep, wi)]) bySeries[s].played++;
      });
    });

    const seriesNums = Object.keys(bySeries).map(Number).sort((a, b) => a - b);
    seriesNums.forEach((s) => {
      const info = bySeries[s];
      const pct = Math.round((info.played / info.total) * 100);
      const row = document.createElement("div");
      row.className = "series-bar-row";
      row.innerHTML = `<span class="series-bar-label">${s > 0 ? "S" + s : "Sp"}</span>` +
        `<div class="series-bar-track"><div class="series-bar-fill" style="width:${pct}%"></div></div>` +
        `<span class="series-bar-pct">${info.played}/${info.total}</span>`;
      seriesSection.appendChild(row);
    });

    container.appendChild(seriesSection);
  }

  function fmtTime(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function initStatsButtons() {
    document.getElementById("stats-btn").onclick = () => {
      buildStats();
      showScreen("stats-screen");
    };

    document.getElementById("stats-back-btn").onclick = () => {
      buildMenu();
      showScreen("menu-screen");
    };

    document.getElementById("stats-reset-btn").onclick = () => {
      document.getElementById("reset-confirm").style.display = "flex";
    };

    document.getElementById("reset-no-btn").onclick = () => {
      document.getElementById("reset-confirm").style.display = "none";
    };

    document.getElementById("reset-yes-btn").onclick = () => {
      localStorage.removeItem(STORAGE_KEY);
      document.getElementById("reset-confirm").style.display = "none";
      buildStats();
    };
  }

  // --- Helpers ---

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function showMessage(text, type) {
    const el = document.getElementById("message");
    el.textContent = text;
    el.className = `message ${type || ""}`;
  }

  function showToast(text) {
    const toast = document.getElementById("toast");
    toast.textContent = text;
    toast.classList.remove("visible");
    // Force reflow so re-adding the class restarts the animation
    void toast.offsetWidth;
    toast.classList.add("visible");
  }

  // --- Init ---
  loadData();
  initStatsButtons();
})();
