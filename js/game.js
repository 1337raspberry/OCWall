(function () {
  "use strict";

  const GROUP_COLORS = ["group-0", "group-1", "group-2", "group-3"];
  const TOTAL_TIME = 150; // 2:30 in seconds
  const MAX_GUESSES_AFTER_TWO = 3;
  const STORAGE_KEY = "oc_wall_history";

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

  function saveResult(episodeIndex, wallIndex, groupsFound) {
    const ep = wallData[episodeIndex];
    const key = wallKey(ep, wallIndex);
    const history = getHistory();
    const prev = history[key];
    // Keep the best score
    if (!prev || groupsFound > prev.score) {
      history[key] = {
        score: groupsFound,
        date: new Date().toISOString().slice(0, 10),
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
    const resp = await fetch("data/walls.json");
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
            label.className = `wall-label wall-label-done${result.score === 4 ? " wall-label-perfect" : ""}`;
            label.textContent = `${w.name} ${result.score}/4`;
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
          if (r.score === 4) perfect++;
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

    showScreen("game-screen");
    buildWall();
    startTimer();
  }

  // We only shuffle once at game start — store the order
  let shuffledUnsolved = null;

  // --- Wall Rendering ---

  function buildWall() {
    const container = document.getElementById("wall");
    container.innerHTML = "";

    // Render solved groups at the top
    solvedGroups.forEach((g) => {
      const row = document.createElement("div");
      row.className = "solved-row";

      g.clues.forEach((clue) => {
        const tile = document.createElement("div");
        tile.className = `tile solved ${GROUP_COLORS[g.groupIndex]}`;
        tile.textContent = clue;
        row.appendChild(tile);
      });

      const label = document.createElement("div");
      label.className = `connection-label ${GROUP_COLORS[g.groupIndex]}`;
      label.textContent = g.connection;
      row.appendChild(label);

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

    // Count groups the player actually found (not auto-solved)
    // If won with 3 solved + 1 auto, the auto-solved 4th still counts
    const found = solvedGroups.length;

    // Save to history
    saveResult(currentWall.episodeIndex, currentWall.wallIndex, found);

    // Linger on completed wall so the user can admire it, shorter pause on failure
    setTimeout(() => showResults(won), won ? 3500 : 1200);
  }

  function showResults(won) {
    const solvedIndices = new Set(solvedGroups.map((g) => g.groupIndex));
    const allGroups = currentWall.wall.groups.map((group, i) => ({
      ...group,
      groupIndex: i,
      found: solvedIndices.has(i),
    }));

    const found = allGroups.filter((g) => g.found).length;
    const title = document.getElementById("results-title");
    if (found === 4) {
      title.textContent = `Wall solved! ${found}/4 groups found`;
    } else {
      title.textContent = `${found}/4 groups found`;
    }

    const container = document.getElementById("results-groups");
    container.innerHTML = "";

    allGroups.forEach((group) => {
      const div = document.createElement("div");
      div.className = `result-group ${GROUP_COLORS[group.groupIndex]} ${group.found ? "found" : "missed"}`;

      const conn = document.createElement("div");
      conn.className = "connection";
      conn.textContent = group.connection + (group.found ? " \u2713" : " \u2717");

      const clues = document.createElement("div");
      clues.className = "clues";
      clues.textContent = group.clues.join(" \u00b7 ");

      div.appendChild(conn);
      div.appendChild(clues);
      container.appendChild(div);
    });

    document.getElementById("play-again-btn").onclick = () => {
      shuffledUnsolved = null;
      startGame(currentWall.episodeIndex, currentWall.wallIndex);
    };

    document.getElementById("back-menu-btn").onclick = () => {
      shuffledUnsolved = null;
      buildMenu(); // Rebuild to reflect updated scores
      showScreen("menu-screen");
    };

    showScreen("results-screen");
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
})();
