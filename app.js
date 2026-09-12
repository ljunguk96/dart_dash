(function () {
  const WORDS_PER_DAY = 20;
  const STORAGE_KEY = "wordDash_state_v1";

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function dateFromKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  // 사용자가 처음 접속한 날을 Day 1로 삼아, 그 이후 날짜 차이만큼 Day가 늘어납니다.
  function dayIndexFor(dateKey, startKey) {
    const d = dateFromKey(dateKey);
    const start = dateFromKey(startKey);
    const diffDays = Math.floor((d.setHours(0, 0, 0, 0) - start.setHours(0, 0, 0, 0)) / 86400000);
    return Math.max(0, diffDays);
  }

  // 전체 단어를 한 바퀴 다 쓰면 다시 섞어서 이어붙이는 "셔플 백" 방식.
  // 같은 단어를 다시 만나더라도 매번 다른 묶음/순서로 나오게 합니다.
  function ensureSequence(state, neededLength) {
    if (!Array.isArray(state.sequence)) state.sequence = [];
    while (state.sequence.length < neededLength) {
      const lap = shuffle(WORD_BANK.map((_, i) => i));
      state.sequence = state.sequence.concat(lap);
    }
  }

  function wordsForDay(dateKey, startKey, state) {
    const dayNumber = dayIndexFor(dateKey, startKey) + 1; // 오늘 첫 접속이면 1
    const start = (dayNumber - 1) * WORDS_PER_DAY;
    ensureSequence(state, start + WORDS_PER_DAY);
    const words = state.sequence.slice(start, start + WORDS_PER_DAY).map((i) => WORD_BANK[i]);
    return { dayNumber, words };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { streak: 0, lastCompletedDate: null, startDate: null, sequence: [], days: {} };
      const parsed = JSON.parse(raw);
      if (!parsed.startDate) parsed.startDate = null;
      if (!Array.isArray(parsed.sequence)) parsed.sequence = [];
      return parsed;
    } catch (e) {
      return { streak: 0, lastCompletedDate: null, startDate: null, sequence: [], days: {} };
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getDayState(state, key) {
    if (!state.days[key]) {
      state.days[key] = { seen: [], quiz: null };
    }
    return state.days[key];
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildQuizQuestions(words) {
    return words.map((word) => {
      const distractorPool = WORD_BANK.filter((w) => w.en !== word.en);
      const distractors = shuffle(distractorPool).slice(0, 3).map((w) => w.ko);
      const options = shuffle([word.ko, ...distractors]);
      return { en: word.en, ipa: word.ipa, pos: word.pos, ex: word.ex, correct: word.ko, options };
    });
  }

  // ---- App state ----
  const state = loadState();
  const key = todayKey();
  if (!state.startDate) state.startDate = key; // 처음 접속한 날 = Day 1
  const dayState = getDayState(state, key);
  const { dayNumber, words: todayWords } = wordsForDay(key, state.startDate, state);
  saveState(state);

  if (!dayState.quiz) {
    dayState.quiz = {
      questions: buildQuizQuestions(todayWords),
      currentIndex: 0,
      answers: [], // { chosen, correct }
      completed: false,
    };
    saveState(state);
  }

  // ---- DOM refs ----
  const dayLabel = document.getElementById("dayLabel");
  const dateLabel = document.getElementById("dateLabel");
  const streakBadge = document.getElementById("streakBadge");
  const progressFill = document.getElementById("progressFill");
  const progressText = document.getElementById("progressText");
  const cardGrid = document.getElementById("cardGrid");
  const goToQuizBtn = document.getElementById("goToQuizBtn");
  const quizBox = document.getElementById("quizBox");
  const resultBox = document.getElementById("resultBox");
  const resultTabBtn = document.getElementById("resultTabBtn");
  const tabBtns = document.querySelectorAll(".tab-btn");
  const views = {
    study: document.getElementById("studyView"),
    quiz: document.getElementById("quizView"),
    result: document.getElementById("resultView"),
  };

  function setView(name) {
    Object.entries(views).forEach(([k, el]) => (el.hidden = k !== name));
    tabBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.view === name));
  }

  tabBtns.forEach((btn) =>
    btn.addEventListener("click", () => {
      if (btn.hidden) return;
      setView(btn.dataset.view);
      if (btn.dataset.view === "quiz") renderQuiz();
      if (btn.dataset.view === "result") renderResult();
    })
  );

  function updateHeader() {
    const now = new Date();
    dayLabel.textContent = `${now.getMonth() + 1}.${now.getDate()} DAY${dayNumber}`;
    dateLabel.textContent = now.toLocaleDateString("ko-KR", { weekday: "long" });
    streakBadge.textContent = `🔥 ${state.streak}일`;
    updateProgress();
  }

  function updateProgress() {
    const seenCount = new Set(dayState.seen).size;
    const pct = Math.round((seenCount / WORDS_PER_DAY) * 100);
    progressFill.style.width = `${pct}%`;
    progressText.textContent = `${seenCount} / ${WORDS_PER_DAY}`;
  }

  function renderCards() {
    cardGrid.innerHTML = "";
    todayWords.forEach((word, idx) => {
      const card = document.createElement("div");
      card.className = "flip-card";
      if (dayState.seen.includes(idx)) card.classList.add("flipped");
      card.innerHTML = `
        <div class="en">${word.en}</div>
        <div class="ipa">${word.ipa} <span class="pos">${word.pos}</span></div>
        <div class="ko">${word.ko}</div>
        <div class="ex">${word.ex}</div>
        <div class="ex-ko">${word.exKo}</div>
      `;
      card.addEventListener("click", () => {
        card.classList.toggle("flipped");
        if (!dayState.seen.includes(idx)) {
          dayState.seen.push(idx);
          saveState(state);
          updateProgress();
        }
      });
      cardGrid.appendChild(card);
    });
  }

  goToQuizBtn.addEventListener("click", () => {
    setView("quiz");
    renderQuiz();
  });

  function renderQuiz() {
    const quiz = dayState.quiz;
    if (quiz.completed) {
      resultTabBtn.hidden = false;
      setView("result");
      renderResult();
      return;
    }

    const qIndex = quiz.currentIndex;
    const q = quiz.questions[qIndex];

    quizBox.innerHTML = `
      <div class="quiz-progress">문제 ${qIndex + 1} / ${quiz.questions.length}</div>
      <div class="quiz-question">${q.en} <span class="pos">${q.pos}</span></div>
      <div class="quiz-sub">${q.ipa} · 알맞은 뜻을 고르세요</div>
      <div class="options" id="optionsWrap"></div>
    `;

    const optionsWrap = document.getElementById("optionsWrap");
    q.options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "option-btn";
      btn.textContent = opt;
      btn.addEventListener("click", () => handleAnswer(opt, btn, q, optionsWrap));
      optionsWrap.appendChild(btn);
    });
  }

  function handleAnswer(chosen, btn, question, optionsWrap) {
    const quiz = dayState.quiz;
    const isCorrect = chosen === question.correct;

    [...optionsWrap.children].forEach((b) => {
      b.disabled = true;
      if (b.textContent === question.correct) b.classList.add("correct");
      else if (b === btn && !isCorrect) b.classList.add("wrong");
    });

    quiz.answers.push({ en: question.en, chosen, correct: question.correct, isCorrect });
    saveState(state);

    setTimeout(() => {
      quiz.currentIndex += 1;
      if (quiz.currentIndex >= quiz.questions.length) {
        finishQuiz();
      } else {
        saveState(state);
        renderQuiz();
      }
    }, 800);
  }

  function finishQuiz() {
    const quiz = dayState.quiz;
    quiz.completed = true;
    saveState(state);
    updateStreak();
    resultTabBtn.hidden = false;
    setView("result");
    renderResult();
  }

  function updateStreak() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

    if (state.lastCompletedDate === key) {
      // 이미 오늘 완료로 집계됨
    } else if (state.lastCompletedDate === yKey) {
      state.streak += 1;
    } else {
      state.streak = 1;
    }
    state.lastCompletedDate = key;
    saveState(state);
    streakBadge.textContent = `🔥 ${state.streak}일`;
  }

  function shiftKey(baseKey, offsetDays) {
    const d = dateFromKey(baseKey);
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function getRecentSummaries(days) {
    const summaries = [];
    const startD = dateFromKey(state.startDate);
    for (let i = 0; i < days; i++) {
      const dKey = shiftKey(key, -i);
      if (dateFromKey(dKey) < startD) break; // 학습 시작 이전 날짜는 표시하지 않음
      const [y, m, d] = dKey.split("-").map(Number);
      const label = `${m}.${d}`;
      const dState = state.days[dKey];
      if (dState && dState.quiz && dState.quiz.completed) {
        const s = dState.quiz.answers.filter((a) => a.isCorrect).length;
        const t = dState.quiz.questions.length;
        summaries.push({ label, text: `${s} / ${t}`, done: true });
      } else {
        summaries.push({ label, text: "미응시", done: false });
      }
    }
    return summaries;
  }

  function renderResult() {
    const quiz = dayState.quiz;
    const score = quiz.answers.filter((a) => a.isCorrect).length;
    const total = quiz.questions.length;
    const summaries = getRecentSummaries(3);

    resultBox.innerHTML = `
      <div class="recent-summary">
        <h3>최근 학습 기록</h3>
        <div class="summary-list">
          ${summaries
            .map(
              (s) => `
            <div class="summary-item ${s.done ? "" : "muted"}">
              <span class="summary-date">${s.label}</span>
              <span class="summary-score">${s.text}</span>
            </div>`
            )
            .join("")}
        </div>
      </div>
      <h2>오늘의 결과</h2>
      <div class="score-big">${score} / ${total}</div>
      <p>${scoreMessage(score, total)}</p>
      <div class="review-list">
        ${quiz.answers
          .map(
            (a) => `
          <div class="review-item ${a.isCorrect ? "correct" : "wrong"}">
            <span class="en">${a.en}</span>
            <span>${a.isCorrect ? "✅ " + a.correct : "❌ 정답: " + a.correct}</span>
          </div>`
          )
          .join("")}
      </div>
    `;
  }

  function scoreMessage(score, total) {
    const ratio = score / total;
    if (ratio === 1) return "완벽해요! 모든 단어를 다 맞혔어요 🎉";
    if (ratio >= 0.8) return "훌륭해요! 내일도 이어가 볼까요? 💪";
    if (ratio >= 0.5) return "잘하고 있어요. 틀린 단어를 다시 복습해보세요 📖";
    return "괜찮아요, 반복하면 늘어요! 학습 탭에서 다시 확인해보세요 🙂";
  }

  if (dayState.quiz.completed) {
    resultTabBtn.hidden = false;
  }

  renderCards();
  updateHeader();
  setView("study");
})();
