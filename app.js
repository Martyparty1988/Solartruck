// ============================================
// APP.JS - Solar Tracker v2
// ============================================

let currentProject = null;
let currentWorkType = 'hourly';
let editingEntryId = null;
let batchWorkType = 'hourly';
let searchWorkType = 'all';
let lastSearchResults = [];
let searchTimeout = null;

// ---- INIT ----
document.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./service-worker.js', { scope: './' }); }
    catch (e) { console.warn('SW fail:', e); }
  }
  try { await initDB(); } catch (e) { showToast('Chyba databáze!', true); return; }
  await loadProjects();
  const last = localStorage.getItem('lastProject');
  if (last) {
    const sel = document.getElementById('projectSelect');
    if (sel.querySelector(`option[value="${last}"]`)) { sel.value = last; onProjectChange(); }
  }
  document.getElementById('entryDate').value = todayStr();
  document.getElementById('statsMonth').value = currentMonthStr();
  document.getElementById('newProjectName').addEventListener('keydown', e => { if (e.key === 'Enter') addNewProject(); });
  document.getElementById('newEmployeeName').addEventListener('keydown', e => { if (e.key === 'Enter') addNewEmployee(); });
});

// ---- HELPERS ----
function todayStr() { const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function currentMonthStr() { const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function formatDate(s) { const [y,m,d]=s.split('-'); return `${d}.${m}.${y}`; }
function getWeekday(s) { return ['Ne','Po','Út','St','Čt','Pá','So'][new Date(s).getDay()]; }
function getInitials(n) { return n.split(' ').map(w=>w[0]).join('').toUpperCase().substring(0,2); }
function escHtml(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

function showToast(msg, err=false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (err ? ' error' : '');
  setTimeout(() => t.className = 'toast', 2500);
}

function showConfirm(title, msg, fn) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = msg;
  document.getElementById('confirmBtn').onclick = () => { closeConfirm(); fn(); };
  document.getElementById('confirmOverlay').classList.add('show');
}
function closeConfirm() { document.getElementById('confirmOverlay').classList.remove('show'); }

// ---- NAVIGATION ----
function openPage(pageId) {
  if (pageId === 'settings') pageId = 'pageSettings';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const t = document.getElementById(pageId);
  if (t) t.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === pageId));
  const fg = document.getElementById('fabGroup');
  fg.style.display = (pageId === 'pageDashboard' && currentProject) ? 'flex' : 'none';
  if (pageId === 'pageStats' && currentProject) loadStats();
  if (pageId === 'pageEmployees' && currentProject) loadEmployees();
  if (pageId === 'pageSettings') { loadProjectList(); populateExportSelects(); }
  if (pageId === 'pageSearch') initSearchPage();
}

// ---- PROJECTS ----
async function loadProjects() {
  const projects = await getProjects();
  const sel = document.getElementById('projectSelect');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Vyber projekt...</option>';
  projects.forEach(p => { const o=document.createElement('option'); o.value=p.id; o.textContent=p.name; sel.appendChild(o); });
  if (cur) sel.value = cur;
  document.getElementById('headerProject').style.display = projects.length > 0 ? 'flex' : 'none';
}

async function loadProjectList() {
  const projects = await getProjects();
  const c = document.getElementById('projectList');
  if (!projects.length) { c.innerHTML = '<div class="empty-state"><p>Žádné projekty.</p></div>'; return; }
  c.innerHTML = projects.map(p => `<div class="project-item"><div><div class="project-name">${escHtml(p.name)}</div><div class="project-date">Vytvořen: ${formatDate(p.created.substring(0,10))}</div></div><button class="btn btn-sm btn-danger" onclick="deleteProjectConfirm('${p.id}','${escHtml(p.name)}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div>`).join('');
}

async function addNewProject() {
  const i = document.getElementById('newProjectName'), n = i.value.trim(); if (!n) return;
  const p = await addProject(n); i.value = '';
  await loadProjects(); await loadProjectList();
  document.getElementById('projectSelect').value = p.id; onProjectChange();
  showToast(`Projekt "${n}" vytvořen`);
}

function deleteProjectConfirm(id, name) {
  showConfirm('Smazat projekt?', `Smazat "${name}"?`, async () => {
    await deleteProject(id);
    if (currentProject === id) { currentProject=null; document.getElementById('projectSelect').value=''; localStorage.removeItem('lastProject'); }
    await loadProjects(); await loadProjectList(); loadDashboard(); showToast('Smazáno');
  });
}

async function onProjectChange() {
  currentProject = document.getElementById('projectSelect').value || null;
  if (currentProject) localStorage.setItem('lastProject', currentProject); else localStorage.removeItem('lastProject');
  document.getElementById('fabGroup').style.display = currentProject ? 'flex' : 'none';
  loadDashboard();
}

// ---- EMPLOYEES ----
async function loadEmployees() {
  if (!currentProject) return;
  const emps = await getEmployees(currentProject);
  const c = document.getElementById('employeeList');
  if (!emps.length) { c.innerHTML = '<div class="empty-state"><h3>Žádní zaměstnanci</h3><p>Přidejte prvního</p></div>'; return; }
  c.innerHTML = emps.map(e => `<div class="employee-item"><div class="employee-name"><div class="employee-avatar">${getInitials(e.name)}</div>${escHtml(e.name)}</div><button class="btn btn-sm btn-danger btn-icon" onclick="deleteEmployeeConfirm('${e.id}','${escHtml(e.name)}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>`).join('');
}

async function addNewEmployee() {
  if (!currentProject) { showToast('Vyber projekt!', true); return; }
  const i = document.getElementById('newEmployeeName'), n = i.value.trim(); if (!n) return;
  await addEmployee(n, currentProject); i.value = ''; await loadEmployees(); showToast(`${n} přidán/a`);
}

function deleteEmployeeConfirm(id, name) {
  showConfirm('Odebrat?', `Odebrat "${name}"?`, async () => { await deleteEmployee(id); await loadEmployees(); showToast('Odebráno'); });
}

// ---- DASHBOARD ----
function getWeekRange() {
  const now=new Date(), day=now.getDay();
  const mon=new Date(now); mon.setDate(now.getDate()-(day===0?6:day-1));
  const sun=new Date(mon); sun.setDate(mon.getDate()+6);
  const f=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  return{from:f(mon),to:f(sun)};
}

async function loadWeekSummary() {
  const el=document.getElementById('weekSummary');
  if (!currentProject) { el.style.display='none'; return; }
  const w=getWeekRange(), entries=await getEntries(currentProject,w.from,w.to);
  if (!entries.length) { el.style.display='none'; return; }
  const days=new Set(); let h=0,s=0;
  entries.forEach(e=>{days.add(e.date);h+=e.hours;s+=e.strings});
  document.getElementById('weekDays').textContent=days.size+' dnů';
  document.getElementById('weekHours').textContent=h.toFixed(1)+'h';
  document.getElementById('weekStrings').textContent=s+'s';
  el.style.display='block';
}

async function populateDashFilter() {
  if (!currentProject) return;
  const emps=await getEmployees(currentProject), sel=document.getElementById('dashEmployeeFilter'), cur=sel.value;
  sel.innerHTML='<option value="">Všichni zaměstnanci</option>';
  emps.forEach(e=>{const o=document.createElement('option');o.value=e.id;o.textContent=e.name;sel.appendChild(o)});
  if (cur) sel.value=cur;
}

async function loadDashboard() {
  const c=document.getElementById('dashboardContent'), fEl=document.getElementById('dashFilter'), wEl=document.getElementById('weekSummary');
  if (!currentProject) {
    fEl.style.display='none'; wEl.style.display='none';
    c.innerHTML='<div class="empty-state"><h3>Vyber projekt</h3><p>Zvol projekt v hlavičce</p><button class="btn btn-primary" onclick="openPage(\'pageSettings\')">Vytvořit</button></div>'; return;
  }
  await populateDashFilter(); fEl.style.display='block'; await loadWeekSummary();
  const filterEmp=document.getElementById('dashEmployeeFilter').value;
  let entries=await getAllEntries(currentProject);
  const emps=await getEmployees(currentProject), empMap={};
  emps.forEach(e=>empMap[e.id]=e.name);
  if (filterEmp) entries=entries.filter(e=>e.employeeId===filterEmp);
  if (!entries.length) {
    const fn=filterEmp?empMap[filterEmp]:null;
    c.innerHTML=`<div class="empty-state"><h3>${fn?'Žádné záznamy pro '+escHtml(fn):'Žádné záznamy'}</h3><p>${fn?'Zkus změnit filtr':'Klikni ➕'}</p></div>`; return;
  }
  let html='';
  if (filterEmp && empMap[filterEmp]) {
    const tH=entries.reduce((s,e)=>s+e.hours,0), tS=entries.reduce((s,e)=>s+e.strings,0), ds=new Set(entries.map(e=>e.date));
    html+=`<div class="filter-active-badge">👤 ${escHtml(empMap[filterEmp])} · ${tH.toFixed(1)}h · ${tS}s · ${ds.size}d<button onclick="document.getElementById('dashEmployeeFilter').value='';loadDashboard()">✕</button></div>`;
  }
  html += renderEntryGroups(entries, empMap);
  c.innerHTML = html;
}

function renderEntryGroups(entries, empMap, highlightText) {
  const groups={};
  entries.forEach(e=>{if(!groups[e.date])groups[e.date]=[];groups[e.date].push(e)});
  const dates=Object.keys(groups).sort().reverse();
  let html='';
  dates.forEach(date=>{
    const de=groups[date], tH=de.reduce((s,e)=>s+e.hours,0), tS=de.reduce((s,e)=>s+e.strings,0);
    html+=`<div class="day-group"><div class="day-header"><div class="day-date">${formatDate(date)}<span class="weekday">${getWeekday(date)}</span></div><div class="day-summary"><span>${tH}h</span>${tS>0?`<span>${tS}s</span>`:''}</div></div>`;
    de.forEach(entry=>{
      const isH=entry.workType==='hourly';
      let name=escHtml(empMap[entry.employeeId]||'Neznámý');
      let tables=entry.tables?escHtml(entry.tables):'';
      if (highlightText) { name=hlText(name,highlightText); tables=hlText(tables,highlightText); }
      html+=`<div class="card entry-card ${isH?'hourly':'task'}"><div class="entry-header"><span class="entry-name">${name}</span><span class="badge ${isH?'badge-hourly':'badge-task'}">${isH?'⏱ Hod.':'✓ Úkol'}</span></div><div class="entry-meta"><div class="entry-meta-item"><strong>${entry.hours}h</strong></div>${entry.strings>0?`<div class="entry-meta-item"><strong>${entry.strings}s</strong></div>`:''}</div>${entry.tables?`<div class="entry-tables">🔧 ${tables}</div>`:''}
<div class="entry-actions"><button class="btn btn-sm btn-ghost" onclick="editEntry('${entry.id}')">Upravit</button><button class="btn btn-sm btn-danger" onclick="deleteEntryConfirm('${entry.id}')">Smazat</button></div></div>`;
    });
    html+='</div>';
  });
  return html;
}

function hlText(text, query) {
  if (!query) return text;
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${esc})`, 'gi'), '<span class="highlight">$1</span>');
}

// ---- SINGLE ENTRY ----
async function openNewEntry() {
  if (!currentProject) { showToast('Vyber projekt!',true); return; }
  editingEntryId=null;
  document.getElementById('modalEntryTitle').textContent='Nový záznam';
  document.getElementById('btnSaveEntry').innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Uložit';
  const emps=await getEmployees(currentProject), sel=document.getElementById('entryEmployee');
  sel.innerHTML='<option value="">Vyber...</option>';
  emps.forEach(e=>{const o=document.createElement('option');o.value=e.id;o.textContent=e.name;sel.appendChild(o)});
  if (!emps.length) { showToast('Přidej zaměstnance',true); return; }
  document.getElementById('entryDate').value=todayStr();
  document.getElementById('entryHours').value='';
  document.getElementById('entryStrings').value='';
  document.getElementById('entryTables').value='';
  setWorkType('hourly');
  document.getElementById('modalEntry').classList.add('show');
}

async function editEntry(id) {
  const entries=await getAllEntries(currentProject), entry=entries.find(e=>e.id===id); if(!entry) return;
  editingEntryId=id;
  document.getElementById('modalEntryTitle').textContent='Upravit';
  document.getElementById('btnSaveEntry').innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Uložit';
  const emps=await getEmployees(currentProject), sel=document.getElementById('entryEmployee');
  sel.innerHTML='<option value="">Vyber...</option>';
  emps.forEach(e=>{const o=document.createElement('option');o.value=e.id;o.textContent=e.name;sel.appendChild(o)});
  sel.value=entry.employeeId;
  document.getElementById('entryDate').value=entry.date;
  document.getElementById('entryHours').value=entry.hours;
  document.getElementById('entryStrings').value=entry.strings||'';
  document.getElementById('entryTables').value=entry.tables||'';
  setWorkType(entry.workType);
  document.getElementById('modalEntry').classList.add('show');
}

function setWorkType(t) {
  currentWorkType=t;
  document.getElementById('btnHourly').className='work-type-btn'+(t==='hourly'?' active-hourly':'');
  document.getElementById('btnTask').className='work-type-btn'+(t==='task'?' active-task':'');
  document.getElementById('stringsGroup').style.opacity=t==='task'?'1':'0.4';
}

async function saveEntry() {
  const empId=document.getElementById('entryEmployee').value, date=document.getElementById('entryDate').value;
  const hours=document.getElementById('entryHours').value, strings=document.getElementById('entryStrings').value;
  const tables=document.getElementById('entryTables').value;
  if (!empId) { showToast('Vyber zaměstnance!',true); return; }
  if (!date) { showToast('Zadej datum!',true); return; }
  if (!hours||parseFloat(hours)<=0) { showToast('Zadej hodiny!',true); return; }
  const data={projectId:currentProject,employeeId:empId,date,hours:parseFloat(hours),strings:currentWorkType==='task'?(parseInt(strings)||0):0,tables:tables.trim(),workType:currentWorkType};
  try {
    if (editingEntryId) { const es=await getAllEntries(currentProject),ex=es.find(e=>e.id===editingEntryId); if(ex){Object.assign(ex,data);await updateEntry(ex);} showToast('Aktualizováno'); }
    else { await addEntry(data); showToast('Uloženo ✓'); }
    closeModal(); loadDashboard();
  } catch(e) { showToast('Chyba!',true); }
}

function deleteEntryConfirm(id) { showConfirm('Smazat?','Smazat záznam?',async()=>{await deleteEntry(id);loadDashboard();showToast('Smazáno')}); }
function closeModal() { document.getElementById('modalEntry').classList.remove('show'); editingEntryId=null; }
function closeModalOnBg(e) { if(e.target===e.currentTarget)closeModal(); }

// ---- BATCH ENTRY ----
async function openBatchEntry() {
  if (!currentProject) { showToast('Vyber projekt!',true); return; }
  const emps=await getEmployees(currentProject);
  if (!emps.length) { showToast('Přidej zaměstnance',true); return; }
  document.getElementById('batchDate').value=todayStr();
  batchWorkType='hourly'; setBatchWorkType('hourly');
  const c=document.getElementById('batchEmployeeList');
  c.innerHTML=emps.map(emp=>`<div class="batch-row" id="brow_${emp.id}" data-empid="${emp.id}"><div class="batch-row-header"><div class="batch-row-name"><div class="employee-avatar" style="width:24px;height:24px;font-size:10px">${getInitials(emp.name)}</div>${escHtml(emp.name)}</div><div class="batch-row-type"><button class="batch-type-btn sel-hourly" data-emp="${emp.id}" data-type="hourly" onclick="toggleBatchRowType('${emp.id}','hourly')">⏱</button><button class="batch-type-btn" data-emp="${emp.id}" data-type="task" onclick="toggleBatchRowType('${emp.id}','task')">✓</button></div></div><div class="batch-row-inputs"><div><div class="batch-input-label">Hodiny</div><input type="number" id="bh_${emp.id}" placeholder="0" step="0.5" min="0" max="24" inputmode="decimal" oninput="updateBatchSummary()"></div><div class="batch-strings-col" id="bsc_${emp.id}" style="opacity:0.4"><div class="batch-input-label">Stringy</div><input type="number" id="bs_${emp.id}" placeholder="0" min="0" inputmode="numeric" oninput="updateBatchSummary()"></div><div><div class="batch-input-label">Stoly</div><input type="text" id="bt_${emp.id}" placeholder="3E42..."></div></div></div>`).join('');
  updateBatchSummary();
  document.getElementById('modalBatch').classList.add('show');
}

function setBatchWorkType(t) {
  batchWorkType=t;
  document.getElementById('batchBtnHourly').className='work-type-btn'+(t==='hourly'?' active-hourly':'');
  document.getElementById('batchBtnTask').className='work-type-btn'+(t==='task'?' active-task':'');
  document.querySelectorAll('.batch-row').forEach(r=>toggleBatchRowType(r.dataset.empid,t));
}

function toggleBatchRowType(empId,t) {
  const r=document.getElementById('brow_'+empId);
  r.querySelector(`[data-emp="${empId}"][data-type="hourly"]`).className='batch-type-btn'+(t==='hourly'?' sel-hourly':'');
  r.querySelector(`[data-emp="${empId}"][data-type="task"]`).className='batch-type-btn'+(t==='task'?' sel-task':'');
  document.getElementById('bsc_'+empId).style.opacity=t==='task'?'1':'0.4';
  r.dataset.worktype=t; r.classList.toggle('task-type',t==='task');
}

function batchFillAllHours(h) { document.querySelectorAll('.batch-row').forEach(r=>{document.getElementById('bh_'+r.dataset.empid).value=h}); updateBatchSummary(); }
function batchClearAll() { document.querySelectorAll('.batch-row').forEach(r=>{const id=r.dataset.empid;document.getElementById('bh_'+id).value='';document.getElementById('bs_'+id).value='';document.getElementById('bt_'+id).value=''}); updateBatchSummary(); }

function updateBatchSummary() {
  let cnt=0,tH=0,tS=0;
  document.querySelectorAll('.batch-row').forEach(r=>{const id=r.dataset.empid,h=parseFloat(document.getElementById('bh_'+id).value)||0,s=parseInt(document.getElementById('bs_'+id).value)||0;if(h>0){cnt++;tH+=h;tS+=s;r.classList.add('has-data')}else{r.classList.remove('has-data')}});
  document.getElementById('batchSummary').innerHTML=cnt===0?'0 záznamů':`<strong>${cnt}</strong> zázn. · <strong>${tH}</strong>h`+(tS>0?` · <strong>${tS}</strong>s`:'');
}

async function saveBatchEntries() {
  const date=document.getElementById('batchDate').value; if(!date){showToast('Datum!',true);return;}
  const toSave=[];
  document.querySelectorAll('.batch-row').forEach(r=>{const id=r.dataset.empid,h=parseFloat(document.getElementById('bh_'+id).value)||0,s=parseInt(document.getElementById('bs_'+id).value)||0,t=document.getElementById('bt_'+id).value.trim(),wt=r.dataset.worktype||batchWorkType;if(h>0)toSave.push({projectId:currentProject,employeeId:id,date,hours:h,strings:wt==='task'?s:0,tables:t,workType:wt})});
  if (!toSave.length) { showToast('Zadej hodiny!',true); return; }
  for (const e of toSave) await addEntry(e);
  showToast(`${toSave.length} uloženo ✓`); closeBatchModal(); loadDashboard();
}

function closeBatchModal() { document.getElementById('modalBatch').classList.remove('show'); }
function closeBatchOnBg(e) { if(e.target===e.currentTarget) closeBatchModal(); }

// ---- SEARCH ----
async function initSearchPage() {
  if (!currentProject) return;
  const emps=await getEmployees(currentProject), sel=document.getElementById('searchEmployee');
  const cur=sel.value;
  sel.innerHTML='<option value="">Všichni</option>';
  emps.forEach(e=>{const o=document.createElement('option');o.value=e.id;o.textContent=e.name;sel.appendChild(o)});
  if (cur) sel.value=cur;
}

function toggleFilters() {
  const f=document.getElementById('searchFilters');
  f.style.display=f.style.display==='none'?'block':'none';
}

function setSearchType(t) {
  searchWorkType=t;
  document.querySelectorAll('[data-stype]').forEach(b=>b.classList.toggle('chip-active',b.dataset.stype===t));
}

function clearFilters() {
  document.getElementById('searchEmployee').value='';
  document.getElementById('searchDateFrom').value='';
  document.getElementById('searchDateTo').value='';
  document.getElementById('searchHoursMin').value='';
  document.getElementById('searchHoursMax').value='';
  setSearchType('all');
  updateFilterCount();
}

function clearSearch() {
  document.getElementById('searchInput').value='';
  document.getElementById('searchClear').style.display='none';
  document.getElementById('searchSummary').style.display='none';
  document.getElementById('searchResults').innerHTML='';
  document.getElementById('searchExport').style.display='none';
  lastSearchResults=[];
}

function onSearchInput() {
  const v=document.getElementById('searchInput').value;
  document.getElementById('searchClear').style.display=v?'block':'none';
  clearTimeout(searchTimeout);
  searchTimeout=setTimeout(()=>{ if(v.length>=1) executeSearch(); else clearSearch(); }, 300);
}

function updateFilterCount() {
  let cnt=0;
  if (document.getElementById('searchEmployee').value) cnt++;
  if (document.getElementById('searchDateFrom').value) cnt++;
  if (document.getElementById('searchDateTo').value) cnt++;
  if (searchWorkType!=='all') cnt++;
  if (document.getElementById('searchHoursMin').value) cnt++;
  if (document.getElementById('searchHoursMax').value) cnt++;
  const badge=document.getElementById('filterCount');
  if (cnt>0) { badge.textContent=cnt; badge.style.display='inline'; }
  else { badge.style.display='none'; }
}

async function executeSearch() {
  if (!currentProject) { showToast('Vyber projekt!',true); return; }
  updateFilterCount();

  const query=(document.getElementById('searchInput').value||'').trim().toLowerCase();
  const empFilter=document.getElementById('searchEmployee').value;
  const dateFrom=document.getElementById('searchDateFrom').value;
  const dateTo=document.getElementById('searchDateTo').value;
  const hoursMin=parseFloat(document.getElementById('searchHoursMin').value)||0;
  const hoursMax=parseFloat(document.getElementById('searchHoursMax').value)||999;

  let entries=await getAllEntries(currentProject);
  const emps=await getEmployees(currentProject), empMap={};
  emps.forEach(e=>empMap[e.id]=e.name);

  // Apply filters
  entries=entries.filter(e=>{
    if (empFilter && e.employeeId!==empFilter) return false;
    if (dateFrom && e.date<dateFrom) return false;
    if (dateTo && e.date>dateTo) return false;
    if (searchWorkType!=='all' && e.workType!==searchWorkType) return false;
    if (e.hours<hoursMin || e.hours>hoursMax) return false;
    if (query) {
      const name=(empMap[e.employeeId]||'').toLowerCase();
      const tables=(e.tables||'').toLowerCase();
      const date=e.date;
      const fDate=formatDate(e.date).toLowerCase();
      if (!name.includes(query) && !tables.includes(query) && !date.includes(query) && !fDate.includes(query) && !String(e.hours).includes(query) && !String(e.strings).includes(query)) return false;
    }
    return true;
  });

  lastSearchResults=entries;

  const sumEl=document.getElementById('searchSummary');
  const resEl=document.getElementById('searchResults');
  const expEl=document.getElementById('searchExport');

  if (!entries.length) {
    sumEl.innerHTML='Nic nenalezeno'; sumEl.style.display='block';
    resEl.innerHTML=''; expEl.style.display='none'; return;
  }

  const tH=entries.reduce((s,e)=>s+e.hours,0);
  const tS=entries.reduce((s,e)=>s+e.strings,0);
  sumEl.innerHTML=`Nalezeno <strong>${entries.length}</strong> · <strong>${tH.toFixed(1)}</strong>h · <strong>${tS}</strong>s`;
  sumEl.style.display='block';
  expEl.style.display='block';

  resEl.innerHTML=renderEntryGroups(entries, empMap, query);
}

async function exportSearchResults() {
  if (!lastSearchResults.length) { showToast('Žádné výsledky',true); return; }
  const projects=await getProjects(), proj=projects.find(p=>p.id===currentProject);
  const emps=await getEmployees(currentProject), empMap={};
  emps.forEach(e=>empMap[e.id]=e.name);
  let csv='Projekt;Datum;Jméno;Hodiny;Stringy;Typ práce;Stoly\n';
  lastSearchResults.forEach(e=>{
    csv+=[proj?proj.name:'',e.date,empMap[e.employeeId]||'',e.hours,e.strings,e.workType==='hourly'?'Hodinovka':'Úkol/Stringy','"'+(e.tables||'').replace(/"/g,'""')+'"'].join(';')+'\n';
  });
  downloadCSV(csv,`SolarTrack_hledani_${todayStr()}.csv`);
  showToast('CSV exportováno ✓');
}

// ---- STATS ----
async function loadStats() {
  if (!currentProject) return;
  const month=document.getElementById('statsMonth').value||null;
  const stats=await getStats(currentProject,month);
  document.getElementById('statHours').textContent=stats.totalHours.toFixed(1);
  document.getElementById('statStrings').textContent=stats.totalStrings;
  document.getElementById('statDays').textContent=stats.workDaysCount;
  document.getElementById('statAvg').textContent=stats.avgHoursPerDay;
  await loadEmployeeStats(month);
  await populateExportSelects();
  await renderCharts(currentProject,month);
}

async function loadEmployeeStats(month) {
  const c=document.getElementById('employeeStatsContainer');
  const emps=await getEmployees(currentProject);
  let entries; if(month){const f=month+'-01',l=new Date(parseInt(month.split('-')[0]),parseInt(month.split('-')[1]),0).getDate(),t=month+'-'+String(l).padStart(2,'0');entries=await getEntries(currentProject,f,t)}else{entries=await getAllEntries(currentProject)}
  if (!emps.length||!entries.length) { c.innerHTML='<p class="text-sm text-muted text-center" style="padding:14px">Žádná data</p>'; return; }
  const ed={};
  emps.forEach(e=>{ed[e.id]={name:e.name,hours:0,strings:0,days:new Set()}});
  entries.forEach(e=>{if(!ed[e.employeeId])return;ed[e.employeeId].hours+=e.hours;ed[e.employeeId].strings+=e.strings;ed[e.employeeId].days.add(e.date)});
  const sorted=Object.entries(ed).filter(([,d])=>d.hours>0).sort((a,b)=>b[1].hours-a[1].hours);
  if (!sorted.length) { c.innerHTML='<p class="text-sm text-muted text-center" style="padding:14px">Žádná data</p>'; return; }
  let html='<div class="emp-stats-list">';
  sorted.forEach(([,d])=>{const avg=d.days.size>0?(d.hours/d.days.size).toFixed(1):0;html+=`<div class="emp-stat-card"><div class="emp-stat-info"><div class="emp-stat-name"><div class="employee-avatar" style="width:26px;height:26px;font-size:10px">${getInitials(d.name)}</div>${escHtml(d.name)}</div><div class="emp-stat-row"><div class="emp-stat-item">⏱ <strong>${d.hours.toFixed(1)}</strong>h</div>${d.strings>0?`<div class="emp-stat-item">✓ <strong>${d.strings}</strong>s</div>`:''}<div class="emp-stat-item">📅 <strong>${d.days.size}</strong>d</div><div class="emp-stat-item">Ø <strong>${avg}</strong>h/d</div></div></div><div class="emp-stat-bar"><div class="emp-stat-bar-value">${d.hours.toFixed(0)}</div><div class="emp-stat-bar-label">hodin</div></div></div>`});
  html+='</div>'; c.innerHTML=html;
}

async function populateExportSelects() {
  const emps=await getEmployees(currentProject);
  ['exportEmployee','exportEmployeeSettings'].forEach(id=>{
    const sel=document.getElementById(id); if(!sel)return;
    const cur=sel.value; sel.innerHTML='<option value="">Všichni</option>';
    emps.forEach(e=>{const o=document.createElement('option');o.value=e.id;o.textContent=e.name;sel.appendChild(o)});
    if(cur)sel.value=cur;
  });
}

// ---- EXPORT ----
async function doExport() {
  if (!currentProject) { showToast('Vyber projekt!',true); return; }
  await performExport(document.getElementById('exportMonth').value||null,document.getElementById('exportEmployeeSettings')?.value||null);
}
async function doExportFromStats() {
  if (!currentProject) { showToast('Vyber projekt!',true); return; }
  await performExport(document.getElementById('exportMonthStats').value||null,document.getElementById('exportEmployee')?.value||null);
}
async function performExport(month,empId) {
  try {
    const csv=await exportToCSV(currentProject,month,empId);
    const projs=await getProjects(), proj=projs.find(p=>p.id===currentProject);
    let sfx=month?`_${month}`:'_komplet';
    if(empId){const es=await getEmployees(currentProject),em=es.find(e=>e.id===empId);if(em)sfx+=`_${em.name.replace(/\s+/g,'-')}`}
    downloadCSV(csv,`SolarTrack_${proj?proj.name:'export'}${sfx}.csv`);
    showToast('CSV ✓');
  } catch(e) { showToast('Chyba!',true); }
}

// ---- ZÁLOHA / OBNOVA ----

async function doBackup() {
  try {
    const stats = await createBackup();
    showToast(`Záloha stažena (${stats.projects} proj, ${stats.employees} zam, ${stats.entries} zázn)`);
  } catch(e) {
    showToast('Chyba zálohy!', true);
    console.error(e);
  }
}

async function doRestore(input) {
  const file = input.files[0];
  if (!file) return;

  showConfirm(
    '⚠️ Obnovit ze zálohy?',
    'Všechna stávající data budou nahrazena daty ze zálohy. Tuto akci nelze vrátit!',
    async () => {
      try {
        const result = await restoreBackup(file);
        showToast(`Obnoveno! ${result.projects} proj, ${result.employees} zam, ${result.entries} zázn`);

        // Refresh všeho
        currentProject = null;
        localStorage.removeItem('lastProject');
        await loadProjects();
        await loadProjectList();

        // Vybrat první projekt pokud existuje
        const sel = document.getElementById('projectSelect');
        if (sel.options.length > 1) {
          sel.selectedIndex = 1;
          onProjectChange();
        } else {
          loadDashboard();
        }
      } catch(e) {
        showToast(typeof e === 'string' ? e : 'Chyba obnovy!', true);
        console.error(e);
      }
    }
  );

  // Reset inputu aby šlo znovu vybrat stejný soubor
  input.value = '';
}
