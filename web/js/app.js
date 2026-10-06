/* AI&DS-ML LEARNING — production client.
   All account/content/progress/assessment/report data is live successfully. */

const LIVE = {
  profiles: [],
  units: [],
  topics: [],
  assessments: [],
  questions: [],
  progress: [],
  attempts: [],
  syllabus: [],
  quizzes: [],
  quizQuestions: [],
  learningSessions: []
};

let S = {
  user: null,
  page: 'dashboard',
  pageHistory: [],
  course: null,
  assignmentId: null,
  assignmentAnswers: {},
  assignmentSessionId: null,
  assignmentExpiresAt: null,
  selectedTopicId: null,
  searchQuery: ''
};

let assignmentBuilder = [];
let editingAssessmentId = null;
let quizBuilder = [];
let editingQuizId = null;
let selectedSyllabusFile = null;
let editingSyllabusId = null;
let selectedSyllabusEditFile = null;
let loading = false;
let realtimeChannel = null;
let realtimeRefreshTimer = null;
let refreshQueued = false;
let assessmentTimer = null;
let learningTimer = null;
let learningIdleTimer = null;
let learningSessionId = null;
let learningStartedAt = null;
let learningUnitId = null;
let learningTopicId = null;
let learningLastActivityAt = 0;

const $ = (id) => document.getElementById(id);

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function initials(name) {
  return String(name || 'U').trim().split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase() || 'U';
}

function toast(message) {
  const x = $('toast');
  if (!x) return;
  x.textContent = message;
  x.classList.remove('hide');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => x.classList.add('hide'), 3200);
}

function applyTheme() {
  document.body.classList.remove('dark');
}

function togglePass() {
  const x = $('password');
  if (x) x.type = x.type === 'password' ? 'text' : 'password';
}

function normalizedProfile(p) {
  const email = String(p?.email_id || '').trim().toLowerCase();
  return {
    email,
    role: ['admin', 'administrator'].includes(String(p?.role || '').trim().toLowerCase()) ? 'admin' : 'student',
    name: p?.full_name || email,
    id: p?.register_id || p?.id || '',
    dept: p?.department || 'Artificial Intelligence & Data Science',
    college: p?.college || 'Mahendra Engineering College',
    authId: p?.id || ''
  };
}

function courseUnits() {
  const out = {};
  const units = [...LIVE.units].sort((a, b) => a.sort_order - b.sort_order);
  for (const unit of units) {
    out[unit.name] = LIVE.topics
      .filter((t) => t.unit_id === unit.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((t) => ({ ...t, id: t.id }));
  }
  return out;
}

function courseUnitOrder() {
  return [...LIVE.units].sort((a, b) => a.sort_order - b.sort_order).map((u) => u.name);
}

function topicsForUnit(unitName) {
  const unit = LIVE.units.find((u) => u.name === unitName);
  if (!unit) return [];
  return LIVE.topics.filter((t) => t.unit_id === unit.id).sort((a, b) => a.sort_order - b.sort_order);
}

function unitTopicStats(userId, unitName) {
  const topics = topicsForUnit(unitName);
  const done = topics.filter((t) => LIVE.progress.some((p) => p.user_id === userId && p.topic_id === t.id)).length;
  return {
    total: topics.length,
    viewed: done,
    pct: topics.length ? Math.round((done / topics.length) * 100) : 0
  };
}

function totalUnitTopics() {
  return LIVE.topics.length;
}

function totalUnitViewed(userId) {
  return LIVE.progress.filter((p) => p.user_id === userId && LIVE.topics.some((t) => t.id === p.topic_id)).length;
}

function assessmentRowsFor(assessmentId, userId = S.user?.authId) {
  const rows = LIVE.attempts.filter((x) => x.assessment_id === assessmentId && (!userId || x.user_id === userId));
  return rows.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
}

function latestAttempt(assessmentId, userId = S.user?.authId) {
  return assessmentRowsFor(assessmentId, userId)[0] || null;
}

function attemptsForUser(userId = S.user?.authId) {
  return LIVE.attempts.filter((a) => a.user_id === userId).sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
}

function overallAssessmentScore(userId = S.user?.authId) {
  const latestByAssessment = new Map();
  attemptsForUser(userId).filter((attempt) => attempt.status !== 'rejected').forEach((attempt) => {
    if (!latestByAssessment.has(attempt.assessment_id)) latestByAssessment.set(attempt.assessment_id, attempt);
  });
  const scores = [...latestByAssessment.values()].map((attempt) => Number(attempt.score || 0));
  return scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
}

function reports() {
  return LIVE.attempts
    .map((a) => {
      const p = LIVE.profiles.find((x) => x.id === a.user_id);
      const ass = LIVE.assessments.find((x) => x.id === a.assessment_id);
      return {
        id: a.id,
        studentId: p?.register_id || p?.id || a.user_id,
        student: p?.full_name || p?.email_id || a.user_id,
        email: p?.email_id || '',
        course: ass?.title || 'Assessment',
        score: Number(a.score || 0),
        correct: Number(a.correct_count || 0),
        total: Number(a.total_count || 0),
        status: a.status || 'completed',
        submittedAt: a.submitted_at,
        assessmentId: a.assessment_id,
        userId: a.user_id,
        attemptCount: LIVE.attempts.filter((attempt) => attempt.user_id === a.user_id && attempt.assessment_id === a.assessment_id).length
      };
    })
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

function latestReports() {
  const latest = new Map();
  reports().forEach((report) => {
    const key = `${report.userId}:${report.assessmentId}`;
    if (!latest.has(key)) latest.set(key, report);
  });
  return [...latest.values()];
}

function studentLearning(userId = S.user?.authId) {
  const viewedTopics = totalUnitViewed(userId);
  return {
    viewedTopics,
    totalTopics: totalUnitTopics(),
    percentage: totalUnitTopics() ? Math.round((viewedTopics / totalUnitTopics()) * 100) : 0
  };
}

function assignmentProgress(userId = S.user?.authId) {
  const list = LIVE.assessments.filter((a) => a.published);
  if (!list.length) return 0;
  const completed = list.filter((a) => latestAttempt(a.id, userId)?.status !== 'rejected').filter((a) => latestAttempt(a.id, userId)).length;
  return Math.round((completed / list.length) * 100);
}

function testCount(userId = S.user?.authId) {
  return attemptsForUser(userId).length;
}

function testCountForUser(userId) {
  return attemptsForUser(userId).length;
}

function rankingSeed() {
  const users = LIVE.profiles.filter((p) => p.role !== 'admin');
  return users.map((p) => {
    const userId = p.id;
    const courseCompletion = totalUnitTopics() ? Math.round((totalUnitViewed(userId) / totalUnitTopics()) * 100) : 0;
    const assessmentCompletion = assignmentProgress(userId);
    const userAttempts = attemptsForUser(userId).filter((x) => x.status !== 'rejected');
    const latest = userAttempts[0];
    const testScore = latest ? Number(latest.score || 0) : 0;
    const overall = Math.round((courseCompletion + assessmentCompletion + testScore) / 3);
    return { ...normalizedProfile(p), courseCompletion, assignmentCompletion: assessmentCompletion, tests: testScore, testCount: userAttempts.length, overall };
  });
}

function rankings() {
  return rankingSeed().sort((a, b) => b.overall - a.overall || b.courseCompletion - a.courseCompletion || a.name.localeCompare(b.name));
}

async function loadLiveData() {
  if (!window.supabaseClient) throw new Error('learning services are unavailable.');
  const isAdmin = S.user?.role === 'admin';

  const [units, topics, assessments, progress, attemptsRows, syllabus, quizzes] = await Promise.all([
    LMS.units(),
    LMS.topics(),
    LMS.assessments(),
    LMS.progress(),
    LMS.attempts(),
    LMS.syllabus(),
    LMS.quizzes()
  ]);

  let questions = [];
  let quizQuestions = [];
  if (isAdmin) {
    [questions, quizQuestions] = await Promise.all([LMS.adminQuestions(), LMS.quizQuestions()]);
  } else {
    const publishedAssessments = assessments.filter((a) => a.published);
    const questionSets = await Promise.all(publishedAssessments.map((a) => LMS.studentQuestions(a.id)));
    questions = questionSets.flat().map((q) => ({ ...q, assessment_id: q.assessment_id, question_text: q.question_text, options: q.options }));
  }

  LIVE.units = units;
  LIVE.topics = topics;
  LIVE.assessments = assessments;
  LIVE.progress = progress;
  LIVE.attempts = attemptsRows;
  LIVE.syllabus = syllabus;
  LIVE.quizzes = quizzes;
  LIVE.questions = questions;
  LIVE.quizQuestions = quizQuestions;
  LIVE.learningSessions = isAdmin ? await LMS.learningSessions() : [];
  LIVE.loginEvents = isAdmin ? await LMS.loginEvents() : [];

  if (isAdmin) {
    LIVE.profiles = await LMS.profiles();
  } else if (S.user?.authId) {
    const profile = await LMS.profile(S.user.authId);
    LIVE.profiles = profile ? [profile] : [];
  }

  // Keep the in-memory header/session profile synchronized with live learning data.
  const ownProfile = LIVE.profiles.find((p) => p.id === S.user?.authId);
  if (ownProfile && S.user) {
    const nextUser = normalizedProfile(ownProfile);
    const roleChanged = nextUser.role !== S.user.role;
    S.user = nextUser;
    if (roleChanged) {
      S.page = nextUser.role === 'admin' ? 'admin' : 'dashboard';
      buildNav();
    }
  }
}

async function login() {
  const entered = ($('email')?.value || '').trim().toLowerCase();
  const selectedRole = $('role')?.value || 'student';
  const loginPassword = $('password')?.value || '';
  if (!entered || !loginPassword) return toast('Enter your Email ID and Password.');
  if (!window.supabaseClient) return toast('Learning services are unavailable. Please check the site configuration.');

  try {
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email: entered, password: loginPassword });
    if (error) throw error;
    if (!data?.user?.id) throw new Error('Sign-in did not return a valid user session.');

    const profile = await LMS.profile(data.user.id);
    if (!profile) {
      await window.supabaseClient.auth.signOut();
      return toast('Login succeeded, but no profile is configured for this account. Create the matching row in public.profiles first.');
    }

    const actualRole = ['admin', 'administrator'].includes(String(profile.role || '').trim().toLowerCase()) ? 'admin' : 'student';
    if (actualRole !== selectedRole) {
      await window.supabaseClient.auth.signOut();
      return toast(`This account is registered as ${actualRole === 'admin' ? 'Administrator' : 'Student'}. Select the correct role.`);
    }

    S.user = normalizedProfile(profile);
    S.page = actualRole === 'admin' ? 'admin' : 'dashboard';
    $('login').classList.add('hide');
    $('app').classList.remove('hide');
    await setup();
    if (actualRole === 'student') LMS.recordLogin().catch(() => {});
    render();
  } catch (error) {
    console.error('Login failed:', error);
    toast(error?.message || 'Login failed.');
  }
}

async function restoreSession() {
  try {
    const session = await LMS.session();
    if (!session?.user?.id) return;
    const profile = await LMS.profile(session.user.id);
    if (!profile) {
      await window.supabaseClient.auth.signOut();
      return toast('Your Auth account has no matching profile.');
    }
    S.user = normalizedProfile(profile);
    S.page = S.user.role === 'admin' ? 'admin' : 'dashboard';
    $('login').classList.add('hide');
    $('app').classList.remove('hide');
    await setup();
    if (S.user?.role === 'student') LMS.recordLogin().catch(() => {});
    render();
  } catch (error) {
    console.warn('Session restore skipped:', error);
  }
}

async function setup() {
  await refreshLive();
  // Learning time begins when a student opens a course topic; dashboard/login time is not counted as learning.
  updateHeaderProfile();
  buildNav();
  subscribeRealtime();
}

function subscribeRealtime() {
  if (!window.supabaseClient) return;
  if (realtimeChannel) {
    window.supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  const tables = ['profiles','lms_units','lms_topics','lms_assessments','lms_questions','lms_topic_progress','lms_attempts','lms_syllabus','lms_quizzes','lms_quiz_questions','lms_learning_sessions','lms_assessment_sessions'];
  let channel = window.supabaseClient.channel(`lms-live-${Date.now()}`);
  for (const table of tables) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
      clearTimeout(realtimeRefreshTimer);
      realtimeRefreshTimer = setTimeout(async () => {
        await refreshLive();
        updateHeaderProfile();
        // Do not wipe an in-progress assessment/quiz builder on a remote change.
        const editing = S.user?.role === 'admin' && (editingAssessmentId || editingQuizId);
        const takingAssessment = S.page === 'customAssignment';
        if (!editing && !takingAssessment) render();
      }, 350);
    });
  }
  realtimeChannel = channel;
  channel.subscribe((status) => { if (status === 'CHANNEL_ERROR') console.warn('Live update channel error.'); });
}

async function refreshLive() {
  if (loading) {
    refreshQueued = true;
    return;
  }
  loading = true;
  refreshQueued = false;
  try {
    await loadLiveData();
  } catch (error) {
    console.error('Live data load failed:', error);
    toast(error?.message || 'Unable to load live learning data.');
  } finally {
    loading = false;
    if (refreshQueued) {
      refreshQueued = false;
      queueMicrotask(() => refreshLive());
    }
  }
}

function updateHeaderProfile() {
  if (!S.user) return;
  if ($('roleBadge')) $('roleBadge').textContent = S.user.role === 'admin' ? 'ADMINISTRATOR' : 'STUDENT LEARNING PORTAL';
  if ($('name')) $('name').textContent = S.user.name;
  if ($('avatar')) $('avatar').textContent = initials(S.user.name);
  if ($('profileMenuName')) $('profileMenuName').textContent = S.user.name;
  if ($('profileMenuEmail')) $('profileMenuEmail').textContent = S.user.email;
  if ($('profileMenuRole')) $('profileMenuRole').textContent = S.user.role === 'admin' ? 'Administrator' : 'Student';
  if ($('profileMenuAvatar')) $('profileMenuAvatar').textContent = initials(S.user.name);
}

async function logout() {
  await stopLearningTracking();
  clearInterval(assessmentTimer);
  closeProfileMenu();
  clearTimeout(realtimeRefreshTimer);
  if (realtimeChannel && window.supabaseClient) { window.supabaseClient.removeChannel(realtimeChannel); realtimeChannel = null; }
  try { await window.supabaseClient.auth.signOut(); } catch (e) { console.warn(e); }
  S = { user: null, page: 'dashboard', course: null, assignmentId: null, assignmentAnswers: {}, assignmentSessionId: null, assignmentExpiresAt: null, selectedTopicId: null, selectedAssessmentUnitId: '', searchQuery: '', assessmentReview: null, assessmentReviewAssessmentId: null };
  Object.keys(LIVE).forEach((key) => { LIVE[key] = []; });
  $('app').classList.add('hide');
  $('login').classList.remove('hide');
  $('email').value = '';
  $('password').value = '';
}

function toggleProfileMenu(e) {
  e?.stopPropagation();
  const menu = $('profileMenu');
  const btn = $('avatarBtn');
  if (!menu) return;
  menu.classList.toggle('hide');
  btn?.setAttribute('aria-expanded', menu.classList.contains('hide') ? 'false' : 'true');
}

function closeProfileMenu() {
  $('profileMenu')?.classList.add('hide');
  $('avatarBtn')?.setAttribute('aria-expanded', 'false');
}

function openAccountProfile() {
  closeProfileMenu();
  S.page = S.user?.role === 'admin' ? 'adminProfile' : 'profile';
  render();
}

function openUserProfile(userId) {
  const user = (LIVE.profiles || []).find((p) => p.id === userId) || rankings().find((u) => u.id === userId);
  if (!user) return toast('Student profile not found.');
  S.profileView = user;
  S.page = 'studentProfile';
  render();
}

function openSettings() {
  closeProfileMenu();
  S.page = 'settings';
  render();
}

function settingsPage() {
  const u = S.user || {};
  return `<div class="header"><div><h1>Settings</h1><p>Manage your AI&DS-ML LEARNING account preferences.</p></div></div>
  <div class="settingsGrid">
    <div class="settingsCard"><h3>Account</h3><p>Your currently signed-in account information.</p><div class="settingRow"><div><div class="settingLabel">Name</div><div class="settingValue">${escapeHtml(u.name)}</div></div></div><div class="settingRow"><div><div class="settingLabel">Email ID</div><div class="settingValue" style="overflow-wrap:anywhere">${escapeHtml(u.email)}</div></div></div><div class="settingRow"><div><div class="settingLabel">Role</div><div class="settingValue">${u.role === 'admin' ? 'Administrator' : 'Student'}</div></div></div><div class="settingsActions"><button class="settingsBtn primary" type="button" onclick="openAccountProfile()">View Profile</button><button class="settingsBtn" type="button" onclick="logout()">Logout</button></div></div>
    <div class="settingsCard"><h3>Platform Services</h3><p>Your learning workspace stays synchronized across devices.</p><div class="settingRow"><div><div class="settingLabel">Authentication</div><div class="settingValue">secure account sign-in</div></div></div><div class="settingRow"><div><div class="settingLabel">Database</div><div class="settingValue">cloud database</div></div></div><div class="settingRow"><div><div class="settingLabel">Files</div><div class="settingValue">private file storage</div></div></div></div>
  </div>`;
}

function buildNav() {
  const admin = S.user?.role === 'admin';
  const navEl = $('nav');
  if (!navEl || !S.user) return;
  const items = admin
    ? [['admin','▦','Dashboard'],['reports','▤','Student Reports'],['students','♙','Students'],['ranking','🏆','Overall Ranking'],['adminCourses','▣','Courses'],['adminLearning','◔','Learning Activity'],['adminAssignments','📝','Assessment'],['adminSyllabus','📚','Syllabus'],['adminQuizzes','❓','Quizzes']]
    : [['dashboard','⌂','Dashboard'],['courses','▤','Course'],['assessment','✓','Assessment'],['training','🧪','Model Training Practice'],['syllabus','📚','Syllabus'],['progress','◔','My Progress'],['profile','♙','My Profile']];
  navEl.innerHTML = items.map(([page, icon, label]) => `<button type="button" class="nav ${S.page === page ? 'active' : ''}" data-page="${page}"><span>${icon}</span><span>${label}</span></button>`).join('');
  navEl.querySelectorAll('.nav[data-page]').forEach((btn) => btn.addEventListener('click', () => go(btn.dataset.page)));
}

function go(page) {
  if (!S.user) return;
  closeProfileMenu();
  const current = S.page;
  if (current === 'customAssignment' && page !== 'customAssignment') clearInterval(assessmentTimer);
  if (current && current !== page) {
    S.pageHistory = [...(S.pageHistory || [])];
    S.pageHistory.push(current);
    if (S.pageHistory.length > 12) S.pageHistory.shift();
  }
  S.page = page;
  if (page !== 'customAssignment') S.assignmentId = null;
  buildNav();
  render();
  if (window.innerWidth <= 850) $('side')?.classList.remove('open');
}

function goBack() {
  if (!S.user) return;
  const previous = (S.pageHistory || []).pop();
  if (!previous) return goHome();
  if (S.page === 'customAssignment' && previous !== 'customAssignment') clearInterval(assessmentTimer);
  S.pageHistory = [...(S.pageHistory || [])];
  S.pageHistory.pop();
  S.page = previous;
  render();
  if (window.innerWidth <= 850) $('side')?.classList.remove('open');
}

function goHome() { if (S.user) { S.searchQuery = ''; if ($('search')) $('search').value = ''; S.pageHistory = []; go(S.user.role === 'admin' ? 'admin' : 'dashboard'); } }
function toggleSide() {
  const side = $('side');
  if (!side) return;
  if (window.innerWidth <= 850) {
    side.classList.toggle('open');
    side.classList.remove('collapsed');
  } else {
    side.classList.toggle('collapsed');
    side.classList.remove('open');
  }
}

function formatDeadline(value) {
  if (!value) return 'No deadline set';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return escapeHtml(value);
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function deadlinePassed(value) {
  return !!value && new Date(value).getTime() <= Date.now();
}

function toDatetimeLocal(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function rankingTable() {
  const list = rankings();
  return `<div class="leaderboardWrap"><table class="leaderboard"><thead><tr><th>Rank</th><th>Student</th><th>Reg No</th><th>Course Completion</th><th>Assessment Completion</th><th>Tests</th><th>Overall</th></tr></thead><tbody>${list.map((u, i) => `<tr><td><span class="rankNo">#${i + 1}</span></td><td><div class="studentCell" style="cursor:pointer" onclick="openUserProfile('${u.id}')"><div class="miniAvatar">${initials(u.name)}</div><div><b>${escapeHtml(u.name)}</b><div style="font-size:9px;color:#8994a2">${escapeHtml(u.email)}</div></div></div></td><td>${escapeHtml(u.id)}</td><td><div class="metric"><div class="metricLine"><div class="progress"><div style="width:${u.courseCompletion}%"></div></div><b>${u.courseCompletion}%</b></div></div></td><td><div class="metric"><div class="metricLine"><div class="progress"><div style="width:${u.assignmentCompletion}%"></div></div><b>${u.assignmentCompletion}%</b></div></div></td><td><b>${u.tests}%</b><div style="font-size:9px;color:#8994a2">${u.testCount} completed</div></td><td><span class="overallPill">${u.overall}%</span></td></tr>`).join('')}</tbody></table></div>`;
}

function rankingPage() {
  return `<div class="header"><div><h1>Overall Ranking</h1><p>Live ranking calculated from current course progress and assessment results.</p></div></div><div class="panel"><div class="panelTitle"><h2>Live Leaderboard</h2><span class="tag">${rankings().length} Students</span></div>${rankingTable()}</div>`;
}

function studentDash() {
  const l = studentLearning();
  const submitted = attemptsForUser().filter((x) => x.status !== 'rejected');
  const latest = submitted[0] ? { ...submitted[0], score: overallAssessmentScore() } : null;
  const latestAssessment = LIVE.assessments.find((a) => a.id === latest?.assessment_id);
  return `<div class="hero"><div><div class="eyebrow">AI&DS-ML LEARNING · MACHINE LEARNING</div><h1>Bring your <span>ML skills</span> to life</h1><p>Learn from the live five-unit curriculum, complete assessments and track your progress directly successfully.</p></div><div class="heroActions"><button class="primary" onclick="go('courses')">Continue Learning</button><button class="secondary" onclick="go('assessment')">Take Assessment</button></div></div>
  <div class="welcome"><h2>Welcome ${escapeHtml(S.user.name.split(' ')[0])} 👋</h2><p>Your course activity and assessment results are saved to your account.</p></div>
  <div class="stats"><div class="stat"><span>📚 Units</span><strong>${LIVE.units.length}</strong><small>Live curriculum</small></div><div class="stat"><span>✓ Topics Viewed</span><strong>${l.viewedTopics}</strong><small>of ${l.totalTopics}</small></div><div class="stat"><span>◔ Course Progress</span><strong>${l.percentage}%</strong><small>Calculated from viewed topics</small></div><div class="stat" style="cursor:pointer" onclick="${latestAssessment ? `openCustomAssignment('${latestAssessment.id}')` : `go('assessment')`}" title="${latestAssessment ? 'Open latest assessment' : 'Open assessments'}"><span>⚡ Latest Score</span><strong>${latest ? Number(latest.score) + '%' : '0%'}</strong><small>${latestAssessment ? escapeHtml(latestAssessment.title) : 'Not attempted · Take Assessment'}</small></div></div>
  <div class="grid2"><div class="panel"><div class="panelTitle"><h2>Resume Learning</h2><button class="link" onclick="go('courses')">View All</button></div>${LIVE.units.slice(0, 2).map((unit) => { const st = unitTopicStats(S.user.authId, unit.name); return `<div class="courseRow"><div class="courseIcon">${unit.sort_order}</div><div class="courseMain"><h3>${escapeHtml(unit.name)}</h3><p>${st.viewed}/${st.total} topics viewed · ${st.pct}% complete</p><div class="progress"><div style="width:${st.pct}%"></div></div></div></div>`; }).join('') || '<div class="empty">No course units published yet.</div>'}</div>
  <div class="panel"><div class="panelTitle"><h2>Upcoming Assessments</h2><button class="link" onclick="go('assessment')">View All</button></div>${LIVE.assessments.filter((a) => a.published).slice(0, 3).map((a) => { const at = latestAttempt(a.id); const expired = deadlinePassed(a.deadline); const rejected = at?.status === 'rejected'; const blocked = expired || (!!at && !a.allow_retake && !rejected); return `<div class="assessment"><div class="assessmentTop"><h3>${escapeHtml(a.title)}</h3><span class="badge ${expired ? 'pending' : at ? 'completed' : 'pending'}">${expired ? 'CLOSED' : at ? 'COMPLETED' : 'PENDING'}</span></div><p>${escapeHtml(a.description || 'Complete this assessment.')}</p><button class="${blocked ? 'secondary' : 'primary'}" ${blocked ? 'disabled' : ''} onclick="${blocked ? 'return false;' : `openCustomAssignment('${a.id}')`}">${expired ? 'Closed' : rejected ? 'Resubmit Assessment' : at && !a.allow_retake ? 'Completed' : at ? 'Retake' : 'Start Assessment'}</button></div>`; }).join('') || '<div class="empty">No assessments published yet.</div>'}</div></div>`;
}

function courses() {
  const data = courseUnits();
  const order = courseUnitOrder();
  const viewed = totalUnitViewed(S.user.authId);
  const total = totalUnitTopics();
  return `<div class="unitPage"><div class="unitIntro"><div><h1>Units and Chapters</h1><p>Open a unit to view its live learning topics. Complete the assessment at the end of each unit.</p></div><div class="unitActions"><span class="tag">${viewed}/${total} TOPICS VIEWED</span></div></div><div class="viewHint">Course content is loaded live. Your topic views are saved immediately.</div>${order.map((unitName, uIndex) => { const st = unitTopicStats(S.user.authId, unitName); const unit = LIVE.units.find((u) => u.name === unitName); const ass = LIVE.assessments.find((a) => a.unit_id === unit?.id && a.published); const at = ass ? latestAttempt(ass.id) : null; const expired = !!ass && deadlinePassed(ass.deadline); const rejected = at?.status === 'rejected'; const blocked = expired || (!!at && !ass.allow_retake && !rejected); const label = expired ? 'Closed' : rejected ? 'Resubmit Assessment' : at ? (ass.allow_retake ? 'Retake Assessment' : 'Completed') : 'Start Assessment'; return `<div class="unitCard"><button class="unitHeader" onclick="toggleUnit(this)"><div class="unitTitle"><div class="unitBadge">UNIT ${uIndex + 1}</div><div><h3>${escapeHtml(unitName)}</h3><p>${data[unitName].length} Learning Topics · ${st.viewed} Viewed · ${st.pct}% Complete</p></div></div><div class="unitState"><span class="unitPct">${st.pct}%</span><span class="chevron">⌄</span></div></button><div class="topicList">${data[unitName].map((t) => { const done = LIVE.progress.some((p) => p.user_id === S.user.authId && p.topic_id === t.id); return `<div class="topicRow"><div class="topicIcon">▢</div><div class="topicInfo"><b>${escapeHtml(t.name)}</b><a href="${escapeHtml(t.link)}" target="_blank" rel="noopener">${escapeHtml(t.link)}</a></div>${done ? '<div class="topicViewed">✓</div>' : ''}<button class="topicOpen" onclick="openTopic('${t.id}')">${done ? 'View Again' : 'View Topic'}</button></div>`; }).join('') || '<div class="empty">No topics in this unit.</div>'}<div class="unitAssessmentEnd"><div><div class="eyebrow" style="color:var(--blue);opacity:1">UNIT ASSESSMENT</div><h3>${escapeHtml(ass?.title || unitName + ' — Assessment')}</h3><p>${escapeHtml(ass?.description || 'No assessment has been published for this unit yet.')}${at ? ` Last score: <b>${Number(at.score)}%</b>.` : ''}</p>${ass?.deadline ? `<div class="muted"><b>Deadline:</b> ${formatDeadline(ass.deadline)}</div>` : ''}</div><button class="${blocked ? 'secondary' : 'primary'}" ${blocked || !ass ? 'disabled' : ''} onclick="${blocked || !ass ? 'return false;' : `openCustomAssignment('${ass.id}')`}">${ass ? label : 'Not Published'}</button></div></div></div>`; }).join('') || '<div class="empty">No units have been published yet.</div>'}</div>`;
}

function toggleUnit(btn) {
  const card = btn.closest('.unitCard');
  document.querySelectorAll('.unitCard').forEach((c) => { if (c !== card) c.classList.remove('open'); });
  card?.classList.toggle('open');
}

async function openTopic(topicId) {
  const topic = LIVE.topics.find((x) => x.id === topicId);
  if (!topic) return toast('Topic not found.');
  try {
    const unit = LIVE.units.find((u) => u.id === topic.unit_id);
    await stopLearningTracking();
    try {
      await startLearningTracking(unit?.id || topic.unit_id || null, topic.id);
    } catch (trackingError) {
      console.warn('Learning tracking unavailable; continuing to open topic:', trackingError);
    }
    await LMS.markTopicViewed(S.user.authId, topic.id);
    const existing = LIVE.progress.find((p) => p.user_id === S.user.authId && p.topic_id === topic.id);
    if (existing) existing.viewed_at = new Date().toISOString(); else LIVE.progress.push({ user_id: S.user.authId, topic_id: topic.id, viewed_at: new Date().toISOString() });
    window.open(topic.link, '_blank', 'noopener');
    toast('Topic activity saved successfully.');
    if (S.page === 'courses' || S.page === 'progress') render();
  } catch (error) { toast(error?.message || 'Unable to save topic activity.'); }
}

function assessment() {
  const units = [...LIVE.units].sort((a, b) => a.sort_order - b.sort_order);
  const selectedUnitId = S.selectedAssessmentUnitId || '';
  const list = LIVE.assessments.filter((a) => a.published && (!selectedUnitId || a.unit_id === selectedUnitId));
  const selectedUnit = units.find((u) => u.id === selectedUnitId);
  const selectedAttempt = list.map((a) => ({ assessment: a, attempt: latestAttempt(a.id) })).find((x) => x.attempt && x.attempt.status !== 'rejected');
  const scorePreview = selectedAttempt ? `<div class="panel" style="margin-bottom:18px;border-left:4px solid var(--blue)"><div class="panelTitle"><div><h2>Score Preview</h2><p class="muted">${escapeHtml(selectedAttempt.assessment.title)}</p></div><strong style="font-size:24px;color:var(--blue)">${Number(selectedAttempt.attempt.score || 0)}%</strong></div><p class="muted">${Number(selectedAttempt.attempt.correct_count || 0)} / ${Number(selectedAttempt.attempt.total_count || 0)} correct</p><button class="primary" onclick="showAssessmentReview('${selectedAttempt.attempt.id}','${selectedAttempt.assessment.id}')">View Score &amp; Answers</button></div>` : '';
  return `<div class="header"><div><h1>Assessment</h1><p>Choose a unit to preview its assessment score.</p></div></div><div class="panel" style="margin-bottom:18px"><label for="assessmentUnitSelect"><b>Select Unit</b></label><select id="assessmentUnitSelect" class="wideInput" style="margin-top:8px" onchange="selectAssessmentUnit(this.value)"><option value="">All Units</option>${units.map((u) => `<option value="${u.id}" ${u.id === selectedUnitId ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select>${selectedUnit ? `<p class="muted" style="margin:10px 0 0">Showing assessments for ${escapeHtml(selectedUnit.name)}.</p>` : ''}</div>${scorePreview}<div class="cards">${list.map((a) => { const at = latestAttempt(a.id); const expired = deadlinePassed(a.deadline); const rejected = at?.status === 'rejected'; const blocked = expired || (!!at && !a.allow_retake && !rejected); const statusText = expired ? 'Closed' : rejected ? 'Rejected · Resubmit' : at ? (a.allow_retake ? 'Completed · Retake allowed' : 'Completed') : 'Not submitted'; const action = expired ? 'Closed' : rejected ? 'Resubmit Assessment' : at ? (a.allow_retake ? 'Retake' : 'Completed') : 'Enter Assessment'; return `<div class="card"><div class="art">📝</div><h3>${escapeHtml(a.title)}</h3><p>${escapeHtml(a.description || 'Complete this assessment as instructed.')}</p><span class="tag">${LIVE.questions.length ? (LIVE.questions.filter((q) => q.assessment_id === a.id).length || 0) : 'Multiple'} questions · ${statusText}</span>${at ? `<div class="status completed" style="margin-top:10px">Latest score: ${Number(at.score || 0)}%</div>` : ''}<div style="margin:10px 0 12px;padding:10px 12px;border:1px solid ${expired ? '#f2c2c2' : '#dce5ee'};border-radius:7px;background:${expired ? '#fff6f6' : '#f8fafc'};font-size:11px;line-height:1.5"><b>Deadline Date &amp; Time:</b> ${a.deadline ? formatDeadline(a.deadline) : 'No deadline set'}<br><b>Retake:</b> ${a.allow_retake ? 'Allowed' : 'Disabled'}</div><button class="${blocked ? 'secondary' : 'primary'}" ${blocked ? 'disabled aria-disabled="true"' : ''} onclick="${blocked ? 'return false;' : `openCustomAssignment('${a.id}')`}">${action}</button></div>`; }).join('') || '<div class="empty">No assessments have been published for this unit.</div>'}</div>`;
}

async function selectAssessmentUnit(unitId) {
  S.selectedAssessmentUnitId = unitId || '';
  await refreshLive();
  render();
}

async function openCustomAssignment(id) {
  const assessment = LIVE.assessments.find((x) => x.id === id);
  if (!assessment) return toast('Assessment not found.');
  if (!assessment.published) return toast('This assessment is not published.');

  // The dashboard's Latest Score card should show the saved result instead of
  // starting the assessment again.
  if (S.page === 'dashboard') {
    const attempt = latestAttempt(id);
    if (attempt) return showAssessmentReview(attempt.id, id);
  }

  S.assignmentId = id;
  S.assignmentAnswers = {};
  S.assignmentSessionId = null;
  S.assignmentExpiresAt = null;
  S.page = 'customAssignment';
  render();

  try {
    // Load only this assessment's questions. This prevents one broken/empty
    // assessment from blocking every student's assessment page.
    let questions = LIVE.questions.filter((q) => q.assessment_id === id);
    if (!questions.length && S.user?.role === 'student') {
      questions = await LMS.studentQuestions(id);
      const otherQuestions = LIVE.questions.filter((q) => q.assessment_id !== id);
      LIVE.questions = [...otherQuestions, ...questions];
    }

    if (!questions.length) {
      throw new Error('No published questions were found for this assessment. Ask the administrator to verify the questions and publish status.');
    }

    const started = await LMS.startAssessment(id);
    S.assignmentSessionId = started.sessionId || null;
    S.assignmentExpiresAt = started.expiresAt || null;
    S.assignmentAnswers = started.answers && typeof started.answers === 'object' ? started.answers : {};
    render();
    startAssessmentTimer();
  } catch (error) {
    S.assignmentId = null;
    S.assignmentSessionId = null;
    S.assignmentExpiresAt = null;
    S.assignmentAnswers = {};
    S.page = 'assessment';
    render();
    toast(error?.message || 'Unable to open assessment.');
    console.error('Assessment open failed:', error);
  }
}

function formatRemaining(value) {
  const seconds = Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 1000));
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function startAssessmentTimer() {
  clearInterval(assessmentTimer);
  if (!S.assignmentExpiresAt) return;
  renderAssessmentTimer();
  assessmentTimer = setInterval(() => {
    if (Date.now() >= new Date(S.assignmentExpiresAt).getTime()) {
      clearInterval(assessmentTimer);
      submitCustomAssignment(true);
    } else {
      renderAssessmentTimer();
      const timer = $('assessmentTimer');
      if (timer) timer.textContent = formatRemaining(S.assignmentExpiresAt);
    }
  }, 1000);
}

function renderAssessmentTimer() {
  if (!S.assignmentExpiresAt || S.page !== 'customAssignment') return;
  const timer = $('assessmentTimer');
  if (timer) { timer.textContent = formatRemaining(S.assignmentExpiresAt); return; }
  const header = document.querySelector('.test .formQuestion');
  if (!header) return;
  header.insertAdjacentHTML('beforeend', `<p class="status pending" style="display:inline-block">Time remaining: <b id="assessmentTimer">${formatRemaining(S.assignmentExpiresAt)}</b></p>`);
}

async function startLearningTracking(unitId = null, topicId = null) {
  if (!S.user?.authId) return;
  if (learningSessionId && learningUnitId === unitId && learningTopicId === topicId) return;
  await stopLearningTracking();
  try {
    const session = await LMS.startLearningSession(S.user.authId, unitId, topicId);
    learningSessionId = session.id;
    learningStartedAt = Date.now();
    learningUnitId = unitId;
    learningTopicId = topicId;
    learningLastActivityAt = Date.now();
    clearInterval(learningTimer);
    learningTimer = setInterval(() => {
      if (!document.hidden && Date.now() - learningLastActivityAt < 120000 && learningSessionId) LMS.heartbeatLearningSession(learningSessionId, false).catch(() => {});
    }, 30000);
  } catch (error) { console.warn('Learning time tracking unavailable:', error); }
}

async function stopLearningTracking() {
  clearInterval(learningTimer);
  clearTimeout(learningIdleTimer);
  if (!learningSessionId) return;
  const id = learningSessionId;
  learningSessionId = null; learningStartedAt = null; learningUnitId = null; learningTopicId = null;
  try { await LMS.heartbeatLearningSession(id, true); } catch (_) { /* best effort */ }
}

function registerLearningActivity() {
  if (S.user?.role !== 'student') return;
  learningLastActivityAt = Date.now();
  clearTimeout(learningIdleTimer);
  learningIdleTimer = setTimeout(() => { if (learningSessionId) LMS.heartbeatLearningSession(learningSessionId, false).catch(() => {}); }, 120000);
}

['mousemove','keydown','click','scroll','touchstart'].forEach((eventName) => window.addEventListener(eventName, registerLearningActivity, { passive: true }));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (learningSessionId) LMS.heartbeatLearningSession(learningSessionId, false).catch(() => {}); }
  else registerLearningActivity();
});

async function showAssessmentReview(attemptId, assessmentId) {
  try {
    // Refresh the attempt/assessment list before opening the review so the
    // preview always reflects the current live database state.
    await refreshLive();
    const result = await LMS.reviewAssessment(attemptId);
    const a = LIVE.assessments.find((x) => x.id === assessmentId) || { title: 'Assessment' };
    S.assessmentReview = result;
    S.assessmentReviewAssessmentId = assessmentId;
    S.page = 'assessment-review';
    render();
  } catch (error) {
    toast(error?.message || 'Could not load assessment review.');
  }
}

function assessmentReviewPage() {
  const r = S.assessmentReview;
  if (!r) return '<div class="empty">Assessment review is not available.</div>';
  const items = Array.isArray(r.questions) ? r.questions : [];
  const currentAssessment = LIVE.assessments.find((x) => x.id === S.assessmentReviewAssessmentId);
  const units = [...LIVE.units].sort((x, y) => x.sort_order - y.sort_order);
  const currentUnitId = currentAssessment?.unit_id || '';
  const a = { title: r.title || currentAssessment?.title || 'Assessment' };
  const total = Number.isFinite(Number(r.total_count)) && Number(r.total_count) > 0 ? Number(r.total_count) : items.length;
  const correct = Number.isFinite(Number(r.correct_count)) ? Number(r.correct_count) : items.filter((q) => q.is_correct === true).length;
  const wrong = Number.isFinite(Number(r.wrong_count)) ? Number(r.wrong_count) : Math.max(0, total - correct);
  const score = Number.isFinite(Number(r.score)) ? Number(r.score) : (total ? Math.round((correct / total) * 100) : 0);
  return `<div class="header"><div><h1>Assessment Review</h1><p>${escapeHtml(a.title)}</p></div></div>
    <div class="panel" style="margin-bottom:18px"><label for="reviewUnitSelect"><b>Select Unit to View</b></label><select id="reviewUnitSelect" class="wideInput" style="margin-top:8px" onchange="changeAssessmentReviewUnit(this.value)"><option value="">Select a unit</option>${units.map((u) => `<option value="${u.id}" ${u.id === currentUnitId ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select><p class="muted" style="margin:10px 0 0">Select a unit to load its latest live assessment review.</p></div>
    <div class="stats" style="grid-template-columns:repeat(3,minmax(0,1fr))">
      <div class="stat"><span>Score</span><strong>${score}%</strong><small>${correct} / ${total} correct</small></div>
      <div class="stat"><span>Correct</span><strong>${correct}</strong><small>Questions answered correctly</small></div>
      <div class="stat"><span>Wrong</span><strong>${wrong}</strong><small>Questions to review</small></div>
    </div>
    <div class="test" style="margin-top:18px">
      ${items.map((q, i) => {
        const selected = q.selected_index;
        const correct = q.correct_index;
        const selectedText = selected === null || selected === undefined ? 'Not answered' : (q.options?.[selected] ?? 'Invalid answer');
        const correctText = q.options?.[correct] ?? 'Correct answer unavailable';
        const ok = q.is_correct === true;
        return `<div class="question" style="border-left:5px solid ${ok ? 'var(--green)' : 'var(--red)'}">
          <div class="qnum">QUESTION ${i + 1} · ${ok ? 'CORRECT' : 'WRONG'}</div>
          <h3>${i + 1}. ${escapeHtml(q.question_text)}</h3>
          <p><b>Your answer:</b> <span style="color:${ok ? 'var(--green)' : 'var(--red)'}">${escapeHtml(selectedText)}</span></p>
          <p><b>Correct answer:</b> <span style="color:var(--green)">${escapeHtml(correctText)}</span></p>
          ${!ok ? '<p class="muted"><b>Review this question:</b> Your selected answer does not match the correct answer.</p>' : '<p class="muted">✓ You answered this correctly.</p>'}
        </div>`;
      }).join('')}
      <div class="testBar"><span><b>${score}%</b> final score</span><button class="secondary" onclick="go('assessment')">Back to Assessments</button></div>
    </div>`;
}

async function changeAssessmentReviewUnit(unitId) {
  const assessment = LIVE.assessments.find((x) => x.published && x.unit_id === unitId);
  if (!assessment) return toast('No published assessment is available for this unit.');
  await refreshLive();
  const attempt = latestAttempt(assessment.id);
  if (!attempt || attempt.status === 'rejected') return toast('No completed assessment review is available for this unit.');
  await showAssessmentReview(attempt.id, assessment.id);
}

function customAssignmentPage() {
  // Page HTML is synchronous; question data is loaded on navigation when needed.
  const a = LIVE.assessments.find((x) => x.id === S.assignmentId);
  if (!a) return `<div class="empty">Assessment not found.</div>`;
  const at = latestAttempt(a.id);
  const expired = deadlinePassed(a.deadline);
  const rejected = at?.status === 'rejected'; const blocked = expired || (!!at && !a.allow_retake && !rejected);
  const questions = LIVE.questions.filter((q) => q.assessment_id === a.id).sort((x, y) => x.sort_order - y.sort_order);
  if (S.user.role === 'student' && !questions.length) {
    // Student question rows intentionally omit correct_index and are loaded through the public RPC.
    return `<div class="test"><div class="formQuestion"><h1>${escapeHtml(a.title)}</h1><p class="muted">Loading assessment questions successfully…</p></div></div>`;
  }
  if (blocked) return `<div class="test"><div class="formQuestion"><div class="eyebrow" style="color:var(--blue);opacity:1">AI&DS-ML LEARNING · ASSESSMENT RESULT</div><h1 style="margin:8px 0">${escapeHtml(a.title)}</h1><p class="muted">${escapeHtml(a.description || 'Assessment details')}</p>${a.deadline ? `<p class="muted"><b>Deadline:</b> ${formatDeadline(a.deadline)}</p>` : ''}${at ? `<div style="margin-top:12px"><span class="status completed">LATEST SCORE: ${Number(at.score)}%</span></div>` : ''}<div class="panel" style="margin-top:15px">${expired ? 'This assessment is closed because the deadline has passed.' : 'You have already completed this assessment. Retake is currently disabled by the administrator.'}</div><div style="display:flex;gap:10px;margin-top:15px;flex-wrap:wrap"><button class="secondary" onclick="go('assessment')">Back to Assessments</button>${at ? `<button class="primary" onclick="showAssessmentReview('${at.id}','${a.id}')">View Score & Answers</button>` : ''}${!expired && at && a.allow_retake ? `<button class="secondary" onclick="openCustomAssignment('${a.id}')">Retake Assessment</button>` : ''}</div><p class="muted" style="margin-top:12px">If you need another attempt, ask your administrator to enable <b>Allow retake</b> for this assessment.</p></div></div>`;
  return `<div class="test"><div class="formQuestion" style="margin-bottom:18px"><div class="eyebrow" style="color:var(--blue);opacity:1">AI&DS-ML LEARNING · ASSESSMENT</div><h1 style="margin:8px 0">${escapeHtml(a.title)}</h1><p class="muted">${escapeHtml(a.description || 'Answer every question and submit your assessment.')}</p>${a.duration_minutes ? `<p class="status pending" style="display:inline-block"><b>Time limit:</b> ${Number(a.duration_minutes)} minutes · <b>Time remaining:</b> <span id="assessmentTimer">${S.assignmentExpiresAt ? formatRemaining(S.assignmentExpiresAt) : 'Starting…'}</span></p>` : ''}${a.deadline ? `<p class="muted"><b>Deadline:</b> ${formatDeadline(a.deadline)}</p>` : ''}</div>${questions.map((q, i) => `<div class="question"><div class="qnum">QUESTION ${i + 1}</div><h3>${i + 1}. ${escapeHtml(q.question_text)}</h3>${(Array.isArray(q.options) ? q.options : []).map((o, j) => `<label class="option"><input type="radio" name="customQ${i}" ${S.assignmentAnswers[i] === j ? 'checked' : ''} onchange="saveCustomAnswer(${i},${j})"><span>${escapeHtml(o)}</span></label>`).join('')}</div>`).join('')}<div class="testBar"><span><b>${Object.keys(S.assignmentAnswers).length}</b> / ${questions.length} answered</span><button class="primary" onclick="submitCustomAssignment()">Submit Assessment</button></div></div>`;
}

function saveCustomAnswer(i, j) { S.assignmentAnswers[i] = Number(j); if (S.assignmentSessionId) LMS.saveAssessmentAnswers(S.assignmentSessionId, S.assignmentAnswers).catch(() => {}); }

async function submitCustomAssignment(autoTimeout = false) {
  const a = LIVE.assessments.find((x) => x.id === S.assignmentId);
  if (!a) return toast('Assessment not found.');
  const questions = LIVE.questions.filter((q) => q.assessment_id === a.id);
  const count = questions.length;
  if (!autoTimeout && Object.keys(S.assignmentAnswers).length < count) return toast('Please answer every question before submitting.');
  try {
    const result = await LMS.submitAssessment(a.id, S.assignmentAnswers, S.assignmentSessionId, autoTimeout);
    LIVE.attempts.unshift({
      id: result.attempt?.id,
      user_id: S.user.authId,
      assessment_id: a.id,
      score: result.attempt?.score ?? result.score,
      correct_count: result.attempt?.correct_count ?? result.correct,
      total_count: result.attempt?.total_count ?? result.total,
      status: result.attempt?.status || 'completed',
      submitted_at: result.attempt?.submitted_at || new Date().toISOString()
    });
    S.page = 'assessment';
    S.assignmentId = null;
    S.assignmentAnswers = {};
    S.assignmentSessionId = null;
    S.assignmentExpiresAt = null;
    clearInterval(assessmentTimer);
    render();
    toast(autoTimeout ? 'Time expired. Assessment submitted automatically.' : 'Assessment submitted successfully.');
  } catch (error) { toast(error?.message || 'Assessment submission failed.'); }
}

function progress() {
  const l = studentLearning();
  const ap = assignmentProgress();
  const tc = testCount();
  const latestAttemptForScore = attemptsForUser().find((attempt) => attempt.status !== 'rejected');
  const latest = latestAttemptForScore ? { ...latestAttemptForScore, score: overallAssessmentScore() } : null;
  return `<div class="header"><div><h1>My Progress</h1><p>Your learning percentage is calculated from live topic activity and completed assessments.</p></div></div><div class="stats"><div class="stat"><span>📚 Course Completion</span><strong>${l.percentage}%</strong><small>${l.viewedTopics}/${l.totalTopics} topics viewed</small></div><div class="stat"><span>📝 Assessment Completion</span><strong>${ap}%</strong><small>${LIVE.assessments.length} published assessments</small></div><div class="stat"><span>✓ Assessments Completed</span><strong>${tc}</strong><small>Live submission history</small></div><div class="stat"><span>⚡ Latest Score</span><strong>${latest ? Number(latest.score) + '%' : '0%'}</strong><small>${latest ? 'Completed' : 'Not attempted'}</small></div></div><div class="grid2"><div class="panel"><h2>Overall Course Progress</h2><div class="ring"><div><strong>${l.percentage}%</strong></div></div><p class="muted">Calculated from topics you have viewed.</p></div><div class="panel"><h2>Learning Activity</h2>${LIVE.units.map((u) => { const st = unitTopicStats(S.user.authId, u.name); return `<div class="stat" style="margin-top:12px"><span>${escapeHtml(u.name)}</span><strong>${st.viewed}/${st.total}</strong><div class="progress"><div style="width:${st.pct}%"></div></div></div>`; }).join('')}</div></div>`;
}

function studentSyllabus() {
  const items = LIVE.syllabus;
  return `<div class="header"><div><h1>Syllabus</h1><p>Current syllabus files published by your administrator.</p></div></div><div class="panel">${items.length ? items.map((x, i) => `<div class="courseRow"><div class="courseIcon">${i + 1}</div><div class="courseMain"><h3>${escapeHtml(x.title)}</h3><p>${escapeHtml(x.description || 'Learning material')}</p><div style="margin-top:9px;display:flex;gap:10px;flex-wrap:wrap"><button class="secondary" onclick="viewSyllabus('${x.id}')">📄 View Syllabus</button><button class="secondary" onclick="downloadSyllabus('${x.id}')">⬇ Download</button></div></div><span class="status verified">AVAILABLE</span></div>`).join('') : '<div class="empty">No syllabus has been published yet.</div>'}</div>`;
}

async function viewSyllabus(id) {
  const x = LIVE.syllabus.find((s) => s.id === id);
  if (!x) return toast('Syllabus file not found.');
  try {
    const url = await LMS.syllabusUrl(x.file_path, false);
    window.open(url, '_blank', 'noopener');
  } catch (e) { toast(e?.message || 'Unable to open the syllabus file.'); }
}

async function downloadSyllabus(id) {
  const x = LIVE.syllabus.find((s) => s.id === id);
  if (!x) return toast('Syllabus file not found.');
  try {
    const url = await LMS.syllabusUrl(x.file_path, true);
    window.open(url, '_blank', 'noopener');
  } catch (e) { toast(e?.message || 'Unable to download the syllabus file.'); }
}

function profile() {
  const u = S.user;
  return accountProfile(false, u);
}

function accountProfile(isAdmin = false, u = S.user) {
  return `<div class="header"><div><h1>${isAdmin ? 'Administrator Profile' : 'My Profile'}</h1><p>Your AI&DS-ML LEARNING account information.</p></div></div><div class="profile"><div class="profileCard"><div class="profileAvatar">${initials(u?.name)}</div><h2>${escapeHtml(u?.name)}</h2><p>${isAdmin ? 'Administrator' : 'Student'}</p><div class="details"><div><span>${isAdmin ? 'Admin ID' : 'Reg No'}</span><b>${escapeHtml(u?.id || '—')}</b></div><div><span>Email ID</span><b style="overflow-wrap:anywhere">${escapeHtml(u?.email || '—')}</b></div><div><span>Department</span><b>${escapeHtml(u?.dept || '—')}</b></div></div></div><div class="profileInfo"><h3>${isAdmin ? 'Administrator Account' : 'Learning Profile'}</h3><p>${isAdmin ? 'Administrator access controls students, curriculum, assessments, quizzes, syllabus files and learning activity.' : 'Your learning progress, assessment submissions and course activity are stored successfully for this account.'}</p><div class="stats"><div class="stat"><span>Role</span><strong style="font-size:12px">${isAdmin ? 'Administrator' : 'Student'}</strong></div><div class="stat"><span>College</span><strong style="font-size:12px">${escapeHtml(u?.college || '—')}</strong></div><div class="stat"><span>${isAdmin ? 'Students' : 'Assessments'}</span><strong>${isAdmin ? LIVE.profiles.filter((x) => x.role !== 'admin').length : testCount()}</strong></div></div></div></div>`;
}

function studentProfileView(u = S.profileView) {
  return `<div class="header"><div><h1>Student Profile</h1><p>Academic profile and account details for ${escapeHtml(u?.name || 'this learner')}.</p></div></div><div class="profile"><div class="profileCard"><div class="profileAvatar">${initials(u?.name)}</div><h2>${escapeHtml(u?.name)}</h2><p>Student</p><div class="details"><div><span>Reg No</span><b>${escapeHtml(u?.id || '—')}</b></div><div><span>Email ID</span><b style="overflow-wrap:anywhere">${escapeHtml(u?.email || '—')}</b></div><div><span>Department</span><b>${escapeHtml(u?.dept || '—')}</b></div></div></div><div class="profileInfo"><h3>Learning Profile</h3><p>${escapeHtml(u?.name || 'This learner')} has progress, assessment submissions and learning activity recorded on this platform.</p><div class="stats"><div class="stat"><span>Role</span><strong style="font-size:12px">Student</strong></div><div class="stat"><span>College</span><strong style="font-size:12px">${escapeHtml(u?.college || '—')}</strong></div><div class="stat"><span>Assessments</span><strong>${testCountForUser(u?.id)}</strong></div></div></div></div>`;
}

function render() {
  if (!S.user) return;
  buildNav();
  const p = $('page');
  if (!p) return;
  p.innerHTML = '';
  if (S.user.role === 'admin') renderAdmin(p); else renderStudent(p);
  if (S.user.role === 'student' && (S.page === 'dashboard' || S.page === 'progress')) {
    p.querySelectorAll('.stat span').forEach((label) => {
      if (label.textContent.includes('Latest Score')) {
        label.textContent = '⚡ Overall Score';
        label.closest('.stat')?.querySelector('small')?.remove();
      }
    });
  }
  if (S.user.role === 'admin' && S.page === 'reports') {
    $('rs')?.querySelectorAll('option[value="verified"], option[value="rejected"]').forEach((option) => option.remove());
  }
  if (S.user.role === 'admin' && S.page === 'adminLearning') setupLearningActivityFilter();
  if (S.user.role === 'admin' && S.page === 'adminAssignments') renderAssignmentBuilder();
  if (S.user.role === 'admin' && S.page === 'adminAssignments') injectAssessmentDurationField();
  if (S.user.role === 'admin' && S.page === 'adminLearning') injectAdminLearningTime();
  if (S.user.role === 'admin' && S.page === 'adminQuizzes') renderQuizBuilder();
  if (S.user.role === 'admin' && S.page === 'adminSyllabus') setupSyllabusDropzone();
}

function injectAssessmentDurationField() {
  const deadline = $('newAsDeadline');
  if (!deadline || $('newAsDuration')) return;
  const wrapper = document.createElement('label');
  wrapper.style.cssText = 'font-size:11px;display:flex;align-items:center;gap:6px';
  wrapper.innerHTML = `Time limit (minutes) <input id="newAsDuration" class="wideInput" type="number" min="1" max="1440" step="1" value="${escapeHtml(LIVE.assessments.find((x) => x.id === editingAssessmentId)?.duration_minutes || '')}" placeholder="Optional">`;
  deadline.parentElement?.parentElement?.appendChild(wrapper);
}

function injectAdminLearningTime() {
  const students = LIVE.profiles.filter((p) => p.role !== 'admin');
  document.querySelectorAll('.activityStudent .activityStats').forEach((stats, index) => {
    const userId = students[index]?.id;
    if (!userId || stats.querySelector('.courseTimeStat')) return;
    const rows = LIVE.learningSessions.filter((s) => s.user_id === userId);
    const seconds = rows.reduce((sum, row) => sum + Number(row.duration_seconds || 0), 0);
    const last = rows.sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at))[0]?.last_seen_at;
    stats.insertAdjacentHTML('beforeend', `<div class="courseTimeStat"><span>Course Time</span><b>${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m</b></div><div class="courseTimeStat"><span>Last Active</span><b>${last ? formatDeadline(last) : 'No activity'}</b></div>`);
  });
}

function setupLearningActivityFilter() {
  const page = $('page');
  const header = page?.querySelector('.header');
  if (!page || !header || $('learningStudentFilter')) return;
  header.querySelector('button[onclick*="ranking"]')?.remove();
  const students = LIVE.profiles.filter((profile) => profile.role !== 'admin');
  const wrap = document.createElement('div');
  wrap.className = 'learningActivityFilter';
  wrap.innerHTML = `<label for="learningStudentSearch">Search student</label><input id="learningStudentSearch" class="wideInput" type="search" placeholder="Name or email..."><select id="learningStudentFilter" class="wideInput"><option value="">All students</option>${students.map((student) => `<option value="${student.id}">${escapeHtml(student.full_name || student.email_id)}</option>`).join('')}</select>`;
  header.appendChild(wrap);
  page.querySelectorAll('.activityStudent').forEach((card, index) => { card.dataset.studentId = students[index]?.id || ''; });
  const applyFilter = () => {
    const selected = $('learningStudentFilter').value;
    const query = $('learningStudentSearch').value.trim().toLowerCase();
    page.querySelectorAll('.activityStudent').forEach((card) => {
      const student = students.find((item) => item.id === card.dataset.studentId);
      const text = `${student?.full_name || ''} ${student?.email_id || ''}`.toLowerCase();
      card.style.display = (!selected || card.dataset.studentId === selected) && (!query || text.includes(query)) ? '' : 'none';
    });
  };
  $('learningStudentFilter').addEventListener('change', applyFilter);
  $('learningStudentSearch').addEventListener('input', applyFilter);
}

function renderStudent(p) {
  switch (S.page) {
    case 'dashboard': p.innerHTML = studentDash(); break;
    case 'courses': p.innerHTML = courses(); break;
    case 'assessment-review': p.innerHTML = assessmentReviewPage(); break;
    case 'assessment': p.innerHTML = assessment(); break;
    case 'customAssignment': p.innerHTML = customAssignmentPage(); break;
    case 'training': p.innerHTML = trainingPracticePage(); break;
    case 'syllabus': p.innerHTML = studentSyllabus(); break;
    case 'progress': p.innerHTML = progress(); break;
    case 'profile': p.innerHTML = profile(); break;
    case 'settings': p.innerHTML = settingsPage(); break;
    case 'search': p.innerHTML = globalSearchPage(); break;
    case 'ranking': S.page = 'dashboard'; p.innerHTML = studentDash(); break;
    default: S.page = 'dashboard'; p.innerHTML = studentDash(); break;
  }
}

function renderAdmin(p) {
  switch (S.page) {
    case 'admin': p.innerHTML = adminDash(); break;
    case 'reports': p.innerHTML = adminReports(); break;
    case 'pending': p.innerHTML = pending(); break;
    case 'completed': p.innerHTML = completed(); break;
    case 'students': p.innerHTML = students(); break;
    case 'ranking': p.innerHTML = rankingPage(); break;
    case 'studentProfile': p.innerHTML = studentProfileView(S.profileView || S.user); break;
    case 'adminCourses': p.innerHTML = adminCourses(); break;
    case 'adminLearning': p.innerHTML = adminLearningActivity(); break;
    case 'adminAssignments': p.innerHTML = adminAssignments(); break;
    case 'adminSyllabus': p.innerHTML = adminSyllabus(); break;
    case 'adminQuizzes': p.innerHTML = adminQuizzes(); break;
    case 'adminProfile': p.innerHTML = accountProfile(true); break;
    case 'settings': p.innerHTML = settingsPage(); break;
    case 'search': p.innerHTML = globalSearchPage(); break;
    default: S.page = 'admin'; p.innerHTML = adminDash(); break;
  }
}

function globalSearchPage() {
  const q = String(S.searchQuery || '').trim().toLowerCase();
  if (!q) return `<div class="header"><div><h1>Search</h1><p>Search courses, topics, assessments, syllabus, quizzes${S.user?.role === 'admin' ? ', and users' : ''}.</p></div></div><div class="empty">Enter a search term in the top search box.</div>`;
  const topicResults = LIVE.topics.filter((t) => `${t.name} ${t.link}`.toLowerCase().includes(q)).slice(0, 30);
  const unitResults = LIVE.units.filter((u) => `${u.name}`.toLowerCase().includes(q));
  const assessmentResults = LIVE.assessments.filter((a) => `${a.title} ${a.description || ''}`.toLowerCase().includes(q) && (S.user?.role === 'admin' || a.published));
  const syllabusResults = LIVE.syllabus.filter((x) => `${x.title} ${x.description || ''} ${x.file_name}`.toLowerCase().includes(q));
  const quizResults = LIVE.quizzes.filter((x) => `${x.title} ${x.description || ''}`.toLowerCase().includes(q) && (S.user?.role === 'admin' || x.published));
  const trainingMatch = S.user?.role === 'student' && ['training','model training','ml training','machine learning','jupyter','pyodide','notebook','practice'].some((term) => term.includes(q) || q.includes(term));
  const userResults = S.user?.role === 'admin' ? LIVE.profiles.filter((u) => `${u.full_name || ''} ${u.email_id || ''} ${u.register_id || ''} ${u.department || ''} ${u.college || ''}`.toLowerCase().includes(q)).slice(0, 40) : [];
  const hasResults = unitResults.length || topicResults.length || assessmentResults.length || syllabusResults.length || quizResults.length || userResults.length || trainingMatch;
  return `<div class="header searchHeader"><div><div class="eyebrow">GLOBAL SEARCH</div><h1>Search Results</h1><p>Live learning content for <b>${escapeHtml(S.searchQuery)}</b>.</p></div><span class="tag">${hasResults ? 'MATCHES FOUND' : 'NO MATCHES'}</span></div>
    ${unitResults.length ? `<div class="panel"><div class="panelTitle"><h2>Units</h2><span class="tag">${unitResults.length}</span></div>${unitResults.map((u) => `<div class="report"><h3>${escapeHtml(u.name)}</h3><p class="muted">Course unit</p></div>`).join('')}</div>` : ''}
    ${topicResults.length ? `<div class="panel"><div class="panelTitle"><h2>Learning Topics</h2><span class="tag">${topicResults.length}</span></div>${topicResults.map((t) => `<div class="report"><div class="reportHead"><div><h3>${escapeHtml(t.name)}</h3><p class="muted">Learning topic</p></div><a href="${escapeHtml(t.link)}" target="_blank" rel="noopener" class="secondary">Open Topic</a></div></div>`).join('')}</div>` : ''}
    ${assessmentResults.length ? `<div class="panel"><div class="panelTitle"><h2>Assessments</h2><span class="tag">${assessmentResults.length}</span></div>${assessmentResults.map((a) => `<div class="report"><h3>${escapeHtml(a.title)}</h3><p class="muted">${escapeHtml(a.description || 'Assessment')}</p></div>`).join('')}</div>` : ''}
    ${syllabusResults.length ? `<div class="panel"><div class="panelTitle"><h2>Syllabus</h2><span class="tag">${syllabusResults.length}</span></div>${syllabusResults.map((x) => `<div class="report"><h3>${escapeHtml(x.title)}</h3><p class="muted">${escapeHtml(x.file_name)}</p></div>`).join('')}</div>` : ''}
    ${quizResults.length ? `<div class="panel"><div class="panelTitle"><h2>Quizzes</h2><span class="tag">${quizResults.length}</span></div>${quizResults.map((x) => `<div class="report"><h3>${escapeHtml(x.title)}</h3><p class="muted">${escapeHtml(x.description || 'Quiz')}</p></div>`).join('')}</div>` : ''}
    ${trainingMatch ? `<div class="panel trainingSearchResult"><div class="panelTitle"><h2>Model Training Practice</h2><span class="tag">PRACTICE</span></div><div class="report"><div class="reportHead"><div><h3>Jupyter Notebook · Python (Pyodide)</h3><p class="muted">Browser-based machine learning model training practice with a guided sample.</p></div><button class="primary" onclick="go('training')">Open Practice</button></div></div></div>` : ''}
    ${userResults.length ? `<div class="panel"><div class="panelTitle"><h2>Users</h2><span class="tag">${userResults.length}</span></div>${userResults.map((u) => `<div class="report"><div class="reportHead"><div><h3>${escapeHtml(u.full_name || u.email_id)}</h3><p class="muted">${escapeHtml(u.email_id || '')} · ${escapeHtml(u.register_id || '')}</p></div><span class="status ${u.role === 'admin' ? 'verified' : 'completed'}">${u.role === 'admin' ? 'ADMINISTRATOR' : 'STUDENT'}</span></div><p class="muted">${escapeHtml(u.department || '')}${u.college ? ` · ${escapeHtml(u.college)}` : ''}</p></div>`).join('')}</div>` : ''}
    ${!hasResults ? '<div class="empty">No matching learning content was found.</div>' : ''}`;
}

function runGlobalSearch() {
  if (!S.user) return;
  S.searchQuery = ($('search')?.value || '').trim();
  if (!S.searchQuery) return goHome();
  closeProfileMenu();
  S.page = 'search';
  buildNav();
  render();
}

function adminDash() {
  const r = latestReports().filter((x) => x.status !== 'rejected');
  const studentsCount = LIVE.profiles.filter((x) => x.role !== 'admin').length;
  const avg = r.length ? Math.round(r.reduce((s, x) => s + Number(x.score), 0) / r.length) : 0;
  return `<div class="header"><div><h1>Administrator Dashboard</h1><p>Live learning-platform overview for AI&DS-ML LEARNING.</p></div></div><div class="stats"><div class="stat"><span>♙ Students</span><strong>${studentsCount}</strong><small>registered profiles</small></div><div class="stat"><span>✓ Completed Assessments</span><strong>${r.length}</strong><small>Live submissions</small></div><div class="stat"><span>★ Average Score</span><strong>${r.length ? avg + '%' : '—'}</strong><small>Current submissions</small></div><div class="stat"><span>📚 Topics</span><strong>${LIVE.topics.length}</strong><small>Across ${LIVE.units.length} units</small></div></div><div class="adminGrid"><div class="panel"><div class="panelTitle"><h2>Latest Reports</h2><button class="link" onclick="go('reports')">View All</button></div>${r.slice(0, 5).map(reportCard).join('') || '<div class="empty">No completed assessment reports yet.</div>'}</div><div class="panel"><div class="panelTitle"><h2>Student Completion</h2><button class="link" onclick="go('students')">Students</button></div>${LIVE.profiles.filter((x) => x.role !== 'admin').sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')).slice(0, 8).map((u) => { const pct = totalUnitTopics() ? Math.round((totalUnitViewed(u.id) / totalUnitTopics()) * 100) : 0; return `<div class="studentLine"><div class="avatar">${initials(u.full_name)}</div><div class="courseMain"><h3>${escapeHtml(u.full_name || u.email_id)}</h3><p>${pct}% course completion</p><div class="progress"><div style="width:${pct}%"></div></div></div><span class="status ${pct === 100 ? 'completed' : 'pending'}">${pct === 100 ? 'Complete' : 'In Progress'}</span></div>`; }).join('') || '<div class="empty">No students registered.</div>'}</div></div><div class="panel"><div class="panelTitle"><h2>🏆 Overall Ranking</h2><button class="link" onclick="go('ranking')">Open Leaderboard</button></div>${rankingTable()}</div>`;
}

function reportCard(r) {
  return `<div class="report"><div class="reportHead"><h3>${escapeHtml(r.student)}</h3><span class="status completed">COMPLETED</span></div><div class="reportDetails"><div><span>Assessment</span><b>${escapeHtml(r.course)}</b></div><div><span>Score</span><b>${Number(r.score)}%</b></div><div><span>Correct</span><b>${r.correct}/${r.total}</b></div><div><span>Attempts</span><b>${Number(r.attemptCount || 0)}</b></div><div><span>Reg No</span><b>${escapeHtml(r.studentId)}</b></div><div><span>Submitted</span><b>${formatDeadline(r.submittedAt)}</b></div></div></div>`;
}

function studentReportCard(student) {
  const units = [...LIVE.units].sort((a, b) => a.sort_order - b.sort_order);
  const rows = units.map((unit) => {
    const assessmentItem = LIVE.assessments.find((a) => a.published && a.unit_id === unit.id);
    const attempts = assessmentItem ? LIVE.attempts
      .filter((attempt) => attempt.user_id === student.id && attempt.assessment_id === assessmentItem.id)
      .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at)) : [];
    const latest = attempts.find((attempt) => attempt.status !== 'rejected');
    return `<tr><td><b>${escapeHtml(unit.name)}</b></td><td>${assessmentItem ? escapeHtml(assessmentItem.title) : 'No assessment'}</td><td><span class="status ${latest ? 'completed' : 'pending'}">${latest ? 'COMPLETED' : 'NOT COMPLETED'}</span></td><td>${latest ? `${Number(latest.score || 0)}%` : '—'}</td><td>${latest ? `${Number(latest.correct_count || 0)}/${Number(latest.total_count || 0)}` : '—'}</td><td>${latest ? formatDeadline(latest.submitted_at) : '—'}</td><td>${attempts.length}</td></tr>`;
  }).join('');
  return `<div class="report studentSummary" data-student-search="${escapeHtml(`${student.full_name || ''} ${student.email_id || ''} ${student.register_id || ''}`.toLowerCase())}"><div class="reportHead"><div><h3>${escapeHtml(student.full_name || student.email_id)}</h3><p class="muted">${escapeHtml(student.email_id || '')}</p></div><span class="status completed">STUDENT</span></div><div class="reportDetails"><div><span>Reg No</span><b>${escapeHtml(student.register_id || student.id)}</b></div><div><span>Units</span><b>${units.length}</b></div></div><div class="tableWrap"><table class="table"><thead><tr><th>Unit</th><th>Assessment</th><th>Status</th><th>Score</th><th>Correct</th><th>Date</th><th>Attempts</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function adminReports() {
  const students = LIVE.profiles.filter((profile) => profile.role !== 'admin');
  return `<div class="header"><div><h1>Student Reports</h1><p>Live unit completion and assessment summary for each student.</p></div></div><div class="filters"><input id="studentReportSearch" placeholder="Search student..." oninput="filterStudentReports()"></div><div id="studentReportList">${students.length ? students.map(studentReportCard).join('') : '<div class="empty">No students registered.</div>'}</div>`;
}

function filterStudentReports() {
  const query = ($('studentReportSearch')?.value || '').trim().toLowerCase();
  document.querySelectorAll('.studentSummary').forEach((card) => {
    card.style.display = !query || (card.dataset.studentSearch || '').includes(query) ? '' : 'none';
  });
}

function filterReports() {
  const q = ($('rq')?.value || '').toLowerCase();
  const status = $('rs')?.value || 'all';
  const rows = reports().filter((x) => (!q || x.student.toLowerCase().includes(q) || x.email.toLowerCase().includes(q)) && (status === 'all' || x.status === status));
  $('reportList').innerHTML = rows.length ? rows.map(reportCard).join('') : '<div class="empty">No matching reports.</div>';
}

function pending() {
  const students = LIVE.profiles.filter((u) => u.role !== 'admin');
  const published = LIVE.assessments.filter((a) => a.published);
  const rows = [];
  for (const student of students) {
    for (const assessmentItem of published) {
      const latest = latestAttempt(assessmentItem.id, student.id);
      if (!latest) {
        const expired = deadlinePassed(assessmentItem.deadline);
        rows.push({ student, assessment: assessmentItem, expired });
      }
    }
  }
  return `<div class="header"><div><h1>Pending Reports</h1><p>Students are listed for published assessments that have no submission yet.</p></div></div>${rows.length ? rows.map(({ student: u, assessment: a, expired }) => `<div class="report"><div class="reportHead"><h3>${escapeHtml(u.full_name || u.email_id)}</h3><span class="status pending">PENDING</span></div><div class="reportDetails"><div><span>Reg No</span><b>${escapeHtml(u.register_id || u.id)}</b></div><div><span>Email ID</span><b>${escapeHtml(u.email_id)}</b></div><div><span>Assessment</span><b>${escapeHtml(a.title)}</b></div><div><span>Status</span><b>${expired ? 'Deadline passed — not submitted' : 'Not submitted'}</b></div><div><span>Deadline</span><b>${a.deadline ? formatDeadline(a.deadline) : 'No deadline set'}</b></div></div></div>`).join('') : '<div class="empty">No pending student reports.</div>'}`;
}

function completed() {
  const r = reports().filter((x) => x.status !== 'rejected');
  return `<div class="header"><div><h1>Completed Reports</h1><p>All submitted student assessment reports.</p></div></div>${r.length ? r.map(reportCard).join('') : '<div class="empty">No completed reports.</div>'}`;
}

async function verify(id) {
  try { await LMS.updateAttemptStatus(id, 'verified'); await refreshLive(); render(); toast('Report verified successfully.'); }
  catch (e) { toast(e?.message || 'Unable to verify report.'); }
}

async function reject(id) {
  try { await LMS.updateAttemptStatus(id, 'rejected'); await refreshLive(); render(); toast('Report rejected.'); }
  catch (e) { toast(e?.message || 'Unable to reject report.'); }
}

function showAddStudentForm() {
  const f = $('studentAdminForm');
  if (!f) return;
  f.innerHTML = `<div class="panel"><div class="panelTitle"><div><h2>Add User</h2><p class="muted" style="margin:4px 0 0">Create a live learning account. Your password is handled securely by the sign-in service.</p></div><button class="link" onclick="document.getElementById('studentAdminForm').innerHTML=''">Cancel</button></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><input id="newStudentName" class="wideInput" placeholder="Full name"><input id="newStudentId" class="wideInput" placeholder="Register number / Admin ID"><input id="newStudentEmail" class="wideInput" type="email" placeholder="Email ID"><input id="newStudentPassword" class="wideInput" type="password" placeholder="Password"><input id="newStudentDept" class="wideInput" placeholder="Department" value="Artificial Intelligence & Data Science"><input id="newStudentCollege" class="wideInput" placeholder="College" value="Mahendra Engineering College"><select id="newStudentRole" class="wideInput"><option value="student">Student</option><option value="admin">Administrator</option></select></div><div style="display:flex;gap:10px;margin-top:14px;align-items:center"><button class="primary" onclick="addStudent()">+ Add User</button><span class="muted">Email ID and ID must be unique.</span></div></div>`;
  $('newStudentName')?.focus();
}

async function addStudent() {
  try {
    const name = ($('newStudentName')?.value || '').trim();
    const id = ($('newStudentId')?.value || '').trim();
    const rawEmail = ($('newStudentEmail')?.value || '').trim().toLowerCase();
    const dept = ($('newStudentDept')?.value || '').trim();
    const college = ($('newStudentCollege')?.value || '').trim();
    const password = ($('newStudentPassword')?.value || '').trim();
    const userRole = $('newStudentRole')?.value === 'admin' ? 'admin' : 'student';
    if (!name || !id || !rawEmail || !password) return toast('Enter name, ID, Email ID and Password.');
    if (password.length < 6) return toast('Password must contain at least 6 characters.');
    if (!/^\S+@\S+\.\S+$/.test(rawEmail)) return toast('Enter a valid Email ID.');
    await LMS.adminCreateUser({ email: rawEmail, password, name, id, dept, college, role: userRole });
    await refreshLive();
    $('studentAdminForm').innerHTML = '';
    render();
    toast(`${userRole === 'admin' ? 'Administrator' : 'Student'} account created successfully.`);
  } catch (e) { console.error(e); toast(e?.message || 'Unable to create account.'); }
}


function showEditStudentForm(userId) {
  const u = LIVE.profiles.find((p) => p.id === userId);
  const f = $('studentAdminForm');
  if (!u || !f) return toast('User account not found.');
  if (u.id === S.user?.authId) return toast('Use your signed-in profile to view your account.');
  f.innerHTML = `<div class="panel"><div class="panelTitle"><div><h2>Edit User</h2><p class="muted" style="margin:4px 0 0">Changes update secure account sign-in and the matching profile.</p></div><button class="link" onclick="document.getElementById('studentAdminForm').innerHTML=''">Cancel</button></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><input id="editStudentName" class="wideInput" value="${escapeHtml(u.full_name || '')}" placeholder="Full name"><input id="editStudentId" class="wideInput" value="${escapeHtml(u.register_id || '')}" placeholder="Register number / Admin ID"><input id="editStudentEmail" class="wideInput" type="email" value="${escapeHtml(u.email_id || '')}" placeholder="Email ID"><input id="editStudentPassword" class="wideInput" type="password" placeholder="New password (leave blank to keep current)"><input id="editStudentDept" class="wideInput" value="${escapeHtml(u.department || '')}" placeholder="Department"><input id="editStudentCollege" class="wideInput" value="${escapeHtml(u.college || '')}" placeholder="College"><select id="editStudentRole" class="wideInput"><option value="student" ${u.role === 'student' ? 'selected' : ''}>Student</option><option value="admin">Administrator</option></select></div><div style="display:flex;gap:10px;margin-top:14px"><button class="primary" onclick="updateStudent('${u.id}')">Save Changes</button></div></div>`;
  $('editStudentName')?.focus();
}

async function updateStudent(userId) {
  try {
    const name = ($('editStudentName')?.value || '').trim();
    const id = ($('editStudentId')?.value || '').trim();
    const email = ($('editStudentEmail')?.value || '').trim().toLowerCase();
    const password = ($('editStudentPassword')?.value || '');
    const dept = ($('editStudentDept')?.value || '').trim();
    const college = ($('editStudentCollege')?.value || '').trim();
    const role = $('editStudentRole')?.value === 'admin' ? 'admin' : 'student';
    if (!name || !id || !email) return toast('Name, ID and Email ID are required.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Enter a valid Email ID.');
    await LMS.adminUpdateUser({ userId, email, password, name, id, dept, college, role });
    $('studentAdminForm').innerHTML = '';
    await refreshLive();
    render();
    toast('User updated successfully.');
  } catch (e) { console.error(e); toast(e?.message || 'Unable to update user.'); }
}

async function deleteStudent(encodedEmail) {
  const email = decodeURIComponent(encodedEmail || '').trim().toLowerCase();
  const student = LIVE.profiles.find((p) => p.role !== 'admin' && String(p.email_id || '').toLowerCase() === email);
  if (!student) return toast('Student account not found.');
  if (!confirm(`Delete student account for ${student.full_name} (${email})? This cannot be undone.`)) return;
  try {
    await LMS.adminDeleteUser({ email, userId: student.id, id: student.register_id });
    await refreshLive();
    render();
    toast('Student account deleted successfully.');
  } catch (e) { console.error(e); toast(e?.message || 'Unable to delete the student account.'); }
}

function students() {
  const list = [...LIVE.profiles].sort((a, b) => {
    const roleA = a.role === 'admin' ? 0 : 1;
    const roleB = b.role === 'admin' ? 0 : 1;
    return roleA - roleB || (a.full_name || '').localeCompare(b.full_name || '');
  });
  return `<div class="header"><div><div class="eyebrow">USER MANAGEMENT</div><h1>Users</h1><p>Search, filter and manage every Student and Administrator account.</p></div><button class="primary" onclick="showAddStudentForm()">+ Add User</button></div>
  <div id="studentAdminForm"></div>
  <div class="studentToolBar">
    <input id="studentSearch" class="wideInput" placeholder="Search name, email, ID, department or college..." oninput="filterStudents()" aria-label="Search users">
    <select id="studentRoleFilter" class="wideInput" onchange="filterStudents()" aria-label="Filter by role"><option value="all">All roles</option><option value="student">Students</option><option value="admin">Administrators</option></select>
    <select id="studentStatusFilter" class="wideInput" onchange="filterStudents()" aria-label="Filter by assessment status"><option value="all">All activity</option><option value="pending">No submission</option><option value="completed">Completed</option><option value="verified">Verified</option><option value="rejected">Rejected</option></select>
  </div>
  <div class="panel tableWrap"><div class="panelTitle"><h2>Registered Users</h2><span id="studentCount" class="tag">${list.length} Accounts</span></div><div id="studentListWrap">${renderStudentRows(list)}</div></div>`;
}

function renderStudentRows(list) {
  return `<table class="table"><thead><tr><th>User</th><th>Role</th><th>ID</th><th>Email ID</th><th>Department</th><th>Latest Assessment</th><th>Score</th><th>Status</th><th>✎</th><th>Delete</th></tr></thead><tbody>${list.map((u) => { const last = attemptsForUser(u.id)[0]; const ass = LIVE.assessments.find((a) => a.id === last?.assessment_id); const isSelf = u.id === S.user?.authId; const isAdmin = u.role === 'admin'; const state = last ? (last.status || 'completed') : 'pending'; return `<tr data-user-search="${escapeHtml(`${u.full_name || ''} ${u.email_id || ''} ${u.register_id || ''} ${u.department || ''} ${u.college || ''}`.toLowerCase())}" data-role="${escapeHtml(isAdmin ? 'admin' : 'student')}" data-status="${escapeHtml(state)}"><td><div class="studentCell"><div class="miniAvatar">${initials(u.full_name)}</div><div><b>${escapeHtml(u.full_name || '—')}</b><div class="mobileOnly muted">${escapeHtml(u.email_id || '')}</div></div></div></td><td><span class="status ${isAdmin ? 'verified' : 'completed'}">${isAdmin ? 'ADMIN' : 'STUDENT'}</span></td><td>${escapeHtml(u.register_id || '')}</td><td><a href="mailto:${escapeHtml(u.email_id)}" class="emailLink">${escapeHtml(u.email_id)}</a></td><td>${escapeHtml(u.department || '')}</td><td>${escapeHtml(ass?.title || '—')}</td><td>${last ? Number(last.score) + '%' : '—'}</td><td><span class="status ${last ? (last.status === 'verified' ? 'verified' : last.status === 'rejected' ? 'rejected' : 'completed') : 'pending'}">${last ? escapeHtml(last.status).toLowerCase() : 'pending'}</span></td><td><button class="secondary" ${isSelf ? 'disabled' : ''} onclick="${isSelf ? 'return false;' : `showEditStudentForm('${u.id}')`}" title="${isSelf ? 'Current user' : 'Edit user'}" aria-label="${isSelf ? 'Current user' : 'Edit user'}">${isSelf ? '●' : '✎'}</button></td><td>${isAdmin || isSelf ? `<button class="dangerBtn" disabled title="Administrator accounts and the signed-in administrator cannot be deleted here." aria-label="Delete unavailable">🛡️</button>` : `<button class="dangerBtn" onclick="deleteStudent('${encodeURIComponent(u.email_id)}')" title="Delete" aria-label="Delete">🗑️</button>`}</td></tr>`; }).join('') || '<tr><td colspan="10"><div class="empty">No users registered yet.</div></td></tr>'}</tbody></table>`;
}

function filterStudents() {
  const q = ($('studentSearch')?.value || '').trim().toLowerCase();
  const role = $('studentRoleFilter')?.value || 'all';
  const status = $('studentStatusFilter')?.value || 'all';
  const rows = [...document.querySelectorAll('#studentListWrap tbody tr[data-user-search]')];
  let visible = 0;
  rows.forEach((row) => {
    const matchText = !q || row.dataset.userSearch.includes(q);
    const matchRole = role === 'all' || row.dataset.role === role;
    const matchStatus = status === 'all' || row.dataset.status === status;
    const show = matchText && matchRole && matchStatus;
    row.style.display = show ? '' : 'none';
    if (show) visible += 1;
  });
  if ($('studentCount')) $('studentCount').textContent = `${visible} Matching`;
}

function adminCourses() {
  const units = [...LIVE.units].sort((a, b) => a.sort_order - b.sort_order);
  return `<div class="header"><div><h1>Course</h1><p>Manage the live Units and Chapters/Topics used by students.</p></div><button class="primary" onclick="showAddUnitForm()">+ Add Unit</button></div><div id="courseAdminForm"></div><div class="viewHint">All course changes are written successfully and are pushed to connected student screens through Realtime.</div>${units.map((unit, uIndex) => { const topics = topicsForUnit(unit.name); return `<div class="unitCard open"><div class="unitHeader" style="cursor:default"><div class="unitTitle"><div class="unitBadge">UNIT ${uIndex + 1}</div><div><h3>${escapeHtml(unit.name)}</h3><p>${topics.length} Chapters / Topics</p></div></div><div class="unitActions"><button class="secondary" onclick="showEditUnitForm('${unit.id}')">Edit Unit</button><button class="secondary" onclick="showAddTopicForm('${encodeURIComponent(unit.id)}')">+ Add Chapter</button><button class="dangerBtn" onclick="removeUnit('${unit.id}')" title="Remove Unit" aria-label="Remove Unit">🗑️</button></div></div><div class="topicList" style="display:block">${topics.length ? topics.map((t) => `<div class="topicRow"><div class="topicIcon">▢</div><div class="topicInfo"><b>${escapeHtml(t.name)}</b><a href="${escapeHtml(t.link)}" target="_blank" rel="noopener">${escapeHtml(t.link)}</a></div><button class="secondary" onclick="showEditTopicForm('${t.id}')">Edit</button><button class="dangerBtn" onclick="removeTopic('${t.id}')" title="Remove" aria-label="Remove">🗑️</button></div>`).join('') : '<div class="empty">No chapters/topics in this unit yet.</div>'}</div></div>`; }).join('') || '<div class="empty">No units have been created yet.</div>'}`;
}

function showEditUnitForm(unitId) {
  const unit = LIVE.units.find((u) => u.id === unitId);
  if (!unit) return toast('Unit not found.');
  $('courseAdminForm').innerHTML = `<div class="panel"><div class="panelTitle"><h2>Edit Unit</h2><button class="link" onclick="document.getElementById('courseAdminForm').innerHTML=''">Cancel</button></div><div class="filters"><input id="editUnitName" value="${escapeHtml(unit.name)}" placeholder="Unit name"><input id="editUnitOrder" type="number" min="1" value="${Number(unit.sort_order || 1)}" placeholder="Order"><button class="primary" onclick="updateCourseUnit('${unit.id}')">Save</button></div></div>`;
  $('editUnitName')?.focus();
}

async function updateCourseUnit(unitId) {
  const name = ($('editUnitName')?.value || '').trim();
  const sortOrder = Number($('editUnitOrder')?.value || 0);
  if (!name) return toast('Enter a unit name.');
  if (LIVE.units.some((u) => u.id !== unitId && u.name.toLowerCase() === name.toLowerCase())) return toast('That unit already exists.');
  try { await LMS.updateUnit(unitId, name, sortOrder); await refreshLive(); render(); toast('Unit updated successfully.'); } catch (e) { toast(e?.message || 'Unable to update unit.'); }
}

function showAddUnitForm() {
  $('courseAdminForm').innerHTML = `<div class="panel"><div class="panelTitle"><h2>Add Unit</h2><button class="link" onclick="document.getElementById('courseAdminForm').innerHTML=''">Cancel</button></div><div class="filters"><input id="newUnitName" placeholder="e.g. Unit-VI"><button class="primary" onclick="addCourseUnit()">Add Unit</button></div></div>`;
}

async function addCourseUnit() {
  const name = ($('newUnitName')?.value || '').trim();
  if (!name) return toast('Enter a unit name.');
  if (LIVE.units.some((u) => u.name.toLowerCase() === name.toLowerCase())) return toast('That unit already exists.');
  try { await LMS.createUnit(name, LIVE.units.length + 1); await refreshLive(); render(); toast('Unit added successfully.'); }
  catch (e) { toast(e?.message || 'Unable to add unit.'); }
}

function showAddTopicForm(encodedUnitId) {
  const unitId = decodeURIComponent(encodedUnitId || '');
  const unit = LIVE.units.find((u) => u.id === unitId);
  if (!unit) return toast('Unit not found.');
  const form = $('courseAdminForm');
  form.innerHTML = `<div class="panel"><div class="panelTitle"><div><h2>Add Chapter / Topic</h2><p class="muted" style="margin:4px 0 0">Adding to <b>${escapeHtml(unit.name)}</b></p></div><button class="link" type="button" onclick="document.getElementById('courseAdminForm').innerHTML=''">Cancel</button></div><div style="display:grid;gap:12px"><input id="newTopicName" class="wideInput" placeholder="Chapter / Topic name"><input id="newTopicLink" class="wideInput" placeholder="Learning material URL (https://...)"><div style="display:flex;gap:10px;align-items:center"><button class="primary" onclick="addCourseTopic('${unit.id}')">+ Add Chapter</button><span class="muted">Both fields are required.</span></div></div></div>`;
  $('newTopicName')?.focus();
}

async function addCourseTopic(unitId) {
  const name = ($('newTopicName')?.value || '').trim();
  let link = ($('newTopicLink')?.value || '').trim();
  if (!name) return toast('Enter the chapter/topic name.');
  if (!link) return toast('Enter the learning material link.');
  if (!/^https?:\/\//i.test(link)) link = `https://${link}`;
  try { new URL(link); } catch (_) { return toast('Enter a valid URL.'); }
  const topics = topicsForUnit(LIVE.units.find((u) => u.id === unitId)?.name || '');
  if (topics.some((t) => t.name.toLowerCase() === name.toLowerCase())) return toast('A topic with this name already exists in this unit.');
  try { await LMS.createTopic(unitId, name, link, topics.length + 1); await refreshLive(); render(); toast('Chapter/topic added successfully.'); }
  catch (e) { toast(e?.message || 'Unable to add topic.'); }
}

function showEditTopicForm(topicId) {
  const topic = LIVE.topics.find((t) => t.id === topicId);
  if (!topic) return toast('Topic not found.');
  $('courseAdminForm').innerHTML = `<div class="panel"><div class="panelTitle"><div><h2>Edit Chapter / Topic</h2><p class="muted" style="margin:4px 0 0">Update the name and live learning URL.</p></div><button class="link" onclick="document.getElementById('courseAdminForm').innerHTML=''">Cancel</button></div><div style="display:grid;gap:12px"><input id="editTopicName" class="wideInput" value="${escapeHtml(topic.name)}" placeholder="Chapter / Topic name"><input id="editTopicLink" class="wideInput" value="${escapeHtml(topic.link)}" placeholder="Learning material URL"><input id="editTopicOrder" class="wideInput" type="number" min="1" value="${Number(topic.sort_order || 1)}" placeholder="Order"><button class="primary" onclick="updateCourseTopic('${topic.id}')">Save Changes</button></div></div>`;
  $('editTopicName')?.focus();
}

async function updateCourseTopic(topicId) {
  const topic = LIVE.topics.find((t) => t.id === topicId);
  const name = ($('editTopicName')?.value || '').trim();
  let link = ($('editTopicLink')?.value || '').trim();
  const sortOrder = Number($('editTopicOrder')?.value || 0);
  if (!topic) return toast('Topic not found.');
  if (!name || !link) return toast('Name and learning URL are required.');
  if (!/^https?:\/\//i.test(link)) link = `https://${link}`;
  try { new URL(link); } catch (_) { return toast('Enter a valid URL.'); }
  if (LIVE.topics.some((t) => t.id !== topicId && t.unit_id === topic.unit_id && t.name.toLowerCase() === name.toLowerCase())) return toast('A topic with this name already exists in this unit.');
  try { await LMS.updateTopic(topicId, name, link, sortOrder); await refreshLive(); render(); toast('Chapter/topic updated successfully.'); } catch (e) { toast(e?.message || 'Unable to update topic.'); }
}

async function removeTopic(topicId) {
  if (!confirm('Remove this chapter/topic?')) return;
  try { await LMS.deleteTopic(topicId); await refreshLive(); render(); toast('Chapter/topic removed successfully.'); }
  catch (e) { toast(e?.message || 'Unable to remove topic.'); }
}

async function removeUnit(unitId) {
  const unit = LIVE.units.find((u) => u.id === unitId);
  if (!unit) return;
  if (!confirm(`Remove ${unit.name} and its topics/assessment?`)) return;
  try { await LMS.deleteUnit(unitId); await refreshLive(); render(); toast('Unit removed successfully.'); }
  catch (e) { toast(e?.message || 'Unable to remove unit.'); }
}

function adminLearningActivity() {
  const students = LIVE.profiles.filter((p) => p.role !== 'admin');
  const fmt = (seconds) => { const s = Math.max(0, Number(seconds || 0)); return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`; };
  return `<div class="header"><div><h1>Learning Activity</h1><p>Server-recorded active learning time by student, unit and topic.</p></div><button class="secondary" onclick="go('ranking')">🏆 Overall Ranking</button></div>${students.map((u) => {
    const rows = LIVE.learningSessions.filter((s) => s.user_id === u.id);
    const totalSeconds = rows.reduce((sum, r) => sum + Number(r.duration_seconds || 0), 0);
    const last = rows.slice().sort((a,b) => new Date(b.last_seen_at) - new Date(a.last_seen_at))[0]?.last_seen_at;
    const lastLogin = (LIVE.loginEvents || []).find(e => e.user_id === u.id)?.login_at;
    const units = LIVE.units.map((unit) => {
      const ur = rows.filter((r) => r.unit_id === unit.id);
      const us = ur.reduce((sum,r) => sum + Number(r.duration_seconds || 0),0);
      const topics = LIVE.topics.filter(t => t.unit_id === unit.id).map(t => {
        const tr = ur.filter(r => r.topic_id === t.id);
        return { t, seconds: tr.reduce((sum,r)=>sum+Number(r.duration_seconds||0),0), sessions: tr.length };
      }).filter(x => x.seconds > 0);
      return { unit, seconds: us, sessions: ur.length, topics };
    }).filter(x => x.seconds > 0);
    return `<div class="activityStudent"><div class="activityHead"><div class="studentCell"><div class="miniAvatar" style="width:36px;height:36px;border-radius:50%;background:#e8f6ff;color:var(--blue);display:grid;place-items:center;font-size:10px;font-weight:800">${initials(u.full_name)}</div><div><b>${escapeHtml(u.full_name)}</b><div style="font-size:9px;color:#8994a2">${escapeHtml(u.email_id || '')}</div></div></div><div class="activityStats"><div><span>Total Course Time</span><b>${fmt(totalSeconds)}</b></div><div><span>Sessions</span><b>${rows.length}</b></div><div><span>Last Active</span><b>${last ? formatDeadline(last) : 'No activity'}</b></div><div><span>Last Login</span><b>${lastLogin ? formatDeadline(lastLogin) : 'No login record'}</b></div></div><button class="secondary" onclick="this.closest('.activityStudent').classList.toggle('open')">View Details</button></div><div class="activityDetails"><div class="report" style="margin-bottom:10px"><b>Course total:</b> ${fmt(totalSeconds)} · <b>${rows.length}</b> learning sessions · <b>Last active:</b> ${last ? formatDeadline(last) : 'No activity'} · <b>Last login:</b> ${lastLogin ? formatDeadline(lastLogin) : 'No login record'}</div>${units.map(x => `<div class="activityUnit"><div class="activityUnitHead"><b>${escapeHtml(x.unit.name)}</b><span>${fmt(x.seconds)} · ${x.sessions} sessions</span></div><div class="activityTopics">${x.topics.map(y => `<span class="activityTopic">${escapeHtml(y.t.name)} · ${fmt(y.seconds)} · ${y.sessions} session${y.sessions===1?'':'s'}</span>`).join('') || '<span class="activityTopic" style="background:#f5f7f9;color:#8691a0">No recorded topic time</span>'}</div></div>`).join('') || '<div class="empty">No learning sessions recorded yet.</div>'}</div></div>`;
  }).join('') || '<div class="empty">No students registered.</div>'}`;
}
function adminAssignments() {
  const unitOptions = LIVE.units.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');
  const editing = editingAssessmentId ? LIVE.assessments.find((x) => x.id === editingAssessmentId) : null;
  return `<div class="header"><div><h1>Assessment Management</h1><p>Create and publish live Google Forms-style assessments stored securely online.</p></div></div><div class="formHeaderBox"><select id="newAsUnit" class="wideInput"><option value="">Select Unit (optional)</option>${LIVE.units.map((u) => `<option value="${u.id}" ${editing?.unit_id === u.id ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select><input id="newAsTitle" class="formTitleInput" value="${escapeHtml(editing?.title || '')}" placeholder="Untitled assessment"><textarea id="newAsDesc" class="formDescInput" placeholder="Assessment description / instructions">${escapeHtml(editing?.description || '')}</textarea><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:center"><input id="newAsDeadline" type="datetime-local" class="wideInput" value="${toDatetimeLocal(editing?.deadline)}"><label style="font-size:11px"><input id="newAsRetake" type="checkbox" ${editing ? (editing.allow_retake ? 'checked' : '') : 'checked'}> Allow retake</label><label style="font-size:11px"><input id="newAsPublished" type="checkbox" ${editing ? (editing.published ? 'checked' : '') : 'checked'}> Publish to students</label></div><div class="formHelp"><b>Deadline</b> = final calendar cutoff. <b>Time limit</b> = countdown duration after the student starts. The timer is server-controlled and auto-submits at expiry.</div></div><div id="assignmentQuestionBuilder"></div><div class="builderActions"><button class="secondary" onclick="addAssignmentQuestion()">＋ Add Question</button><div style="display:flex;gap:10px"><button class="secondary" onclick="cancelAssessmentEdit()">Cancel</button><button class="primary" onclick="publishAssignment()">${editing ? 'Save Changes' : 'Publish Assessment'}</button></div></div><div class="panel" style="margin-top:18px"><div class="panelTitle"><h2>Published Assessments</h2><span class="tag">${LIVE.assessments.length}</span></div>${LIVE.assessments.length ? LIVE.assessments.map((a) => `<div class="report"><div class="reportHead"><div><h3>${escapeHtml(a.title)}</h3><span class="status ${a.published ? 'verified' : 'pending'}">${a.published ? 'PUBLISHED' : 'DRAFT'}</span></div><div style="display:flex;gap:8px"><button class="secondary" onclick="editAssessment('${a.id}')">Edit</button><button class="dangerBtn" onclick="deleteAssessment('${a.id}')">🗑️</button></div></div><p class="muted">${escapeHtml(a.description || 'No description')} · ${(LIVE.questions.filter((q) => q.assessment_id === a.id).length)} questions · Deadline: ${a.deadline ? formatDeadline(a.deadline) : 'None'} · Retake: ${a.allow_retake ? 'Allowed' : 'Disabled'}</p></div>`).join('') : '<div class="empty">No assessments published yet.</div>'}</div>`;
}

function renderAssignmentBuilder() {
  if (!editingAssessmentId && assignmentBuilder.length === 0 && LIVE.assessments.length === 0) assignmentBuilder = [];
  const box = $('assignmentQuestionBuilder');
  if (!box) return;
  box.innerHTML = assignmentBuilder.length ? assignmentBuilder.map((q, i) => `<div class="formQuestion"><div class="questionHeader"><span>Question ${i + 1}</span><button class="dangerBtn" onclick="removeAssignmentQuestion(${i})">🗑️</button></div><input class="formQuestionInput" value="${escapeHtml(q.question_text || q.question || '')}" oninput="assignmentBuilder[${i}].question_text=this.value" placeholder="Question"><div class="optionGrid">${(q.options || ['', '', '', '']).map((o, j) => `<div class="optionEditor"><input type="text" value="${escapeHtml(o)}" oninput="assignmentBuilder[${i}].options[${j}]=this.value" placeholder="Option ${j + 1}"><label><input type="radio" name="correct${i}" ${Number(q.correct_index ?? q.correct ?? 0) === j ? 'checked' : ''} onchange="assignmentBuilder[${i}].correct_index=${j}"> Correct</label></div>`).join('')}</div></div>`).join('') : '<div class="empty">Click <b>Add Question</b> to build your assessment.</div>';
}

function addAssignmentQuestion() { assignmentBuilder.push({ question_text: '', options: ['', '', '', ''], correct_index: 0 }); renderAssignmentBuilder(); }
function removeAssignmentQuestion(index) { assignmentBuilder.splice(index, 1); renderAssignmentBuilder(); }

async function publishAssignment() {
  const title = ($('newAsTitle')?.value || '').trim();
  const description = ($('newAsDesc')?.value || '').trim();
  const unitId = $('newAsUnit')?.value || '';
  const deadline = $('newAsDeadline')?.value ? new Date($('newAsDeadline').value).toISOString() : null;
  const durationMinutes = $('newAsDuration')?.value ? Number($('newAsDuration').value) : null;
  const allowRetake = !!$('newAsRetake')?.checked;
  if (!title) return toast('Enter an assessment title.');
  if (!assignmentBuilder.length) return toast('Add at least one question.');
  for (let i = 0; i < assignmentBuilder.length; i += 1) {
    const q = assignmentBuilder[i];
    if (!String(q.question_text || '').trim() || !Array.isArray(q.options) || q.options.some((o) => !String(o || '').trim())) return toast(`Complete Question ${i + 1} and all options.`);
  }
  try {
    const payload = { id: editingAssessmentId || undefined, unit_id: unitId || null, title, description, deadline, duration_minutes: durationMinutes, allow_retake: allowRetake, published: !!$('newAsPublished')?.checked, created_by: S.user.authId };
    await LMS.upsertAssessment(payload, assignmentBuilder);
    editingAssessmentId = null;
    assignmentBuilder = [];
    await refreshLive();
    render();
    toast('Assessment saved successfully.');
  } catch (e) { toast(e?.message || 'Unable to save assessment.'); }
}

function editAssessment(id) {
  const a = LIVE.assessments.find((x) => x.id === id);
  if (!a) return;
  editingAssessmentId = id;
  assignmentBuilder = LIVE.questions.filter((q) => q.assessment_id === id).sort((x, y) => x.sort_order - y.sort_order).map((q) => ({ question_text: q.question_text, options: Array.isArray(q.options) ? q.options : [], correct_index: Number(q.correct_index || 0) }));
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelAssessmentEdit() { editingAssessmentId = null; assignmentBuilder = []; render(); }

async function deleteAssessment(id) {
  if (!confirm('Delete this assessment and its questions/attempts?')) return;
  try { await LMS.deleteAssessment(id); await refreshLive(); render(); toast('Assessment deleted successfully.'); }
  catch (e) { toast(e?.message || 'Unable to delete assessment.'); }
}

function adminSyllabus() {
  const editing = editingSyllabusId ? LIVE.syllabus.find((x) => x.id === editingSyllabusId) : null;
  return `<div class="header"><div><h1>Syllabus Management</h1><p>Manage syllabus metadata and files in private file storage.</p></div></div>${editing ? `<div class="panel"><div class="panelTitle"><h2>Edit Syllabus</h2><button class="link" onclick="cancelSyllabusEdit()">Cancel</button></div><div style="display:grid;gap:10px"><input id="editSyTitle" class="wideInput" value="${escapeHtml(editing.title || '')}" placeholder="Syllabus title"><input id="editSyDesc" class="wideInput" value="${escapeHtml(editing.description || '')}" placeholder="Description"><input id="editSyFile" type="file" accept=".pdf,.doc,.docx,.txt" onchange="handleSyllabusEditFile(this.files[0])"><div id="editSyFileInfo" class="fileInfo"></div><button class="primary" onclick="updateSyllabusFile('${editing.id}')">Save Changes</button></div></div>` : `<div class="panel"><div class="panelTitle"><h2>Upload Syllabus File</h2><span class="tag">PDF · DOC · DOCX · TXT</span></div><div id="syllabusDropzone" class="dropzone" onclick="document.getElementById('syllabusFile').click()"><div class="dropIcon">⬆</div><h3>Drag & drop your syllabus file here</h3><p>or click to browse from your computer</p><small>Maximum file size: 3 MB</small><input id="syllabusFile" type="file" accept=".pdf,.doc,.docx,.txt" style="display:none" onchange="handleSyllabusFile(this.files[0])"></div><div id="syllabusFileInfo" class="fileInfo"></div><div style="margin-top:14px"><input id="uploadSyTitle" class="wideInput" placeholder="Syllabus title"><input id="uploadSyDesc" class="wideInput" placeholder="Description" style="margin-top:8px"><button class="primary" style="margin-top:10px" onclick="uploadSyllabusFile()">Upload Syllabus</button></div></div>`}<div class="panel"><div class="panelTitle"><h2>Published Syllabus</h2><span class="tag">${LIVE.syllabus.length} Items</span></div>${LIVE.syllabus.length ? LIVE.syllabus.map((x) => `<div class="report"><div class="reportHead"><div><h3>${escapeHtml(x.title)}</h3><span class="status verified">FILE · ${escapeHtml(x.file_name)}</span></div><div style="display:flex;gap:8px"><button class="secondary" onclick="editSyllabus('${x.id}')">Edit</button><button class="dangerBtn" onclick="deleteSyllabus('${x.id}')">🗑️</button></div></div><p class="muted">${escapeHtml(x.description || 'Syllabus learning material')}</p><p class="muted">${x.size_bytes ? (Number(x.size_bytes) / 1024 / 1024).toFixed(2) + ' MB' : ''}</p></div>`).join('') : '<div class="empty">No syllabus files published yet.</div>'}</div>`;
}

function handleSyllabusEditFile(file) {
  selectedSyllabusEditFile = file || null;
  const box = $('editSyFileInfo');
  if (!box) return;
  box.innerHTML = file ? `<div class="selectedFile"><b>Replacement:</b> ${escapeHtml(file.name)} <span>${(file.size / 1024 / 1024).toFixed(2)} MB</span></div>` : '';
}

function editSyllabus(id) {
  editingSyllabusId = id;
  selectedSyllabusEditFile = null;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelSyllabusEdit() { editingSyllabusId = null; selectedSyllabusEditFile = null; render(); }

async function updateSyllabusFile(id) {
  const row = LIVE.syllabus.find((x) => x.id === id);
  if (!row) return toast('Syllabus not found.');
  const title = ($('editSyTitle')?.value || '').trim();
  const description = ($('editSyDesc')?.value || '').trim();
  if (!title) return toast('Enter a syllabus title.');
  const file = selectedSyllabusEditFile;
  if (file && file.size > 3 * 1024 * 1024) return toast('File is larger than 3 MB.');
  let newPath = null;
  try {
    const values = { title, description };
    if (file) {
      const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '_');
      newPath = `${S.user.authId}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await window.supabaseClient.storage.from('lms-syllabus').upload(newPath, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });
      if (uploadError) throw uploadError;
      Object.assign(values, { file_name: file.name, file_path: newPath, mime_type: file.type || 'application/octet-stream', size_bytes: file.size });
    }
    await LMS.updateSyllabus(id, values);
    if (newPath && row.file_path) await window.supabaseClient.storage.from('lms-syllabus').remove([row.file_path]);
    editingSyllabusId = null;
    selectedSyllabusEditFile = null;
    await refreshLive();
    render();
    toast('Syllabus updated successfully.');
  } catch (e) {
    if (newPath) await window.supabaseClient.storage.from('lms-syllabus').remove([newPath]).catch(() => {});
    toast(e?.message || 'Unable to update syllabus.');
  }
}

function handleSyllabusFile(file) {
  selectedSyllabusFile = file || null;
  const box = $('syllabusFileInfo');
  if (!box) return;
  if (!file) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="selectedFile"><b>Selected:</b> ${escapeHtml(file.name)} <span>${(file.size / 1024 / 1024).toFixed(2)} MB</span></div>`;
}

function setupSyllabusDropzone() {
  const z = $('syllabusDropzone');
  if (!z || z.__bound) return;
  z.__bound = true;
  ['dragenter', 'dragover'].forEach((ev) => z.addEventListener(ev, (e) => { e.preventDefault(); z.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((ev) => z.addEventListener(ev, (e) => { e.preventDefault(); z.classList.remove('dragover'); }));
  z.addEventListener('drop', (e) => handleSyllabusFile(e.dataTransfer.files?.[0]));
}

async function uploadSyllabusFile() {
  if (!selectedSyllabusFile) return toast('Please select a syllabus file first.');
  if (selectedSyllabusFile.size > 3 * 1024 * 1024) return toast('File is larger than 3 MB.');
  const title = (($('uploadSyTitle')?.value || '').trim() || selectedSyllabusFile.name.replace(/\.[^/.]+$/, ''));
  const description = ($('uploadSyDesc')?.value || '').trim();
  try { await LMS.uploadSyllabus(selectedSyllabusFile, title, description, S.user.authId); selectedSyllabusFile = null; await refreshLive(); render(); toast('Syllabus uploaded to private file storage.'); }
  catch (e) { toast(e?.message || 'Unable to upload syllabus.'); }
}

async function deleteSyllabus(id) {
  const row = LIVE.syllabus.find((x) => x.id === id);
  if (!row || !confirm(`Delete ${row.file_name}?`)) return;
  try { await LMS.deleteSyllabus(id, row.file_path); await refreshLive(); render(); toast('Syllabus deleted successfully.'); }
  catch (e) { toast(e?.message || 'Unable to delete syllabus.'); }
}

function adminQuizzes() {
  const editing = editingQuizId ? LIVE.quizzes.find((x) => x.id === editingQuizId) : null;
  return `<div class="header"><div><h1>Quiz Management</h1><p>Create and fully edit live quizzes stored securely online.</p></div></div><div class="formHeaderBox"><input id="newQTitle" class="formTitleInput" value="${escapeHtml(editing?.title || '')}" placeholder="Untitled quiz"><textarea id="newQDesc" class="formDescInput" placeholder="Quiz description / instructions">${escapeHtml(editing?.description || '')}</textarea><label style="font-size:11px"><input id="newQPublished" type="checkbox" ${editing ? (editing.published ? 'checked' : '') : 'checked'}> Publish to students</label></div><div id="quizQuestionBuilder"></div><div class="builderActions"><button class="secondary" onclick="addQuizQuestion()">＋ Add Question</button><div><button class="secondary" onclick="cancelQuizEdit()">Cancel</button> <button class="primary" onclick="publishQuiz()">${editing ? 'Save Changes' : 'Publish Quiz'}</button></div></div><div class="panel" style="margin-top:18px"><div class="panelTitle"><h2>Published Quizzes</h2><span class="tag">${LIVE.quizzes.length}</span></div>${LIVE.quizzes.length ? LIVE.quizzes.map((q) => `<div class="report"><div class="reportHead"><div><h3>${escapeHtml(q.title)}</h3><span class="status verified">${LIVE.quizQuestions.filter((qq) => qq.quiz_id === q.id).length} QUESTIONS</span></div><div style="display:flex;gap:8px"><button class="secondary" onclick="editQuiz('${q.id}')">Edit</button><button class="dangerBtn" onclick="deleteQuiz('${q.id}')">🗑️</button></div></div><p class="muted">${escapeHtml(q.description || 'No description')}</p></div>`).join('') : '<div class="empty">No quizzes published yet.</div>'}</div>`;
}

function renderQuizBuilder() {
  const box = $('quizQuestionBuilder');
  if (!box) return;
  box.innerHTML = quizBuilder.length ? quizBuilder.map((q, i) => `<div class="formQuestion"><div class="questionHeader"><span>Question ${i + 1}</span><button class="dangerBtn" onclick="removeQuizQuestion(${i})">🗑️</button></div><input class="formQuestionInput" value="${escapeHtml(q.question_text || '')}" oninput="quizBuilder[${i}].question_text=this.value" placeholder="Question"><div class="optionGrid">${(q.options || ['', '', '', '']).map((o, j) => `<div class="optionEditor"><input type="text" value="${escapeHtml(o)}" oninput="quizBuilder[${i}].options[${j}]=this.value" placeholder="Option ${j + 1}"><label><input type="radio" name="quizCorrect${i}" ${Number(q.correct_index ?? 0) === j ? 'checked' : ''} onchange="quizBuilder[${i}].correct_index=${j}"> Correct</label></div>`).join('')}</div></div>`).join('') : '<div class="empty">Click <b>Add Question</b> to start building your quiz.</div>';
}

function addQuizQuestion() { quizBuilder.push({ question_text: '', options: ['', '', '', ''], correct_index: 0 }); renderQuizBuilder(); }
function removeQuizQuestion(i) { quizBuilder.splice(i, 1); renderQuizBuilder(); }

async function publishQuiz() {
  const title = ($('newQTitle')?.value || '').trim();
  const description = ($('newQDesc')?.value || '').trim();
  if (!title) return toast('Enter a quiz title.');
  if (!quizBuilder.length) return toast('Add at least one question.');
  for (let i = 0; i < quizBuilder.length; i += 1) {
    const q = quizBuilder[i];
    if (!q.question_text.trim() || q.options.some((x) => !String(x).trim())) return toast(`Complete Question ${i + 1} and all options.`);
  }
  try { await LMS.upsertQuiz({ id: editingQuizId || undefined, title, description, published: !!$('newQPublished')?.checked, created_by: S.user.authId }, quizBuilder); editingQuizId = null; quizBuilder = []; await refreshLive(); render(); toast('Quiz saved successfully.'); }
  catch (e) { toast(e?.message || 'Unable to save quiz.'); }
}

function editQuiz(id) {
  const q = LIVE.quizzes.find((x) => x.id === id);
  if (!q) return;
  editingQuizId = id;
  quizBuilder = LIVE.quizQuestions.filter((qq) => qq.quiz_id === id).sort((a, b) => a.sort_order - b.sort_order).map((qq) => ({ question_text: qq.question_text, options: qq.options, correct_index: Number(qq.correct_index || 0) }));
  render();
}

function cancelQuizEdit() { editingQuizId = null; quizBuilder = []; render(); }

async function deleteQuiz(id) {
  if (!confirm('Delete this quiz?')) return;
  try { await LMS.deleteQuiz(id); await refreshLive(); render(); toast('Quiz deleted successfully.'); }
  catch (e) { toast(e?.message || 'Unable to delete quiz.'); }
}

// Boot — learning platform is the only source of persistent application data.
applyTheme();
$('email')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
$('password')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
$('search')?.addEventListener('input', () => { clearTimeout(window.__searchTimer); window.__searchTimer = setTimeout(() => { if (($('search')?.value || '').trim().length >= 2) runGlobalSearch(); }, 260); });
$('search')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') runGlobalSearch(); if (e.key === 'Escape') { e.target.value = ''; if (S.user) goHome(); } });
document.addEventListener('click', (e) => { const wrap = document.querySelector('.profileMenuWrap'); if (wrap && !wrap.contains(e.target)) closeProfileMenu(); });
restoreSession();
