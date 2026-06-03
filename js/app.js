/* =========================================================
   ענפים — app.js
   Full application logic for the coaching management platform
   ========================================================= */

'use strict';

// ── Global state ──────────────────────────────────────────
let currentUser     = null;
let currentUserData = null;
let calendarInstance = null;
let activeConversationId = null;
let allCoaches      = [];

// ── Auth guard ────────────────────────────────────────────
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = user;

  // Load user profile from Firestore
  try {
    const snap = await db.collection('users').doc(user.uid).get();
    if (snap.exists) {
      currentUserData = { uid: user.uid, ...snap.data() };
    } else {
      // First login — create profile (treat as manager if no doc exists)
      currentUserData = {
        uid:   user.uid,
        name:  user.displayName || user.email,
        email: user.email,
        role:  'manager',
      };
      await db.collection('users').doc(user.uid).set(currentUserData);
    }
  } catch (e) {
    console.error('Failed to load user profile:', e);
    currentUserData = {
      uid:   user.uid,
      name:  user.displayName || user.email,
      email: user.email,
      role:  'manager',
    };
  }

  // Update UI
  applyUserUI();
  document.dispatchEvent(new Event('userLoaded'));

  // Start data listeners
  initDataListeners();
});

// ── Apply user info to sidebar ────────────────────────────
function applyUserUI() {
  const name   = currentUserData?.name  || currentUserData?.email || '?';
  const role   = currentUserData?.role  || 'coach';
  const initEl = document.getElementById('userInitials');
  const nameEl = document.getElementById('userName');
  const roleEl = document.getElementById('userRoleLabel');

  if (initEl) initEl.textContent = name.charAt(0).toUpperCase();
  if (nameEl) nameEl.textContent = name;
  if (roleEl) {
    const labels = { manager: 'מנהל', coach: 'מאמן', coordinator: 'רכז' };
    roleEl.textContent = labels[role] || role;
  }

  // Role-based visibility
  const isManager = role === 'manager';
  document.querySelectorAll('.manager-only, [data-roles="manager"]').forEach(el => {
    el.style.display = isManager ? '' : 'none';
  });
}

// ── Logout ────────────────────────────────────────────────
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  await auth.signOut();
  window.location.href = 'index.html';
});

// ── Sidebar navigation ────────────────────────────────────
function navigateTo(section) {
  // Hide all sections
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  // Show target
  const target = document.getElementById('sec-' + section);
  if (target) target.classList.add('active');

  // Update nav items
  document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === section);
  });

  // Close sidebar on mobile
  if (window.innerWidth < 768) {
    document.getElementById('sidebar')?.classList.remove('open');
  }

  // Special init for calendar
  if (section === 'calendar' && calendarInstance) {
    setTimeout(() => calendarInstance.updateSize(), 100);
  }

  // Init gallery when navigated to
  if (section === 'gallery') renderGallery();
  if (section === 'messages') renderMessages();
}

// Attach click handlers to nav items
document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.section));
});

// Sidebar toggle (mobile)
document.getElementById('sidebarToggle')?.addEventListener('click', () => {
  document.getElementById('sidebar')?.classList.toggle('open');
});

// ── Toast ─────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle' };
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── Firestore listeners ───────────────────────────────────
function initDataListeners() {
  listenCoaches();
  listenSummaries();
  listenEquipment();
  listenLessonPlans();
  listenMessages();
  listenSessions();
  loadDashboardStats();
  initCalendar();
}

// ── Coaches ───────────────────────────────────────────────
function listenCoaches() {
  db.collection('users').onSnapshot(snap => {
    allCoaches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCoaches();
    populateCoachSelects();
  }, err => console.error('coaches listener:', err));
}

function renderCoaches() {
  const grid = document.getElementById('coaches-grid');
  if (!grid) return;
  if (!allCoaches.length) {
    grid.innerHTML = '<p style="color:var(--text-3);padding:24px;text-align:center">אין חברי צוות עדיין</p>';
    return;
  }
  const roleLabels = { manager: 'מנהל', coach: 'מאמן', coordinator: 'רכז' };
  grid.innerHTML = `<div class="grid-2">${allCoaches.map(c => `
    <div class="card" style="display:flex;align-items:center;gap:16px;padding:20px">
      <div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--primary-lighter));display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:700;color:white;flex-shrink:0">
        ${(c.name || c.email || '?').charAt(0).toUpperCase()}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:1rem;margin-bottom:2px">${esc(c.name || c.email)}</div>
        <div style="font-size:.8rem;color:var(--text-3)">${esc(c.email || '')}</div>
        ${c.phone ? `<div style="font-size:.8rem;color:var(--text-3)">${esc(c.phone)}</div>` : ''}
        ${c.school ? `<div style="font-size:.8rem;color:var(--text-2);margin-top:4px"><i class="fas fa-school" style="opacity:.6"></i> ${esc(c.school)}</div>` : ''}
      </div>
      <div>
        <span style="background:rgba(230,57,70,.15);color:var(--primary-lighter);padding:4px 10px;border-radius:20px;font-size:.75rem;font-weight:700">
          ${roleLabels[c.role] || c.role || 'מאמן'}
        </span>
      </div>
    </div>
  `).join('')}</div>`;
}

function populateCoachSelects() {
  ['sess-coach', 'msg-to'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = id === 'msg-to'
      ? '<option value="">בחר נמען...</option>'
      : '<option value="">בחר מאמן...</option>';
    allCoaches.forEach(c => {
      if (c.uid === currentUserData?.uid) return; // don't show self in messages
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name || c.email;
      sel.appendChild(opt);
    });
    if (current) sel.value = current;
  });
}

// ── Summaries ─────────────────────────────────────────────
let allSummaries = [];

function listenSummaries() {
  let query = db.collection('summaries').orderBy('createdAt', 'desc').limit(100);
  // Coaches see only their own summaries
  if (currentUserData?.role === 'coach' || currentUserData?.role === 'coordinator') {
    query = query.where('coachUid', '==', currentUserData.uid);
  }
  query.onSnapshot(snap => {
    allSummaries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSummaries();
    renderRecentSummaries();
    updateCoachStats();
  }, err => console.error('summaries listener:', err));
}

function renderSummaries() {
  const list = document.getElementById('summaries-list');
  if (!list) return;
  if (!allSummaries.length) {
    list.innerHTML = '<p style="color:var(--text-3);padding:24px;text-align:center">אין סיכומים עדיין</p>';
    return;
  }
  list.innerHTML = allSummaries.map(s => summaryCard(s, true)).join('');
}

function summaryCard(s, full = false) {
  const date   = s.date ? s.date : (s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString('he-IL') : '—');
  const rating = '★'.repeat(s.rating || 3) + '☆'.repeat(5 - (s.rating || 3));
  const cls    = [
    'summary-card',
    s.hasDiscipline ? 'discipline' : '',
    s.hasEquipment  ? 'equipment'  : '',
  ].filter(Boolean).join(' ');

  return `<div class="${cls}" onclick="openSummaryModal('${s.id}')">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
      <div>
        <div style="font-weight:700;font-size:1rem">${esc(s.school || '—')} — ${esc(s.group || '—')}</div>
        <div style="font-size:.8rem;color:var(--text-3);margin-top:2px">${esc(s.coachName || '')}${s.coachName && date ? ' · ' : ''}${date}</div>
      </div>
      <div style="font-size:1.1rem;color:#f5a623;letter-spacing:1px">${rating}</div>
    </div>
    <div style="font-size:.875rem;color:var(--text-2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(s.summary || '')}</div>
    ${s.hasDiscipline ? '<span style="display:inline-block;margin-top:8px;background:rgba(230,57,70,.15);color:var(--primary-lighter);padding:2px 8px;border-radius:12px;font-size:.72rem;font-weight:700"><i class="fas fa-exclamation-triangle"></i> משמעת</span>' : ''}
    ${s.hasEquipment  ? '<span style="display:inline-block;margin-top:8px;margin-right:6px;background:rgba(255,165,0,.15);color:#f5a623;padding:2px 8px;border-radius:12px;font-size:.72rem;font-weight:700"><i class="fas fa-tools"></i> ציוד</span>' : ''}
  </div>`;
}

function renderRecentSummaries() {
  const el = document.getElementById('recent-summaries');
  if (!el) return;
  const recent = allSummaries.slice(0, 5);
  if (!recent.length) {
    el.innerHTML = '<p style="color:var(--text-3);padding:12px 0">אין סיכומים עדיין</p>';
    return;
  }
  el.innerHTML = recent.map(s => summaryCard(s)).join('');
}

function openSummaryModal(id) {
  const s = allSummaries.find(x => x.id === id);
  if (!s) return;
  const date   = s.date || (s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString('he-IL') : '—');
  const rating = '★'.repeat(s.rating || 3) + '☆'.repeat(5 - (s.rating || 3));
  document.getElementById('summaryModalContent').innerHTML = `
    <div style="padding:20px 24px">
      <div class="form-grid">
        <div><strong>בית ספר</strong><p>${esc(s.school || '—')}</p></div>
        <div><strong>קבוצה</strong><p>${esc(s.group || '—')}</p></div>
        <div><strong>תאריך</strong><p>${date}</p></div>
        <div><strong>משתתפים</strong><p>${s.attendance || '—'}</p></div>
        <div><strong>מאמן</strong><p>${esc(s.coachName || '—')}</p></div>
        <div><strong>דירוג</strong><p style="color:#f5a623;font-size:1.2rem">${rating}</p></div>
      </div>
      <hr style="border-color:var(--border);margin:16px 0">
      <div class="mb-16"><strong>סיכום השיעור:</strong><p style="margin-top:6px;white-space:pre-wrap">${esc(s.summary || '')}</p></div>
      ${s.highlights ? `<div class="mb-16"><strong>נקודות חיוביות:</strong><p style="margin-top:6px;white-space:pre-wrap">${esc(s.highlights)}</p></div>` : ''}
      ${s.hasDiscipline ? `<div class="mb-16" style="background:rgba(230,57,70,.08);border-radius:8px;padding:12px"><strong style="color:var(--primary-lighter)"><i class="fas fa-exclamation-triangle"></i> בעיית משמעת:</strong><p style="margin-top:6px;white-space:pre-wrap">${esc(s.disciplineDetails || '—')}</p></div>` : ''}
      ${s.hasEquipment  ? `<div class="mb-16" style="background:rgba(255,165,0,.08);border-radius:8px;padding:12px"><strong style="color:#f5a623"><i class="fas fa-tools"></i> בעיית ציוד:</strong><p style="margin-top:6px;white-space:pre-wrap">${esc(s.equipmentDetails || '—')}</p></div>` : ''}
      ${s.notes ? `<div><strong>הערות נוספות:</strong><p style="margin-top:6px;white-space:pre-wrap">${esc(s.notes)}</p></div>` : ''}
    </div>`;
  document.getElementById('summaryModal').classList.add('show');
}

// ── Submit Summary Form ───────────────────────────────────
async function submitSummary(event) {
  event.preventDefault();
  const btn = document.getElementById('submitSummaryBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px"></div> שולח...';

  try {
    const rating = document.querySelector('input[name="rating"]:checked')?.value || 3;
    const hasDiscipline = document.getElementById('sum-discipline')?.checked;
    const hasEquipment  = document.getElementById('sum-equipment')?.checked;

    // Upload photos
    const photoUrls = [];
    const photoFiles = document.getElementById('sum-photos')?.files;
    if (photoFiles?.length) {
      for (const file of photoFiles) {
        const ref = storage.ref(`summaries/${Date.now()}_${file.name}`);
        await ref.put(file);
        photoUrls.push(await ref.getDownloadURL());
      }
    }

    await db.collection('summaries').add({
      school:            document.getElementById('sum-school').value.trim(),
      group:             document.getElementById('sum-group').value.trim(),
      date:              document.getElementById('sum-date').value,
      attendance:        parseInt(document.getElementById('sum-attendance').value) || 0,
      rating:            parseInt(rating),
      summary:           document.getElementById('sum-summary').value.trim(),
      highlights:        document.getElementById('sum-highlights')?.value.trim() || '',
      hasDiscipline,
      disciplineDetails: hasDiscipline ? document.getElementById('sum-discipline-details')?.value.trim() : '',
      hasEquipment,
      equipmentDetails:  hasEquipment  ? document.getElementById('sum-equipment-details')?.value.trim() : '',
      notes:             document.getElementById('sum-notes')?.value.trim() || '',
      photos:            photoUrls,
      coachUid:          currentUser.uid,
      coachName:         currentUserData?.name || currentUser.email,
      createdAt:         firebase.firestore.FieldValue.serverTimestamp(),
    });

    showToast('הסיכום נשלח בהצלחה!', 'success');
    document.getElementById('summaryForm').reset();
    document.getElementById('photo-preview').style.display = 'none';
    document.getElementById('photo-preview').innerHTML = '';
    navigateTo('summaries');
  } catch (e) {
    console.error(e);
    showToast('שגיאה בשליחת הסיכום: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> שלח סיכום למנהל';
  }
}

// ── Equipment ─────────────────────────────────────────────
let allEquipment = [];

function listenEquipment() {
  db.collection('equipment').orderBy('createdAt', 'desc').onSnapshot(snap => {
    allEquipment = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderEquipment();
  }, err => console.error('equipment listener:', err));
}

function renderEquipment() {
  const tbody = document.getElementById('equipment-body');
  if (!tbody) return;
  if (!allEquipment.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:32px">אין פריטי ציוד עדיין</td></tr>';
    return;
  }
  const statusMap = { good: ['תקין', 'var(--success)'], damaged: ['פגום', '#f5a623'], broken: ['מקולקל', 'var(--danger)'] };
  tbody.innerHTML = allEquipment.map(eq => {
    const [label, color] = statusMap[eq.status] || ['—', 'var(--text-3)'];
    return `<tr>
      <td><strong>${esc(eq.name || '—')}</strong></td>
      <td>${esc(eq.school || '—')}</td>
      <td>${eq.quantity || 1}</td>
      <td><span style="color:${color};font-weight:600">${label}</span></td>
      <td style="font-size:.85rem;color:var(--text-3)">${esc(eq.notes || '')}</td>
      <td>
        <button class="btn-ghost btn-sm" onclick="deleteEquipment('${eq.id}')" title="מחק">
          <i class="fas fa-trash" style="color:var(--danger)"></i>
        </button>
      </td>
    </tr>`;
  }).join('');
}

async function deleteEquipment(id) {
  if (!confirm('האם למחוק פריט זה?')) return;
  try {
    await db.collection('equipment').doc(id).delete();
    showToast('הפריט נמחק', 'info');
  } catch (e) {
    showToast('שגיאה במחיקה', 'error');
  }
}

// ── Lesson Plans ──────────────────────────────────────────
let allLessonPlans = [];

function listenLessonPlans() {
  db.collection('lessonPlans').orderBy('number', 'asc').onSnapshot(snap => {
    allLessonPlans = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderLessonPlans();
  }, err => console.error('lessonPlans listener:', err));
}

function renderLessonPlans() {
  const list = document.getElementById('lesson-plans-list');
  if (!list) return;
  if (!allLessonPlans.length) {
    list.innerHTML = '<p style="color:var(--text-3);padding:24px;text-align:center">אין מערכי שיעור עדיין</p>';
    return;
  }
  list.innerHTML = allLessonPlans.map(lp => `
    <div class="lesson-plan-card">
      <div style="display:flex;align-items:flex-start;gap:16px">
        <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,var(--primary),var(--primary-lighter));display:flex;align-items:center;justify-content:center;font-size:1.1rem;font-weight:900;color:white;flex-shrink:0">
          ${lp.number || '?'}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:1rem;margin-bottom:4px">${esc(lp.title || '—')}</div>
          <div style="font-size:.8rem;color:var(--text-3);margin-bottom:8px">${lp.date || ''}</div>
          ${lp.description ? `<div style="font-size:.875rem;color:var(--text-2);margin-bottom:8px">${esc(lp.description)}</div>` : ''}
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            ${lp.videoUrl ? `<a href="${lp.videoUrl}" target="_blank" rel="noopener" class="btn-ghost btn-sm" style="text-decoration:none"><i class="fab fa-youtube" style="color:#ff0000"></i> צפה בסרטון</a>` : ''}
            ${lp.fileUrl  ? `<a href="${lp.fileUrl}"  target="_blank" rel="noopener" class="btn-ghost btn-sm" style="text-decoration:none"><i class="fas fa-file-pdf" style="color:var(--primary-lighter)"></i> הורד קובץ</a>` : ''}
          </div>
        </div>
        ${currentUserData?.role === 'manager' ? `
        <button class="btn-ghost btn-sm" onclick="deleteLessonPlan('${lp.id}')" title="מחק">
          <i class="fas fa-trash" style="color:var(--danger)"></i>
        </button>` : ''}
      </div>
    </div>
  `).join('');
}

async function deleteLessonPlan(id) {
  if (!confirm('האם למחוק מערך שיעור זה?')) return;
  try {
    await db.collection('lessonPlans').doc(id).delete();
    showToast('מערך השיעור נמחק', 'info');
  } catch (e) {
    showToast('שגיאה במחיקה', 'error');
  }
}

// ── Gallery ───────────────────────────────────────────────
let galleryLoaded = false;

function renderGallery() {
  if (galleryLoaded) return;
  galleryLoaded = true;
  const grid = document.getElementById('gallery-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';
  db.collection('gallery').orderBy('createdAt', 'desc').limit(50).get().then(snap => {
    if (snap.empty) {
      grid.innerHTML = '<p style="color:var(--text-3);padding:24px;text-align:center;width:100%">אין תמונות עדיין</p>';
      return;
    }
    grid.innerHTML = snap.docs.map(d => {
      const data = d.data();
      return `<div class="photo-item">
        <img src="${data.url}" alt="${esc(data.name || '')}" loading="lazy"
             onclick="window.open('${data.url}','_blank')" style="cursor:pointer">
      </div>`;
    }).join('');
  }).catch(e => {
    grid.innerHTML = '<p style="color:var(--danger);padding:24px">שגיאה בטעינת הגלריה</p>';
    console.error(e);
  });
}

async function uploadGalleryPhotos(input) {
  if (!input.files?.length) return;
  const grid = document.getElementById('gallery-grid');
  showToast('מעלה תמונות...', 'info');
  try {
    for (const file of input.files) {
      const ref = storage.ref(`gallery/${Date.now()}_${file.name}`);
      await ref.put(file);
      const url = await ref.getDownloadURL();
      await db.collection('gallery').add({
        url,
        name:       file.name,
        uploadedBy: currentUser.uid,
        createdAt:  firebase.firestore.FieldValue.serverTimestamp(),
      });
      if (grid) {
        const div = document.createElement('div');
        div.className = 'photo-item';
        div.innerHTML = `<img src="${url}" alt="${esc(file.name)}" loading="lazy"
          onclick="window.open('${url}','_blank')" style="cursor:pointer">`;
        grid.prepend(div);
      }
    }
    galleryLoaded = false; // allow refresh
    showToast(`${input.files.length} תמונות הועלו בהצלחה!`, 'success');
    input.value = '';
    // Remove empty state
    const empty = grid?.querySelector('p');
    if (empty) empty.remove();
  } catch (e) {
    showToast('שגיאה בהעלאת תמונות: ' + e.message, 'error');
  }
}

// ── Sessions / Calendar ───────────────────────────────────
let allSessions = [];

function listenSessions() {
  db.collection('sessions').orderBy('date', 'asc').onSnapshot(snap => {
    allSessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (calendarInstance) {
      calendarInstance.removeAllEvents();
      calendarInstance.addEventSource(sessionsToEvents());
    }
    updateSessionStats();
    updateCoachTodaySessions();
  }, err => console.error('sessions listener:', err));
}

function sessionsToEvents() {
  return allSessions.map(s => ({
    id:    s.id,
    title: `${s.school || ''} ${s.group ? '— ' + s.group : ''}`,
    start: s.startTime ? `${s.date}T${s.startTime}` : s.date,
    end:   s.endTime   ? `${s.date}T${s.endTime}`   : undefined,
    extendedProps: s,
    color: '#e63946',
  }));
}

function initCalendar() {
  const el = document.getElementById('calendar');
  if (!el || calendarInstance) return;
  calendarInstance = new FullCalendar.Calendar(el, {
    locale:         'he',
    direction:      'rtl',
    initialView:    'dayGridMonth',
    headerToolbar: {
      start:  'prev,next today',
      center: 'title',
      end:    'dayGridMonth,timeGridWeek,timeGridDay',
    },
    events:         sessionsToEvents(),
    eventClick: ({ event }) => {
      const s = event.extendedProps;
      const timeStr = s.startTime ? ` | ${s.startTime}${s.endTime ? '–' + s.endTime : ''}` : '';
      alert(`${event.title}\nתאריך: ${s.date}${timeStr}\nמאמן: ${s.coachName || '—'}\n${s.notes ? 'הערות: ' + s.notes : ''}`);
    },
    height: 'auto',
    buttonText: { today: 'היום', month: 'חודש', week: 'שבוע', day: 'יום' },
  });
  calendarInstance.render();
}

// ── Messages ─────────────────────────────────────────────
let conversations       = [];
let messagesUnsubscribe = null;

function listenMessages() {
  db.collection('conversations')
    .where('participants', 'array-contains', currentUser.uid)
    .orderBy('updatedAt', 'desc')
    .onSnapshot(snap => {
      conversations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderConversationList();
      updateMessageBadge();
    }, err => console.error('messages listener:', err));
}

function renderConversationList() {
  const list = document.getElementById('message-list');
  if (!list) return;
  if (!conversations.length) {
    list.innerHTML = '<p style="color:var(--text-3);padding:16px;font-size:.85rem">אין שיחות עדיין</p>';
    return;
  }
  list.innerHTML = conversations.map(c => {
    const otherUid  = c.participants?.find(p => p !== currentUser.uid);
    const otherName = c.participantNames?.[otherUid] || 'לא ידוע';
    const unread    = c.unread?.[currentUser.uid] || 0;
    const last      = c.lastMessage || '';
    return `<div class="conv-item ${activeConversationId === c.id ? 'active' : ''}"
         onclick="openConversation('${c.id}','${esc(otherName)}','${otherUid}')"
         style="padding:14px 16px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;
                ${activeConversationId === c.id ? 'background:rgba(230,57,70,.1)' : ''}">
      <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--primary-lighter));display:flex;align-items:center;justify-content:center;font-weight:700;color:white;flex-shrink:0">
        ${otherName.charAt(0).toUpperCase()}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:.9rem">${esc(otherName)}</div>
        <div style="font-size:.78rem;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(last)}</div>
      </div>
      ${unread > 0 ? `<span style="background:var(--primary);color:white;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700">${unread}</span>` : ''}
    </div>`;
  }).join('');
}

function updateMessageBadge() {
  const total = conversations.reduce((sum, c) => sum + (c.unread?.[currentUser.uid] || 0), 0);
  const badge = document.getElementById('msg-badge');
  if (badge) {
    badge.textContent = total;
    badge.style.display = total > 0 ? '' : 'none';
  }
}

function openConversation(convId, otherName, otherUid) {
  activeConversationId = convId;
  renderConversationList();

  const panel = document.getElementById('chat-panel');
  const empty = document.getElementById('chat-empty');
  const header = document.getElementById('chat-header-name');
  if (panel)  { panel.style.display = 'flex'; }
  if (empty)  { empty.style.display = 'none'; }
  if (header) { header.textContent = otherName; }

  // Mark as read
  db.collection('conversations').doc(convId).update({
    [`unread.${currentUser.uid}`]: 0,
  }).catch(() => {});

  // Listen to messages in this conversation
  if (messagesUnsubscribe) messagesUnsubscribe();
  messagesUnsubscribe = db.collection('conversations').doc(convId)
    .collection('messages').orderBy('createdAt', 'asc')
    .onSnapshot(snap => {
      const thread = document.getElementById('messages-thread');
      if (!thread) return;
      thread.innerHTML = snap.docs.map(d => {
        const m    = d.data();
        const mine = m.senderUid === currentUser.uid;
        const time = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '';
        return `<div style="display:flex;justify-content:${mine ? 'flex-start' : 'flex-end'};margin-bottom:10px">
          <div style="max-width:70%;background:${mine ? 'var(--bg-2)' : 'var(--primary)'};padding:10px 14px;border-radius:${mine ? '4px 16px 16px 16px' : '16px 4px 16px 16px'};font-size:.9rem">
            <p style="margin:0">${esc(m.text || '')}</p>
            <span style="font-size:.68rem;opacity:.6;display:block;margin-top:4px;text-align:${mine ? 'right' : 'left'}">${time}</span>
          </div>
        </div>`;
      }).join('');
      thread.scrollTop = thread.scrollHeight;
    });
}

async function sendMessage() {
  const input = document.getElementById('msg-input');
  const text  = input?.value.trim();
  if (!text || !activeConversationId) return;
  input.value = '';

  try {
    await db.collection('conversations').doc(activeConversationId)
      .collection('messages').add({
        text,
        senderUid:  currentUser.uid,
        senderName: currentUserData?.name || currentUser.email,
        createdAt:  firebase.firestore.FieldValue.serverTimestamp(),
      });

    // Update conversation metadata
    const conv = conversations.find(c => c.id === activeConversationId);
    const otherUid = conv?.participants?.find(p => p !== currentUser.uid);
    const update = {
      lastMessage: text,
      updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (otherUid) update[`unread.${otherUid}`] = firebase.firestore.FieldValue.increment(1);
    await db.collection('conversations').doc(activeConversationId).update(update);
  } catch (e) {
    showToast('שגיאה בשליחת הודעה', 'error');
  }
}

// Enter key to send
document.getElementById('msg-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

function renderMessages() {
  // Called when messages section is navigated to — list already live via listener
}

// ── Modal helpers ─────────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.add('show'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('show'); }

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('show');
  });
});

// Lesson Plan Modal
function openLessonPlanModal()  { openModal('lessonPlanModal'); }
function closeLessonPlanModal() { closeModal('lessonPlanModal'); document.getElementById('lessonPlanForm')?.reset(); }

async function submitLessonPlan(event) {
  event.preventDefault();
  const btn = document.getElementById('submitLessonPlanBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px"></div> שומר...';
  try {
    let fileUrl = '';
    const fileEl = document.getElementById('lp-file');
    if (fileEl?.files[0]) {
      const ref = storage.ref(`lessonPlans/${Date.now()}_${fileEl.files[0].name}`);
      await ref.put(fileEl.files[0]);
      fileUrl = await ref.getDownloadURL();
    }
    await db.collection('lessonPlans').add({
      number:      parseInt(document.getElementById('lp-number').value),
      date:        document.getElementById('lp-date').value,
      title:       document.getElementById('lp-title').value.trim(),
      description: document.getElementById('lp-desc')?.value.trim() || '',
      videoUrl:    document.getElementById('lp-video')?.value.trim() || '',
      fileUrl,
      createdBy:   currentUser.uid,
      createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('מערך השיעור נשמר!', 'success');
    closeLessonPlanModal();
  } catch (e) {
    showToast('שגיאה: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> שמור מערך שיעור';
  }
}

// Session Modal
function openSessionModal() {
  populateCoachSelects();
  openModal('sessionModal');
}
function closeSessionModal() { closeModal('sessionModal'); document.getElementById('sessionForm')?.reset(); }

async function submitSession(event) {
  event.preventDefault();
  try {
    const coachId   = document.getElementById('sess-coach').value;
    const coachData = allCoaches.find(c => c.id === coachId);
    await db.collection('sessions').add({
      coachUid:   coachId,
      coachName:  coachData?.name || coachData?.email || '—',
      school:     document.getElementById('sess-school').value.trim(),
      group:      document.getElementById('sess-group')?.value.trim() || '',
      date:       document.getElementById('sess-date').value,
      startTime:  document.getElementById('sess-start')?.value || '',
      endTime:    document.getElementById('sess-end')?.value || '',
      notes:      document.getElementById('sess-notes')?.value.trim() || '',
      createdAt:  firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('האימון נוסף ללוח!', 'success');
    closeSessionModal();
  } catch (e) {
    showToast('שגיאה: ' + e.message, 'error');
  }
}

// Coach Modal
function openCoachModal()  { openModal('coachModal'); }
function closeCoachModal() { closeModal('coachModal'); document.getElementById('coachForm')?.reset(); }

async function submitCoach(event) {
  event.preventDefault();
  try {
    await db.collection('users').add({
      name:      document.getElementById('new-coach-name').value.trim(),
      phone:     document.getElementById('new-coach-phone')?.value.trim() || '',
      email:     document.getElementById('new-coach-email').value.trim(),
      role:      document.getElementById('new-coach-role').value,
      school:    document.getElementById('new-coach-school')?.value.trim() || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('חבר הצוות נוסף!', 'success');
    closeCoachModal();
  } catch (e) {
    showToast('שגיאה: ' + e.message, 'error');
  }
}

// Equipment Modal
function openEquipmentModal()  { openModal('equipmentModal'); }
function closeEquipmentModal() { closeModal('equipmentModal'); document.getElementById('equipmentForm')?.reset(); }

async function submitEquipment(event) {
  event.preventDefault();
  try {
    await db.collection('equipment').add({
      name:      document.getElementById('eq-name').value.trim(),
      school:    document.getElementById('eq-school').value.trim(),
      quantity:  parseInt(document.getElementById('eq-quantity').value) || 1,
      status:    document.getElementById('eq-status').value,
      notes:     document.getElementById('eq-notes')?.value.trim() || '',
      reportedBy: currentUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('הציוד דווח!', 'success');
    closeEquipmentModal();
  } catch (e) {
    showToast('שגיאה: ' + e.message, 'error');
  }
}

// New Message Modal
function openNewMessageModal() {
  populateCoachSelects();
  openModal('newMessageModal');
}
function closeNewMessageModal() { closeModal('newMessageModal'); document.getElementById('newMessageForm')?.reset(); }

async function submitNewMessage(event) {
  event.preventDefault();
  const toUid    = document.getElementById('msg-to').value;
  const content  = document.getElementById('msg-first-content').value.trim();
  if (!toUid || !content) return;

  try {
    const toUser = allCoaches.find(c => c.id === toUid);
    // Check if conversation already exists
    let convId = null;
    const existing = conversations.find(c =>
      c.participants?.includes(currentUser.uid) && c.participants?.includes(toUid)
    );
    if (existing) {
      convId = existing.id;
    } else {
      const ref = await db.collection('conversations').add({
        participants: [currentUser.uid, toUid],
        participantNames: {
          [currentUser.uid]: currentUserData?.name || currentUser.email,
          [toUid]: toUser?.name || toUser?.email || 'לא ידוע',
        },
        lastMessage: content,
        updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
        unread: { [toUid]: 1 },
      });
      convId = ref.id;
    }

    await db.collection('conversations').doc(convId).collection('messages').add({
      text:       content,
      senderUid:  currentUser.uid,
      senderName: currentUserData?.name || currentUser.email,
      createdAt:  firebase.firestore.FieldValue.serverTimestamp(),
    });

    if (existing) {
      await db.collection('conversations').doc(convId).update({
        lastMessage: content,
        updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
        [`unread.${toUid}`]: firebase.firestore.FieldValue.increment(1),
      });
    }

    showToast('ההודעה נשלחה!', 'success');
    closeNewMessageModal();
    navigateTo('messages');
    setTimeout(() => openConversation(convId, toUser?.name || 'לא ידוע', toUid), 400);
  } catch (e) {
    showToast('שגיאה בשליחת הודעה: ' + e.message, 'error');
  }
}

// ── Stats & dashboard helpers ─────────────────────────────
function loadDashboardStats() {
  // Coaches count
  db.collection('users').where('role', 'in', ['coach', 'coordinator']).get().then(snap => {
    const el = document.getElementById('stat-coaches');
    if (el) el.textContent = snap.size;
  });
}

function updateSessionStats() {
  // Sessions this week
  const now      = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  const fmt = d => d.toISOString().split('T')[0];
  const thisWeek = allSessions.filter(s => s.date >= fmt(startOfWeek) && s.date <= fmt(endOfWeek));
  const el = document.getElementById('stat-sessions');
  if (el) el.textContent = thisWeek.length;
}

function updateCoachStats() {
  // Summaries stat
  const sumEl = document.getElementById('stat-summaries');
  if (sumEl) {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const recent = allSummaries.filter(s => {
      const ts = s.createdAt?.toDate ? s.createdAt.toDate() : null;
      return ts && ts >= since;
    });
    sumEl.textContent = recent.length;
  }

  // Equipment issues
  const eqEl = document.getElementById('stat-equipment');
  if (eqEl) {
    eqEl.textContent = allEquipment.filter(e => e.status !== 'good').length;
  }

  // Coach-specific stats
  const coachSumEl = document.getElementById('stat-coach-summaries');
  if (coachSumEl) coachSumEl.textContent = allSummaries.length;
}

function updateCoachTodaySessions() {
  const today = new Date().toISOString().split('T')[0];
  const todays = allSessions.filter(s => s.date === today && s.coachUid === currentUser?.uid);
  const el = document.getElementById('stat-coach-today');
  if (el) el.textContent = todays.length;
  const totalEl = document.getElementById('stat-coach-sessions');
  if (totalEl) totalEl.textContent = allSessions.filter(s => s.coachUid === currentUser?.uid).length;

  // Today session info card
  const infoEl = document.getElementById('today-session-info');
  if (infoEl && todays.length) {
    infoEl.innerHTML = todays.map(s => `
      <div class="card" style="border-right:4px solid var(--primary)">
        <div class="card-title"><i class="fas fa-dumbbell" style="color:var(--primary-lighter)"></i> אימון היום</div>
        <div style="margin-top:12px">
          <div><strong>${esc(s.school)}</strong>${s.group ? ' — ' + esc(s.group) : ''}</div>
          ${s.startTime ? `<div style="color:var(--text-3);margin-top:4px"><i class="fas fa-clock"></i> ${s.startTime}${s.endTime ? '–' + s.endTime : ''}</div>` : ''}
        </div>
      </div>`).join('');
  }
}

// ── Toggle discipline / equipment details ──────────────────
document.getElementById('sum-discipline')?.addEventListener('change', function() {
  const row = document.getElementById('discipline-details-row');
  if (row) row.style.display = this.checked ? 'block' : 'none';
});

document.getElementById('sum-equipment')?.addEventListener('change', function() {
  const row = document.getElementById('equipment-details-row');
  if (row) row.style.display = this.checked ? 'block' : 'none';
});

// ── Utility ───────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
