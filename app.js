(function () {
  const WORDS_PER_DAY = 20;
  const EPOCH = new Date(2024, 0, 1); // 기준일 (요일 계산용, 로컬 자정)
  const STORAGE_KEY = "wordDash_state_v1";

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function dateFromKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function dayIndexFor(dateKey) {
    const d = dateFromKey(dateKey);
    const diffDays = Math.floor((d.setHours(0, 0, 0, 0) - EPOCH.setHours(0, 0, 0, 0)) / 86400000);
    return Math.max(0, diffDays);
  }

  function totalSets() {
    return Math.ceil(WORD_BANK.length / WORDS_PER_DAY);
  }

  function wordsForDay(dateKey) {
    const setIndex = dayIndexFor(dateKey) % totalSets();
    const start = setIndex * WORDS_PER_DAY;
    const words = [];
    for (let i = 0; i < WORDS_PER_DAY; i++) {
      words.push(WORD_BANK[(start + i) % WORD_BANK.length]);
    }
    return { setIndex: setIndex + 1, words };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { streak: 0, lastCompletedDate: null, days: {} };
      return JSON.parse(raw);
    } catch (e) {
      return { streak: 0, lastCompletedDate: null, days: {} };
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
      return { en: word.en, pos: word.pos, ex: word.ex, correct: word.ko, options };
    });
  }

  // ---- App state ----
  const state = loadState();
  const key = todayKey();
  const dayState = getDayState(state, key);
  const { setIndex, words: todayWords } = wordsForDay(key);
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
    dayLabel.textContent = `Day ${setIndex}`;
    dateLabel.textContent = new Date().toLocaleDateString("ko-KR", {
      month: "long",
      day: "numeric",
      weekday: "short",
    });
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
        <div class="pos">${word.pos}</div>
        <div class="ko">${word.ko}</div>
        <div class="ex">${word.ex}</div>
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
      <div class="quiz-sub">알맞은 뜻을 고르세요</div>
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

  function renderResult() {
    const quiz = dayState.quiz;
    const score = quiz.answers.filter((a) => a.isCorrect).length;
    const total = quiz.questions.length;

    resultBox.innerHTML = `
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
