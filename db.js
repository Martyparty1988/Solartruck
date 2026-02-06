// ============================================
// DB.JS - IndexedDB databázová vrstva
// Offline-first ukládání dat
// ============================================

const DB_NAME = 'SolarTrackerDB';
const DB_VERSION = 1;

let db = null;

/**
 * Inicializace databáze
 */
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains('projects')) {
        const projectStore = database.createObjectStore('projects', { keyPath: 'id' });
        projectStore.createIndex('name', 'name', { unique: false });
        projectStore.createIndex('created', 'created', { unique: false });
      }

      if (!database.objectStoreNames.contains('employees')) {
        const empStore = database.createObjectStore('employees', { keyPath: 'id' });
        empStore.createIndex('name', 'name', { unique: false });
        empStore.createIndex('projectId', 'projectId', { unique: false });
      }

      if (!database.objectStoreNames.contains('entries')) {
        const entryStore = database.createObjectStore('entries', { keyPath: 'id' });
        entryStore.createIndex('projectId', 'projectId', { unique: false });
        entryStore.createIndex('employeeId', 'employeeId', { unique: false });
        entryStore.createIndex('date', 'date', { unique: false });
        entryStore.createIndex('project_date', ['projectId', 'date'], { unique: false });
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = (event) => {
      reject('Chyba při otevírání databáze: ' + event.target.error);
    };
  });
}

// ---- PROJEKTY ----

function addProject(name) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite');
    const store = tx.objectStore('projects');
    const project = {
      id: 'proj_' + Date.now(),
      name: name.trim(),
      created: new Date().toISOString(),
      active: true
    };
    const req = store.add(project);
    req.onsuccess = () => resolve(project);
    req.onerror = () => reject(req.error);
  });
}

function getProjects() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readonly');
    const store = tx.objectStore('projects');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.filter(p => p.active !== false));
    req.onerror = () => reject(req.error);
  });
}

function deleteProject(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite');
    const store = tx.objectStore('projects');
    const req = store.get(id);
    req.onsuccess = () => {
      const project = req.result;
      if (project) {
        project.active = false;
        store.put(project);
      }
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

// ---- ZAMĚSTNANCI ----

function addEmployee(name, projectId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('employees', 'readwrite');
    const store = tx.objectStore('employees');
    const employee = {
      id: 'emp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: name.trim(),
      projectId: projectId,
      active: true,
      created: new Date().toISOString()
    };
    const req = store.add(employee);
    req.onsuccess = () => resolve(employee);
    req.onerror = () => reject(req.error);
  });
}

function getEmployees(projectId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('employees', 'readonly');
    const store = tx.objectStore('employees');
    const index = store.index('projectId');
    const req = index.getAll(projectId);
    req.onsuccess = () => resolve(req.result.filter(e => e.active !== false));
    req.onerror = () => reject(req.error);
  });
}

function deleteEmployee(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('employees', 'readwrite');
    const store = tx.objectStore('employees');
    const req = store.get(id);
    req.onsuccess = () => {
      const emp = req.result;
      if (emp) {
        emp.active = false;
        store.put(emp);
      }
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

// ---- PRACOVNÍ ZÁZNAMY ----

function addEntry(entry) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('entries', 'readwrite');
    const store = tx.objectStore('entries');
    const record = {
      id: 'entry_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      projectId: entry.projectId,
      employeeId: entry.employeeId,
      date: entry.date,
      hours: parseFloat(entry.hours) || 0,
      strings: parseInt(entry.strings) || 0,
      tables: entry.tables || '',
      workType: entry.workType,
      created: new Date().toISOString()
    };
    const req = store.add(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

function getEntries(projectId, dateFrom, dateTo) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('entries', 'readonly');
    const store = tx.objectStore('entries');
    const index = store.index('projectId');
    const req = index.getAll(projectId);
    req.onsuccess = () => {
      let results = req.result;
      if (dateFrom) results = results.filter(e => e.date >= dateFrom);
      if (dateTo) results = results.filter(e => e.date <= dateTo);
      results.sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

function getAllEntries(projectId) {
  return getEntries(projectId, null, null);
}

function deleteEntry(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('entries', 'readwrite');
    const store = tx.objectStore('entries');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function updateEntry(entry) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('entries', 'readwrite');
    const store = tx.objectStore('entries');
    const req = store.put(entry);
    req.onsuccess = () => resolve(entry);
    req.onerror = () => reject(req.error);
  });
}

// ---- EXPORT FUNKCE ----

async function exportToCSV(projectId, month, employeeId) {
  const project = await new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readonly');
    const req = tx.objectStore('projects').get(projectId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const employees = await getEmployees(projectId);
  const empMap = {};
  employees.forEach(e => empMap[e.id] = e.name);

  let entries;
  if (month) {
    const from = month + '-01';
    const lastDay = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
    const to = month + '-' + String(lastDay).padStart(2, '0');
    entries = await getEntries(projectId, from, to);
  } else {
    entries = await getAllEntries(projectId);
  }

  // Filtr podle zaměstnance
  if (employeeId) {
    entries = entries.filter(e => e.employeeId === employeeId);
  }

  let csv = 'Projekt;Datum;Jméno;Hodiny;Stringy;Typ práce;Stoly\n';

  entries.forEach(e => {
    csv += [
      project.name,
      e.date,
      empMap[e.employeeId] || 'Neznámý',
      e.hours,
      e.strings,
      e.workType === 'hourly' ? 'Hodinovka' : 'Úkol/Stringy',
      '"' + (e.tables || '').replace(/"/g, '""') + '"'
    ].join(';') + '\n';
  });

  return csv;
}

function downloadCSV(csv, filename) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
