if (window.marked && window.marked.setOptions) {
    window.marked.setOptions({ breaks: true });
}

const API_URL = '/api/tasks';
let currentEditId = null;
let currentDeleteId = null;
let allTasks = [];
let todaySlices = [];

// Default Weekly Schedule
const DEFAULT_WEEKLY_SCHEDULE = {
    wakeTime: "08:00",
    sleepTime: "22:00",
    days: {
        Monday: [
            { label: "Class", start: "10:00", end: "13:00" },
            { label: "Class", start: "16:00", end: "17:00" }
        ],
        Tuesday: [
            { label: "Class", start: "11:00", end: "12:30" },
            { label: "Class", start: "13:00", end: "14:30" },
            { label: "Class", start: "15:00", end: "17:00" }
        ],
        Wednesday: [
            { label: "Class", start: "10:00", end: "13:00" }
        ],
        Thursday: [
            { label: "Class", start: "11:00", end: "12:30" },
            { label: "Work", start: "14:00", end: "18:00" }
        ],
        Friday: [
            { label: "Work", start: "09:00", end: "13:00" }
        ],
        Saturday: [],
        Sunday: []
    }
};

function getWeeklySchedule() {
    try {
        const saved = localStorage.getItem('weekly_recurring_schedule');
        return saved ? JSON.parse(saved) : DEFAULT_WEEKLY_SCHEDULE;
    } catch (e) {
        return DEFAULT_WEEKLY_SCHEDULE;
    }
}

// Custom Toast Notification
function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMessage');
    if (!toast || !toastMsg) return;

    toastMsg.innerText = message;
    toast.classList.remove('hidden');

    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.classList.add('hidden'), 300);
    }, 2500);
}

// Tab Switcher
function switchTab(tabName) {
    const tasksView = document.getElementById('tasksView');
    const settingsView = document.getElementById('settingsView');
    const tabTasksBtn = document.getElementById('tabTasksBtn');
    const tabSettingsBtn = document.getElementById('tabSettingsBtn');

    if (tabName === 'tasks') {
        tasksView.classList.remove('hidden');
        tasksView.classList.add('active');
        settingsView.classList.add('hidden');
        settingsView.classList.remove('active');

        tabTasksBtn.classList.add('active');
        tabSettingsBtn.classList.remove('active');

        computeTodaySlices();
        renderTasks(allTasks);
    } else {
        settingsView.classList.remove('hidden');
        settingsView.classList.add('active');
        tasksView.classList.add('hidden');
        tasksView.classList.remove('active');

        tabSettingsBtn.classList.add('active');
        tabTasksBtn.classList.remove('active');

        loadWeeklyScheduleIntoSettings();
    }
}

// Day & Slices Computation
function getCurrentDayName() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date().getDay()];
}

function formatTimeStr(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function computeTodaySlices() {
    const dayName = getCurrentDayName();
    const dayBadge = document.getElementById('currentDayBadge');
    if (dayBadge) dayBadge.innerText = `${dayName}`;

    const schedule = getWeeklySchedule();
    const wakeVal = schedule.wakeTime || "08:00";
    const sleepVal = schedule.sleepTime || "22:00";
    const dayBlocks = schedule.days[dayName] || [];

    const todayStr = new Date().toISOString().split('T')[0];
    const baseDate = `${todayStr}T`;

    let wakeTime = new Date(`${baseDate}${wakeVal}:00`);
    let sleepTime = new Date(`${baseDate}${sleepVal}:00`);
    if (sleepTime <= wakeTime) sleepTime.setDate(sleepTime.getDate() + 1);

    const parsedBlocks = dayBlocks.map(b => {
        let bStart = new Date(`${baseDate}${b.start}:00`);
        let bEnd = new Date(`${baseDate}${b.end}:00`);
        if (bStart < wakeTime) bStart.setDate(bStart.getDate() + 1);
        if (bEnd <= bStart) bEnd.setDate(bEnd.getDate() + 1);
        return { label: b.label || 'Blocked', start: bStart, end: bEnd, isBlocked: true };
    }).sort((a, b) => a.start - b.start);

    let intervals = [];
    let currentTime = new Date(wakeTime);
    let sliceNum = 1;

    parsedBlocks.forEach(block => {
        if (currentTime < block.start) {
            const id = `slice_${sliceNum++}`;
            const label = `Slice ${sliceNum - 1}: ${formatTimeStr(currentTime)} - ${formatTimeStr(block.start)}`;
            intervals.push({ id, label, start: new Date(currentTime), end: new Date(block.start), isBlocked: false });
        }
        intervals.push({
            id: `blocked_${Date.now()}_${Math.random()}`,
            label: `🚫 ${block.label} (${formatTimeStr(block.start)} - ${formatTimeStr(block.end)})`,
            start: block.start,
            end: block.end,
            isBlocked: true
        });
        currentTime = new Date(Math.max(currentTime, block.end));
    });

    if (currentTime < sleepTime) {
        const id = `slice_${sliceNum++}`;
        const label = `Slice ${sliceNum - 1}: ${formatTimeStr(currentTime)} - ${formatTimeStr(sleepTime)}`;
        intervals.push({ id, label, start: new Date(currentTime), end: new Date(sleepTime), isBlocked: false });
    }

    todaySlices = intervals;
    updateSliceDropdowns();
}

function updateSliceDropdowns() {
    const taskSliceSelect = document.getElementById('taskSlice');
    const editTaskSliceSelect = document.getElementById('editTaskSlice');

    const activeSlices = todaySlices.filter(s => !s.isBlocked);
    let optionsHTML = '<option value="">No Slice (Unassigned)</option>';

    activeSlices.forEach(s => {
        optionsHTML += `<option value="${s.id}">${s.label}</option>`;
    });

    if (taskSliceSelect) taskSliceSelect.innerHTML = optionsHTML;
    if (editTaskSliceSelect) editTaskSliceSelect.innerHTML = optionsHTML;
}

// Settings
function loadWeeklyScheduleIntoSettings() {
    const schedule = getWeeklySchedule();
    document.getElementById('globalWakeTime').value = schedule.wakeTime || "08:00";
    document.getElementById('globalSleepTime').value = schedule.sleepTime || "22:00";

    const daySelect = document.getElementById('settingsDaySelect');
    if (daySelect && !daySelect.value) {
        daySelect.value = getCurrentDayName();
    }
    loadDayScheduleInSettings();
}

function loadDayScheduleInSettings() {
    const selectedDay = document.getElementById('settingsDaySelect').value;
    const schedule = getWeeklySchedule();
    const dayBlocks = (schedule.days && schedule.days[selectedDay]) ? schedule.days[selectedDay] : [];

    const container = document.getElementById('settingsBlockedContainer');
    if (!container) return;
    container.innerHTML = '';

    dayBlocks.forEach(b => {
        addSettingsBlockedRow(b.label, b.start, b.end);
    });
}

function addSettingsBlockedRow(label = '', start = '10:00', end = '12:00') {
    const container = document.getElementById('settingsBlockedContainer');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'blocked-row';
    row.innerHTML = `
        <input type="text" placeholder="Activity (e.g. Class)" class="block-label" value="${label}">
        <input type="time" class="block-start" value="${start}">
        <span>to</span>
        <input type="time" class="block-end" value="${end}">
        <button type="button" onclick="this.parentElement.remove()" class="icon-btn">✖</button>
    `;
    container.appendChild(row);
}

function clearSettingsBlockedRows() {
    const container = document.getElementById('settingsBlockedContainer');
    if (container) container.innerHTML = '';
}

function saveWeeklySchedule() {
    const wakeTime = document.getElementById('globalWakeTime').value;
    const sleepTime = document.getElementById('globalSleepTime').value;
    const selectedDay = document.getElementById('settingsDaySelect').value;

    const schedule = getWeeklySchedule();
    schedule.wakeTime = wakeTime;
    schedule.sleepTime = sleepTime;

    const rows = document.querySelectorAll('#settingsBlockedContainer .blocked-row');
    const updatedBlocks = [];

    rows.forEach(row => {
        const label = row.querySelector('.block-label').value;
        const start = row.querySelector('.block-start').value;
        const end = row.querySelector('.block-end').value;
        if (start && end) {
            updatedBlocks.push({ label: label || 'Class', start, end });
        }
    });

    schedule.days[selectedDay] = updatedBlocks;
    localStorage.setItem('weekly_recurring_schedule', JSON.stringify(schedule));

    showToast(`✓ Schedule for ${selectedDay} saved!`);
}

// Fetch & Task Management
async function fetchTasks() {
    try {
        const response = await fetch(API_URL);
        allTasks = await response.json();
        renderTasks(allTasks);
    } catch (error) {
        console.error('Error fetching tasks:', error);
    }
}

async function addTask(event) {
    event.preventDefault();
    const titleInput = document.getElementById('taskTitle');
    const priorityInput = document.getElementById('taskPriority');
    const sliceSelect = document.getElementById('taskSlice');

    const selectedSlice = sliceSelect ? sliceSelect.value : '';

    const newTask = {
        title: titleInput.value,
        description: selectedSlice ? `[slice:${selectedSlice}]` : "",
        priority: parseInt(priorityInput.value)
    };

    try {
        await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newTask)
        });
        titleInput.value = '';
        fetchTasks();
    } catch (error) {
        console.error('Error adding task:', error);
    }
}

async function completeTask(id) {
    try {
        await fetch(`${API_URL}/${id}/complete`, { method: 'PUT' });
        fetchTasks();
    } catch (error) {
        console.error('Error completing task:', error);
    }
}

function deleteTask(id) {
    currentDeleteId = id;
    document.getElementById('deleteModal').classList.remove('hidden');
}

function closeDeleteModal() {
    document.getElementById('deleteModal').classList.add('hidden');
    currentDeleteId = null;
}

async function submitDelete() {
    try {
        await fetch(`${API_URL}/${currentDeleteId}`, { method: 'DELETE' });
        closeDeleteModal();
        fetchTasks();
    } catch (error) {
        console.error('Error deleting task:', error);
    }
}

function getTaskSlice(task) {
    if (!task || !task.description) return '';
    const match = task.description.match(/\[slice:(.*?)\]/);
    return match ? match[1] : '';
}

function cleanDescription(description) {
    if (!description) return '';
    return description.replace(/\[slice:(.*?)\]/g, '').trim();
}

// Smart Markdown insertion: automatically forces a new line if cursor isn't already on one
function insertMarkdown(syntax) {
    const textarea = document.getElementById('editTaskDescription');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    const linePrefixes = ['[ ] ', '- ', '1. ', '### '];
    let prefix = '';

    if (linePrefixes.includes(syntax) && start > 0 && text[start - 1] !== '\n') {
        prefix = '\n';
    }

    const insertion = prefix + syntax;
    textarea.value = text.substring(0, start) + insertion + text.substring(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + insertion.length;
}

function editTask(id) {
    currentEditId = id;
    const task = allTasks.find(t => t.id === id);
    if (!task) return;

    document.getElementById('editTaskInput').value = task.title;
    document.getElementById('editTaskDescription').value = cleanDescription(task.description);

    const sliceSelect = document.getElementById('editTaskSlice');
    if (sliceSelect) {
        sliceSelect.value = getTaskSlice(task);
    }

    document.getElementById('editModal').classList.remove('hidden');
}

function closeEditModal() {
    document.getElementById('editModal').classList.add('hidden');
    currentEditId = null;
}

async function submitEdit() {
    const newTitle = document.getElementById('editTaskInput').value;
    const rawDesc = document.getElementById('editTaskDescription').value;
    const sliceSelect = document.getElementById('editTaskSlice');
    const selectedSlice = sliceSelect ? sliceSelect.value : '';

    if (currentEditId === null || !newTitle || newTitle.trim() === '') return;

    const existingTask = allTasks.find(t => t.id === currentEditId) || {};
    const finalDesc = selectedSlice ? `[slice:${selectedSlice}]\n${rawDesc}` : rawDesc;

    try {
        const response = await fetch(`${API_URL}/${currentEditId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...existingTask,
                title: newTitle.trim(),
                description: finalDesc
            })
        });

        if (!response.ok) throw new Error(`Save failed with HTTP ${response.status}`);

        closeEditModal();
        await fetchTasks();
    } catch (error) {
        console.error('Error editing task:', error);
    }
}

// Subtask Logic & Interactive Board Toggling
const SUBTASK_REGEX = /\[\s*([xX]?)\s*\]/g;

function getSubtaskStats(description) {
    if (!description) return null;
    const matches = [...description.matchAll(SUBTASK_REGEX)];
    if (!matches || matches.length === 0) return null;

    const total = matches.length;
    const completed = matches.filter(m => m[1].toLowerCase() === 'x').length;
    return { completed, total };
}

async function toggleTaskSubtask(taskId, subtaskIndex) {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;

    let desc = task.description || '';
    let matchIdx = 0;

    let updatedDesc = desc.replace(SUBTASK_REGEX, (match, group1) => {
        if (matchIdx === subtaskIndex) {
            const isChecked = group1.toLowerCase() === 'x';
            matchIdx++;
            return isChecked ? '[ ]' : '[x]';
        }
        matchIdx++;
        return match;
    });

    try {
        await fetch(`${API_URL}/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...task, description: updatedDesc })
        });
        fetchTasks();
    } catch (e) {
        console.error('Error toggling subtask:', e);
    }
}

async function toggleRollover(id) {
    try {
        await fetch(`${API_URL}/${id}/rollover`, { method: 'PUT' });
        fetchTasks();
    } catch (error) {
        console.error('Error toggling rollover:', error);
    }
}

// Board Rendering
function renderTasks(tasks) {
    const container = document.getElementById('scheduleSlicesContainer');
    const completedTaskList = document.getElementById('completedTaskList');
    const completedSection = document.getElementById('completedSection');

    if (!container) return;

    container.innerHTML = '';
    if (completedTaskList) completedTaskList.innerHTML = '';

    const activeTasks = tasks.filter(task => !task.completed);
    const completedTasks = tasks.filter(task => task.completed);

    if (completedSection) {
        completedSection.classList.toggle('hidden', completedTasks.length === 0);
    }

    const buildTaskHTML = (task) => {
        const li = document.createElement('li');
        li.className = `task-item ${task.completed ? 'completed' : ''} ${task.rollover ? 'is-rollover' : ''}`;

        const cleanDesc = cleanDescription(task.description);
        const subtaskStats = getSubtaskStats(cleanDesc);
        let subtaskBadgeHTML = '';
        if (subtaskStats) {
            const isAllDone = subtaskStats.completed === subtaskStats.total;
            subtaskBadgeHTML = `<span class="subtask-badge ${isAllDone ? 'all-done' : ''}">${subtaskStats.completed}/${subtaskStats.total}</span>`;
        }

        let notesHTML = '';
        if (cleanDesc) {
            let cbIdx = 0;

            // Automatically format subtask lines into Markdown list items so each checkbox renders on its own line
            let formattedDesc = cleanDesc.split('\n').map(line => {
                let trimmed = line.trim();
                if (trimmed.startsWith('[ ]') || trimmed.startsWith('[x]') || trimmed.startsWith('[X]')) {
                    return `- ${trimmed}`;
                }
                return line;
            }).join('\n');

            let parsedMarkdown = formattedDesc.replace(SUBTASK_REGEX, (match, group1) => {
                const isChecked = group1.toLowerCase() === 'x';
                const idx = cbIdx++;
                return `<input type="checkbox" ${isChecked ? 'checked' : ''} onclick="toggleTaskSubtask(${task.id}, ${idx})">`;
            });

            notesHTML = `<div class="task-notes-rendered">${marked.parse(parsedMarkdown)}</div>`;
        }

        li.innerHTML = `
            <div class="task-item-main">
                <input type="checkbox" class="checkbox" ${task.completed ? 'checked' : ''} onchange="completeTask(${task.id})">
                <span class="task-title">${task.title}</span>
                ${subtaskBadgeHTML}
                <span class="priority-badge prio-${task.priority}">
                    ${task.priority === 3 ? 'High' : task.priority === 2 ? 'Med' : 'Low'}
                </span>
                <div class="task-actions">
                    <button class="icon-btn rollover-btn ${task.rollover ? 'active' : ''}" onclick="toggleRollover(${task.id})" title="Rollover to tomorrow">➔</button>
                    <button class="icon-btn edit-btn" onclick="editTask(${task.id})">✎</button>
                    <button class="icon-btn delete-btn" onclick="deleteTask(${task.id})">✖</button>
                </div>
            </div>
            ${notesHTML}
        `;
        return li;
    };

    const tasksBySlice = {};
    const unassignedTasks = [];

    activeTasks.forEach(task => {
        const sliceId = getTaskSlice(task);
        if (sliceId) {
            if (!tasksBySlice[sliceId]) tasksBySlice[sliceId] = [];
            tasksBySlice[sliceId].push(task);
        } else {
            unassignedTasks.push(task);
        }
    });

    if (todaySlices.length > 0) {
        todaySlices.forEach(slice => {
            const card = document.createElement('div');
            card.className = slice.isBlocked ? 'slice-card blocked' : 'slice-card';

            const header = document.createElement('div');
            header.className = 'slice-header';
            header.innerHTML = `<span class="slice-title">${slice.label}</span>`;
            card.appendChild(header);

            if (slice.isBlocked) {
                card.innerHTML += `<p class="blocked-text">🔒 Tasks cannot be assigned during this period.</p>`;
            } else {
                const ul = document.createElement('ul');
                ul.className = 'task-list';
                const sliceTasks = tasksBySlice[slice.id] || [];
                sliceTasks.forEach(task => ul.appendChild(buildTaskHTML(task)));
                card.appendChild(ul);
            }

            container.appendChild(card);
        });
    }

    if (unassignedTasks.length > 0) {
        const card = document.createElement('div');
        card.className = 'slice-card';
        card.innerHTML = `<div class="slice-header"><span class="slice-title">📌 Unassigned Tasks</span></div>`;

        const ul = document.createElement('ul');
        ul.className = 'task-list';
        unassignedTasks.forEach(task => ul.appendChild(buildTaskHTML(task)));
        card.appendChild(ul);

        container.appendChild(card);
    }

    if (completedTaskList) {
        completedTasks.forEach(task => completedTaskList.appendChild(buildTaskHTML(task)));
    }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    computeTodaySlices();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('PWA Service Worker active'))
            .catch(err => console.error('Service Worker error:', err));
    });
}

void fetchTasks();
setInterval(fetchTasks, 60000);