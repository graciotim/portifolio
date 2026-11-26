const I18N = window.I18N;
const FLAGS = window.FLAGS;
const LANGS = ["pt", "en", "es"];
const HTML_LANG = { pt: "pt-BR", en: "en", es: "es" };
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// ================= Idioma =================
// Ordem: ?lang= na URL → escolha salva → idioma do navegador → inglês.
function detectLang() {
  const fromUrl = new URLSearchParams(location.search).get("lang");
  if (LANGS.includes(fromUrl)) return fromUrl;
  const saved = store.get("lang");
  if (LANGS.includes(saved)) return saved;
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language || ""];
  for (const p of prefs) {
    const base = p.toLowerCase().split("-")[0];
    if (LANGS.includes(base)) return base;
  }
  return "en";
}

let lang = detectLang();
const t = (key) => I18N[lang][key] ?? I18N.pt[key] ?? key;

function applyLang(next, { save = false } = {}) {
  lang = next;
  if (save) store.set("lang", next);
  document.documentElement.lang = HTML_LANG[next];
  document.title = t("meta.title");
  document.querySelector('meta[name="description"]').setAttribute("content", t("meta.desc"));

  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    el.dataset.i18nAttr.split(";").forEach((pair) => {
      const [attr, key] = pair.split(":");
      el.setAttribute(attr, t(key));
    });
  });

  document.getElementById("langFlag").innerHTML = FLAGS[next];
  document.getElementById("langCode").textContent = next.toUpperCase();
  document.querySelectorAll("#langMenu [data-lang]").forEach((li) => {
    li.setAttribute("aria-selected", li.dataset.lang === next);
  });

  terminals.forEach((term) => term.rebuild());
}

// Menu de idiomas
const langBtn = document.getElementById("langBtn");
const langMenu = document.getElementById("langMenu");
const langItems = [...langMenu.querySelectorAll("[data-lang]")];
langItems.forEach((li) => { li.querySelector(".flag").innerHTML = FLAGS[li.dataset.lang]; });

function openLangMenu() {
  langMenu.hidden = false;
  langBtn.setAttribute("aria-expanded", "true");
  (langItems.find((li) => li.dataset.lang === lang) || langItems[0]).focus();
}
function closeLangMenu(focusBtn = false) {
  langMenu.hidden = true;
  langBtn.setAttribute("aria-expanded", "false");
  if (focusBtn) langBtn.focus();
}
langBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  langMenu.hidden ? openLangMenu() : closeLangMenu();
});
langItems.forEach((li) => {
  li.addEventListener("click", () => { applyLang(li.dataset.lang, { save: true }); closeLangMenu(true); });
});
langMenu.addEventListener("keydown", (e) => {
  const i = langItems.indexOf(document.activeElement);
  if (e.key === "ArrowDown") { e.preventDefault(); langItems[(i + 1) % langItems.length].focus(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); langItems[(i - 1 + langItems.length) % langItems.length].focus(); }
  else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); document.activeElement.click(); }
  else if (e.key === "Escape" || e.key === "Tab") { closeLangMenu(e.key === "Escape"); }
});
document.addEventListener("click", (e) => {
  if (!langMenu.hidden && !e.target.closest("#lang")) closeLangMenu();
});

// ================= Terminais digitando =================
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// Monta os tokens de uma query: SELECT … FROM … WHERE … = '…' ORDER BY … DESC;
const sqlTokens = ({ comment, select, from, where, val, order, hint }) => [
  ["c", comment + "\n"],
  ["k", "SELECT"], ["", " " + select + "\n"],
  ["k", "FROM"], ["", " " + from + "\n"],
  ["k", "WHERE"], ["", ` ${where} = `], ["s", val], ["", "\n"],
  ["k", "ORDER BY"], ["", " " + order + " "], ["k", "DESC"], ["", ";"],
  ...(hint ? [["", "\n"], ["c", hint]] : []),
];

// duration: tempo total (ms) pra digitar a query inteira, independente do idioma/tamanho.
function createTerminal({ code, result, build, delay = 400, duration = 2600, onDone }) {
  let tokens = [];
  let done = false;
  let started = false;
  const length = () => tokens.reduce((n, [, s]) => n + s.length, 0);

  function render(chars) {
    let left = chars;
    let html = "";
    for (const [cls, text] of tokens) {
      if (left <= 0) break;
      const part = esc(text.slice(0, left));
      html += cls ? `<span class="${cls}">${part}</span>` : part;
      left -= text.length;
    }
    code.innerHTML = html;
  }

  function finish(wait) {
    done = true;
    setTimeout(() => {
      result.hidden = false;
      onDone?.();
    }, wait);
  }

  return {
    get done() { return done; },
    rebuild() { tokens = build(); if (done) render(length()); },
    start() {
      if (started) return;
      started = true;
      if (reduceMotion) { render(length()); finish(0); return; }
      // Digita por tempo (rAF), não por caractere: rápido e com um leve ritmo irregular.
      let t0 = 0;
      let shown = 0;
      const tick = (now) => {
        t0 ||= now;
        const p = Math.min(1, (now - t0) / duration);
        const target = Math.ceil(length() * p);
        // Avança em rajadas de 1–3 chars pra parecer digitação, sem nunca passar do alvo.
        shown = Math.min(target, Math.max(shown + 1, target - Math.floor(Math.random() * 3)));
        render(shown);
        if (shown < length()) requestAnimationFrame(tick);
        else finish(220);
      };
      setTimeout(() => requestAnimationFrame(tick), delay);
    },
  };
}

const heroTerm = createTerminal({
  code: document.getElementById("typed"),
  result: document.getElementById("termResult"),
  build: () => sqlTokens({
    comment: t("term.comment"), select: t("term.select"), from: "joao_graciotim",
    where: "area", val: t("term.area"), order: t("term.order"),
    hint: t(isTouch ? "term.psstTouch" : "term.psst"),
  }),
});

const terminals = [heroTerm];
const termIO = new IntersectionObserver(
  (entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target._term.start();
    termIO.unobserve(e.target);
  }),
  // Só dispara quando o terminal está quase inteiro na tela e acima do rodapé da viewport.
  { threshold: 0.5, rootMargin: "0px 0px -10% 0px" }
);
const heroEditor = document.querySelector(".hero .editor");
heroEditor._term = heroTerm;
termIO.observe(heroEditor);

// ================= Easter egg: terminal interativo =================
// Aperte "/" (ou clique no terminal do topo) e digite SQL. Tente um DROP TABLE.
const repl = document.getElementById("repl");
const replOut = document.getElementById("replOut");
const replInput = document.getElementById("replInput");
const heroResult = document.getElementById("termResult");
const fmt = (key, vars) => t(key).replace(/\{(\w+)\}/g, (_, k) => vars[k]);
const replHistory = [];
let histPos = 0;
let errCount = 0;
// A cada 3 erros, o HINT sugere o snake no lugar do "digite help".
const hinted = (msg) => (++errCount % 3 === 0 ? msg.replace(/HINT:.*$/, t("repl.hintSnake")) : msg);

const TABLES = {
  skills: ["skills", "habilidades", "joao_graciotim", "stack"],
  projects: ["projetos", "projects", "proyectos"],
  contact: ["contato", "contact", "contacto"],
  coffee: ["cafe", "café", "coffee"],
};
const findTable = (name) => Object.keys(TABLES).find((k) => TABLES[k].includes(name));

function print(html, cls = "") {
  const line = document.createElement("div");
  if (cls) line.className = cls;
  line.innerHTML = html;
  replOut.append(line);
  replOut.scrollTop = replOut.scrollHeight;
}
const printText = (text, cls) => print(esc(text), cls);

function printTable(head, rows) {
  const th = head.map((h) => `<th>${esc(h)}</th>`).join("");
  const tr = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
  print(`<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`);
  printText(fmt("repl.rows", { n: rows.length }), "muted");
}

function selectFrom(table) {
  if (table === "skills") {
    const rows = [...heroResult.querySelectorAll("tbody tr")].map((tr) => [
      esc(tr.cells[0].textContent),
      tr.cells[1].innerHTML,
    ]);
    printTable([t("term.col1"), t("term.col2")], rows);
  } else if (table === "projects") {
    const rows = [...document.querySelectorAll(".project:not(.project--cta)")].map((p) => [
      esc(p.querySelector(".subheading").textContent),
      esc(p.querySelector(".project__meta .caption:last-child").textContent),
    ]);
    printTable([t("repl.colTitle"), t("repl.colYear")], rows);
  } else if (table === "contact") {
    const email = document.getElementById("copyEmail").dataset.email;
    printTable(["canal", "valor"], [
      ["email", esc(email)],
      ["linkedin", "linkedin.com/in/joaograciotim"],
      ["github", "github.com/graciotim"],
    ]);
    navigator.clipboard?.writeText(email).then(() => showToast(t("repl.copied")), () => {});
  } else if (table === "coffee") {
    printText(t("repl.coffee"), "err");
  }
}

function dropTable(name) {
  const editor = repl.closest(".editor");
  heroResult.classList.add("is-dropping");
  editor.classList.remove("is-shaking");
  void editor.offsetWidth; // reinicia a animação se rodar duas vezes seguidas
  editor.classList.add("is-shaking");
  setTimeout(() => printText(fmt("repl.drop", { t: name }), "err"), 450);
  setTimeout(() => {
    heroResult.classList.remove("is-dropping");
    editor.classList.remove("is-shaking");
  }, 1400);
}

function run(raw) {
  const q = raw.trim().replace(/;+\s*$/, "");
  if (!q) return;
  print(`<span class="k">sql&gt;</span> ${esc(raw.trim())}`, "echo");
  const low = q.toLowerCase().replace(/\s+/g, " ");
  let m;

  if (["help", "\\?", "\\h", "\\dt", "\\d"].includes(low)) printText(t("repl.help"), "muted");
  else if (["clear", "cls", "\\! clear"].includes(low)) replOut.innerHTML = "";
  else if (["exit", "quit", "\\q"].includes(low)) { printText(t("repl.bye"), "muted"); setTimeout(closeRepl, 600); }
  else if ((m = low.match(/^drop (?:table|database|schema) (?:if exists )?([^\s;]+)/))) dropTable(m[1].replace(/"/g, ""));
  else if ((m = low.match(/^(drop|delete|truncate|update|insert|alter|create)\b/))) printText(fmt("repl.readonly", { w: m[1].toUpperCase() }), "err");
  else if (/^(snake|play|select .+? from "?snake"?)$/.test(low)) Snake.start();
  else if ((m = low.match(/^select .+? from ([^\s;]+)/))) {
    const name = m[1].replace(/"/g, "");
    const table = findTable(name);
    table ? selectFrom(table) : printText(hinted(fmt("repl.notable", { t: name })), "err");
  } else printText(hinted(fmt("repl.syntax", { w: q.split(" ")[0] })), "err");
}

function openRepl({ focus = true } = {}) {
  if (!heroTerm.done || Snake.active) return;
  const editor = repl.closest(".editor");
  if (repl.hidden) {
    repl.hidden = false;
    editor.classList.add("is-repl");
    if (!replOut.childElementCount) printText(t("repl.welcome"), "muted");
  }
  const r = editor.getBoundingClientRect();
  if (r.top < 0 || r.bottom > innerHeight) editor.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
  if (focus) replInput.focus({ preventScroll: true });
}
function closeRepl() {
  repl.hidden = true;
  repl.closest(".editor").classList.remove("is-repl");
  replInput.blur();
}

replInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const v = replInput.value;
    if (v.trim()) { replHistory.push(v); histPos = replHistory.length; }
    replInput.value = "";
    run(v);
  } else if (e.key === "ArrowUp" && replHistory.length) {
    e.preventDefault();
    histPos = Math.max(0, histPos - 1);
    replInput.value = replHistory[histPos];
  } else if (e.key === "ArrowDown" && replHistory.length) {
    e.preventDefault();
    histPos = Math.min(replHistory.length, histPos + 1);
    replInput.value = replHistory[histPos] ?? "";
  } else if (e.key === "Escape") closeRepl();
});
document.getElementById("replHint").addEventListener("click", openRepl);
document.querySelector(".hero .editor").addEventListener("click", (e) => {
  if (!e.target.closest("button, a, input")) openRepl();
});
// Pista no rodapé: leva até o terminal e já abre o jogo.
document.getElementById("footerSnake").addEventListener("click", () => {
  heroTerm.start();
  heroEditor.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
  const go = () => (heroTerm.done ? (openRepl({ focus: false }), run("snake")) : setTimeout(go, 150));
  go();
});
if (isTouch) document.querySelector("#replHint [data-i18n]").dataset.i18n = "repl.hintTouch";
document.addEventListener("keydown", (e) => {
  if (e.key !== "/"|| e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest("input, textarea, select, [contenteditable]")) return;
  e.preventDefault();
  openRepl();
});

// ================= Nav =================
const nav = document.getElementById("nav");
const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

const menuBtn = document.getElementById("menuBtn");
const navLinks = document.getElementById("navLinks");
function setMenu(open) {
  navLinks.classList.toggle("is-open", open);
  nav.classList.toggle("menu-open", open);
  menuBtn.setAttribute("aria-expanded", open);
}
menuBtn.addEventListener("click", () => setMenu(!navLinks.classList.contains("is-open")));
navLinks.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setMenu(false)));

// Link ativo conforme a seção visível
const spy = new IntersectionObserver(
  (entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    navLinks.querySelectorAll("a").forEach((a) =>
      a.classList.toggle("is-current", a.getAttribute("href") === `#${e.target.id}`)
    );
  }),
  { rootMargin: "-45% 0px -50% 0px" }
);
document.querySelectorAll("main section[id]").forEach((s) => spy.observe(s));

// ================= Revelar ao rolar =================
const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
  }),
  { threshold: 0.1 }
);
document.querySelectorAll(".reveal").forEach((el, i) => {
  el.style.transitionDelay = `${(i % 4) * 40}ms`;
  io.observe(el);
});

// ================= Impacto: contagem dos indicadores =================
const countIO = new IntersectionObserver(
  (entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    countIO.unobserve(e.target);
    const el = e.target;
    const end = Number(el.dataset.count);
    const dur = 1600;
    let t0 = 0;
    const step = (now) => {
      t0 ||= now;
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }),
  { threshold: 0.6 }
);
if (!reduceMotion) document.querySelectorAll("[data-count]").forEach((el) => { el.textContent = "0"; countIO.observe(el); });

// ================= Filtro de projetos =================
const filterBtns = document.querySelectorAll(".tag-btn");
const projects = document.querySelectorAll(".project");
filterBtns.forEach((btn) =>
  btn.addEventListener("click", () => {
    filterBtns.forEach((b) => b.classList.toggle("is-active", b === btn));
    const f = btn.dataset.filter;
    projects.forEach((p) => {
      const show = f === "all" || p.dataset.tags.split(" ").includes(f);
      p.classList.toggle("is-hidden", !show);
      if (show) p.classList.add("is-in");
    });
  })
);

// ================= Contato =================
const toast = document.getElementById("toast");
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-on"), 2200);
}

const copyBtn = document.getElementById("copyEmail");
copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(copyBtn.dataset.email);
    showToast(t("contact.copied"));
  } catch {
    showToast(copyBtn.dataset.email);
  }
});

// O formulário abre o app de e-mail do visitante com a mensagem preenchida.
const form = document.getElementById("contactForm");
const formError = document.getElementById("formError");
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const fields = [...form.querySelectorAll(".input")];
  let ok = true;
  fields.forEach((f) => {
    const valid = f.value.trim() !== "" && f.checkValidity();
    f.classList.toggle("is-invalid", !valid);
    if (!valid) ok = false;
  });
  formError.hidden = ok;
  if (!ok) { fields.find((f) => f.classList.contains("is-invalid"))?.focus(); return; }

  const { name, email, message } = Object.fromEntries(new FormData(form));
  const to = copyBtn.dataset.email;
  const body = `${message}\n\n— ${name} (${email})`;
  showToast(t("form.opening"));
  location.href = `mailto:${to}?subject=${encodeURIComponent(t("form.subject"))}&body=${encodeURIComponent(body)}`;
});

// ================= Início =================
document.getElementById("year").textContent = new Date().getFullYear();
applyLang(lang);
