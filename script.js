import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  updateProfile,
  EmailAuthProvider,
  linkWithCredential,
  linkWithPopup
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

/* =========================
   FIREBASE CONFIG PASTE HERE
   ========================= */


  // Your web app's Firebase configuration
  const firebaseConfig = {
    apiKey: "AIzaSyA6mhqKVbfiC5aKooDqPCC2wQqBqJwhdDE",
    authDomain: "pranjal-study-tracker.firebaseapp.com",
    projectId: "pranjal-study-tracker",
    storageBucket: "pranjal-study-tracker.firebasestorage.app",
    messagingSenderId: "708890835472",
    appId: "1:708890835472:web:c64dbb80339adadfcc6895"
  };


const FIREBASE_READY = firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY";
const LOCAL_STORAGE_KEY = "study_tracker_pro_local_v3";

let app = null;
let auth = null;
let db = null;
let currentUser = null;
let isLocalMode = !FIREBASE_READY;
let appState = createDefaultState();
let saveDebounce = null;
let toastTimer = null;

const timerState = {
  mode: "stopwatch",
  running: false,
  startedAt: null,
  accumulated: 0,
  remaining: 25 * 60,
  phase: "focus",
  cycles: 0,
  intervalId: null
};

const filters = {
  status: "all",
  subject: ""
};

const $ = (id) => document.getElementById(id);

const els = {
  brandTitle: $("brandTitle"),
  authView: $("authView"),
  appView: $("appView"),
  topUser: $("topUser"),
  userBadge: $("userBadge"),
  logoutBtn: $("logoutBtn"),
  syncInfo: $("syncInfo"),

  guestBtn: $("guestBtn"),
  googleBtn: $("googleBtn"),
  signupForm: $("signupForm"),
  loginForm: $("loginForm"),
  signupName: $("signupName"),
  signupEmail: $("signupEmail"),
  signupPassword: $("signupPassword"),
  loginEmail: $("loginEmail"),
  loginPassword: $("loginPassword"),

  notifBtn: $("notifBtn"),

  statToday: $("statToday"),
  statWeek: $("statWeek"),
  statMonth: $("statMonth"),
  statStreak: $("statStreak"),
  statPending: $("statPending"),
  statNextSubject: $("statNextSubject"),

  taskForm: $("taskForm"),
  taskText: $("taskText"),
  taskSubject: $("taskSubject"),
  taskPriority: $("taskPriority"),
  taskDeadline: $("taskDeadline"),
  statusFilter: $("statusFilter"),
  subjectFilter: $("subjectFilter"),
  taskList: $("taskList"),

  noteForm: $("noteForm"),
  noteText: $("noteText"),
  noteList: $("noteList"),

  revisionForm: $("revisionForm"),
  revisionTopic: $("revisionTopic"),
  revisionBaseDate: $("revisionBaseDate"),
  revisionList: $("revisionList"),

  timerMode: $("timerMode"),
  timerSubject: $("timerSubject"),
  focusMin: $("focusMin"),
  shortBreakMin: $("shortBreakMin"),
  longBreakMin: $("longBreakMin"),
  timerDisplay: $("timerDisplay"),
  phaseBadge: $("phaseBadge"),
  timerHint: $("timerHint"),
  startBtn: $("startBtn"),
  pauseBtn: $("pauseBtn"),
  resetBtn: $("resetBtn"),
  saveSessionBtn: $("saveSessionBtn"),

  profileForm: $("profileForm"),
  profileAppName: $("profileAppName"),
  profileName: $("profileName"),
  profileClass: $("profileClass"),
  profileExam: $("profileExam"),
  profileDailyTarget: $("profileDailyTarget"),
  profileWeeklyTarget: $("profileWeeklyTarget"),
  profileSubjects: $("profileSubjects"),
  dailyBar: $("dailyBar"),
  weeklyBar: $("weeklyBar"),
  dailyTargetText: $("dailyTargetText"),
  weeklyTargetText: $("weeklyTargetText"),

  subjectSummary: $("subjectSummary"),
  comparisonText: $("comparisonText"),

  monthChart: $("monthChart"),
  monthLabel: $("monthLabel"),

  upcomingList: $("upcomingList"),
  toast: $("toast")
};

init();

function init() {
  bindEvents();
  setupFirebaseOrLocal();
  resetTimerDisplay();
  window.addEventListener("resize", renderMonthChart);
}

function bindEvents() {
  els.guestBtn.addEventListener("click", handleGuestMode);
  els.googleBtn.addEventListener("click", handleGoogleSignIn);
  els.signupForm.addEventListener("submit", handleSignup);
  els.loginForm.addEventListener("submit", handleLogin);
  els.logoutBtn.addEventListener("click", handleLogout);
  els.notifBtn.addEventListener("click", enableNotifications);

  els.taskForm.addEventListener("submit", addTask);
  els.statusFilter.addEventListener("change", () => {
    filters.status = els.statusFilter.value;
    renderTasks();
  });
  els.subjectFilter.addEventListener("change", () => {
    filters.subject = els.subjectFilter.value;
    renderTasks();
  });

  els.taskList.addEventListener("click", handleTaskListClick);
  els.noteForm.addEventListener("submit", addNote);
  els.noteList.addEventListener("click", handleNoteListClick);
  els.revisionForm.addEventListener("submit", addRevisionPlan);
  els.revisionList.addEventListener("click", handleRevisionListClick);

  els.timerMode.addEventListener("change", () => {
    timerState.mode = els.timerMode.value;
    resetTimerState();
  });

  els.startBtn.addEventListener("click", startTimer);
  els.pauseBtn.addEventListener("click", pauseTimer);
  els.resetBtn.addEventListener("click", resetTimerState);
  els.saveSessionBtn.addEventListener("click", saveCurrentSession);

  els.profileForm.addEventListener("submit", saveProfile);
}

function setupFirebaseOrLocal() {
  if (FIREBASE_READY) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    onAuthStateChanged(auth, async (user) => {
      currentUser = user;

      if (!user) {
        showAuthView();
        return;
      }

      isLocalMode = false;
      await loadRemoteState();
      showAppView();
      renderAll();
      maybeNotifyDueToday();
    });
  } else {
    showToast("Firebase config abhi blank hai. Guest/local mode se app chal jayega.");
    showAuthView();
    els.syncInfo.textContent = "Local mode active";
  }
}

function createDefaultState() {
  return {
    profile: {
      appName: "Pranjal Study Tracker Pro",
      displayName: "Student",
      className: "",
      examTarget: "",
      dailyTargetHours: 6,
      weeklyTargetHours: 35,
      favoriteSubjects: ["Physics", "Chemistry", "Maths"]
    },
    tasks: [],
    notes: [],
    revisions: [],
    studyLog: {}
  };
}

function mergeDefaults(raw) {
  const base = createDefaultState();
  return {
    ...base,
    ...raw,
    profile: {
      ...base.profile,
      ...(raw.profile || {})
    },
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    notes: Array.isArray(raw.notes) ? raw.notes : [],
    revisions: Array.isArray(raw.revisions) ? raw.revisions : [],
    studyLog: raw.studyLog && typeof raw.studyLog === "object" ? raw.studyLog : {}
  };
}

function showAuthView() {
  els.authView.classList.remove("hidden");
  els.appView.classList.add("hidden");
  els.topUser.classList.add("hidden");
}

function showAppView() {
  els.authView.classList.add("hidden");
  els.appView.classList.remove("hidden");
  els.topUser.classList.remove("hidden");
  els.userBadge.textContent =
    currentUser?.displayName ||
    currentUser?.email ||
    (currentUser?.isAnonymous ? "Guest User" : "User");
}

async function handleGuestMode() {
  try {
    if (FIREBASE_READY) {
      await signInAnonymously(auth);
    } else {
      isLocalMode = true;
      currentUser = {
        uid: "local-guest",
        displayName: "Local Guest",
        email: "",
        isAnonymous: true
      };
      appState = readLocalState();
      showAppView();
      renderAll();
      maybeNotifyDueToday();
    }
  } catch (error) {
    showToast(error.message || "Guest mode start nahi hua.");
  }
}

async function handleGoogleSignIn() {
  if (!FIREBASE_READY) {
    showToast("Google sign-in ke liye Firebase config paste karo.");
    return;
  }

  const provider = new GoogleAuthProvider();

  try {
    if (auth.currentUser?.isAnonymous) {
      await linkWithPopup(auth.currentUser, provider);
      appState.profile.displayName = auth.currentUser.displayName || appState.profile.displayName;
      scheduleSave();
      showToast("Guest account Google se link ho gaya.");
    } else {
      await signInWithPopup(auth, provider);
    }
  } catch (error) {
    showToast(error.message || "Google sign-in failed.");
  }
}

async function handleSignup(event) {
  event.preventDefault();

  const name = els.signupName.value.trim();
  const email = els.signupEmail.value.trim();
  const password = els.signupPassword.value.trim();

  if (password.length < 6) {
    showToast("Password kam se kam 6 characters ka rakho.");
    return;
  }

  if (!FIREBASE_READY) {
    showToast("Signup ke liye Firebase config paste karo.");
    return;
  }

  try {
    if (auth.currentUser?.isAnonymous) {
      const credential = EmailAuthProvider.credential(email, password);
      await linkWithCredential(auth.currentUser, credential);
      await updateProfile(auth.currentUser, { displayName: name });
      appState.profile.displayName = name || appState.profile.displayName;
      scheduleSave();
      showToast("Guest account signup account me convert ho gaya.");
    } else {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(result.user, { displayName: name });
      currentUser = result.user;
      appState.profile.displayName = name || appState.profile.displayName;
      await saveRemoteState(true);
      showToast("Account create ho gaya.");
    }

    els.signupForm.reset();
  } catch (error) {
    showToast(error.message || "Signup failed.");
  }
}

async function handleLogin(event) {
  event.preventDefault();

  const email = els.loginEmail.value.trim();
  const password = els.loginPassword.value.trim();

  if (!FIREBASE_READY) {
    showToast("Login ke liye Firebase config paste karo.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    els.loginForm.reset();
  } catch (error) {
    showToast(error.message || "Login failed.");
  }
}

async function handleLogout() {
  try {
    stopTimerInterval();

    if (isLocalMode) {
      currentUser = null;
      showAuthView();
      showToast("Local guest mode band ho gaya.");
      return;
    }

    await signOut(auth);
    showToast("Logout ho gaya.");
  } catch (error) {
    showToast(error.message || "Logout failed.");
  }
}

function userDocRef(uid) {
  return doc(db, "users", uid, "app", "main");
}

async function loadRemoteState() {
  if (!currentUser || !FIREBASE_READY) return;

  const snap = await getDoc(userDocRef(currentUser.uid));

  if (snap.exists()) {
    appState = mergeDefaults(snap.data());
  } else {
    appState = createDefaultState();
    appState.profile.displayName =
      currentUser.displayName || currentUser.email?.split("@")[0] || "Student";
    await saveRemoteState(true);
  }

  updateBrand();
  els.syncInfo.textContent = currentUser.isAnonymous ? "Cloud guest mode" : "Cloud sync active";
}

function readLocalState() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return createDefaultState();
    return mergeDefaults(JSON.parse(raw));
  } catch {
    return createDefaultState();
  }
}

function scheduleSave() {
  clearTimeout(saveDebounce);
  saveDebounce = setTimeout(() => {
    saveState();
  }, 300);
}

async function saveState() {
  if (isLocalMode) {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(appState));
    els.syncInfo.textContent = "Saved locally";
    return;
  }

  await saveRemoteState();
}

async function saveRemoteState(immediate = false) {
  if (!FIREBASE_READY || !currentUser) return;

  const payload = JSON.parse(JSON.stringify(appState));

  if (immediate) {
    await setDoc(userDocRef(currentUser.uid), payload, { merge: true });
    els.syncInfo.textContent = "Cloud synced";
    return;
  }

  await setDoc(userDocRef(currentUser.uid), payload, { merge: true });
  els.syncInfo.textContent = "Cloud synced";
}

function updateBrand() {
  const name = appState.profile.appName?.trim() || "Pranjal Study Tracker Pro";
  document.title = name;
  els.brandTitle.textContent = name;
}

function renderAll() {
  updateBrand();
  fillProfileForm();
  renderStats();
  renderTasks();
  renderNotes();
  renderRevisions();
  renderTargets();
  renderSubjects();
  renderMonthChart();
  renderUpcoming();
  maybeNotifyDueToday();
}

function fillProfileForm() {
  els.profileAppName.value = appState.profile.appName || "";
  els.profileName.value = appState.profile.displayName || "";
  els.profileClass.value = appState.profile.className || "";
  els.profileExam.value = appState.profile.examTarget || "";
  els.profileDailyTarget.value = appState.profile.dailyTargetHours ?? 6;
  els.profileWeeklyTarget.value = appState.profile.weeklyTargetHours ?? 35;
  els.profileSubjects.value = (appState.profile.favoriteSubjects || []).join(", ");
}

function renderStats() {
  const todaySeconds = getDayTotal(getDateKey(new Date()));
  const weekSeconds = getThisWeekSeconds();
  const monthSeconds = getCurrentMonthSeconds();
  const pendingCount = appState.tasks.filter((task) => !task.done).length;
  const nextSubject = getNextSubject();
  const streakData = getStreakData();

  els.statToday.textContent = formatHoursMinutes(todaySeconds);
  els.statWeek.textContent = formatHoursMinutes(weekSeconds);
  els.statMonth.textContent = formatHoursMinutes(monthSeconds);
  els.statStreak.textContent = `${streakData.current} / best ${streakData.best}`;
  els.statPending.textContent = String(pendingCount);
  els.statNextSubject.textContent = nextSubject || "-";
  els.monthLabel.textContent = formatHoursMinutes(monthSeconds);
}

function getNextSubject() {
  const pending = appState.tasks.filter((task) => !task.done);
  if (!pending.length) return "";

  const withDeadline = pending
    .filter((task) => task.deadline)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));

  return (withDeadline[0] || pending[0]).subject || "General";
}

function addTask(event) {
  event.preventDefault();

  const text = els.taskText.value.trim();
  if (!text) return;

  const task = {
    id: createId(),
    text,
    subject: els.taskSubject.value.trim() || "General",
    priority: els.taskPriority.value,
    deadline: els.taskDeadline.value || "",
    done: false,
    createdAt: new Date().toISOString()
  };

  appState.tasks.unshift(task);
  scheduleSave();
  els.taskForm.reset();
  els.taskPriority.value = "Medium";
  renderTasks();
  renderStats();
  renderUpcoming();
  showToast("Task add ho gaya.");
}

function renderTasks() {
  const subjects = [...new Set(appState.tasks.map((t) => t.subject).filter(Boolean))].sort();
  const currentSelect = filters.subject;

  els.subjectFilter.innerHTML =
    `<option value="">All Subjects</option>` +
    subjects.map((subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`).join("");

  els.subjectFilter.value = currentSelect;

  let tasks = [...appState.tasks];

  if (filters.status === "pending") tasks = tasks.filter((task) => !task.done);
  if (filters.status === "completed") tasks = tasks.filter((task) => task.done);
  if (filters.subject) tasks = tasks.filter((task) => task.subject === filters.subject);

  tasks.sort((a, b) => {
    const aKey = a.deadline || "9999-99-99";
    const bKey = b.deadline || "9999-99-99";
    return aKey.localeCompare(bKey);
  });

  if (!tasks.length) {
    els.taskList.innerHTML = `<div class="empty">No tasks found.</div>`;
    return;
  }

  els.taskList.innerHTML = tasks.map((task) => {
    return `
      <div class="task-item ${task.done ? "done" : ""}">
        <div class="task-main">
          <div class="task-top">
            <div class="task-title">${escapeHtml(task.text)}</div>
            <div class="badge priority-${escapeHtml(task.priority)}">${escapeHtml(task.priority)}</div>
          </div>

          <div class="task-meta">
            <span>Subject: ${escapeHtml(task.subject || "General")}</span>
            <span>${task.deadline ? `Deadline: ${escapeHtml(task.deadline)}` : "No deadline"}</span>
            <span>${task.done ? "Completed" : "Pending"}</span>
          </div>

          <div class="task-actions">
            <button class="mini-btn done" data-action="toggle-task" data-id="${task.id}">
              ${task.done ? "Undo" : "Complete"}
            </button>
            <button class="mini-btn edit" data-action="edit-task" data-id="${task.id}">Edit</button>
            <button class="mini-btn delete" data-action="delete-task" data-id="${task.id}">Delete</button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function handleTaskListClick(event) {
  const btn = event.target.closest("[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const task = appState.tasks.find((item) => item.id === id);
  if (!task) return;

  if (action === "toggle-task") {
    task.done = !task.done;
    scheduleSave();
    renderAll();
    return;
  }

  if (action === "delete-task") {
    appState.tasks = appState.tasks.filter((item) => item.id !== id);
    scheduleSave();
    renderAll();
    return;
  }

  if (action === "edit-task") {
    const newText = prompt("Task title", task.text);
    if (newText === null) return;

    const newSubject = prompt("Subject", task.subject || "General");
    if (newSubject === null) return;

    const newPriority = prompt("Priority: High / Medium / Low", task.priority);
    if (newPriority === null) return;

    const newDeadline = prompt("Deadline (YYYY-MM-DD, blank allowed)", task.deadline || "");
    if (newDeadline === null) return;

    task.text = newText.trim() || task.text;
    task.subject = newSubject.trim() || "General";
    task.priority = ["High", "Medium", "Low"].includes(newPriority.trim()) ? newPriority.trim() : task.priority;
    task.deadline = newDeadline.trim();

    scheduleSave();
    renderAll();
  }
}

function addNote(event) {
  event.preventDefault();

  const text = els.noteText.value.trim();
  if (!text) return;

  appState.notes.unshift({
    id: createId(),
    text,
    createdAt: new Date().toISOString()
  });

  els.noteForm.reset();
  scheduleSave();
  renderNotes();
}

function renderNotes() {
  if (!appState.notes.length) {
    els.noteList.innerHTML = `<div class="empty">No notes yet.</div>`;
    return;
  }

  els.noteList.innerHTML = appState.notes.map((note) => `
    <div class="note-item">
      <div>${escapeHtml(note.text)}</div>
      <div class="item-row">
        <span class="note-time">${formatPrettyDateTime(note.createdAt)}</span>
        <button class="mini-btn delete" data-action="delete-note" data-id="${note.id}">Delete</button>
      </div>
    </div>
  `).join("");
}

function handleNoteListClick(event) {
  const btn = event.target.closest("[data-action='delete-note']");
  if (!btn) return;

  const id = btn.dataset.id;
  appState.notes = appState.notes.filter((note) => note.id !== id);
  scheduleSave();
  renderNotes();
}

function addRevisionPlan(event) {
  event.preventDefault();

  const topic = els.revisionTopic.value.trim();
  const baseDate = els.revisionBaseDate.value;

  if (!topic || !baseDate) return;

  const schedule = [1, 3, 7, 15].map((days) => getDateKey(addDays(parseDate(baseDate), days)));

  appState.revisions.unshift({
    id: createId(),
    topic,
    baseDate,
    schedule,
    doneMap: {}
  });

  els.revisionForm.reset();
  scheduleSave();
  renderRevisions();
  renderUpcoming();
  showToast("Revision plan create ho gaya.");
}

function renderRevisions() {
  if (!appState.revisions.length) {
    els.revisionList.innerHTML = `<div class="empty">No revision plan yet.</div>`;
    return;
  }

  els.revisionList.innerHTML = appState.revisions.map((item) => `
    <div class="revision-item">
      <div class="item-row">
        <strong>${escapeHtml(item.topic)}</strong>
        <button class="mini-btn delete" data-action="delete-revision" data-id="${item.id}">Delete</button>
      </div>

      <div class="light-meta">Base date: ${escapeHtml(item.baseDate)}</div>

      <div class="schedule-row">
        ${item.schedule.map((dateKey) => {
          const done = !!item.doneMap?.[dateKey];
          return `
            <button
              class="schedule-chip ${done ? "done" : ""}"
              data-action="toggle-revision-date"
              data-id="${item.id}"
              data-date="${dateKey}"
            >
              ${dateKey} ${done ? "✓" : ""}
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `).join("");
}

function handleRevisionListClick(event) {
  const btn = event.target.closest("[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const revision = appState.revisions.find((item) => item.id === id);
  if (!revision) return;

  if (action === "delete-revision") {
    appState.revisions = appState.revisions.filter((item) => item.id !== id);
    scheduleSave();
    renderRevisions();
    renderUpcoming();
    return;
  }

  if (action === "toggle-revision-date") {
    const dateKey = btn.dataset.date;
    revision.doneMap = revision.doneMap || {};
    revision.doneMap[dateKey] = !revision.doneMap[dateKey];
    scheduleSave();
    renderRevisions();
    renderUpcoming();
  }
}

function saveProfile(event) {
  event.preventDefault();

  appState.profile.appName = els.profileAppName.value.trim() || "Pranjal Study Tracker Pro";
  appState.profile.displayName = els.profileName.value.trim() || "Student";
  appState.profile.className = els.profileClass.value.trim();
  appState.profile.examTarget = els.profileExam.value.trim();
  appState.profile.dailyTargetHours = Number(els.profileDailyTarget.value || 0);
  appState.profile.weeklyTargetHours = Number(els.profileWeeklyTarget.value || 0);
  appState.profile.favoriteSubjects = els.profileSubjects.value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (currentUser && FIREBASE_READY && !currentUser.isAnonymous && auth.currentUser) {
    updateProfile(auth.currentUser, { displayName: appState.profile.displayName }).catch(() => {});
    els.userBadge.textContent = appState.profile.displayName;
  }

  scheduleSave();
  renderAll();
  showToast("Profile save ho gaya.");
}

/* =========================
   TIMER
   ========================= */

function getFocusSeconds() {
  return Math.max(1, Number(els.focusMin.value || 25)) * 60;
}

function getShortBreakSeconds() {
  return Math.max(1, Number(els.shortBreakMin.value || 5)) * 60;
}

function getLongBreakSeconds() {
  return Math.max(1, Number(els.longBreakMin.value || 15)) * 60;
}

function startTimer() {
  if (timerState.running) return;

  timerState.mode = els.timerMode.value;
  timerState.running = true;
  timerState.startedAt = Date.now();

  if (timerState.mode === "pomodoro" && !timerState.remaining) {
    timerState.remaining = getFocusSeconds();
    timerState.phase = "focus";
  }

  stopTimerInterval();
  timerState.intervalId = setInterval(tickTimer, 1000);
  updateTimerUI();
}

function pauseTimer() {
  if (!timerState.running) return;

  if (timerState.mode === "stopwatch") {
    timerState.accumulated = getStopwatchElapsed();
  } else {
    timerState.remaining = getPomodoroRemaining();
  }

  timerState.running = false;
  timerState.startedAt = null;
  stopTimerInterval();
  updateTimerUI();
}

function resetTimerState() {
  timerState.mode = els.timerMode.value;
  timerState.running = false;
  timerState.startedAt = null;
  timerState.accumulated = 0;
  timerState.phase = "focus";
  timerState.cycles = 0;
  timerState.remaining = getFocusSeconds();
  stopTimerInterval();
  updateTimerUI();
}

function saveCurrentSession() {
  if (timerState.mode === "stopwatch") {
    const seconds = getStopwatchElapsed();
    if (seconds <= 0) {
      showToast("Pehle timer chalao.");
      return;
    }

    addStudySession(els.timerSubject.value.trim() || getNextSubject() || "General", seconds);
    resetTimerState();
    showToast("Stopwatch session save ho gaya.");
    return;
  }

  if (timerState.phase !== "focus") {
    showToast("Pomodoro me sirf focus phase study session hota hai.");
    return;
  }

  const secondsDone = getFocusSeconds() - getPomodoroRemaining();
  if (secondsDone <= 0) {
    showToast("Abhi focus time save karne layak nahi hai.");
    return;
  }

  addStudySession(els.timerSubject.value.trim() || getNextSubject() || "General", secondsDone);
  resetTimerState();
  showToast("Pomodoro focus session save ho gaya.");
}

function tickTimer() {
  if (!timerState.running) return;

  if (timerState.mode === "stopwatch") {
    updateTimerUI();
    return;
  }

  const remaining = getPomodoroRemaining();
  if (remaining > 0) {
    updateTimerUI();
    return;
  }

  handlePomodoroPhaseComplete();
}

function handlePomodoroPhaseComplete() {
  stopTimerInterval();

  if (timerState.phase === "focus") {
    addStudySession(els.timerSubject.value.trim() || getNextSubject() || "General", getFocusSeconds());
    timerState.cycles += 1;

    const longBreak = timerState.cycles % 4 === 0;
    timerState.phase = longBreak ? "longBreak" : "shortBreak";
    timerState.remaining = longBreak ? getLongBreakSeconds() : getShortBreakSeconds();
    timerState.running = true;
    timerState.startedAt = Date.now();
    timerState.intervalId = setInterval(tickTimer, 1000);
    sendBrowserNotification("Focus complete", "Break start ho gaya.");
  } else {
    timerState.phase = "focus";
    timerState.remaining = getFocusSeconds();
    timerState.running = true;
    timerState.startedAt = Date.now();
    timerState.intervalId = setInterval(tickTimer, 1000);
    sendBrowserNotification("Break over", "Next focus session start ho gaya.");
  }

  updateTimerUI();
}

function stopTimerInterval() {
  if (timerState.intervalId) {
    clearInterval(timerState.intervalId);
    timerState.intervalId = null;
  }
}

function getStopwatchElapsed() {
  if (!timerState.running || !timerState.startedAt) {
    return timerState.accumulated;
  }
  return timerState.accumulated + Math.floor((Date.now() - timerState.startedAt) / 1000);
}

function getPomodoroRemaining() {
  if (!timerState.running || !timerState.startedAt) {
    return timerState.remaining;
  }
  return Math.max(0, timerState.remaining - Math.floor((Date.now() - timerState.startedAt) / 1000));
}

function updateTimerUI() {
  const mode = els.timerMode.value;
  let label = "Stopwatch";
  let display = "00:00:00";

  if (mode === "stopwatch") {
    display = formatClock(getStopwatchElapsed());
    label = "Stopwatch";
    els.timerHint.textContent = "Manual session save se study hours add honge.";
  } else {
    const remaining = getPomodoroRemaining();
    display = formatClock(remaining);
    label =
      timerState.phase === "focus"
        ? "Focus"
        : timerState.phase === "shortBreak"
        ? "Short Break"
        : "Long Break";
    els.timerHint.textContent = "Focus complete hote hi auto short/long break chalega.";
  }

  els.phaseBadge.textContent = label;
  els.timerDisplay.textContent = display;
}

function resetTimerDisplay() {
  timerState.remaining = getFocusSeconds();
  updateTimerUI();
}

function addStudySession(subject, seconds) {
  const key = getDateKey(new Date());

  if (!appState.studyLog[key]) {
    appState.studyLog[key] = {
      totalSeconds: 0,
      subjects: {}
    };
  }

  appState.studyLog[key].totalSeconds += seconds;
  appState.studyLog[key].subjects[subject] =
    (appState.studyLog[key].subjects[subject] || 0) + seconds;

  scheduleSave();
  renderAll();
}

/* =========================
   TARGETS / SUBJECTS / GRAPH
   ========================= */

function renderTargets() {
  const todaySeconds = getDayTotal(getDateKey(new Date()));
  const weekSeconds = getThisWeekSeconds();

  const dailyTargetSeconds = Number(appState.profile.dailyTargetHours || 0) * 3600;
  const weeklyTargetSeconds = Number(appState.profile.weeklyTargetHours || 0) * 3600;

  const dailyPercent = dailyTargetSeconds > 0 ? Math.min(100, Math.round((todaySeconds / dailyTargetSeconds) * 100)) : 0;
  const weeklyPercent = weeklyTargetSeconds > 0 ? Math.min(100, Math.round((weekSeconds / weeklyTargetSeconds) * 100)) : 0;

  els.dailyBar.style.width = `${dailyPercent}%`;
  els.weeklyBar.style.width = `${weeklyPercent}%`;

  els.dailyTargetText.textContent = `${dailyPercent}% • ${formatHoursMinutes(todaySeconds)} / ${Number(appState.profile.dailyTargetHours || 0)}h`;
  els.weeklyTargetText.textContent = `${weeklyPercent}% • ${formatHoursMinutes(weekSeconds)} / ${Number(appState.profile.weeklyTargetHours || 0)}h`;
}

function renderSubjects() {
  const subjectTotals = getSubjectTotals();
  const subjectEntries = Object.entries(subjectTotals);

  const favoriteSubjects = appState.profile.favoriteSubjects || [];
  favoriteSubjects.forEach((sub) => {
    if (!subjectTotals[sub]) {
      subjectTotals[sub] = 0;
    }
  });

  const finalEntries = Object.entries(subjectTotals).sort((a, b) => b[1] - a[1]);

  if (!finalEntries.length) {
    els.subjectSummary.innerHTML = `<div class="empty">Subject data abhi nahi hai.</div>`;
    els.comparisonText.textContent = "This week vs last week";
    return;
  }

  const thisWeek = getThisWeekSeconds();
  const lastWeek = getLastWeekSeconds();
  const diff = thisWeek - lastWeek;
  const diffText =
    diff === 0
      ? "Same as last week"
      : diff > 0
      ? `+${formatHoursMinutes(diff)} better`
      : `${formatHoursMinutes(Math.abs(diff))} lower`;

  els.comparisonText.textContent = diffText;

  const weakSubject = [...finalEntries].sort((a, b) => a[1] - b[1])[0]?.[0] || "";

  els.subjectSummary.innerHTML = finalEntries.map(([name, seconds]) => {
    const weekSeconds = getWeekSubjectSeconds(name);
    return `
      <div class="subject-item">
        <div class="item-row">
          <strong>${escapeHtml(name)}</strong>
          <span class="badge">${weakSubject === name ? "Weak highlight" : "Tracked"}</span>
        </div>
        <div class="light-meta">
          Total: ${formatHoursMinutes(seconds)} • This week: ${formatHoursMinutes(weekSeconds)}
        </div>
      </div>
    `;
  }).join("");
}

function renderMonthChart() {
  const canvas = els.monthChart;
  const width = canvas.clientWidth || 700;
  const height = 300;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = width * dpr;
  canvas.height = height * dpr;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const values = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const key = getDateKey(new Date(year, month, day));
    values.push(getDayTotal(key) / 3600);
  }

  const maxValue = Math.max(1, ...values);
  const pad = { top: 20, right: 20, bottom: 36, left: 44 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const barGap = 5;
  const barWidth = Math.max(6, (chartWidth - barGap * (daysInMonth - 1)) / daysInMonth);

  ctx.fillStyle = "rgba(255,255,255,0.02)";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;

  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (chartHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();

    const value = ((maxValue / 4) * (4 - i)).toFixed(1);
    ctx.fillStyle = "rgba(220,230,255,0.8)";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${value}h`, pad.left - 8, y + 4);
  }

  values.forEach((value, index) => {
    const x = pad.left + index * (barWidth + barGap);
    const barHeight = (value / maxValue) * chartHeight;
    const y = pad.top + chartHeight - barHeight;

    drawRoundedBar(ctx, x, y, barWidth, barHeight, 6);

    const day = index + 1;
    if (day === 1 || day % 5 === 0 || day === daysInMonth) {
      ctx.fillStyle = "rgba(215,228,255,0.85)";
      ctx.textAlign = "center";
      ctx.fillText(String(day), x + barWidth / 2, height - 12);
    }
  });
}

function drawRoundedBar(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  const r = Math.min(radius, width / 2, height / 2);
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();

  const grad = ctx.createLinearGradient(x, y, x, y + height);
  grad.addColorStop(0, "rgba(108, 150, 255, 0.95)");
  grad.addColorStop(1, "rgba(60, 109, 255, 0.95)");
  ctx.fillStyle = grad;
  ctx.fill();
}

/* =========================
   UPCOMING / CALENDAR
   ========================= */

function renderUpcoming() {
  const todayKey = getDateKey(new Date());
  const items = [];

  appState.tasks.forEach((task) => {
    if (!task.done && task.deadline) {
      items.push({
        type: "Task",
        title: task.text,
        subject: task.subject || "General",
        date: task.deadline
      });
    }
  });

  appState.revisions.forEach((rev) => {
    rev.schedule.forEach((dateKey) => {
      const done = rev.doneMap?.[dateKey];
      if (!done) {
        items.push({
          type: "Revision",
          title: rev.topic,
          subject: "Revision",
          date: dateKey
        });
      }
    });
  });

  items.sort((a, b) => a.date.localeCompare(b.date));

  const futureItems = items.filter((item) => item.date >= todayKey).slice(0, 10);

  if (!futureItems.length) {
    els.upcomingList.innerHTML = `<div class="empty">Upcoming calendar clear hai.</div>`;
    return;
  }

  els.upcomingList.innerHTML = futureItems.map((item) => `
    <div class="upcoming-item">
      <div class="item-row">
        <strong>${escapeHtml(item.title)}</strong>
        <span class="badge">${escapeHtml(item.type)}</span>
      </div>
      <div class="light-meta">
        ${escapeHtml(item.subject)} • ${escapeHtml(item.date)}
      </div>
    </div>
  `).join("");
}

/* =========================
   NOTIFICATIONS
   ========================= */

async function enableNotifications() {
  if (!("Notification" in window)) {
    showToast("Is browser me notifications supported nahi hain.");
    return;
  }

  const permission = await Notification.requestPermission();
  showToast(`Notification permission: ${permission}`);
  maybeNotifyDueToday();
}

function maybeNotifyDueToday() {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const todayKey = getDateKey(new Date());
  const marker = `study-notified-${todayKey}`;
  if (localStorage.getItem(marker)) return;

  const dueTasks = appState.tasks.filter((task) => !task.done && task.deadline === todayKey);
  const dueRevisions = appState.revisions.flatMap((rev) =>
    rev.schedule
      .filter((dateKey) => dateKey === todayKey && !rev.doneMap?.[dateKey])
      .map(() => rev.topic)
  );

  if (!dueTasks.length && !dueRevisions.length) return;

  const parts = [];
  if (dueTasks.length) parts.push(`${dueTasks.length} task due`);
  if (dueRevisions.length) parts.push(`${dueRevisions.length} revision due`);

  sendBrowserNotification("Study reminder", parts.join(" • "));
  localStorage.setItem(marker, "1");
}

function sendBrowserNotification(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    new Notification(title, { body });
  } catch {
    /* ignore */
  }
}

/* =========================
   HELPERS
   ========================= */

function getDayTotal(dateKey) {
  return Number(appState.studyLog?.[dateKey]?.totalSeconds || 0);
}

function getSubjectTotals() {
  const totals = {};

  for (const entry of Object.values(appState.studyLog)) {
    const subjects = entry?.subjects || {};
    for (const [subject, seconds] of Object.entries(subjects)) {
      totals[subject] = (totals[subject] || 0) + Number(seconds || 0);
    }
  }

  return totals;
}

function getCurrentMonthSeconds() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  let total = 0;

  for (const key of Object.keys(appState.studyLog)) {
    const date = parseDate(key);
    if (!date) continue;
    if (date.getFullYear() === year && date.getMonth() === month) {
      total += getDayTotal(key);
    }
  }

  return total;
}

function getThisWeekSeconds() {
  const { start, end } = getWeekRange(new Date());
  return getRangeSeconds(start, end);
}

function getLastWeekSeconds() {
  const currentStart = getWeekRange(new Date()).start;
  const lastWeekDate = addDays(currentStart, -2);
  const { start, end } = getWeekRange(lastWeekDate);
  return getRangeSeconds(start, end);
}

function getRangeSeconds(startDate, endDate) {
  let total = 0;
  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    total += getDayTotal(getDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return total;
}

function getWeekRange(baseDate) {
  const date = new Date(baseDate);
  date.setHours(0, 0, 0, 0);

  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const start = new Date(date);
  start.setDate(date.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(0, 0, 0, 0);

  return { start, end };
}

function getWeekSubjectSeconds(subject) {
  const { start, end } = getWeekRange(new Date());
  let total = 0;
  const cursor = new Date(start);

  while (cursor <= end) {
    const key = getDateKey(cursor);
    total += Number(appState.studyLog?.[key]?.subjects?.[subject] || 0);
    cursor.setDate(cursor.getDate() + 1);
  }

  return total;
}

function getStreakData() {
  const activeKeys = Object.keys(appState.studyLog)
    .filter((key) => getDayTotal(key) > 0)
    .sort();

  if (!activeKeys.length) return { current: 0, best: 0 };

  let best = 1;
  let running = 1;

  for (let i = 1; i < activeKeys.length; i++) {
    const prev = parseDate(activeKeys[i - 1]);
    const curr = parseDate(activeKeys[i]);
    const diff = Math.round((curr - prev) / 86400000);

    if (diff === 1) {
      running += 1;
      best = Math.max(best, running);
    } else {
      running = 1;
    }
  }

  const todayKey = getDateKey(new Date());
  const yesterdayKey = getDateKey(addDays(new Date(), -1));

  let current = 0;
  let cursor = null;

  if (getDayTotal(todayKey) > 0) cursor = parseDate(todayKey);
  else if (getDayTotal(yesterdayKey) > 0) cursor = parseDate(yesterdayKey);

  if (cursor) {
    while (getDayTotal(getDateKey(cursor)) > 0) {
      current += 1;
      cursor = addDays(cursor, -1);
    }
  }

  return { current, best };
}

function formatClock(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function formatHoursMinutes(totalSeconds) {
  const sec = Math.floor(totalSeconds || 0);
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function getDateKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(dateKey) {
  if (!dateKey) return null;
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatPrettyDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString();
}

function createId() {
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2200);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

