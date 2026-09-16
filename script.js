const STORAGE_KEY = "study-notes-entries";

const form = document.getElementById("entry-form");
const idField = document.getElementById("entry-id");
const dateField = document.getElementById("date");
const titleField = document.getElementById("video-title");
const urlField = document.getElementById("video-url");
const tagsField = document.getElementById("tags");
const summaryField = document.getElementById("summary");
const submitBtn = document.getElementById("submit-btn");
const cancelEditBtn = document.getElementById("cancel-edit");
const searchField = document.getElementById("search");
const listEl = document.getElementById("entry-list");
const emptyState = document.getElementById("empty-state");
const statsEl = document.getElementById("stats");

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function parseTags(raw) {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function resetForm() {
  form.reset();
  idField.value = "";
  dateField.value = new Date().toISOString().slice(0, 10);
  submitBtn.textContent = "기록 저장";
  cancelEditBtn.hidden = true;
}

function computeStreak(entries) {
  const dates = new Set(entries.map((e) => e.date));
  let streak = 0;
  const cursor = new Date();
  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    if (dates.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function renderStats(entries) {
  const total = entries.length;
  const streak = computeStreak(entries);
  statsEl.innerHTML = `
    <span>총 기록 ${total}개</span>
    <span>연속 기록 ${streak}일</span>
  `;
}

function render() {
  const entries = loadEntries();
  const query = searchField.value.trim().toLowerCase();

  const filtered = entries
    .filter((e) => {
      if (!query) return true;
      const haystack = [e.title, e.summary, ...(e.tags || [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  listEl.innerHTML = "";
  emptyState.hidden = filtered.length > 0;

  for (const entry of filtered) {
    const li = document.createElement("li");
    li.className = "entry-card";

    const titleHtml = entry.url
      ? `<a href="${escapeAttr(entry.url)}" target="_blank" rel="noopener">${escapeHtml(entry.title)}</a>`
      : escapeHtml(entry.title);

    const tagsHtml = (entry.tags || [])
      .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
      .join("");

    li.innerHTML = `
      <div class="entry-card-head">
        <span class="entry-date">${entry.date}</span>
      </div>
      <div class="entry-title">${titleHtml}</div>
      <div class="entry-summary">${escapeHtml(entry.summary)}</div>
      <div class="entry-tags">${tagsHtml}</div>
      <div class="entry-actions">
        <button class="edit-btn" data-id="${entry.id}">수정</button>
        <button class="delete-btn" data-id="${entry.id}">삭제</button>
      </div>
    `;
    listEl.appendChild(li);
  }

  renderStats(entries);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const entries = loadEntries();

  const entry = {
    id: idField.value || crypto.randomUUID(),
    date: dateField.value,
    title: titleField.value.trim(),
    url: urlField.value.trim(),
    tags: parseTags(tagsField.value),
    summary: summaryField.value.trim(),
  };

  const existingIndex = entries.findIndex((en) => en.id === entry.id);
  if (existingIndex >= 0) {
    entries[existingIndex] = entry;
  } else {
    entries.push(entry);
  }

  saveEntries(entries);
  resetForm();
  render();
});

cancelEditBtn.addEventListener("click", () => {
  resetForm();
});

listEl.addEventListener("click", (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  const id = target.dataset.id;
  if (!id) return;

  if (target.classList.contains("delete-btn")) {
    const ok = confirm("이 기록을 삭제할까요?");
    if (!ok) return;
    const entries = loadEntries().filter((en) => en.id !== id);
    saveEntries(entries);
    render();
  }

  if (target.classList.contains("edit-btn")) {
    const entry = loadEntries().find((en) => en.id === id);
    if (!entry) return;
    idField.value = entry.id;
    dateField.value = entry.date;
    titleField.value = entry.title;
    urlField.value = entry.url || "";
    tagsField.value = (entry.tags || []).join(", ");
    summaryField.value = entry.summary;
    submitBtn.textContent = "수정 완료";
    cancelEditBtn.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

searchField.addEventListener("input", render);

resetForm();
render();
