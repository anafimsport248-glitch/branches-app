/* =========================================================
   ענפים — app.js
   Full application logic for the coaching management platform
   ========================================================= */

'use strict';

// ── Global State ────────────────────────────────────────────
let currentUserData = null;
let currentThreadId = null;
let calendarInitialized = false;
let calendar;
let unsubscribers = [];

// ── Navigation (runs immediately, independent of Firebase) ───
function navigateTo(sectionName) {
  document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
  const target = document.getElementById('sec-' + sectionName);
  if (target) target.classList.add('active');
  const navBtn = document.querySelector(`.nav-item[data-section="${sectionName}"]`);
  if (navBtn) navBtn.classList.add('active');
  if (sectionName === 'calendar' && !calendarInitialized) {
    setTimeout(() => { initCalendar(); }, 50);
  }
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar')?.classList.remove('open');
  }
}

document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.section));
});

document.getElementById('sidebarToggle')?.addEventListener('click', () => {
  document.getElementById('sidebar')?.classList.toggle('open');
});

document.addEventListener('click', (e) => {
  if (window.innerWidth <= 768) {
    const sidebar = document.getElementById('sidebar');
    const toggle  = document.getElementById('sidebarToggle');
    if (sidebar && !sidebar.contains(e.target) && !toggle?.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  }
});

// ── Auth State ───────────────────────────────────────────────
if (typeof auth === 'undefined') {
  console.error('Firebase auth not initialized');
} else {
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  try {
    const snap = await db.collection('users').doc(user.uid).get();
    if (snap.exists) {
      currentUserData = { uid: user.uid, ...snap.data() };
    } else {
      // Create a user doc if it doesn't exist (e.g. first Google login)
      const newUser = {
        uid: user.uid,
        name: user.displayName || user.email.split('@')[0],
        email: user.email,
        role: 'coach',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await db.collection('users').doc(user.uid).set(newUser);
      currentUserData = { ...newUser };
    }

    // Populate sidebar user info
    const nameEl = document.getElementById('userName');
    const initEl = document.getElementById('userInitials');
    const roleEl = document.getElementById('userRoleLabel');

    if (nameEl) nameEl.textContent = currentUserData.name || currentUserData.email;
    if (initEl) initEl.textContent = (currentUserData.name || currentUserData.email || '?')
      .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    if (roleEl) {
      const roleMap = { manager: 'מנהל', coach: 'מאמן', coordinator: 'רכז' };
      roleEl.textContent = roleMap[currentUserData.role] || currentUserData.role || '—';
    }

    // Role-based UI: hide manager-only elements for non-managers
    if (currentUserData.role !== 'manager') {
      document.querySelectorAll('.manager-only').forEach(el => {
        el.style.display = 'none';
      });
    }

    // Dispatch event so inline scripts can react
    document.dispatchEvent(new CustomEvent('userLoaded'));

    // Load all data
    loadAllData();

  } catch (err) {
    console.error('Error loading user data:', err);
    showToast('שגיאה בטעינת נתוני המשתמש', 'error');
  }
});
} // end if auth

// ── Load All Data ────────────────────────────────────────────
function loadAllData() {
  loadLessonPlans();
  loadSummaries();
  loadSessions();
  loadCoaches();
  loadEquipment();
  loadMessages();
  loadGallery();
  loadDashboardStats();

  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      unsubscribers.forEach(fn => fn());
      await auth.signOut();
    });
  }
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-30px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── FullCalendar ──────────────────────────────────────────────
function initCalendar() {
  try {
  const el = document.getElementById('calendar');
  if (!el || calendarInitialized) return;
  if (typeof FullCalendar === 'undefined') { console.warn('FullCalendar not loaded'); return; }
  calendarInitialized = true;

  calendar = new FullCalendar.Calendar(el, {
    locale: 'he',
    direction: 'rtl',
    initialView: 'dayGridMonth',
    headerToolbar: {
      start: 'prev,next today',
      center: 'title',
      end: 'dayGridMonth,timeGridWeek'
    },
    events: [],
    eventClick: (info) => {
      const { title, extendedProps } = info.event;
      showToast(`${title} — ${extendedProps.school || ''}`, 'info');
    }
  });
  calendar.render();

  // Load sessions into calendar
  db.collection('sessions').get().then(snap => {
    snap.forEach(doc => {
      const d = doc.data();
      const start = d.date + (d.startTime ? 'T' + d.startTime : '');
      const end   = d.date + (d.endTime   ? 'T' + d.endTime   : '');
      calendar.addEvent({
        id: doc.id,
        title: `${d.coachName || ''} — ${d.school || ''}`,
        start,
        end: d.endTime ? end : undefined,
        extendedProps: { school: d.school, coachName: d.coachName }
      });
    });
  }).catch(err => console.warn('Calendar sessions load error:', err));
  } catch (err) { console.error('initCalendar error:', err); }
}

// ══════════════════════════════════════════════════════════════
// LESSON PLANS
// ══════════════════════════════════════════════════════════════
function loadLessonPlans() {
  const unsub = db.collection('lessonPlans').orderBy('number').onSnapshot(
    renderLessonPlans,
    err => console.error('loadLessonPlans:', err)
  );
  unsubscribers.push(unsub);
}

function renderLessonPlans(snapshot) {
  const list = document.getElementById('lesson-plans-list');
  if (!list) return;

  if (snapshot.empty) {
    list.innerHTML = '<div class="loading-center" style="color:var(--text-3)"><p>אין מערכי שיעור עדיין</p></div>';
    return;
  }

  list.innerHTML = snapshot.docs.map(doc => {
    const d = doc.data();
    const isManager = currentUserData?.role === 'manager';
    const managerActions = isManager ? `
      <button class="btn-ghost btn-sm" onclick="deleteLessonPlan('${doc.id}')">
        <i class="fas fa-trash" style="color:var(--danger)"></i>
      </button>` : '';

    return `
      <div class="lesson-plan-card" id="lp-${doc.id}">
        <span class="lp-number">מערך ${d.number || ''}</span>
        <div class="lp-title">${escHtml(d.title || '')}</div>
        ${d.description ? `<div class="lp-desc">${escHtml(d.description)}</div>` : ''}
        <div class="lp-date"><i class="fas fa-calendar-alt"></i> ${formatDate(d.date)}</div>
        <div class="lp-actions">
          ${d.videoUrl ? `<a href="${escHtml(d.videoUrl)}" target="_blank" class="btn-secondary btn-sm"><i class="fab fa-youtube" style="color:var(--danger)"></i> סרטון</a>` : ''}
          ${d.fileUrl  ? `<a href="${escHtml(d.fileUrl)}"  target="_blank" class="btn-secondary btn-sm"><i class="fas fa-file-pdf"></i> קובץ</a>` : ''}
          ${managerActions}
        </div>
      </div>`;
  }).join('');
}

function openLessonPlanModal() {
  document.getElementById('lessonPlanModal').classList.add('show');
}

function closeLessonPlanModal() {
  document.getElementById('lessonPlanModal').classList.remove('show');
  document.getElementById('lessonPlanForm')?.reset();
  const fn = document.getElementById('lp-file-name');
  if (fn) fn.textContent = 'לחץ לבחירת קובץ';
}

async function submitLessonPlan(e) {
  e.preventDefault();
  const btn = document.getElementById('submitLessonPlanBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px"></div> שומר...';

  try {
    const number = parseInt(document.getElementById('lp-number').value);
    const title  = document.getElementById('lp-title').value.trim();
    const desc   = document.getElementById('lp-desc').value.trim();
    const date   = document.getElementById('lp-date').value;
    const video  = document.getElementById('lp-video').value.trim();
    const file   = document.getElementById('lp-file').files[0];

    const data = {
      number, title, description: desc, date, videoUrl: video,
      createdBy: currentUserData?.uid,
      createdByName: currentUserData?.name || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Upload file if provided
    if (file) {
      const ref = storage.ref(`lessonPlans/${Date.now()}_${file.name}`);
      const snap = await ref.put(file);
      data.fileUrl = await snap.ref.getDownloadURL();
      data.fileName = file.name;
    }

    await db.collection('lessonPlans').add(data);
    closeLessonPlanModal();
    showToast('מערך השיעור נשמר בהצלחה', 'success');
  } catch (err) {
    console.error(err);
    showToast('שגיאה בשמירת המערך: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> שמור מערך שיעור';
  }
}

async function deleteLessonPlan(id) {
  if (!confirm('למחוק את מערך השיעור?')) return;
  try {
    await db.collection('lessonPlans').doc(id).delete();
    showToast('המערך נמחק', 'info');
  } catch (err) {
    showToast('שגיאה במחיקה', 'error');
  }
}

// ══════════════════════════════════════════════════════════════
// SUMMARIES
// ══════════════════════════════════════════════════════════════
function loadSummaries() {
  let query = db.collection('summaries').orderBy('createdAt', 'desc');
  // Coaches only see their own summaries
  if (currentUserData?.role === 'coach' || currentUserData?.role === 'coordinator') {
    query = query.where('coachId', '==', currentUserData.uid);
  }
  const unsub = query.onSnapshot(renderSummaries, err => console.error('loadSummaries:', err));
  unsubscribers.push(unsub);
}

function renderSummaries(snapshot) {
  const list = document.getElementById('summaries-list');
  if (!list) return;

  if (snapshot.empty) {
    list.innerHTML = '<div class="loading-center" style="color:var(--text-3)"><p>אין סיכומים עדיין</p></div>';
    return;
  }

  list.innerHTML = snapshot.docs.map(doc => {
    const d = doc.data();
    const classes = ['summary-card'];
    if (d.hasDiscipline) classes.push('discipline');
    if (d.hasEquipment)  classes.push('equipment');

    const tags = [];
    if (d.hasDiscipline) tags.push('<span class="summary-tag discipline-tag"><i class="fas fa-exclamation-triangle"></i> משמעת</span>');
    if (d.hasEquipment)  tags.push('<span class="summary-tag equipment-tag"><i class="fas fa-tools"></i> ציוד</span>');

    const stars = '★'.repeat(d.rating || 3) + '☆'.repeat(5 - (d.rating || 3));

    return `
      <div class="${classes.join(' ')}" onclick="viewSummary('${doc.id}')">
        <div class="summary-meta">
          <span class="summary-school">${escHtml(d.school || '—')}</span>
          <span class="summary-date">${formatDate(d.date)}</span>
          <span class="summary-coach">${escHtml(d.coachName || '')}</span>
          <span style="color:var(--warning);font-size:.8rem">${stars}</span>
        </div>
        <div class="summary-body">${escHtml(d.summary || '')}</div>
        ${tags.length ? `<div class="summary-tags">${tags.join('')}</div>` : ''}
      </div>`;
  }).join('');

  // Update recent-summaries in dashboard (latest 3)
  const recentEl = document.getElementById('recent-summaries');
  if (recentEl) {
    const recent = snapshot.docs.slice(0, 3);
    if (recent.length === 0) {
      recentEl.innerHTML = '<p style="color:var(--text-3);font-size:.875rem">אין סיכומים עדיין</p>';
    } else {
      recentEl.innerHTML = recent.map(doc => {
        const d = doc.data();
        return `<div style="padding:8px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:600;font-size:.875rem">${escHtml(d.school || '—')}</div>
            <div style="font-size:.78rem;color:var(--text-3)">${escHtml(d.coachName || '')} · ${formatDate(d.date)}</div>
          </div>
          ${d.hasDiscipline ? '<span class="summary-tag discipline-tag">משמעת</span>' : ''}
          ${d.hasEquipment  ? '<span class="summary-tag equipment-tag">ציוד</span>'   : ''}
        </div>`;
      }).join('');
    }
  }

  // Update coach dashboard counter
  const coachSumEl = document.getElementById('stat-coach-summaries');
  if (coachSumEl) coachSumEl.textContent = snapshot.size;
}

async function submitSummary(e) {
  e.preventDefault();
  const btn = document.getElementById('submitSummaryBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px"></div> שולח...';

  try {
    const hasDiscipline = document.getElementById('sum-discipline').checked;
    const hasEquipment  = document.getElementById('sum-equipment').checked;
    const rating = parseInt(document.querySelector('input[name="rating"]:checked')?.value || '3');
    const files  = document.getElementById('sum-photos').files;

    const data = {
      school:       document.getElementById('sum-school').value.trim(),
      group:        document.getElementById('sum-group').value.trim(),
      date:         document.getElementById('sum-date').value,
      attendance:   parseInt(document.getElementById('sum-attendance').value) || 0,
      rating,
      summary:      document.getElementById('sum-summary').value.trim(),
      highlights:   document.getElementById('sum-highlights').value.trim(),
      hasDiscipline,
      disciplineDetails: hasDiscipline ? document.getElementById('sum-discipline-details').value.trim() : '',
      hasEquipment,
      equipmentDetails:  hasEquipment  ? document.getElementById('sum-equipment-details').value.trim() : '',
      notes:        document.getElementById('sum-notes').value.trim(),
      coachId:      currentUserData?.uid,
      coachName:    currentUserData?.name || '',
      photos:       [],
      createdAt:    firebase.firestore.FieldValue.serverTimestamp()
    };

    // Upload photos
    if (files && files.length > 0) {
      const urls = await Promise.all(Array.from(files).map(async file => {
        const ref  = storage.ref(`summaries/${Date.now()}_${file.name}`);
        const snap = await ref.put(file);
        return snap.ref.getDownloadURL();
      }));
      data.photos = urls;
    }

    await db.collection('summaries').add(data);
    document.getElementById('summaryForm').reset();
    document.getElementById('photo-preview').style.display = 'none';
    document.getElementById('photo-preview').innerHTML = '';
    document.getElementById('discipline-details-row').style.display = 'none';
    document.getElementById('equipment-details-row').style.display  = 'none';
    showToast('הסיכום נשלח בהצלחה!', 'success');
    navigateTo('summaries');
  } catch (err) {
    console.error(err);
    showToast('שגיאה בשליחת הסיכום: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> שלח סיכום למנהל';
  }
}

async function viewSummary(id) {
  const doc = await db.collection('summaries').doc(id).get();
  if (!doc.exists) return;
  const d = doc.data();

  const stars = '★'.repeat(d.rating || 3) + '☆'.repeat(5 - (d.rating || 3));
  const photos = (d.photos || []).map(url =>
    `<div class="photo-item"><img src="${url}" alt="תמונה"></div>`).join('');

  document.getElementById('summaryModalContent').innerHTML = `
    <div style="padding:4px 0 16px">
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px">
        <div><span style="font-size:.75rem;color:var(--text-3)">בית ספר</span><div style="font-weight:700">${escHtml(d.school)}</div></div>
        <div><span style="font-size:.75rem;color:var(--text-3)">קבוצה</span><div style="font-weight:700">${escHtml(d.group || '—')}</div></div>
        <div><span style="font-size:.75rem;color:var(--text-3)">תאריך</span><div style="font-weight:700">${formatDate(d.date)}</div></div>
        <div><span style="font-size:.75rem;color:var(--text-3)">מאמן</span><div style="font-weight:700;color:var(--primary-lighter)">${escHtml(d.coachName)}</div></div>
        <div><span style="font-size:.75rem;color:var(--text-3)">דירוג</span><div style="color:var(--warning)">${stars}</div></div>
        <div><span style="font-size:.75rem;color:var(--text-3)">משתתפים</span><div style="font-weight:700">${d.attendance || 0}</div></div>
      </div>
      <div class="section-block-title"><i class="fas fa-clipboard-check"></i> סיכום</div>
      <p style="color:var(--text-2);line-height:1.7;margin-bottom:16px">${escHtml(d.summary || '')}</p>
      ${d.highlights ? `<div class="section-block-title"><i class="fas fa-star"></i> הצלחות</div><p style="color:var(--text-2);line-height:1.7;margin-bottom:16px">${escHtml(d.highlights)}</p>` : ''}
      ${d.hasDiscipline ? `<div style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:8px;padding:12px;margin-bottom:12px"><b style="color:var(--warning)"><i class="fas fa-exclamation-triangle"></i> בעיות משמעת</b><p style="margin-top:6px;color:var(--text-2)">${escHtml(d.disciplineDetails || '—')}</p></div>` : ''}
      ${d.hasEquipment  ? `<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:12px;margin-bottom:12px"><b style="color:var(--danger)"><i class="fas fa-tools"></i> בעיות ציוד</b><p style="margin-top:6px;color:var(--text-2)">${escHtml(d.equipmentDetails || '—')}</p></div>` : ''}
      ${d.notes ? `<div class="section-block-title"><i class="fas fa-sticky-note"></i> הערות</div><p style="color:var(--text-2);line-height:1.7;margin-bottom:16px">${escHtml(d.notes)}</p>` : ''}
      ${photos ? `<div class="section-block-title"><i class="fas fa-camera"></i> תמונות</div><div class="photo-grid" style="margin-top:8px">${photos}</div>` : ''}
    </div>`;

  document.getElementById('summaryModal').classList.add('show');
}

// ══════════════════════════════════════════════════════════════
// SESSIONS (Calendar)
// ══════════════════════════════════════════════════════════════
function loadSessions() {
  // Sessions are loaded into calendar when calendar is initialized
  // Also update coach dashboard stats
  let query = db.collection('sessions');
  if (currentUserData?.role === 'coach' || currentUserData?.role === 'coordinator') {
    query = query.where('coachId', '==', currentUserData.uid);
  }

  const unsub = query.onSnapshot(snapshot => {
    // Update coach session stats
    const today = new Date().toISOString().split('T')[0];
    let todayCount = 0;
    snapshot.forEach(doc => {
      if (doc.data().date === today) todayCount++;
    });

    const todayEl   = document.getElementById('stat-coach-today');
    const totalEl   = document.getElementById('stat-coach-sessions');
    if (todayEl) todayEl.textContent = todayCount;
    if (totalEl) totalEl.textContent = snapshot.size;

    // Update today session info card
    const todayInfo = document.getElementById('today-session-info');
    if (todayInfo) {
      const todaySessions = snapshot.docs.filter(d => d.data().date === today);
      if (todaySessions.length > 0) {
        todayInfo.innerHTML = todaySessions.map(doc => {
          const d = doc.data();
          return `<div class="card" style="border-right:4px solid var(--primary)">
            <div class="card-title"><i class="fas fa-dumbbell"></i> אימון היום</div>
            <div style="margin-top:8px;color:var(--text-2)">
              <div><i class="fas fa-school"></i> ${escHtml(d.school || '')}</div>
              <div><i class="fas fa-users"></i> ${escHtml(d.group || '')}</div>
              ${d.startTime ? `<div><i class="fas fa-clock"></i> ${d.startTime}${d.endTime ? ' — ' + d.endTime : ''}</div>` : ''}
            </div>
          </div>`;
        }).join('');
      }
    }
  }, err => console.error('loadSessions:', err));

  unsubscribers.push(unsub);
}

function openSessionModal() {
  // Populate coach dropdown
  const sel = document.getElementById('sess-coach');
  if (sel) {
    sel.innerHTML = '<option value="">טוען מאמנים...</option>';
    db.collection('users').where('role', 'in', ['coach', 'coordinator']).get().then(snap => {
      sel.innerHTML = '<option value="">בחר מאמן...</option>';
      snap.forEach(doc => {
        const d = doc.data();
        const opt = document.createElement('option');
        opt.value = doc.id;
        opt.textContent = d.name || d.email;
        opt.dataset.name = d.name || d.email;
        sel.appendChild(opt);
      });
      // Pre-select current user if they are a coach
      if (currentUserData?.role !== 'manager') {
        sel.value = currentUserData?.uid || '';
      }
    });
  }
  document.getElementById('sessionModal').classList.add('show');
}

function closeSessionModal() {
  document.getElementById('sessionModal').classList.remove('show');
  document.getElementById('sessionForm')?.reset();
}

async function submitSession(e) {
  e.preventDefault();
  try {
    const coachSel = document.getElementById('sess-coach');
    const coachId  = coachSel.value;
    const coachName = coachSel.options[coachSel.selectedIndex]?.dataset.name || '';
    const date      = document.getElementById('sess-date').value;
    const school    = document.getElementById('sess-school').value.trim();
    const group     = document.getElementById('sess-group').value.trim();
    const startTime = document.getElementById('sess-start').value;
    const endTime   = document.getElementById('sess-end').value;
    const notes     = document.getElementById('sess-notes').value.trim();

    const data = {
      coachId, coachName, date, school, group, startTime, endTime, notes,
      createdBy: currentUserData?.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const ref = await db.collection('sessions').add(data);

    // Add to calendar immediately
    if (calendar) {
      const start = date + (startTime ? 'T' + startTime : '');
      const end   = date + (endTime   ? 'T' + endTime   : '');
      calendar.addEvent({
        id: ref.id,
        title: `${coachName} — ${school}`,
        start,
        end: endTime ? end : undefined,
        extendedProps: { school, coachName }
      });
    }

    closeSessionModal();
    showToast('האימון נוסף ללוח השנה', 'success');
    navigateTo('calendar');
  } catch (err) {
    console.error(err);
    showToast('שגיאה בהוספת האימון: ' + err.message, 'error');
  }
}

// ══════════════════════════════════════════════════════════════
// COACHES
// ══════════════════════════════════════════════════════════════
function loadCoaches() {
  const unsub = db.collection('users')
    .where('role', 'in', ['coach', 'coordinator', 'manager'])
    .onSnapshot(renderCoaches, err => console.error('loadCoaches:', err));
  unsubscribers.push(unsub);
}

function renderCoaches(snapshot) {
  const grid = document.getElementById('coaches-grid');
  if (!grid) return;

  // Also populate session modal coach dropdown if it's open
  const msgTo = document.getElementById('msg-to');
  if (msgTo && msgTo.children.length <= 1) {
    snapshot.forEach(doc => {
      if (doc.id === currentUserData?.uid) return;
      const opt = document.createElement('option');
      opt.value = doc.id;
      opt.textContent = doc.data().name || doc.data().email;
      msgTo.appendChild(opt);
    });
  }

  if (snapshot.empty) {
    grid.innerHTML = '<div class="loading-center" style="color:var(--text-3)"><p>אין חברי צוות עדיין</p></div>';
    return;
  }

  const roleMap  = { manager: 'מנהל', coach: 'מאמן', coordinator: 'רכז' };
  const colorMap = ['#e63946','#3b82f6','#22c55e','#f59e0b','#8b5cf6','#ec4899'];

  grid.innerHTML = `<div class="coaches-grid-layout">` +
    snapshot.docs.map((doc, i) => {
      const d = doc.data();
      const initials = (d.name || d.email || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const color    = colorMap[i % colorMap.length];
      const isManager = currentUserData?.role === 'manager';
      return `
        <div class="coach-card">
          <div class="coach-avatar" style="background:${color}">${initials}</div>
          <div class="coach-name">${escHtml(d.name || d.email || '—')}</div>
          <div class="coach-role">${roleMap[d.role] || d.role || ''}</div>
          ${d.school ? `<div class="coach-school"><i class="fas fa-school"></i> ${escHtml(d.school)}</div>` : ''}
          ${d.phone  ? `<div class="coach-phone"><i class="fas fa-phone"></i> ${escHtml(d.phone)}</div>`   : ''}
          ${isManager ? `<button class="btn-ghost btn-sm" style="margin-top:6px" onclick="deleteCoach('${doc.id}')"><i class="fas fa-trash" style="color:var(--danger)"></i></button>` : ''}
        </div>`;
    }).join('') + `</div>`;
}

function openCoachModal() {
  document.getElementById('coachModal').classList.add('show');
}

function closeCoachModal() {
  document.getElementById('coachModal').classList.remove('show');
  document.getElementById('coachForm')?.reset();
}

async function submitCoach(e) {
  e.preventDefault();
  try {
    const name   = document.getElementById('new-coach-name').value.trim();
    const email  = document.getElementById('new-coach-email').value.trim();
    const phone  = document.getElementById('new-coach-phone').value.trim();
    const role   = document.getElementById('new-coach-role').value;
    const school = document.getElementById('new-coach-school').value.trim();

    // Check for duplicate email
    const existing = await db.collection('users').where('email', '==', email).get();
    if (!existing.empty) {
      showToast('כתובת אימייל כבר קיימת במערכת', 'error');
      return;
    }

    await db.collection('users').add({
      name, email, phone, role, school,
      createdBy: currentUserData?.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    closeCoachModal();
    showToast('חבר הצוות נוסף בהצלחה', 'success');
  } catch (err) {
    console.error(err);
    showToast('שגיאה בהוספת חבר הצוות: ' + err.message, 'error');
  }
}

async function deleteCoach(id) {
  if (!confirm('למחוק את חבר הצוות?')) return;
  try {
    await db.collection('users').doc(id).delete();
    showToast('חבר הצוות הוסר', 'info');
  } catch (err) {
    showToast('שגיאה במחיקה', 'error');
  }
}

// ══════════════════════════════════════════════════════════════
// EQUIPMENT
// ══════════════════════════════════════════════════════════════
function loadEquipment() {
  const unsub = db.collection('equipment').orderBy('createdAt', 'desc')
    .onSnapshot(renderEquipment, err => console.error('loadEquipment:', err));
  unsubscribers.push(unsub);
}

function renderEquipment(snapshot) {
  const tbody = document.getElementById('equipment-body');
  if (!tbody) return;

  if (snapshot.empty) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:24px">אין ציוד מדווח עדיין</td></tr>';
    return;
  }

  const statusMap = { good: 'תקין', damaged: 'פגום', broken: 'מקולקל / לתיקון' };
  const badgeMap  = { good: 'badge-good', damaged: 'badge-damaged', broken: 'badge-broken' };

  tbody.innerHTML = snapshot.docs.map(doc => {
    const d = doc.data();
    return `<tr>
      <td style="font-weight:600;color:var(--text-1)">${escHtml(d.name || '')}</td>
      <td>${escHtml(d.school || '')}</td>
      <td>${d.quantity || 1}</td>
      <td><span class="badge ${badgeMap[d.status] || ''}">${statusMap[d.status] || d.status}</span></td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(d.notes || '—')}</td>
      <td>
        <button class="btn-ghost btn-sm" onclick="deleteEquipment('${doc.id}')">
          <i class="fas fa-trash" style="color:var(--danger)"></i>
        </button>
      </td>
    </tr>`;
  }).join('');
}

function openEquipmentModal() {
  document.getElementById('equipmentModal').classList.add('show');
}

function closeEquipmentModal() {
  document.getElementById('equipmentModal').classList.remove('show');
  document.getElementById('equipmentForm')?.reset();
}

async function submitEquipment(e) {
  e.preventDefault();
  try {
    const data = {
      name:     document.getElementById('eq-name').value.trim(),
      school:   document.getElementById('eq-school').value.trim(),
      quantity: parseInt(document.getElementById('eq-quantity').value) || 1,
      status:   document.getElementById('eq-status').value,
      notes:    document.getElementById('eq-notes').value.trim(),
      reportedBy:   currentUserData?.uid,
      reportedName: currentUserData?.name || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('equipment').add(data);
    closeEquipmentModal();
    showToast('הציוד נוסף בהצלחה', 'success');
  } catch (err) {
    console.error(err);
    showToast('שגיאה בשמירת הציוד: ' + err.message, 'error');
  }
}

async function deleteEquipment(id) {
  if (!confirm('למחוק את הציוד?')) return;
  try {
    await db.collection('equipment').doc(id).delete();
    showToast('הציוד הוסר', 'info');
  } catch (err) {
    showToast('שגיאה במחיקה', 'error');
  }
}

// ══════════════════════════════════════════════════════════════
// MESSAGES
// ══════════════════════════════════════════════════════════════
function loadMessages() {
  if (!currentUserData?.uid) return;

  // Load threads where current user is a participant
  const unsub = db.collection('messageThreads')
    .where('participants', 'array-contains', currentUserData.uid)
    .orderBy('lastAt', 'desc')
    .onSnapshot(snapshot => {
      const list = document.getElementById('message-list');
      if (!list) return;

      if (snapshot.empty) {
        list.innerHTML = '<div style="padding:16px;color:var(--text-3);font-size:.875rem;text-align:center">אין שיחות עדיין</div>';
        return;
      }

      let unreadCount = 0;
      list.innerHTML = snapshot.docs.map(doc => {
        const d = doc.data();
        const otherName = d.participantNames?.find(n => n !== currentUserData.name) || '—';
        const isActive  = currentThreadId === doc.id ? ' active' : '';
        const unread    = (d.unreadFor || []).includes(currentUserData.uid);
        if (unread) unreadCount++;
        return `
          <div class="message-thread-item${isActive}" onclick="openThread('${doc.id}', '${escHtml(otherName)}')">
            <div class="thread-name">${escHtml(otherName)}${unread ? ' <span style="width:7px;height:7px;background:var(--primary);border-radius:50%;display:inline-block"></span>' : ''}</div>
            <div class="thread-preview">${escHtml((d.lastMessage || '').slice(0, 50))}</div>
          </div>`;
      }).join('');

      // Update badge
      const badge = document.getElementById('msg-badge');
      if (badge) {
        if (unreadCount > 0) {
          badge.textContent = unreadCount;
          badge.style.display = 'inline-block';
        } else {
          badge.style.display = 'none';
        }
      }
    }, err => console.error('loadMessages:', err));

  unsubscribers.push(unsub);

  // Populate message recipient dropdown
  db.collection('users').get().then(snap => {
    const sel = document.getElementById('msg-to');
    if (!sel) return;
    sel.innerHTML = '<option value="">בחר נמען...</option>';
    snap.forEach(doc => {
      if (doc.id === currentUserData.uid) return;
      const opt = document.createElement('option');
      opt.value = doc.id;
      opt.dataset.name = doc.data().name || doc.data().email;
      opt.textContent  = doc.data().name || doc.data().email;
      sel.appendChild(opt);
    });
  });
}

function openThread(threadId, otherName) {
  currentThreadId = threadId;

  // Update thread list active state
  document.querySelectorAll('.message-thread-item').forEach(el => el.classList.remove('active'));
  event?.currentTarget?.classList.add('active');

  const chatPanel = document.getElementById('chat-panel');
  const chatEmpty = document.getElementById('chat-empty');
  if (chatPanel) { chatPanel.style.display = 'flex'; }
  if (chatEmpty) { chatEmpty.style.display = 'none'; }

  const header = document.getElementById('chat-header-name');
  if (header) header.textContent = otherName;

  // Mark as read
  db.collection('messageThreads').doc(threadId).update({
    unreadFor: firebase.firestore.FieldValue.arrayRemove(currentUserData.uid)
  }).catch(() => {});

  // Load messages in thread
  db.collection('messageThreads').doc(threadId).collection('messages')
    .orderBy('sentAt', 'asc').onSnapshot(snapshot => {
      const thread = document.getElementById('messages-thread');
      if (!thread) return;
      thread.innerHTML = snapshot.docs.map(doc => {
        const d = doc.data();
        const isSent = d.senderId === currentUserData.uid;
        return `<div class="message-bubble ${isSent ? 'sent' : 'received'}">
          <div>${escHtml(d.text || '')}</div>
          <div style="font-size:.68rem;color:${isSent ? 'rgba(255,255,255,.5)' : 'var(--text-3)'};margin-top:4px;text-align:${isSent ? 'left' : 'right'}">${formatTimestamp(d.sentAt)}</div>
        </div>`;
      }).join('');
      thread.scrollTop = thread.scrollHeight;
    });
}

function openNewMessageModal() {
  document.getElementById('newMessageModal').classList.add('show');
}

function closeNewMessageModal() {
  document.getElementById('newMessageModal').classList.remove('show');
  document.getElementById('newMessageForm')?.reset();
}

async function submitNewMessage(e) {
  e.preventDefault();
  try {
    const toSel  = document.getElementById('msg-to');
    const toId   = toSel.value;
    const toName = toSel.options[toSel.selectedIndex]?.dataset.name || '';
    const text   = document.getElementById('msg-first-content').value.trim();

    if (!toId || !text) return;

    // Check if thread already exists
    const existing = await db.collection('messageThreads')
      .where('participants', 'array-contains', currentUserData.uid)
      .get();

    let threadId = null;
    existing.forEach(doc => {
      const d = doc.data();
      if (d.participants.includes(toId)) threadId = doc.id;
    });

    const now = firebase.firestore.FieldValue.serverTimestamp();

    if (!threadId) {
      const ref = await db.collection('messageThreads').add({
        participants:     [currentUserData.uid, toId],
        participantNames: [currentUserData.name || '', toName],
        lastMessage:      text,
        lastAt:           now,
        unreadFor:        [toId]
      });
      threadId = ref.id;
    } else {
      await db.collection('messageThreads').doc(threadId).update({
        lastMessage: text,
        lastAt: now,
        unreadFor: firebase.firestore.FieldValue.arrayUnion(toId)
      });
    }

    await db.collection('messageThreads').doc(threadId).collection('messages').add({
      text,
      senderId: currentUserData.uid,
      senderName: currentUserData.name || '',
      sentAt: now
    });

    closeNewMessageModal();
    showToast('ההודעה נשלחה', 'success');
    openThread(threadId, toName);
  } catch (err) {
    console.error(err);
    showToast('שגיאה בשליחת ההודעה: ' + err.message, 'error');
  }
}

async function sendMessage() {
  const input = document.getElementById('msg-input');
  const text  = input?.value?.trim();
  if (!text || !currentThreadId) return;

  try {
    const now = firebase.firestore.FieldValue.serverTimestamp();

    // Get the other participant to mark as unread
    const threadDoc = await db.collection('messageThreads').doc(currentThreadId).get();
    const otherIds  = (threadDoc.data()?.participants || []).filter(id => id !== currentUserData.uid);

    await db.collection('messageThreads').doc(currentThreadId).collection('messages').add({
      text,
      senderId: currentUserData.uid,
      senderName: currentUserData.name || '',
      sentAt: now
    });

    await db.collection('messageThreads').doc(currentThreadId).update({
      lastMessage: text,
      lastAt: now,
      unreadFor: firebase.firestore.FieldValue.arrayUnion(...otherIds)
    });

    input.value = '';
  } catch (err) {
    showToast('שגיאה בשליחת ההודעה', 'error');
  }
}

// Allow Enter key to send
document.getElementById('msg-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ══════════════════════════════════════════════════════════════
// GALLERY
// ══════════════════════════════════════════════════════════════
function loadGallery() {
  const unsub = db.collection('gallery').orderBy('uploadedAt', 'desc')
    .onSnapshot(snapshot => {
      const grid = document.getElementById('gallery-grid');
      if (!grid) return;
      if (snapshot.empty) {
        grid.innerHTML = '<div style="color:var(--text-3);text-align:center;padding:40px">אין תמונות עדיין — העלה תמונות מהאימונים!</div>';
        return;
      }
      grid.innerHTML = snapshot.docs.map(doc => {
        const d = doc.data();
        return `<div class="photo-item">
          <img src="${d.url}" alt="${escHtml(d.name || '')}" loading="lazy"
               onclick="window.open('${d.url}','_blank')">
        </div>`;
      }).join('');
    }, err => console.error('loadGallery:', err));
  unsubscribers.push(unsub);
}

async function uploadGalleryPhotos(input) {
  const files = input.files;
  if (!files || files.length === 0) return;

  const btn = document.getElementById('gallery-upload-btn');
  if (btn) { btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px"></div> מעלה...'; }

  try {
    await Promise.all(Array.from(files).map(async file => {
      const ref  = storage.ref(`gallery/${Date.now()}_${file.name}`);
      const snap = await ref.put(file);
      const url  = await snap.ref.getDownloadURL();
      await db.collection('gallery').add({
        url,
        name: file.name,
        uploadedBy:   currentUserData?.uid,
        uploadedName: currentUserData?.name || '',
        uploadedAt:   firebase.firestore.FieldValue.serverTimestamp()
      });
    }));
    showToast(`${files.length} תמונות הועלו בהצלחה`, 'success');
  } catch (err) {
    console.error(err);
    showToast('שגיאה בהעלאת התמונות: ' + err.message, 'error');
  } finally {
    if (btn) btn.innerHTML = '<i class="fas fa-upload"></i> העלה תמונות';
    input.value = '';
  }
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD STATS
// ══════════════════════════════════════════════════════════════
function loadDashboardStats() {
  // Active coaches count
  db.collection('users').where('role', 'in', ['coach', 'coordinator'])
    .onSnapshot(snap => {
      const el = document.getElementById('stat-coaches');
      if (el) el.textContent = snap.size;
    });

  // Sessions this week
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().split('T')[0];
  db.collection('sessions').where('date', '>=', weekAgoStr)
    .onSnapshot(snap => {
      const el = document.getElementById('stat-sessions');
      if (el) el.textContent = snap.size;
    });

  // New summaries (last 7 days)
  db.collection('summaries').where('date', '>=', weekAgoStr)
    .onSnapshot(snap => {
      const el = document.getElementById('stat-summaries');
      if (el) el.textContent = snap.size;
    });

  // Open equipment issues (damaged or broken)
  db.collection('equipment').where('status', 'in', ['damaged', 'broken'])
    .onSnapshot(snap => {
      const el = document.getElementById('stat-equipment');
      if (el) el.textContent = snap.size;
    });
}

// ══════════════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════════════
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  } catch { return dateStr; }
}

function formatTimestamp(ts) {
  if (!ts) return '';
  try {
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('show');
    }
  });
});

// ── DOMContentLoaded ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Do NOT init calendar here — only when navigating to it (it may be hidden)

  // Toggle discipline details
  document.getElementById('sum-discipline')?.addEventListener('change', function () {
    document.getElementById('discipline-details-row').style.display = this.checked ? 'block' : 'none';
  });

  // Toggle equipment details
  document.getElementById('sum-equipment')?.addEventListener('change', function () {
    document.getElementById('equipment-details-row').style.display = this.checked ? 'block' : 'none';
  });
});
