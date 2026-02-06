// ============================================
// CHARTS.JS - Grafy a přehledy
// Chart.js vizualizace dat
// ============================================

let hoursChart = null;
let stringsChart = null;
let comparisonChart = null;

function destroyCharts() {
  if (hoursChart) { hoursChart.destroy(); hoursChart = null; }
  if (stringsChart) { stringsChart.destroy(); stringsChart = null; }
  if (comparisonChart) { comparisonChart.destroy(); comparisonChart = null; }
}

async function renderCharts(projectId, month) {
  destroyCharts();

  let entries;
  if (month) {
    const from = month + '-01';
    const lastDay = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
    const to = month + '-' + String(lastDay).padStart(2, '0');
    entries = await getEntries(projectId, from, to);
  } else {
    entries = await getAllEntries(projectId);
  }

  if (entries.length === 0) return;

  const dailyData = {};
  entries.forEach(e => {
    if (!dailyData[e.date]) {
      dailyData[e.date] = { hours: 0, strings: 0, hourlyHours: 0, taskHours: 0 };
    }
    dailyData[e.date].hours += e.hours;
    dailyData[e.date].strings += e.strings;
    if (e.workType === 'hourly') {
      dailyData[e.date].hourlyHours += e.hours;
    } else {
      dailyData[e.date].taskHours += e.hours;
    }
  });

  const dates = Object.keys(dailyData).sort();
  const shortDates = dates.map(d => {
    const parts = d.split('-');
    return parts[2] + '.' + parts[1] + '.';
  });

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#94a3b8',
          font: { size: 11, family: "'DM Sans', sans-serif" }
        }
      }
    },
    scales: {
      x: {
        ticks: { color: '#64748b', font: { size: 10 }, maxRotation: 45 },
        grid: { color: 'rgba(100,116,139,0.1)' }
      },
      y: {
        ticks: { color: '#64748b', font: { size: 10 } },
        grid: { color: 'rgba(100,116,139,0.15)' },
        beginAtZero: true
      }
    }
  };

  const hoursCtx = document.getElementById('chartHours');
  if (hoursCtx) {
    hoursChart = new Chart(hoursCtx, {
      type: 'bar',
      data: {
        labels: shortDates,
        datasets: [{
          label: 'Hodiny / den',
          data: dates.map(d => dailyData[d].hours),
          backgroundColor: 'rgba(59, 130, 246, 0.7)',
          borderColor: '#3b82f6',
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: commonOptions
    });
  }

  const stringsCtx = document.getElementById('chartStrings');
  if (stringsCtx) {
    stringsChart = new Chart(stringsCtx, {
      type: 'bar',
      data: {
        labels: shortDates,
        datasets: [{
          label: 'Stringy / den',
          data: dates.map(d => dailyData[d].strings),
          backgroundColor: 'rgba(245, 158, 11, 0.7)',
          borderColor: '#f59e0b',
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: commonOptions
    });
  }

  const compCtx = document.getElementById('chartComparison');
  if (compCtx) {
    comparisonChart = new Chart(compCtx, {
      type: 'bar',
      data: {
        labels: shortDates,
        datasets: [
          {
            label: 'Hodinovka (h)',
            data: dates.map(d => dailyData[d].hourlyHours),
            backgroundColor: 'rgba(59, 130, 246, 0.6)',
            borderColor: '#3b82f6',
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: 'Úkol/Stringy (h)',
            data: dates.map(d => dailyData[d].taskHours),
            backgroundColor: 'rgba(245, 158, 11, 0.6)',
            borderColor: '#f59e0b',
            borderWidth: 1,
            borderRadius: 4
          }
        ]
      },
      options: {
        ...commonOptions,
        scales: {
          ...commonOptions.scales,
          x: { ...commonOptions.scales.x, stacked: false },
          y: { ...commonOptions.scales.y, stacked: false }
        }
      }
    });
  }
}

async function getStats(projectId, month) {
  let entries;
  if (month) {
    const from = month + '-01';
    const lastDay = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
    const to = month + '-' + String(lastDay).padStart(2, '0');
    entries = await getEntries(projectId, from, to);
  } else {
    entries = await getAllEntries(projectId);
  }

  const stats = {
    totalHours: 0,
    totalStrings: 0,
    hourlyHours: 0,
    taskHours: 0,
    workDays: new Set(),
    entriesCount: entries.length
  };

  entries.forEach(e => {
    stats.totalHours += e.hours;
    stats.totalStrings += e.strings;
    stats.workDays.add(e.date);
    if (e.workType === 'hourly') stats.hourlyHours += e.hours;
    else stats.taskHours += e.hours;
  });

  stats.workDaysCount = stats.workDays.size;
  stats.avgHoursPerDay = stats.workDaysCount > 0
    ? (stats.totalHours / stats.workDaysCount).toFixed(1) : 0;

  return stats;
}
