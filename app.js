"use strict";

const icons = {
  book: '<path d="M12 7.5c-2-2-5-3-9-2v13c4-1 7 0 9 2 2-2 5-3 9-2v-13c-4-1-7 0-9 2v13"/>',
  home: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"/>',
  quiz: '<path d="m3.5 7 1.5 1.5L8 5.5M3.5 13 5 14.5l3-3M10.5 7h10m-10 6h10m-10 6h10M5 19h.1"/>',
  repeat: '<path d="M4 11a8 8 0 1 1 2.4 6.7M4 5.5V11h5.5"/><path d="M12 8v4l2.5 1.5"/>',
  flash: '<rect x="5.5" y="6" width="15" height="14" rx="2"/><path d="M16 3.5H5a2 2 0 0 0-2 2v11m6-6h8m-8 4h5"/>',
  bank: '<path d="M3 5h18v4H3zM5 9v11h14V9m-9 4h4"/>',
  save: '<path d="M12 22s7-3 7-10V5l-7-3-7 3v7c0 7 7 10 7 10Z"/><path d="m9 12 2 2 4-4"/>',
  play: '<path d="m9 5 11 7-11 7z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".65"/>'
};
const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
const escapeHtml = value => String(value).replace(/[&<>"']/g, letter => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[letter]);
const questionsById = new Map(QUESTIONS.map(question => [question.id, question]));
const graded = QUESTIONS.filter(question => !question.referenceOnly);
const formatter = new Intl.NumberFormat("vi-VN");
const format = number => formatter.format(number);
const DAY = 86_400_000;
const GOAL = 3;
const intervals = [1, 3, 7, 14, 30];
const storageKey = "vnr202-on-den-khi-thuoc-v1";
const views = {
  home: { label: "Tổng quan", short: "Tổng quan", icon: "home" },
  practice: { label: "Luyện trắc nghiệm", short: "Luyện câu", icon: "quiz" },
  revision: { label: "Ôn câu sai", short: "Ôn lại", icon: "repeat" },
  flash: { label: "Thẻ ghi nhớ", short: "Thẻ nhớ", icon: "flash" },
  bank: { label: "Ngân hàng câu hỏi", short: "Câu hỏi", icon: "bank" }
};
const states = {
  mastered: { label: "Đã thuộc", color: "#258369" },
  learning: { label: "Đang học", color: "#5574e8" },
  wrong: { label: "Cần sửa sai", color: "#d6913f" },
  new: { label: "Chưa luyện", color: "#a8b4c9" },
  reference: { label: "Cần đối chiếu", color: "#d6913f" }
};

const main = document.querySelector("#main");
const nav = document.querySelector("#nav");
const announce = document.querySelector("#announce");
const dateFormat = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });
let bankFilter = "all";
let bankQuery = "";
let bankPage = 1;
let storageAvailable = true;

function readState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return {
      stats: saved.stats || {}, sessions: saved.sessions || {}, flash: saved.flash || {},
      settings: Object.assign({ size: 15 }, saved.settings), lastMode: saved.lastMode
    };
  } catch {
    storageAvailable = false;
    return { stats: {}, sessions: {}, flash: {}, settings: { size: 15 } };
  }
}

let state = readState();

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
}

const currentView = () => Object.hasOwn(views, location.hash.slice(1)) ? location.hash.slice(1) : "home";
const statFor = id => state.stats[id] || { attempts: 0, streak: 0, needsRepair: false };
const cardStatus = question => {
  if (question.referenceOnly) return "reference";
  const stat = statFor(question.id);
  if (stat.streak >= GOAL) return "mastered";
  if (stat.needsRepair) return "wrong";
  return stat.attempts ? "learning" : "new";
};
const isDue = (question, now) => {
  const stat = statFor(question.id);
  return stat.streak >= GOAL && stat.dueAt <= now;
};
const badge = (type, label = states[type]?.label) => `<span class="status ${type}">${label}</span>`;
const courseName = "Lịch sử Đảng";
const activeSession = mode => {
  const session = state.sessions[mode];
  return session && !session.done ? session : null;
};

function counts() {
  const totals = { mastered: 0, learning: 0, wrong: 0, new: 0, due: 0, nextDue: Infinity, attempts: 0 };
  const now = Date.now();
  for (const question of graded) {
    const card = statFor(question.id);
    totals[cardStatus(question)]++;
    totals.attempts += card.attempts;
    if (isDue(question, now)) totals.due++;
    else if (card.streak >= GOAL) totals.nextDue = Math.min(totals.nextDue, card.dueAt);
  }
  return totals;
}

function renderNavigation(view, totals) {
  const count = totals.wrong + totals.due;
  nav.innerHTML = '<p class="nav-heading">HỌC TẬP</p>' + Object.entries(views).map(([key, item]) => `
    <a href="#${key}" class="nav-item" aria-label="${item.label}" title="${item.label}" ${key === view ? 'aria-current="page"' : ""}>
      ${icon(item.icon)}<span class="nav-full">${item.label}</span><span class="nav-short">${item.short}</span>
      ${key === "revision" && count ? `<small aria-hidden="true">${count}</small>` : ""}
    </a>`).join("");
  document.querySelector("#top-title").textContent = views[view].label;
  document.querySelector("#storage-icon").innerHTML = icon("save");
  document.querySelector(".local-info p").innerHTML = storageAvailable ? "Tiến độ được lưu trên<br>trình duyệt này." : "Trình duyệt đang chặn<br>lưu tiến độ.";
}

function render({ focus = null, scroll = false } = {}) {
  const view = currentView();
  const totals = counts();
  renderNavigation(view, totals);
  const session = state.sessions[view];
  if (view === "home") main.innerHTML = homePage(totals);
  else if (view === "bank") {
    main.innerHTML = bankShell();
    updateBank();
  } else if (session) {
    main.innerHTML = session.done ? summaryPage(session, totals) : sessionPage(session);
  } else if (view === "practice") main.innerHTML = practicePage(totals);
  else if (view === "revision") main.innerHTML = revisionPage(totals);
  else main.innerHTML = flashPage(totals);
  if (scroll) window.scrollTo(0, 0);
  if (focus) document.querySelector(focus)?.focus({ preventScroll: true });
}

function navigate(view, focus = "main") {
  rememberSession(view);
  if (view !== currentView()) history.pushState(null, "", "#" + view);
  render({ focus, scroll: true });
}

function rememberSession(view) {
  if (activeSession(view) && state.lastMode !== view) {
    state.lastMode = view;
    save();
  }
}

function homePage(totals) {
  const percent = Math.floor(totals.mastered / graded.length * 100);
  const recent = [state.lastMode, "practice", "revision", "flash"].find(mode => activeSession(mode));
  const tap = recent ? `<a class="btn hero" href="#${recent}">${icon("play")} Học tiếp</a>`
    : `<button class="btn hero" data-action="start-practice">${icon("play")} ${totals.attempts ? "Luyện lượt mới" : "Bắt đầu học"}</button>`;
  const due = totals.due ? `${format(totals.due)} câu đến hạn ôn lại hôm nay.`
    : Number.isFinite(totals.nextDue) ? `Lần ôn tiếp theo · ${dateFormat.format(totals.nextDue)}`
    : "Trả lời đúng 3 lần liên tiếp để một câu được tính là đã thuộc.";
  const revisionCopy = totals.wrong
    ? `${format(totals.wrong)} câu sai cần ôn lại.${totals.due ? ` Ngoài ra, ${totals.due} câu đã đến hạn ôn.` : ""}`
    : totals.due ? `${format(totals.due)} câu đã thuộc đến hạn ôn lại.` : "Câu trả lời sai sẽ xuất hiện ở đây để bạn luyện lại.";
  return `
    <section class="dashboard-hero" aria-labelledby="home-title">
      <div>
        <span class="hero-kicker">Lịch sử Đảng Cộng sản Việt Nam</span>
        <h1 id="home-title">Ôn đến khi thuộc</h1>
        <p class="hero-copy">Luyện ${format(graded.length)} câu trắc nghiệm, ôn lại câu sai và tự kiểm tra bằng thẻ ghi nhớ.</p>
        ${tap}
      </div>
      <div class="hero-progress" aria-label="${totals.mastered} trên ${graded.length} câu đã thuộc">
        <div class="donut" style="--progress:${percent}%" aria-hidden="true"><strong>${percent}%</strong></div>
        <span>${format(totals.mastered)} / ${format(graded.length)} câu đã thuộc</span>
      </div>
    </section>
    <section class="home-section" aria-labelledby="modes-title">
      <div class="section-head"><h2 id="modes-title">Chọn cách học</h2></div>
      <div class="cards">
        ${modeCard("blue", "quiz", "Luyện trắc nghiệm", "Trả lời theo từng lượt ngắn và xem đáp án ngay sau mỗi câu.", "practice", activeSession("practice") ? "Luyện tiếp" : "Chọn lượt luyện")}
        ${modeCard("green", "repeat", "Ôn câu sai", revisionCopy, "revision", activeSession("revision") ? "Ôn tiếp" : "Mở phần ôn tập")}
        ${modeCard("warm", "flash", "Thẻ ghi nhớ", "Tự nhẩm đáp án. Những thẻ bạn chưa nhớ sẽ xuất hiện lại.", "flash", activeSession("flash") ? "Xem thẻ tiếp" : "Mở bộ thẻ")}
      </div>
    </section>
    <section class="home-section" aria-labelledby="progress-title">
      <div class="section-head"><h2 id="progress-title">Tiến độ học tập</h2><p>${format(QUESTIONS.length)} câu trong tài liệu</p></div>
      <div class="panel">
        <div class="meter" aria-hidden="true">
          ${["mastered", "learning", "wrong", "new"].map(key => `<span class="${key}" style="width:${totals[key] / graded.length * 100}%"></span>`).join("")}
        </div>
        <div class="metrics">
          ${["mastered", "learning", "wrong", "new"].map(key => `<div class="metric"><i style="--dot:${states[key].color}"></i><div><strong>${format(totals[key])}</strong><span>${states[key].label}</span></div></div>`).join("")}
        </div>
        <p class="panel-foot">${due}</p>
      </div>
    </section>`;
}

function modeCard(theme, symbol, title, description, view, action) {
  return `<article class="mode">
    <div class="mode-icon ${theme}">${icon(symbol)}</div>
    <h3>${title}</h3><p>${description}</p>
    <a class="btn ${theme === "blue" ? "outline" : theme}" href="#${view}">${action}</a>
  </article>`;
}

function pageHeading(title, copy) {
  return `<h1 class="screen-title">${title}</h1><p class="lead">${copy}</p>`;
}

function practicePage(totals) {
  return `<div class="subview compact">
    ${pageHeading("Luyện trắc nghiệm", "Mỗi câu có phản hồi ngay sau khi nộp. Câu sai được đưa vào lượt ôn riêng.")}
    <section class="panel start-panel">
      <h2 class="inline-icon">${icon("quiz")} Lượt luyện mới</h2>
      <p>${totals.new ? `${format(totals.new)} câu bạn chưa luyện.` : "Bạn đã luyện qua toàn bộ câu có thể chấm."} Lượt luyện xen kẽ câu mới và câu đang học.</p>
      ${segments("practiceSize", "Số câu mỗi lượt", [["10", "10 câu"], ["15", "15 câu"], ["25", "25 câu"], ["40", "40 câu"]], String(state.settings.size))}
      <div class="controls"><button class="btn primary" data-action="start-practice">${icon("play")} Bắt đầu luyện</button></div>
    </section>
    <p class="panel-foot">Mỗi câu cần 3 lần trả lời đúng liên tiếp để tính là đã thuộc. Khi trả lời sai, chuỗi đúng của câu đó bắt đầu lại từ đầu.</p>
  </div>`;
}

function revisionPage(totals) {
  const dueCopy = totals.due ? `${format(totals.due)} câu đến hạn kiểm tra trí nhớ.`
    : Number.isFinite(totals.nextDue) ? `Lần ôn tiếp theo · ${dateFormat.format(totals.nextDue)}.` : "Câu đã thuộc sẽ được lên lịch kiểm tra từ ngày hôm sau.";
  return `<div class="subview compact">
    ${pageHeading("Ôn câu sai", "Trả lời lại qua nhiều vòng. Sau 3 lần đúng liên tiếp, câu đó sẽ rời danh sách cần sửa sai.")}
    <section class="panel start-panel">
      <h2 class="inline-icon">${icon("repeat")} ${format(totals.wrong)} câu cần sửa sai</h2>
      <p>${totals.wrong ? "Bắt đầu một lượt ôn tối đa 15 câu sai. Mỗi vòng sẽ đưa các câu còn yếu trở lại." : "Các câu bạn trả lời sai hoặc bấm “Chưa nhớ” sẽ xuất hiện ở đây."}</p>
      <div class="controls">${totals.wrong
        ? '<button class="btn primary" data-action="start-wrong">Ôn câu sai</button>'
        : '<a class="btn outline" href="#practice">Luyện trắc nghiệm</a>'}</div>
    </section>
    <section class="panel start-panel">
      <h2 class="inline-icon">${icon("clock")} Ôn theo lịch</h2>
      <p>${dueCopy}</p>
      ${totals.due ? '<div class="controls"><button class="btn primary" data-action="start-due">Ôn câu đến hạn</button></div>' : ""}
    </section>
  </div>`;
}

function flashPage(totals) {
  return `<div class="subview compact">
    ${pageHeading("Thẻ ghi nhớ", "Đọc câu hỏi, nói hoặc nhẩm đáp án rồi mới lật thẻ. Lặp lại những thẻ bạn chưa nhớ.")}
    <section class="panel start-panel">
      <h2 class="inline-icon">${icon("flash")} Bộ thẻ mới</h2>
      <p>Mỗi lượt gồm tối đa 15 thẻ. Kết quả thẻ giúp bạn chọn câu cần học lại. Trắc nghiệm dùng để kiểm tra mức độ thuộc.</p>
      <div class="controls">
        <button class="btn primary" data-action="start-flash">Bắt đầu lật thẻ</button>
        ${totals.wrong ? '<button class="btn outline" data-action="flash-wrong">Lật thẻ câu sai</button>' : ""}
      </div>
    </section>
  </div>`;
}

function segments(name, label, values, selected) {
  return `<fieldset class="setting"><legend>${label}</legend><div class="segment">
    ${values.map(([value, title]) => `<label><input type="radio" name="${name}" value="${value}" ${selected === value ? "checked" : ""}><span>${title}</span></label>`).join("")}
  </div></fieldset>`;
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function mixPractice(size) {
  const shuffled = shuffle(graded);
  const fresh = shuffled.filter(question => cardStatus(question) === "new");
  const learning = shuffled.filter(question => cardStatus(question) === "learning");
  const wrong = shuffled.filter(question => cardStatus(question) === "wrong");
  const due = shuffled.filter(question => isDue(question, Date.now()));
  const available = [...learning, ...wrong, ...due];
  const mastered = shuffled.filter(question => cardStatus(question) === "mastered" && !due.includes(question));
  const targetNew = Math.min(fresh.length, Math.ceil(size * .6));
  return shuffle([...fresh.slice(0, targetNew), ...available, ...fresh.slice(targetNew), ...mastered].slice(0, size));
}

function startPractice() {
  startSession("practice", "practice", mixPractice(state.settings.size));
}

function startRevision(kind) {
  const time = Date.now();
  const selected = kind === "wrong"
    ? graded.filter(question => cardStatus(question) === "wrong")
      .sort((a, b) => statFor(a.id).lastAt - statFor(b.id).lastAt)
    : graded.filter(question => isDue(question, time))
      .sort((a, b) => statFor(a.id).dueAt - statFor(b.id).dueAt);
  if (selected.length) startSession("revision", kind, shuffle(selected.slice(0, 15)));
}

function startFlash(kind) {
  const source = kind === "flashWrong" ? graded.filter(question => cardStatus(question) === "wrong") : graded;
  const pool = shuffle(source).sort((a, b) => {
    const first = state.flash[a.id];
    const second = state.flash[b.id];
    return Number(Boolean(second?.difficult)) - Number(Boolean(first?.difficult)) || (first?.lastAt || 0) - (second?.lastAt || 0);
  });
  if (pool.length) startSession("flash", kind, pool.slice(0, 15));
}

function orderFor(question) {
  const match = /\b(?:trên|dưới|cả\s+[A-E]|[A-E]\s+(?:và|hoặc)\s+[A-E])\b/iu;
  const values = Object.values(question.choices);
  const dependsOnOrder = values.some(value =>
    /(?:phương án|đáp án|ý|câu)\s+[a-e]\b|(?:tất cả|cả\s+\d+)\s+(?:đều|các|phương án|đáp án)|\b(?:trên|dưới)\b.*(?:đúng|sai)|(?:đúng|sai).*\b(?:trên|dưới)\b/iu.test(value)
    || match.test(value) && /(?:đáp án|phương án|đều đúng|đều sai|ý trên)/iu.test(value));
  const keys = Object.keys(question.choices);
  return dependsOnOrder ? keys : shuffle(keys);
}

function startSession(mode, kind, questions) {
  if (!questions.length) return;
  const session = { mode, kind, queue: questions.map(question => question.id), pending: [],
    startSize: questions.length, index: 0, round: 1, total: 0, correct: 0, newMastered: 0,
    crossed: [], done: false };
  prepare(session);
  state.sessions[mode] = session;
  state.lastMode = mode;
  save();
  navigate(mode, "#prompt");
}

function prepare(session) {
  const question = questionsById.get(session.queue[session.index]);
  session.order = orderFor(question);
  session.selected = [];
  session.result = null;
  session.revealed = false;
}

function statusForScreen(question) {
  const type = cardStatus(question);
  const stat = statFor(question.id);
  if (type === "learning" || type === "wrong") return badge(type, `${stat.streak}/${GOAL} lần đúng liên tiếp`);
  return badge(type);
}

function sessionTitle(session) {
  return ({ practice: "Luyện trắc nghiệm", single: "Luyện một câu", wrong: "Ôn câu sai",
    due: "Ôn theo lịch", flash: "Thẻ ghi nhớ", flashWrong: "Thẻ ghi nhớ · Câu sai" })[session.kind];
}

function sessionPage(session) {
  const question = questionsById.get(session.queue[session.index]);
  const completeInRound = session.index + (session.result ? 1 : 0);
  return `<div class="subview">
    <div class="context">
      ${badge("feature", sessionTitle(session))}
      <span>${session.mode !== "practice" ? `Vòng ${session.round} · ` : ""}${session.mode === "flash" ? "Thẻ" : "Câu"} ${session.index + 1} / ${session.queue.length}</span>
      <a class="btn plain" href="#home">Tạm dừng</a>
    </div>
    <div class="meter study-meter" role="progressbar" aria-label="Tiến độ vòng này" aria-valuemin="0" aria-valuemax="${session.queue.length}" aria-valuenow="${completeInRound}"><span style="width:${completeInRound / session.queue.length * 100}%"></span></div>
    ${session.mode === "flash" ? flashCard(question, session) : quizCard(question, session)}
  </div>`;
}

function quizCard(question, session) {
  const confirmed = Boolean(session.result);
  const required = question.keys.length;
  const shownKeys = session.order.map((key, index) => question.keys.includes(key) ? index : -1).filter(index => index >= 0);
  const correctLabels = shownKeys.map(index => String.fromCharCode(65 + index)).join(", ");
  const result = session.result;
  return `<section class="panel question-panel" aria-labelledby="prompt">
    <div class="question-meta"><span>Câu #${question.id} · Trang ${question.page} PDF</span>${statusForScreen(question)}</div>
    <h1 class="prompt" id="prompt" tabindex="-1">${escapeHtml(question.text)}</h1>
    <p class="instructions">${required === 1 ? "Chọn 1 đáp án." : `Chọn đủ ${required} đáp án.`}</p>
    <div class="options" aria-label="Đáp án">${optionButtons(question, session.order, session.selected, confirmed)}</div>
    ${confirmed ? `<div id="feedback" tabindex="-1" class="feedback ${result.correct ? "good" : ""}">
      <strong>${result.correct ? "Chính xác" : result.skipped ? "Ghi vào danh sách ôn" : "Chưa chính xác"}</strong>
      <p>Đáp án theo PDF · ${correctLabels}</p>
      <p>${result.correct ? (result.mastered ? "Câu này đã thuộc và có lịch ôn tiếp theo." : "Câu này sẽ xuất hiện lại trong các lượt luyện.") : "Câu này đã được ghi vào phần Ôn câu sai."}</p>
    </div>${sourceNote(question, /^\((?:Câu trả lời đúng|Kết quả đúng)/u.test(question.note))}` : ""}
    <div class="controls">
      ${confirmed
        ? `<span class="hint keyboard">Enter để tiếp tục</span><div class="spacer"></div><button class="btn primary" data-action="next">${nextLabel(session)}</button>`
        : `<button class="btn plain" data-action="skip">Chưa nhớ</button><span class="hint keyboard">${shortcutText(session.order.length)} · Enter để nộp</span>
          <div class="spacer"></div><button class="btn primary" data-action="submit" ${session.selected.length === required ? "" : "disabled"}>Kiểm tra đáp án</button>`}
    </div>
  </section>`;
}

function nextLabel(session) {
  if (session.index + 1 < session.queue.length) return "Câu tiếp theo";
  return session.pending.length ? "Bắt đầu vòng tiếp" : "Xem kết quả";
}

function shortcutText(length) {
  return `Phím 1–${length} tương ứng A–${String.fromCharCode(64 + length)}`;
}

function optionButtons(question, order, selected, confirmed, showKeys = true) {
  return order.map((key, index) => {
    const label = String.fromCharCode(65 + index);
    const chosen = selected.includes(key);
    const right = confirmed && showKeys && question.keys.includes(key);
    const wrong = confirmed && chosen && !right;
    const text = escapeHtml(question.choices[key]);
    const body = `<span class="letter" aria-hidden="true">${label}</span><span class="choice-text">${text}</span>${right ? icon("check") : wrong ? icon("close") : ""}`;
    if (confirmed) return `<div class="option ${right ? "correct" : wrong ? "incorrect" : ""}">${body}<span class="sr-only">(${label}${right ? ", đáp án đúng theo PDF" : wrong ? ", lựa chọn chưa đúng" : ""})</span></div>`;
    return `<button class="option" data-action="option" data-key="${key}" aria-label="${label}. ${text}" aria-pressed="${chosen}" aria-keyshortcuts="${index + 1} ${label}">${body}</button>`;
  }).join("");
}

function sourceNote(question, open = false) {
  if (!question.note) return "";
  return `<details class="source-note" ${open ? "open" : ""}>
    <summary>Ghi chú trong tài liệu</summary>
    <p>${escapeHtml(question.note.replace(/^\((.*)\)$/, "$1"))}</p>
  </details>`;
}

function flashCard(question, session) {
  return `<section class="panel question-panel" aria-labelledby="prompt">
    <div class="question-meta"><span>Câu #${question.id} · Trang ${question.page} PDF</span>${statusForScreen(question)}</div>
    <div class="flash-area">
      <h1 class="prompt" id="prompt" tabindex="-1">${escapeHtml(question.text)}</h1>
      ${session.revealed ? `
        <div class="flash-answer" id="flash-answer" tabindex="-1">
          <strong>Đáp án theo PDF</strong>
          <ul>${[...question.keys].map(key => `<li>${escapeHtml(question.choices[key])}</li>`).join("")}</ul>
        </div>${sourceNote(question)}`
        : '<p class="flash-hint">Thử tự nhẩm đáp án trước khi lật thẻ.</p>'}
    </div>
    <div class="controls">
      ${session.revealed ? `<button class="btn outline" data-action="rate-no">${icon("repeat")} Chưa nhớ</button>
        <div class="spacer"></div><button class="btn primary" data-action="rate-yes">${icon("check")} Đã nhớ</button>`
        : `<span class="hint keyboard">Enter để lật thẻ</span><div class="spacer"></div>
        <button class="btn primary" data-action="reveal">${icon("flash")} Xem đáp án</button>`}
    </div>
  </section>`;
}

function summaryPage(session, totals) {
  const isFlash = session.mode === "flash";
  const isRevision = session.mode === "revision";
  let description = isFlash ? "Bạn đã tự nhớ được các thẻ trong lượt này."
    : isRevision ? "Bạn đã hoàn thành vòng ôn cho các câu trong lượt này."
    : `Bạn đã luyện xong ${format(session.startSize)} câu.`;
  const metrics = isFlash
    ? [[session.startSize, "Thẻ đã nhớ"], [session.total - session.correct, "Lần cần xem lại"], [session.round, "Vòng lật thẻ"]]
    : [[session.correct, "Lượt trả lời đúng"], [session.total - session.correct, "Lượt chưa đúng"], [session.newMastered, "Câu mới thuộc"]];
  return `<div class="subview compact">
    ${pageHeading("Hoàn thành lượt học", description)}
    <section class="panel">
      <h2 class="inline-icon">${icon("check")} Kết quả ${sessionTitle(session).toLocaleLowerCase("vi")}</h2>
      <div class="summary-stats">
        ${metrics.map(([number, label]) => `<div class="summary-stat"><strong>${format(number)}</strong><span>${label}</span></div>`).join("")}
      </div>
      ${!isFlash && totals.wrong ? `<p class="lead">Còn ${format(totals.wrong)} câu cần sửa sai.</p>` : ""}
      <div class="controls">
        ${session.mode === "practice" && totals.wrong
          ? (activeSession("revision") ? '<a class="btn primary" href="#revision">Tiếp tục ôn câu sai</a>' : '<button class="btn primary" data-action="start-wrong">Ôn câu sai</button>')
          : session.mode === "practice"
            ? '<button class="btn primary" data-action="start-practice">Luyện lượt tiếp theo</button>'
            : '<button class="btn primary" data-action="reset-view">Chọn lượt mới</button>'}
        ${session.mode === "practice" && totals.wrong ? '<button class="btn outline" data-action="reset-view">Chọn lượt luyện mới</button>' : ""}
        <a class="btn plain" href="#home">Về tổng quan</a>
      </div>
    </section>
  </div>`;
}

function toggleChoice(session, key) {
  if (session.result || !session.order.includes(key)) return;
  const question = questionsById.get(session.queue[session.index]);
  const selected = session.selected;
  if (selected.includes(key)) session.selected = selected.filter(item => item !== key);
  else if (question.keys.length === 1) session.selected = [key];
  else session.selected = [...selected, key];
  save();
  for (const button of main.querySelectorAll('[data-action="option"]')) {
    button.setAttribute("aria-pressed", String(session.selected.includes(button.dataset.key)));
  }
  main.querySelector('[data-action="submit"]').disabled = session.selected.length !== question.keys.length;
  if (question.keys.length > 1) announce.textContent = `Đã chọn ${session.selected.length} đáp án. Cần đúng ${question.keys.length} lựa chọn.`;
}

function score(question, correct, now) {
  const card = statFor(question.id);
  const wasMastered = card.streak >= GOAL;
  card.attempts++;
  card.lastAt = now;
  card.streak = correct ? Math.min(card.streak + 1, GOAL) : 0;
  if (!correct) {
    card.needsRepair = true;
    delete card.dueAt;
    delete card.interval;
  } else if (card.streak >= GOAL) {
    card.needsRepair = false;
    if (!wasMastered || now >= card.dueAt) {
      card.interval = wasMastered ? Math.min(card.interval + 1, intervals.length - 1) : 0;
      card.dueAt = now + intervals[card.interval] * DAY;
    }
  }
  state.stats[question.id] = card;
  return { mastered: card.streak >= GOAL, newlyMastered: !wasMastered && card.streak >= GOAL };
}

function submitAnswer(session, skipped) {
  if (session.result) return;
  const question = questionsById.get(session.queue[session.index]);
  if (!skipped && session.selected.length !== question.keys.length) return;
  const correct = !skipped && session.selected.every(key => question.keys.includes(key));
  if (skipped) session.selected = [];
  const result = score(question, correct, Date.now());
  session.result = { correct, skipped, mastered: result.mastered };
  session.total++;
  if (correct) session.correct++;
  if (result.newlyMastered && !session.crossed.includes(question.id)) {
    session.crossed.push(question.id);
    session.newMastered++;
  }
  if (session.mode === "revision" && !result.mastered) session.pending.push(question.id);
  save();
  render({ focus: "#feedback" });
  document.querySelector("#feedback")?.scrollIntoView({ block: "nearest" });
}

function advance(session) {
  session.index++;
  if (session.index === session.queue.length) {
    if (session.pending.length) {
      session.queue = session.pending;
      session.pending = [];
      session.index = 0;
      session.round++;
    } else session.done = true;
  }
  if (!session.done) prepare(session);
  save();
  render({ focus: session.done ? "main" : "#prompt", scroll: true });
}

function rateFlash(session, remembered) {
  if (!session.revealed) return;
  const id = session.queue[session.index];
  const record = { difficult: !remembered, lastAt: Date.now() };
  state.flash[id] = record;
  session.total++;
  if (remembered) session.correct++;
  else session.pending.push(id);
  advance(session);
}

function normalize(value) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replaceAll("đ", "d");
}
const searchIndex = new Map(QUESTIONS.map(question => [
  question.id, normalize(`${question.id} ${question.text} ${Object.values(question.choices).join(" ")}`)
]));

function bankShell() {
  return `<div class="subview">
    ${pageHeading("Ngân hàng câu hỏi", `Tra cứu ${format(QUESTIONS.length)} câu theo từ khóa hoặc số câu. Mở mỗi câu để xem đáp án trong tài liệu.`)}
    <div class="bank-controls">
      <label class="search">${icon("search")}<span class="sr-only">Tìm câu hỏi</span><input id="bank-search" type="search" value="${escapeHtml(bankQuery)}" placeholder="Tìm theo từ khóa hoặc #câu"></label>
      <div class="segment" aria-label="Lọc trạng thái">
        ${[["all","Tất cả"],["wrong","Cần sửa sai"],["mastered","Đã thuộc"],["reference","Cần đối chiếu"]].map(([value, label]) =>
          `<label><input name="bankFilter" type="radio" value="${value}" ${bankFilter === value ? "checked" : ""}><span>${label}</span></label>`).join("")}
      </div>
    </div>
    <div id="bank-results"></div>
  </div>`;
}

function updateBank() {
  const query = normalize(bankQuery.trim());
  const matching = QUESTIONS.filter(question => {
    const matchesQuery = /^#\d+$/.test(query) ? question.id === Number(query.slice(1)) : searchIndex.get(question.id).includes(query);
    return matchesQuery && (bankFilter === "all" || cardStatus(question) === bankFilter);
  });
  const size = 18;
  const pages = Math.ceil(matching.length / size);
  bankPage = Math.min(bankPage, pages || 1);
  const results = document.querySelector("#bank-results");
  results.innerHTML = `<p class="bank-overview" aria-live="polite">${format(matching.length)} câu${pages > 1 ? ` · Trang ${bankPage} / ${pages}` : ""}</p>
    ${matching.length ? `<div class="bank-list">${matching.slice((bankPage - 1) * size, bankPage * size).map(bankItem).join("")}</div>`
      : '<div class="panel empty"><h2>Chưa có câu phù hợp</h2><p>Thử đổi từ khóa hoặc bộ lọc.</p></div>'}
    ${pages > 1 ? `<div class="controls pager">
      <button class="btn outline" data-action="bank-prev" ${bankPage > 1 ? "" : "disabled"}>Trang trước</button>
      <button class="btn outline" data-action="bank-next" ${bankPage < pages ? "" : "disabled"}>Trang sau</button>
    </div>` : ""}`;
}

function bankItem(question) {
  const needsNote = question.referenceOnly;
  return `<details class="panel bank-row">
    <summary><span>#${question.id}</span> <strong>${escapeHtml(question.text)}</strong></summary>
    <div class="bank-details">
      <div class="question-meta">${statusForScreen(question)} <span>Trang ${question.page} PDF</span></div>
      <div class="options">${optionButtons(question, Object.keys(question.choices), [], true, !needsNote)}</div>
      ${sourceNote(question, needsNote)}
      ${needsNote ? '<p class="panel-foot">Câu này được giữ để đối chiếu với PDF và được bỏ qua khi chấm tiến độ.</p>'
        : `<div class="controls"><button class="btn outline" data-action="single" data-id="${question.id}">Luyện câu này</button></div>`}
    </div>
  </details>`;
}

main.addEventListener("input", event => {
  if (event.target.id === "bank-search") {
    bankQuery = event.target.value;
    bankPage = 1;
    updateBank();
  }
});

main.addEventListener("change", event => {
  const input = event.target;
  if (input.name === "practiceSize") {
    state.settings.size = Number(input.value);
    save();
  } else if (input.name === "bankFilter") {
    bankFilter = input.value;
    bankPage = 1;
    updateBank();
  }
});

main.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button || button.disabled) return;
  const mode = currentView();
  const session = activeSession(mode);
  switch (button.dataset.action) {
    case "start-practice":
      if (activeSession("practice")) navigate("practice", "#prompt");
      else startPractice();
      break;
    case "start-wrong":
      if (activeSession("revision")) navigate("revision", "#prompt");
      else startRevision("wrong");
      break;
    case "start-due": startRevision("due"); break;
    case "start-flash": startFlash("flash"); break;
    case "flash-wrong": startFlash("flashWrong"); break;
    case "reset-view":
      delete state.sessions[mode];
      save();
      render({ focus: "main", scroll: true });
      break;
    case "bank-prev":
    case "bank-next":
      bankPage += button.dataset.action === "bank-prev" ? -1 : 1;
      updateBank();
      document.querySelector("#bank-search").focus({ preventScroll: true });
      window.scrollTo(0, 0);
      break;
    case "single":
      if (activeSession("practice")) {
        const shouldReplace = window.confirm("Bạn đang có một lượt trắc nghiệm dở. Kết thúc lượt đó để luyện riêng câu này? Các câu đã trả lời vẫn được lưu.");
        if (!shouldReplace) break;
      }
      startSession("practice", "single", [questionsById.get(Number(button.dataset.id))]);
      break;
    case "option": if (session) toggleChoice(session, button.dataset.key); break;
    case "submit": if (session) submitAnswer(session, false); break;
    case "skip": if (session) submitAnswer(session, true); break;
    case "next": if (session?.result) advance(session); break;
    case "reveal":
      if (session) {
        session.revealed = true;
        save();
        render({ focus: "#flash-answer" });
        document.querySelector("#flash-answer")?.scrollIntoView({ block: "nearest" });
      }
      break;
    case "rate-yes": if (session) rateFlash(session, true); break;
    case "rate-no": if (session) rateFlash(session, false); break;
  }
});

document.addEventListener("keydown", event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || event.target.matches("input,textarea,select,[contenteditable]")) return;
  const key = event.key.toUpperCase();
  const isNumberKey = /^[1-5]$/.test(key);
  if (event.shiftKey && !isNumberKey) return;

  const session = activeSession(currentView());
  if (!session) return;
  if (key === "ENTER") {
    const interactive = event.target.closest("a,button,summary");
    if (interactive && interactive.dataset.action !== "option") return;
    const next = document.querySelector('[data-action="next"], [data-action="reveal"], [data-action="submit"]');
    if (next && !next.disabled) {
      event.preventDefault();
      next.click();
    }
    return;
  }
  if (session.mode === "flash" || session.result) return;
  const index = isNumberKey ? Number(key) - 1 : /^[A-E]$/.test(key) ? key.charCodeAt(0) - 65 : -1;
  if (index >= 0 && index < session.order.length) {
    event.preventDefault();
    const option = session.order[index];
    toggleChoice(session, option);
    main.querySelector(`[data-key="${option}"]`)?.focus({ preventScroll: true });
  }
});

window.addEventListener("hashchange", () => {
  rememberSession(currentView());
  render({ focus: activeSession(currentView()) ? "#prompt" : "main", scroll: true });
});
window.addEventListener("storage", event => {
  if (event.key === storageKey) {
    state = readState();
    render();
  }
});

document.querySelector("#brand-icon").innerHTML = icon("book");
document.querySelector("#course-label").innerHTML = `${icon("book")} ${courseName} · ${format(QUESTIONS.length)} câu`;
render();
