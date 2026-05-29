const TOTAL_QUESTIONS = 5;
const DEFAULT_DURATION_SECONDS = 30;
const OPTION_LABELS = ["A", "B", "C", "D"];

const params = new URLSearchParams(window.location.search);
const durationSeconds = Math.max(1, Number(params.get("duration")) || DEFAULT_DURATION_SECONDS);

const app = document.querySelector("#app");

let allQuestions = [];
let roundQuestions = [];
let currentIndex = 0;
let remainingSeconds = durationSeconds;
let timerId = null;

init();

async function init() {
  try {
    const response = await fetch("iplayground2026_quiz_data.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`題庫載入失敗 (${response.status})`);
    }

    const data = await response.json();
    allQuestions = Array.isArray(data) ? data : [];
    if (allQuestions.length < TOTAL_QUESTIONS) {
      throw new Error(`題庫至少需要 ${TOTAL_QUESTIONS} 題，目前只有 ${allQuestions.length} 題`);
    }

    renderStart();
  } catch (error) {
    renderError(error);
  }
}

function renderStart() {
  clearTimer();
  app.innerHTML = `
    <section class="stage start-card">
      <div>
        <h1 class="start-title">Swift Challenge Quiz</h1>
        <p class="start-copy">每輪隨機 ${TOTAL_QUESTIONS} 題，每題 ${durationSeconds} 秒。倒數結束後會自動進入下一題，最後一次公布答案與解析。</p>
        <button class="primary-action" type="button" data-action="start">開始挑戰</button>
      </div>
    </section>
  `;

  app.querySelector("[data-action='start']").addEventListener("click", startRound);
}

function startRound() {
  roundQuestions = shuffle([...allQuestions]).slice(0, TOTAL_QUESTIONS).map((question) => ({
    ...question,
    displayChoices: buildDisplayChoices(question),
  }));
  currentIndex = 0;
  renderQuestion();
}

function renderQuestion() {
  clearTimer();
  remainingSeconds = durationSeconds;
  const question = roundQuestions[currentIndex];
  const choicesHtml = question.displayChoices.length > 0
    ? `<section class="choices-grid" aria-label="答案選項">${question.displayChoices.map(renderChoice).join("")}</section>`
    : renderFillBlankNotice();

  app.innerHTML = `
    <section class="stage quiz-stage">
      <header class="quiz-header">
        <div class="timer-block">
          <div class="timer-label">倒數計時</div>
          <div class="timer-value" data-timer>${formatSeconds(remainingSeconds)}</div>
        </div>
        <div class="question-count">第 ${currentIndex + 1} 題 / 共 ${TOTAL_QUESTIONS} 題</div>
      </header>

      <section class="question-card">
        <div class="question-text">${renderRichText(question.question)}</div>
      </section>

      ${choicesHtml}
    </section>
  `;

  timerId = window.setInterval(tick, 1000);
}

function tick() {
  remainingSeconds -= 1;
  const timer = app.querySelector("[data-timer]");
  if (timer) {
    timer.textContent = formatSeconds(remainingSeconds);
    timer.classList.toggle("is-hot", remainingSeconds <= 10);
  }

  if (remainingSeconds <= 0) {
    goNext();
  }
}

function goNext() {
  clearTimer();
  if (currentIndex + 1 >= TOTAL_QUESTIONS) {
    renderResults();
    return;
  }

  currentIndex += 1;
  renderQuestion();
}

function renderResults() {
  clearTimer();
  app.innerHTML = `
    <section class="result-shell">
      <header class="result-header">
        <h1 class="result-title">答案與解答</h1>
        <button class="secondary-action" type="button" data-action="restart">再玩一次</button>
      </header>
      <section class="result-list">
        ${roundQuestions.map(renderResultCard).join("")}
      </section>
    </section>
  `;

  app.querySelector("[data-action='restart']").addEventListener("click", startRound);
}

function renderChoice(choice, index) {
  const label = OPTION_LABELS[index] || "";
  return `
    <article class="choice-tile choice-${label.toLowerCase()}">
      <div class="choice-label">${label}</div>
      <div class="choice-text">${escapeHtml(choice)}</div>
    </article>
  `;
}

function renderFillBlankNotice() {
  return `
    <section class="fill-blank-card">
      <div>
        <p class="fill-blank-title">填空題</p>
        <p class="fill-blank-copy">答案會在五題結束後一起公布。</p>
      </div>
    </section>
  `;
}

function renderResultCard(question, index) {
  return `
    <article class="result-card">
      <div class="result-meta">
        <span>第 ${index + 1} 題</span>
        <span>${escapeHtml(question.author || "Unknown")}</span>
      </div>
      <div class="result-question">${renderRichText(question.question)}</div>
      <p class="result-answer">正確答案：${escapeHtml(question.answer)}</p>
      <p class="result-reason">${escapeHtml(question.reason || "沒有解析。")}</p>
    </article>
  `;
}

function buildDisplayChoices(question) {
  const choices = Array.isArray(question.choices) ? question.choices : [];
  if (choices.length === 0) {
    return [];
  }

  return shuffle([question.answer, ...choices]).slice(0, OPTION_LABELS.length);
}

function renderRichText(text) {
  const source = String(text || "");
  const parts = source.split(/```(?:swift)?\n?/);
  if (parts.length === 1) {
    return escapeHtml(source).replace(/\n/g, "<br>");
  }

  return parts.map((part, index) => {
    const trimmed = part.replace(/\n$/, "");
    if (index % 2 === 1) {
      return `<pre><code>${escapeHtml(trimmed)}</code></pre>`;
    }
    return escapeHtml(trimmed).replace(/\n/g, "<br>");
  }).join("");
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function formatSeconds(seconds) {
  return `00:${String(Math.max(0, seconds)).padStart(2, "0")}`;
}

function clearTimer() {
  if (timerId) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

function renderError(error) {
  clearTimer();
  app.innerHTML = `
    <section class="error-card">
      <h1>無法啟動題庫</h1>
      <p>${escapeHtml(error.message)}</p>
    </section>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
