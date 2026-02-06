// ============================================
// APP.JS - Hlavní aplikační logika
// Solar Tracker PWA
// ============================================

// ---- GLOBÁLNÍ STAV ----
let currentProject = null;
let currentWorkType = 'hourly';
let editingEntryId = null;

// ---- INICIALIZACE ----
document.addEventListener('DOMContentLoaded', async () => {
  // Registrace Service Workeru – RELATIVNÍ cesta + scope
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('./service-worker.js', {
        scope: './'
      });
      console.log('SW registrován, scope:', reg.scope);
    } catch (e) {
      console.warn('SW registrace selhala:', e);
    }
  }

  // Inicializace databáze
  try {
    await initDB();
    console.log('IndexedDB připravena');
  } catch (e) {
    console.error('DB chyba:', e);
    showToast('Chyba databáze!', true);
    return;
  }

  // Načtení projektů
  await loadProjects();

  // Poslední vybraný projekt
  const lastProject = localStorage.getItem('lastProject');
  if (lastProject) {
    const sel = document.getElementById('projectSelect');
    if (sel.querySelector(`option[value="${lastProject}"]`)) {
      sel.value = lastProject;
      onProjectChange();
    }
  }

  // Nastavit dnešní datum
  document.getElementById('entryDate').value = todayStr();

  // Nastavit aktuální měsíc pro statistiky
  document.getElementById('statsMonth').value = currentMonthStr();

  // Enter key pro inputy
  document.getElementById('newProjectName').addEventListener('keydown', e => {
    if (e.key === 'Enter') addNewProject();
  });
  document.getElementById('newEmployeeName').addEventListener('keydown', e => {
    if (e.key === 'Enter') addNewEmployee();
  });
});

// ---- POMOCNÉ FUNKCE ----

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function currentMonthStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

function getWeekday(dateStr) {
  const days = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
  return days[new Date(dateStr).getDay()];
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => toast.className = 'toast', 2500);
}

function showConfirm(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmBtn').onclick = () => {
    closeConfirm();
    onConfirm();
  };
  document.getElementById('confirmOverlay').classList.add('show');
}

function closeConfirm() {
  document.getElementById('confirmOverlay').classList.remove('show');
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
}

// ---- NAVIGACE ----

function openPage(pageId) {
  // Skrýt všechny stránky
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  // Speciální alias
  if (pageId === 'settings') pageId = 'pageSettings';

  // Zobrazit cílovou stránku
  const target = document.getElementById(pageId);
  if (target) target.classList.add('active');

  // Aktualizovat navigaci
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === pageId);
  });

  // FAB jen na dashboard
  const fabGroup = document.getElementById('fabGroup');
  fabGroup.style.display = (pageId === 'pageDashboard' && currentProject) ? 'flex' : 'none';

  // Akce pro konkrétní stránky
  if (pageId === 'pageStats' && currentProject) loadStats();
  if (pageId === 'pageEmployees' && currentProject) loadEmployees();
  if (pageId === 'pageSettings') { loadProjectList(); populateExportSelects(); }
}

// ---- PROJEKTY ----

async function loadProjects() {
  const projects = await getProjects();
  const sel = document.getElementById('projectSelect');
  const current = sel.value;

  sel.innerHTML = '<option value="">Vyber projekt...</option>';
  projects.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    sel.appendChild(opt);
  });

  if (current) sel.value = current;
  document.getElementById('headerProject').style.display = projects.length > 0 ? 'flex' : 'none';
}

async function loadProjectList() {
  const projects = await getProjects();
  const container = document.getElementById('projectList');

  if (projects.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Žádné projekty. Přidejte svůj první projekt výše.</p></div>';
    return;
  }

  container.innerHTML = projects.map(p => `
    <div class="project-item">
      <div>
        <div class="project-name">${escHtml(p.name)}</div>
        <div class="project-date">Vytvořen: ${formatDate(p.created.substring(0, 10))}</div>
      </div>
      <button class="btn btn-sm btn-danger" onclick="deleteProjectConfirm('${p.id}', '${escHtml(p.name)}')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    </div>
  `).join('');
}

async function addNewProject() {
  const input = document.getElementById('newProjectName');
  const name = input.value.trim();
  if (!name) return;

  try {
    const project = await addProject(name);
    input.value = '';
    await loadProjects();
    await loadProjectList();
    document.getElementById('projectSelect').value = project.id;
    onProjectChange();
    showToast(`Projekt "${name}" vytvořen`);
  } catch (e) {
    showToast('Chyba při vytváření projektu', true);
  }
}

function deleteProjectConfirm(id, name) {
  showConfirm('Smazat projekt?', `Opravdu chcete smazat projekt "${name}"?`, async () => {
    await deleteProject(id);
    if (currentProject === id) {
      currentProject = null;
      document.getElementById('projectSelect').value = '';
      localStorage.removeItem('lastProject');
    }
    await loadProjects();
    await loadProjectList();
    loadDashboard();
    showToast('Projekt smazán');
  });
}

async function onProjectChange() {
  const sel = document.getElementById('projectSelect');
  currentProject = sel.value || null;

  if (currentProject) {
    localStorage.setItem('lastProject', currentProject);
  } else {
    localStorage.removeItem('lastProject');
  }

  document.getElementById('fabGroup').style.display = currentProject ? 'flex' : 'none';
  loadDashboard();
}

// ---- ZAMĚSTNANCI ----

async function loadEmployees() {
  if (!currentProject) return;

  const employees = await getEmployees(currentProject);
  const container = document.getElementById('employeeList');

  if (employees.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        <h3>Žádní zaměstnanci</h3>
        <p>Přidejte zaměstnance pro tento projekt</p>
      </div>`;
    return;
  }

  container.innerHTML = employees.map(e => `
    <div class="employee-item">
      <div class="employee-name">
        <div class="employee-avatar">${getInitials(e.name)}</div>
        ${escHtml(e.name)}
      </div>
      <button class="btn btn-sm btn-danger btn-icon" onclick="deleteEmployeeConfirm('${e.id}', '${escHtml(e.name)}')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `).join('');
}

async function addNewEmployee() {
  if (!currentProject) {
    showToast('Nejdřív vyber projekt!', true);
    return;
  }

  const input = document.getElementById('newEmployeeName');
  const name = input.value.trim();
  if (!name) return;

  try {
    await addEmployee(name, currentProject);
    input.value = '';
    await loadEmployees();
    showToast(`${name} přidán/a`);
  } catch (e) {
    showToast('Chyba při přidávání', true);
  }
}

function deleteEmployeeConfirm(id, name) {
  showConfirm('Smazat zaměstnance?', `Opravdu chcete odebrat "${name}"?`, async () => {
    await deleteEmployee(id);
    await loadEmployees();
    showToast('Zaměstnanec odebrán');
  });
}

// ---- DASHBOARD (ZÁZNAMY) ----

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = d => d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');

  return { from: fmt(monday), to: fmt(sunday) };
}

async function loadWeekSummary() {
  const el = document.getElementById('weekSummary');
  if (!currentProject) { el.style.display = 'none'; return; }

  const week = getWeekRange();
  const entries = await getEntries(currentProject, week.from, week.to);

  if (entries.length === 0) { el.style.display = 'none'; return; }

  const days = new Set();
  let hours = 0, strings = 0;
  entries.forEach(e => { days.add(e.date); hours += e.hours; strings += e.strings; });

  document.getElementById('weekDays').textContent = days.size + ' dnů';
  document.getElementById('weekHours').textContent = hours.toFixed(1) + 'h';
  document.getElementById('weekStrings').textContent = strings + 's';
  el.style.display = 'block';
}

async function populateDashFilter() {
  if (!currentProject) return;
  const employees = await getEmployees(currentProject);
  const sel = document.getElementById('dashEmployeeFilter');
  const current = sel.value;
  sel.innerHTML = '<option value="">Všichni zaměstnanci</option>';
  employees.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = e.name;
    sel.appendChild(opt);
  });
  if (current) sel.value = current;
}

async function loadDashboard() {
  const container = document.getElementById('dashboardContent');
  const filterEl = document.getElementById('dashFilter');
  const weekEl = document.getElementById('weekSummary');

  if (!currentProject) {
    filterEl.style.display = 'none';
    weekEl.style.display = 'none';
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <h3>Vyber projekt</h3>
        <p>Zvol projekt v hlavičce nebo vytvoř nový v nastavení</p>
        <button class="btn btn-primary" onclick="openPage('settings')">Vytvořit projekt</button>
      </div>`;
    return;
  }

  // Populate filtr
  await populateDashFilter();
  filterEl.style.display = 'block';

  // Týdenní souhrn
  await loadWeekSummary();

  // Filtr zaměstnance
  const filterEmpId = document.getElementById('dashEmployeeFilter').value;

  let entries = await getAllEntries(currentProject);
  const employees = await getEmployees(currentProject);
  const empMap = {};
  employees.forEach(e => empMap[e.id] = e.name);

  // Aplikovat filtr
  if (filterEmpId) {
    entries = entries.filter(e => e.employeeId === filterEmpId);
  }

  if (entries.length === 0) {
    const filterName = filterEmpId ? empMap[filterEmpId] : null;
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <h3>${filterName ? 'Žádné záznamy pro ' + escHtml(filterName) : 'Žádné záznamy'}</h3>
        <p>${filterName ? 'Zkus změnit filtr nebo přidej záznamy' : 'Klikni na ➕ a přidej první záznam práce'}</p>
      </div>`;
    return;
  }

  // Zobrazit filtr badge pokud je aktivní
  let html = '';
  if (filterEmpId && empMap[filterEmpId]) {
    // Spočítat souhrn pro filtrovaného zaměstnance
    const totalH = entries.reduce((s, e) => s + e.hours, 0);
    const totalS = entries.reduce((s, e) => s + e.strings, 0);
    const daysSet = new Set(entries.map(e => e.date));
    html += `
      <div class="filter-active-badge">
        👤 ${escHtml(empMap[filterEmpId])} · ${totalH.toFixed(1)}h · ${totalS}s · ${daysSet.size} dnů
        <button onclick="document.getElementById('dashEmployeeFilter').value='';loadDashboard()">✕</button>
      </div>`;
  }

  // Seskupit po dnech
  const groups = {};
  entries.forEach(e => {
    if (!groups[e.date]) groups[e.date] = [];
    groups[e.date].push(e);
  });

  const dates = Object.keys(groups).sort().reverse();

  dates.forEach(date => {
    const dayEntries = groups[date];
    const totalHours = dayEntries.reduce((s, e) => s + e.hours, 0);
    const totalStrings = dayEntries.reduce((s, e) => s + e.strings, 0);

    html += `
      <div class="day-group">
        <div class="day-header">
          <div class="day-date">
            ${formatDate(date)}
            <span class="weekday">${getWeekday(date)}</span>
          </div>
          <div class="day-summary">
            <span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              ${totalHours}h
            </span>
            ${totalStrings > 0 ? `<span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              ${totalStrings}s
            </span>` : ''}
          </div>
        </div>`;

    dayEntries.forEach(entry => {
      const isHourly = entry.workType === 'hourly';
      html += `
        <div class="card entry-card ${isHourly ? 'hourly' : 'task'}">
          <div class="entry-header">
            <span class="entry-name">${escHtml(empMap[entry.employeeId] || 'Neznámý')}</span>
            <span class="badge ${isHourly ? 'badge-hourly' : 'badge-task'}">
              ${isHourly ? '⏱ Hodinovka' : '✓ Úkol'}
            </span>
          </div>
          <div class="entry-meta">
            <div class="entry-meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <strong>${entry.hours}h</strong>
            </div>
            ${entry.strings > 0 ? `
            <div class="entry-meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <strong>${entry.strings} stringů</strong>
            </div>` : ''}
          </div>
          ${entry.tables ? `<div class="entry-tables">🔧 Stoly: ${escHtml(entry.tables)}</div>` : ''}
          <div class="entry-actions">
            <button class="btn btn-sm btn-blue" onclick="editEntry('${entry.id}')">Upravit</button>
            <button class="btn btn-sm btn-danger" onclick="deleteEntryConfirm('${entry.id}')">Smazat</button>
          </div>
        </div>`;
    });

    html += `</div>`;
  });

  container.innerHTML = html;
}

// ---- NOVÝ / EDIT ZÁZNAM ----

async function openNewEntry() {
  if (!currentProject) {
    showToast('Nejdřív vyber projekt!', true);
    return;
  }

  editingEntryId = null;
  document.getElementById('modalEntryTitle').textContent = 'Nový záznam';
  document.getElementById('btnSaveEntry').innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
    Uložit záznam`;

  const employees = await getEmployees(currentProject);
  const sel = document.getElementById('entryEmployee');
  sel.innerHTML = '<option value="">Vyber zaměstnance...</option>';
  employees.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = e.name;
    sel.appendChild(opt);
  });

  if (employees.length === 0) {
    showToast('Nejdřív přidej zaměstnance v záložce Tým', true);
    return;
  }

  document.getElementById('entryDate').value = todayStr();
  document.getElementById('entryHours').value = '';
  document.getElementById('entryStrings').value = '';
  document.getElementById('entryTables').value = '';
  setWorkType('hourly');

  document.getElementById('modalEntry').classList.add('show');
}

async function editEntry(id) {
  const entries = await getAllEntries(currentProject);
  const entry = entries.find(e => e.id === id);
  if (!entry) return;

  editingEntryId = id;
  document.getElementById('modalEntryTitle').textContent = 'Upravit záznam';
  document.getElementById('btnSaveEntry').innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
    Aktualizovat`;

  const employees = await getEmployees(currentProject);
  const sel = document.getElementById('entryEmployee');
  sel.innerHTML = '<option value="">Vyber zaměstnance...</option>';
  employees.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = e.name;
    sel.appendChild(opt);
  });

  sel.value = entry.employeeId;
  document.getElementById('entryDate').value = entry.date;
  document.getElementById('entryHours').value = entry.hours;
  document.getElementById('entryStrings').value = entry.strings || '';
  document.getElementById('entryTables').value = entry.tables || '';
  setWorkType(entry.workType);

  document.getElementById('modalEntry').classList.add('show');
}

function setWorkType(type) {
  currentWorkType = type;
  document.getElementById('btnHourly').className = 'work-type-btn' + (type === 'hourly' ? ' active-hourly' : '');
  document.getElementById('btnTask').className = 'work-type-btn' + (type === 'task' ? ' active-task' : '');
  document.getElementById('stringsGroup').style.opacity = type === 'task' ? '1' : '0.4';
}

async function saveEntry() {
  const employeeId = document.getElementById('entryEmployee').value;
  const date = document.getElementById('entryDate').value;
  const hours = document.getElementById('entryHours').value;
  const strings = document.getElementById('entryStrings').value;
  const tables = document.getElementById('entryTables').value;

  if (!employeeId) { showToast('Vyber zaměstnance!', true); return; }
  if (!date) { showToast('Zadej datum!', true); return; }
  if (!hours || parseFloat(hours) <= 0) { showToast('Zadej hodiny!', true); return; }

  const data = {
    projectId: currentProject,
    employeeId,
    date,
    hours: parseFloat(hours),
    strings: currentWorkType === 'task' ? (parseInt(strings) || 0) : 0,
    tables: tables.trim(),
    workType: currentWorkType
  };

  try {
    if (editingEntryId) {
      const entries = await getAllEntries(currentProject);
      const existing = entries.find(e => e.id === editingEntryId);
      if (existing) {
        Object.assign(existing, data);
        await updateEntry(existing);
        showToast('Záznam aktualizován');
      }
    } else {
      await addEntry(data);
      showToast('Záznam uložen ✓');
    }

    closeModal();
    loadDashboard();
  } catch (e) {
    showToast('Chyba při ukládání!', true);
    console.error(e);
  }
}

function deleteEntryConfirm(id) {
  showConfirm('Smazat záznam?', 'Opravdu chcete smazat tento pracovní záznam?', async () => {
    await deleteEntry(id);
    loadDashboard();
    showToast('Záznam smazán');
  });
}

// ---- MODÁLY ----

function closeModal() {
  document.getElementById('modalEntry').classList.remove('show');
  editingEntryId = null;
}

function closeModalOnBg(event) {
  if (event.target === event.currentTarget) closeModal();
}

// ---- STATISTIKY ----

async function loadStats() {
  if (!currentProject) return;

  const month = document.getElementById('statsMonth').value || null;
  const stats = await getStats(currentProject, month);

  document.getElementById('statHours').textContent = stats.totalHours.toFixed(1);
  document.getElementById('statStrings').textContent = stats.totalStrings;
  document.getElementById('statDays').textContent = stats.workDaysCount;
  document.getElementById('statAvg').textContent = stats.avgHoursPerDay;

  // Přehled po zaměstnancích
  await loadEmployeeStats(month);

  // Naplnit export select
  await populateExportSelects();

  // Grafy
  await renderCharts(currentProject, month);
}

async function loadEmployeeStats(month) {
  const container = document.getElementById('employeeStatsContainer');
  const employees = await getEmployees(currentProject);

  let entries;
  if (month) {
    const from = month + '-01';
    const lastDay = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
    const to = month + '-' + String(lastDay).padStart(2, '0');
    entries = await getEntries(currentProject, from, to);
  } else {
    entries = await getAllEntries(currentProject);
  }

  if (employees.length === 0 || entries.length === 0) {
    container.innerHTML = '<p class="text-sm text-muted text-center" style="padding:16px">Žádná data</p>';
    return;
  }

  // Agregace per zaměstnanec
  const empData = {};
  employees.forEach(e => {
    empData[e.id] = { name: e.name, hours: 0, strings: 0, days: new Set(), hourlyH: 0, taskH: 0 };
  });

  entries.forEach(e => {
    if (!empData[e.employeeId]) return;
    empData[e.employeeId].hours += e.hours;
    empData[e.employeeId].strings += e.strings;
    empData[e.employeeId].days.add(e.date);
    if (e.workType === 'hourly') empData[e.employeeId].hourlyH += e.hours;
    else empData[e.employeeId].taskH += e.hours;
  });

  // Najít max hodin pro relativní bar
  const maxHours = Math.max(...Object.values(empData).map(d => d.hours), 1);

  // Seřadit od nejvíce hodin
  const sorted = Object.entries(empData)
    .filter(([, d]) => d.hours > 0)
    .sort((a, b) => b[1].hours - a[1].hours);

  if (sorted.length === 0) {
    container.innerHTML = '<p class="text-sm text-muted text-center" style="padding:16px">Žádná data</p>';
    return;
  }

  let html = '<div class="emp-stats-list">';
  sorted.forEach(([empId, d]) => {
    const avgPerDay = d.days.size > 0 ? (d.hours / d.days.size).toFixed(1) : 0;
    html += `
      <div class="emp-stat-card">
        <div class="emp-stat-info">
          <div class="emp-stat-name">
            <div class="employee-avatar" style="width:28px;height:28px;font-size:11px">${getInitials(d.name)}</div>
            ${escHtml(d.name)}
          </div>
          <div class="emp-stat-row">
            <div class="emp-stat-item">⏱ <strong>${d.hours.toFixed(1)}</strong>h</div>
            ${d.strings > 0 ? `<div class="emp-stat-item">✓ <strong>${d.strings}</strong>s</div>` : ''}
            <div class="emp-stat-item">📅 <strong>${d.days.size}</strong> dnů</div>
            <div class="emp-stat-item">Ø <strong>${avgPerDay}</strong>h/den</div>
          </div>
        </div>
        <div class="emp-stat-bar">
          <div class="emp-stat-bar-value">${d.hours.toFixed(0)}</div>
          <div class="emp-stat-bar-label">hodin</div>
        </div>
      </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}

async function populateExportSelects() {
  const employees = await getEmployees(currentProject);

  // Stats page export select
  const selStats = document.getElementById('exportEmployee');
  if (selStats) {
    const current = selStats.value;
    selStats.innerHTML = '<option value="">Všichni zaměstnanci</option>';
    employees.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.name;
      selStats.appendChild(opt);
    });
    if (current) selStats.value = current;
  }

  // Settings page export select
  const selSettings = document.getElementById('exportEmployeeSettings');
  if (selSettings) {
    const current = selSettings.value;
    selSettings.innerHTML = '<option value="">Všichni</option>';
    employees.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.name;
      selSettings.appendChild(opt);
    });
    if (current) selSettings.value = current;
  }
}

// ---- EXPORT ----

async function doExport() {
  if (!currentProject) {
    showToast('Nejdřív vyber projekt!', true);
    return;
  }

  const month = document.getElementById('exportMonth').value || null;
  const empId = document.getElementById('exportEmployeeSettings')?.value || null;
  await performExport(month, empId);
}

async function doExportFromStats() {
  if (!currentProject) {
    showToast('Nejdřív vyber projekt!', true);
    return;
  }

  const month = document.getElementById('exportMonthStats').value || null;
  const empId = document.getElementById('exportEmployee')?.value || null;
  await performExport(month, empId);
}

async function performExport(month, employeeId) {
  try {
    const csv = await exportToCSV(currentProject, month, employeeId);
    const projects = await getProjects();
    const proj = projects.find(p => p.id === currentProject);
    const name = proj ? proj.name : 'export';

    let suffix = month ? `_${month}` : '_komplet';
    if (employeeId) {
      const employees = await getEmployees(currentProject);
      const emp = employees.find(e => e.id === employeeId);
      if (emp) suffix += `_${emp.name.replace(/\s+/g, '-')}`;
    }

    downloadCSV(csv, `SolarTrack_${name}${suffix}.csv`);
    showToast('CSV exportováno ✓');
  } catch (e) {
    showToast('Chyba exportu!', true);
    console.error(e);
  }
}

// ---- HROMADNÉ ZADÁNÍ DNE ----

let batchWorkType = 'hourly';

async function openBatchEntry() {
  if (!currentProject) {
    showToast('Nejdřív vyber projekt!', true);
    return;
  }

  const employees = await getEmployees(currentProject);
  if (employees.length === 0) {
    showToast('Nejdřív přidej zaměstnance v záložce Tým', true);
    return;
  }

  // Nastavit datum na dnes
  document.getElementById('batchDate').value = todayStr();
  batchWorkType = 'hourly';
  setBatchWorkType('hourly');

  // Vygenerovat řádky pro každého zaměstnance
  const container = document.getElementById('batchEmployeeList');
  container.innerHTML = employees.map(emp => `
    <div class="batch-row" id="brow_${emp.id}" data-empid="${emp.id}">
      <div class="batch-row-header">
        <div class="batch-row-name">
          <div class="employee-avatar" style="width:26px;height:26px;font-size:11px">${getInitials(emp.name)}</div>
          ${escHtml(emp.name)}
        </div>
        <div class="batch-row-type">
          <button class="batch-type-btn sel-hourly" data-emp="${emp.id}" data-type="hourly"
                  onclick="toggleBatchRowType('${emp.id}','hourly')">⏱</button>
          <button class="batch-type-btn" data-emp="${emp.id}" data-type="task"
                  onclick="toggleBatchRowType('${emp.id}','task')">✓</button>
        </div>
      </div>
      <div class="batch-row-inputs">
        <div>
          <div class="batch-input-label">Hodiny</div>
          <input type="number" id="bh_${emp.id}" placeholder="0" step="0.5" min="0" max="24"
                 inputmode="decimal" oninput="updateBatchSummary()">
        </div>
        <div class="batch-strings-col" id="bsc_${emp.id}" style="opacity:0.4">
          <div class="batch-input-label">Stringy</div>
          <input type="number" id="bs_${emp.id}" placeholder="0" min="0"
                 inputmode="numeric" oninput="updateBatchSummary()">
        </div>
        <div>
          <div class="batch-input-label">Stoly</div>
          <input type="text" id="bt_${emp.id}" placeholder="3E42...">
        </div>
      </div>
    </div>
  `).join('');

  updateBatchSummary();
  document.getElementById('modalBatch').classList.add('show');
}

function setBatchWorkType(type) {
  batchWorkType = type;
  document.getElementById('batchBtnHourly').className =
    'work-type-btn' + (type === 'hourly' ? ' active-hourly' : '');
  document.getElementById('batchBtnTask').className =
    'work-type-btn' + (type === 'task' ? ' active-task' : '');

  // Přepnout výchozí typ u všech řádků
  document.querySelectorAll('.batch-row').forEach(row => {
    const empId = row.dataset.empid;
    toggleBatchRowType(empId, type);
  });
}

function toggleBatchRowType(empId, type) {
  const row = document.getElementById('brow_' + empId);
  const btnH = row.querySelector(`[data-emp="${empId}"][data-type="hourly"]`);
  const btnT = row.querySelector(`[data-emp="${empId}"][data-type="task"]`);
  const stringsCol = document.getElementById('bsc_' + empId);

  btnH.className = 'batch-type-btn' + (type === 'hourly' ? ' sel-hourly' : '');
  btnT.className = 'batch-type-btn' + (type === 'task' ? ' sel-task' : '');
  stringsCol.style.opacity = type === 'task' ? '1' : '0.4';

  // Uložit typ na řádek
  row.dataset.worktype = type;

  // Vizuální indikace
  row.classList.toggle('task-type', type === 'task');
}

function batchFillAllHours(hours) {
  document.querySelectorAll('.batch-row').forEach(row => {
    const empId = row.dataset.empid;
    document.getElementById('bh_' + empId).value = hours;
  });
  updateBatchSummary();
}

function batchClearAll() {
  document.querySelectorAll('.batch-row').forEach(row => {
    const empId = row.dataset.empid;
    document.getElementById('bh_' + empId).value = '';
    document.getElementById('bs_' + empId).value = '';
    document.getElementById('bt_' + empId).value = '';
  });
  updateBatchSummary();
}

function updateBatchSummary() {
  let count = 0;
  let totalHours = 0;
  let totalStrings = 0;

  document.querySelectorAll('.batch-row').forEach(row => {
    const empId = row.dataset.empid;
    const hours = parseFloat(document.getElementById('bh_' + empId).value) || 0;
    const strings = parseInt(document.getElementById('bs_' + empId).value) || 0;

    if (hours > 0) {
      count++;
      totalHours += hours;
      totalStrings += strings;
      row.classList.add('has-data');
    } else {
      row.classList.remove('has-data');
    }
  });

  const summary = document.getElementById('batchSummary');
  if (count === 0) {
    summary.innerHTML = '0 záznamů k uložení';
  } else {
    let text = `<strong>${count}</strong> záznamů · <strong>${totalHours}</strong>h`;
    if (totalStrings > 0) text += ` · <strong>${totalStrings}</strong> stringů`;
    summary.innerHTML = text;
  }
}

async function saveBatchEntries() {
  const date = document.getElementById('batchDate').value;
  if (!date) {
    showToast('Zadej datum!', true);
    return;
  }

  const rows = document.querySelectorAll('.batch-row');
  const toSave = [];

  rows.forEach(row => {
    const empId = row.dataset.empid;
    const hours = parseFloat(document.getElementById('bh_' + empId).value) || 0;
    const strings = parseInt(document.getElementById('bs_' + empId).value) || 0;
    const tables = document.getElementById('bt_' + empId).value.trim();
    const workType = row.dataset.worktype || batchWorkType;

    if (hours > 0) {
      toSave.push({
        projectId: currentProject,
        employeeId: empId,
        date: date,
        hours: hours,
        strings: workType === 'task' ? strings : 0,
        tables: tables,
        workType: workType
      });
    }
  });

  if (toSave.length === 0) {
    showToast('Zadej hodiny alespoň jednomu zaměstnanci', true);
    return;
  }

  try {
    for (const entry of toSave) {
      await addEntry(entry);
    }
    showToast(`${toSave.length} záznamů uloženo ✓`);
    closeBatchModal();
    loadDashboard();
  } catch (e) {
    showToast('Chyba při ukládání!', true);
    console.error(e);
  }
}

function closeBatchModal() {
  document.getElementById('modalBatch').classList.remove('show');
}

function closeBatchOnBg(event) {
  if (event.target === event.currentTarget) closeBatchModal();
}

// ---- BEZPEČNÝ HTML ----

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
