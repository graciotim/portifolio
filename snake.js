// ================= Easter egg: snake =================
// Digite "snake" (ou SELECT * FROM snake) no terminal do topo.
// PC: setas/WASD, espaço pausa, Esc sai. Celular: deslize no tabuleiro, toque pausa.
// Usa as funções do terminal definidas em script.js (print, t, fmt, store…).
const Snake = (() => {
  const COLS = 20;
  const ROWS = 14;
  const MAX_CELL = 28;
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const KEYS = {
    arrowup: "up", w: "up", arrowdown: "down", s: "down",
    arrowleft: "left", a: "left", arrowright: "right", d: "right",
  };

  const wrap = document.getElementById("snake");
  const board = document.getElementById("snakeBoard");
  const canvas = document.getElementById("snakeCanvas");
  const hud = document.getElementById("snakeScore");
  const msg = document.getElementById("snakeMsg");
  const prompt = repl.querySelector(".repl__prompt");
  const ctx = canvas.getContext("2d");

  const css = getComputedStyle(document.documentElement);
  const color = (v) => css.getPropertyValue(v).trim();
  const C = {
    bg: color("--color-void"),
    dot: color("--color-charcoal"),
    body: color("--color-phosphor-green"),
    head: color("--color-snow"),
    food: color("--color-mint-pulse"),
  };

  let active = false;
  let state = "ready"; // ready | playing | paused | over
  let snake = [];
  let dir = "right";
  let queue = [];
  let food = null;
  let score = 0;
  let timer = 0;
  let cell = 0;

  const loadScores = () => {
    try { return JSON.parse(store.get("snake.scores")) || []; } catch { return []; }
  };
  const best = () => loadScores()[0]?.score ?? 0;
  const speed = () => (reduceMotion ? 130 : Math.max(65, 140 - score * 4));
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];

  function showMsg(key) {
    msg.textContent = key ? t(key) : "";
    msg.hidden = !key;
  }

  function resize() {
    cell = Math.min(MAX_CELL, Math.floor(board.clientWidth / COLS));
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${cell * COLS}px`;
    canvas.style.height = `${cell * ROWS}px`;
    canvas.width = cell * COLS * dpr;
    canvas.height = cell * ROWS * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function draw() {
    hud.textContent = fmt("snake.hud", { s: score, b: Math.max(best(), score) });
    if (!cell) return;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, cell * COLS, cell * ROWS);
    ctx.fillStyle = C.dot;
    for (let x = 0; x < COLS; x++)
      for (let y = 0; y < ROWS; y++) ctx.fillRect(x * cell + cell / 2 - 1, y * cell + cell / 2 - 1, 2, 2);
    if (food) {
      ctx.fillStyle = C.food;
      ctx.beginPath();
      ctx.arc(food[0] * cell + cell / 2, food[1] * cell + cell / 2, cell * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    snake.forEach(([x, y], i) => {
      ctx.fillStyle = i ? C.body : C.head;
      ctx.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
    });
  }

  function placeFood() {
    const free = [];
    for (let x = 0; x < COLS; x++)
      for (let y = 0; y < ROWS; y++) if (!snake.some((p) => same(p, [x, y]))) free.push([x, y]);
    food = free[Math.floor(Math.random() * free.length)] ?? null;
  }

  function reset() {
    const y = ROWS >> 1;
    snake = [[6, y], [5, y], [4, y]];
    dir = "right";
    queue = [];
    score = 0;
    placeFood();
    state = "ready";
    showMsg(isTouch ? "snake.startTouch" : "snake.startKey");
  }

  function step() {
    if (queue.length) dir = queue.shift();
    const [dx, dy] = DIRS[dir];
    const prev = snake[0];
    const head = [prev[0] + dx, prev[1] + dy];
    const eating = food && same(head, food);
    const body = eating ? snake : snake.slice(0, -1); // a cauda sai do lugar antes da cabeça chegar

    if (head[0] < 0 || head[1] < 0 || head[0] >= COLS || head[1] >= ROWS) return gameOver("snake.wall", prev);
    if (body.some((p) => same(p, head))) return gameOver("snake.self", head);

    snake = [head, ...body];
    if (eating) { score++; placeFood(); }
    draw();
    timer = setTimeout(step, speed());
  }

  function resume() {
    state = "playing";
    showMsg(null);
    clearTimeout(timer);
    timer = setTimeout(step, speed());
  }
  function pause() {
    if (state !== "playing") return;
    state = "paused";
    clearTimeout(timer);
    showMsg("snake.paused");
  }
  const togglePause = () => (state === "playing" ? pause() : state === "paused" && resume());

  function turn(d) {
    if (state === "over") return;
    const last = queue.at(-1) || dir;
    const [lx, ly] = DIRS[last];
    const [nx, ny] = DIRS[d];
    const reverse = lx + nx === 0 && ly + ny === 0;
    if (d !== last && !reverse && queue.length < 2) queue.push(d);
    if (state !== "playing") resume();
  }

  function start() {
    active = true;
    replOut.hidden = true;
    prompt.hidden = true;
    wrap.hidden = false;
    replInput.blur(); // fecha o teclado virtual no celular
    reset();
    resize();
    // Espera o teclado do celular fechar antes de centralizar o jogo.
    setTimeout(() => {
      const r = wrap.getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight) wrap.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    }, isTouch ? 350 : 0);
  }

  function stop() {
    if (!active) return;
    active = false;
    state = "over";
    clearTimeout(timer);
    wrap.hidden = true;
    replOut.hidden = false;
    prompt.hidden = false;
    replOut.scrollTop = replOut.scrollHeight;
    if (!isTouch) replInput.focus({ preventScroll: true });
  }

  function gameOver(key, [x, y]) {
    state = "over";
    clearTimeout(timer);
    draw();
    setTimeout(() => {
      stop();
      const entry = { score, date: new Date().toISOString().slice(0, 10) };
      const top = [...loadScores(), entry].sort((a, b) => b.score - a.score).slice(0, 5);
      store.set("snake.scores", JSON.stringify(top.filter((s) => s.score > 0)));

      const day = (d) => new Date(`${d}T00:00`).toLocaleDateString(HTML_LANG[lang]);
      const rows = top.map((s, i) => {
        const cells = [String(i + 1), String(s.score), esc(day(s.date))];
        return s === entry ? cells.map((c) => `<span class="k">${c}</span>`) : cells;
      });

      printText(fmt(key, { x, y }), "err");
      print(`<span class="k">sql&gt;</span> INSERT INTO high_scores VALUES (${score});`, "echo");
      printText("INSERT 0 1", "muted");
      printTable([t("snake.colRank"), t("snake.colScore"), t("snake.colDate")], rows);
      if (score > 0 && top[0] === entry) printText(t("snake.record"), "muted");
      print(`<button class="repl__again" type="button">${esc(t("snake.again"))}</button>`);
    }, 600);
  }

  // Teclado (PC)
  document.addEventListener("keydown", (e) => {
    if (!active) return;
    const k = e.key.toLowerCase();
    if (KEYS[k]) { e.preventDefault(); turn(KEYS[k]); }
    else if (k === " ") { e.preventDefault(); togglePause(); }
    else if (k === "escape") { e.preventDefault(); stop(); }
  });

  // Swipe (celular): vira assim que o dedo anda ~20px, dá pra encadear curvas sem soltar.
  let origin = null;
  let moved = false;
  board.addEventListener("touchstart", (e) => {
    const p = e.touches[0];
    origin = [p.clientX, p.clientY];
    moved = false;
  }, { passive: true });
  board.addEventListener("touchmove", (e) => {
    if (!origin) return;
    const p = e.touches[0];
    const dx = p.clientX - origin[0];
    const dy = p.clientY - origin[1];
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
    origin = [p.clientX, p.clientY];
    moved = true;
  }, { passive: true });
  board.addEventListener("touchend", () => {
    if (origin && !moved) togglePause();
    origin = null;
  });
  // Não deixa o clique no tabuleiro reabrir o terminal (e o teclado).
  wrap.addEventListener("click", (e) => e.stopPropagation());

  document.getElementById("snakeClose").addEventListener("click", stop);
  replOut.addEventListener("click", (e) => {
    if (e.target.closest(".repl__again")) run("snake");
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  window.addEventListener("resize", () => { if (active) resize(); });

  return { start, get active() { return active; } };
})();
