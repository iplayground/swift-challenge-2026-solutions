const TOTAL_QUESTIONS = 5;
const DEFAULT_DURATION_SECONDS = 30;
const OPTION_LABELS = ["A", "B", "C", "D"];

const params = new URLSearchParams(window.location.search);
const durationSeconds = Math.max(1, Number(params.get("duration")) || DEFAULT_DURATION_SECONDS);

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

let allQuestions = [];
let roundQuestions = [];
let currentIndex = 0;
let remainingSeconds = durationSeconds;
let timerId = null;
let toastId = null;
let liquidGlassId = null;

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
    <section class="stage start-card liquid-glass">
      <div>
        <h1 class="start-title">iPlayground 2026 Quiz</h1>
        <p class="start-copy">每輪隨機 ${TOTAL_QUESTIONS} 題，每題 ${durationSeconds} 秒。倒數結束後會自動進入下一題，最後一次公布答案與解析。</p>
        <button class="primary-action" type="button" data-action="start">開始挑戰</button>
      </div>
    </section>
  `;

  app.querySelector("[data-action='start']").addEventListener("click", startRound);
  refreshLiquidGlass();
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
  hideToast();
  remainingSeconds = durationSeconds;
  const question = roundQuestions[currentIndex];
  const content = parseQuestionContent(question.question);
  const choicesHtml = question.displayChoices.length > 0
    ? `<section class="choices-grid" aria-label="答案選項">${question.displayChoices.map(renderChoice).join("")}</section>`
    : renderFillBlankNotice();

  app.innerHTML = `
    <section class="stage quiz-stage">
      <header class="quiz-header">
        <div class="timer-block timer-card liquid-glass">
          <div class="timer-label">倒數計時</div>
          <div class="timer-value" data-timer>${formatSeconds(remainingSeconds)}</div>
        </div>
        <div class="question-count progress-pill liquid-glass"><span></span>第 ${currentIndex + 1} 題 / 共 ${TOTAL_QUESTIONS} 題</div>
      </header>

      <section class="question-card liquid-glass">
        <div class="eyebrow">SWIFT QUIZ</div>
        <h1 class="question-title">${renderPlainText(content.title)}</h1>
        ${content.signature ? `<div class="function-signature">${escapeHtml(content.signature)}</div>` : ""}
        ${content.codeBlocks.map(renderCodeBlock).join("")}
      </section>

      ${choicesHtml}
    </section>
  `;

  app.querySelectorAll("[data-choice]").forEach((button) => {
    button.addEventListener("click", () => handleChoiceClick(button, question));
  });
  updateTimerDisplay();
  timerId = window.setInterval(tick, 1000);
  refreshLiquidGlass();
}

function tick() {
  remainingSeconds -= 1;
  updateTimerDisplay();

  if (remainingSeconds <= 0) {
    goNext();
  }
}

function updateTimerDisplay() {
  const timer = app.querySelector("[data-timer]");
  if (timer) {
    timer.textContent = formatSeconds(remainingSeconds);
    timer.classList.toggle("is-hot", remainingSeconds <= 10);
    timer.classList.toggle("is-faster", remainingSeconds <= 5);
    timer.classList.toggle("is-fastest", remainingSeconds <= 2);
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
  refreshLiquidGlass();
}

function renderChoice(choice, index) {
  const label = OPTION_LABELS[index] || "";
  const color = ["blue", "green", "yellow", "pink"][index] || "blue";
  return `
    <button class="choice-tile answer ${color} liquid-glass" type="button" data-choice="${escapeHtml(choice)}">
      <div class="choice-label badge">${label}</div>
      <div class="choice-text">${escapeHtml(choice)}</div>
      <div class="choice-state" aria-hidden="true"></div>
    </button>
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
  const content = parseQuestionContent(question.question);
  const referenceLinks = getReferenceLinks(question);
  return `
    <article class="result-card">
      <div class="result-meta">
        <span>第 ${index + 1} 題</span>
        <span>${escapeHtml(question.author || "Unknown")}</span>
      </div>
      <div class="result-question">
        ${renderPlainText(content.title)}
        ${content.codeBlocks.map(renderCodeBlock).join("")}
      </div>
      <p class="result-answer">正確答案：${escapeHtml(question.answer)}</p>
      <p class="result-reason">${escapeHtml(question.reason || "沒有解析。")}</p>
      ${referenceLinks.length > 0 ? renderReferenceLinks(referenceLinks) : ""}
    </article>
  `;
}

function renderReferenceLinks(links) {
  return `
    <aside class="reference-panel">
      <div class="reference-content">
        <div class="reference-label">延伸閱讀</div>
        <nav class="result-links" aria-label="延伸閱讀">
          ${links.map((link) => `
            <a class="result-link" href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">
              ${escapeHtml(link.label)}
            </a>
          `).join("")}
        </nav>
      </div>
    </aside>
  `;
}

function getReferenceLinks(question) {
  const text = `${question.question || ""}\n${question.answer || ""}\n${question.reason || ""}`;
  const links = [];

  addReference(links, text, "Swift Arrays", "https://docs.swift.org/swift-book/documentation/the-swift-programming-language/collectiontypes/", /sorted\(\)|sort\(\)|陣列/);
  addReference(links, text, "Swift Types", "https://docs.swift.org/swift-book/documentation/the-swift-programming-language/types/", /Never|fatalError|assertionFailure|Optional|try\?/);
  addReference(links, text, "Swift Protocols", "https://docs.swift.org/swift-book/documentation/the-swift-programming-language/protocols/", /Comparable|protocol|協定|ExpressibleBy/);
  addReference(links, text, "Swift Strings", "https://docs.swift.org/swift-book/documentation/the-swift-programming-language/stringsandcharacters/", /字串|插值|String|\\\(/);
  addReference(links, text, "Error Handling", "https://docs.swift.org/swift-book/documentation/the-swift-programming-language/errorhandling/", /catch|throw|throws|rethrows|錯誤/);
  addReference(links, text, "Swift Functions", "https://docs.swift.org/swift-book/documentation/the-swift-programming-language/functions/", /func|函式|argument label|引數標籤|參數/);
  addReference(links, text, "Access Control", "https://docs.swift.org/swift-book/documentation/the-swift-programming-language/accesscontrol/", /private|fileprivate|存取/);
  addReference(links, text, "Swift Concurrency", "https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/", /MainActor|Task|await|actor|Concurrency/);
  addReference(links, text, "SwiftUI ScrollView", "https://developer.apple.com/documentation/swiftui/scrollview", /ScrollView/);
  addReference(links, text, "SwiftUI VStack", "https://developer.apple.com/documentation/swiftui/vstack", /VStack/);
  addReference(links, text, "SwiftUI LinearGradient", "https://developer.apple.com/documentation/swiftui/lineargradient", /LinearGradient|foregroundStyle|Gradient/);

  return links.slice(0, 3);
}

function addReference(links, text, label, url, pattern) {
  if (pattern.test(text) && !links.some((link) => link.url === url)) {
    links.push({ label, url });
  }
}

function buildDisplayChoices(question) {
  const choices = Array.isArray(question.choices) ? question.choices : [];
  if (choices.length === 0) {
    return [];
  }

  return shuffle([question.answer, ...choices]).slice(0, OPTION_LABELS.length);
}

function handleChoiceClick(button, question) {
  const buttons = app.querySelectorAll("[data-choice]");
  const selectedAnswer = button.dataset.choice || "";
  const correctAnswer = String(question.answer || "");
  const isCorrect = selectedAnswer === correctAnswer;

  buttons.forEach((item) => {
    item.classList.remove("correct", "wrong");
    item.querySelector(".choice-state").textContent = "";
  });

  if (isCorrect) {
    button.classList.add("correct");
    button.querySelector(".choice-state").textContent = "正確";
    showToast("答對了！這就是 Swift 正確語法。");
    return;
  }

  button.classList.add("wrong");
  button.querySelector(".choice-state").textContent = "錯誤";
  buttons.forEach((item) => {
    if ((item.dataset.choice || "") === correctAnswer) {
      item.classList.add("correct");
      item.querySelector(".choice-state").textContent = "正確";
    }
  });
  showToast(`再想一下：正確答案是 ${correctAnswer}`);
}

function showToast(message) {
  if (!toast) {
    return;
  }

  if (toastId) {
    window.clearTimeout(toastId);
  }

  toast.textContent = message;
  toast.classList.add("show");
  toastId = window.setTimeout(hideToast, 2200);
}

function hideToast() {
  if (toast) {
    toast.classList.remove("show");
  }
  if (toastId) {
    window.clearTimeout(toastId);
    toastId = null;
  }
}

function parseQuestionContent(text) {
  const source = String(text || "");
  const parts = source.split(/```(?:swift)?\n?/);
  if (parts.length === 1) {
    return {
      title: source.trim(),
      signature: "",
      codeBlocks: [],
    };
  }

  const codeBlocks = parts
    .filter((_, index) => index % 2 === 1)
    .map((part) => part.replace(/\n$/, ""));
  const signature = codeBlocks[0]
    ?.split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && line.length <= 80) || "";

  return {
    title: parts[0].trim(),
    signature,
    codeBlocks,
  };
}

function renderPlainText(text) {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

function renderCodeBlock(code) {
  return `<pre class="code-block"><code>${highlightSwiftCode(code)}</code></pre>`;
}

function highlightSwiftCode(code) {
  const source = String(code || "");
  const keywords = new Set(["func", "let", "var", "return", "guard", "else", "throw", "class", "struct", "enum", "await", "async", "override", "private", "fileprivate", "nonisolated"]);
  const types = new Set(["Int", "String", "Bool", "Void", "Never", "Point", "MainActor"]);
  const tokenPattern = /\/\/.*$|"(?:\\.|[^"\\])*"|\b[A-Za-z_][A-Za-z0-9_]*\b/gm;

  let highlighted = "";
  let cursor = 0;

  for (const match of source.matchAll(tokenPattern)) {
    const token = match[0];
    highlighted += escapeHtml(source.slice(cursor, match.index));

    if (token.startsWith("//")) {
      highlighted += `<span class="code-muted">${escapeHtml(token)}</span>`;
    } else if (token.startsWith("\"")) {
      highlighted += `<span class="code-string">${escapeHtml(token)}</span>`;
    } else if (keywords.has(token)) {
      highlighted += `<span class="code-keyword">${escapeHtml(token)}</span>`;
    } else if (types.has(token)) {
      highlighted += `<span class="code-type">${escapeHtml(token)}</span>`;
    } else {
      highlighted += escapeHtml(token);
    }

    cursor = match.index + token.length;
  }

  return highlighted + escapeHtml(source.slice(cursor));
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function formatSeconds(seconds) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const secondsPart = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secondsPart).padStart(2, "0")}`;
}

function clearTimer() {
  if (timerId) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

function refreshLiquidGlass() {
  if (liquidGlassId) {
    window.cancelAnimationFrame(liquidGlassId);
  }

  liquidGlassId = window.requestAnimationFrame(() => {
    if (typeof window.liquidGL !== "function") {
      return;
    }

    const targets = app.querySelectorAll(".liquid-glass");
    if (targets.length === 0) {
      return;
    }

    const renderer = window.__liquidGLRenderer__;
    if (renderer) {
      renderer.lenses = [];
      renderer._pendingReveal = [];
    }

    window.liquidGL({
      target: ".liquid-glass",
      snapshot: "body",
      resolution: 1.5,
      refraction: 0.011,
      bevelDepth: 0.012,
      bevelWidth: 0.22,
      frost: 18,
      shadow: true,
      specular: true,
      reveal: "fade",
      tilt: false,
      tiltFactor: 0,
      magnify: 1,
    });

    app.querySelectorAll(".liquid-glass").forEach((target) => {
      target.style.pointerEvents = "";
    });

    if (window.__liquidGLRenderer__) {
      window.__liquidGLRenderer__.captureSnapshot();
    }
  });
}

function renderError(error) {
  clearTimer();
  app.innerHTML = `
    <section class="error-card liquid-glass">
      <h1>無法啟動題庫</h1>
      <p>${escapeHtml(error.message)}</p>
    </section>
  `;
  refreshLiquidGlass();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
