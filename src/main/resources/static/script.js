if (window.marked && window.marked.setOptions) {
    window.marked.setOptions({ breaks: true });
}

const API_URL = '/api/tasks';
let currentEditId = null;
let currentDeleteId = null;
let allTasks = [];
let todaySlices = [];

// Default Weekly Schedule Supporting Blocks and Divisions
const DEFAULT_WEEKLY_SCHEDULE = {
    wakeTime: "08:00",
    sleepTime: "22:00",
    days: {
        Monday: {
            blocks: [
                { label: "Class", start: "10:00", end: "13:00" },
                { label: "Class", start: "16:00", end: "17:00" }
            ],
            divisions: []
        },
        Tuesday: {
            blocks: [
                { label: "Class", start: "11:00", end: "12:30" },
                { label: "Class", start: "13:00", end: "14:30" }
            ],
            divisions: []
        },
        Wednesday: {
            blocks: [{ label: "Class", start: "10:00", end: "13:00" }],
            divisions: []
        },
        Thursday: {
            blocks: [
                { label: "Class", start: "11:00", end: "12:30" },
                { label: "Work", start: "14:00", end: "18:00" }
            ],
            divisions: []
        },
        Friday: {
            blocks: [{ label: "Work", start: "09:00", end: "13:00" }],
            divisions: []
        },
        Saturday: { blocks: [], divisions: ["13:00"] },
        Sunday: { blocks: [], divisions: [] }
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

// Normalizer for backward compatibility
function getDayData(schedule, dayName) {
    const raw = schedule.days ? schedule.days[dayName] : null;
    if (!raw) return { blocks: [], divisions: [] };
    if (Array.isArray(raw)) return { blocks: raw, divisions: [] };
    return {
        blocks: raw.blocks || [],
        divisions: raw.divisions || []
    };
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
    }, 3000);
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

function getCurrentDayName() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date().getDay()];
}

function formatTimeStr(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function format24Hour(date) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
}

// Compute Slices Handling Wake/Sleep, Blocked Windows, and Custom Split Divisions
function computeTodaySlices() {
    const dayName = getCurrentDayName();
    const dayBadge = document.getElementById('currentDayBadge');
    if (dayBadge) dayBadge.innerText = `${dayName}`;

    const schedule = getWeeklySchedule();
    const wakeVal = schedule.wakeTime || "08:00";
    const sleepVal = schedule.sleepTime || "22:00";
    const dayData = getDayData(schedule, dayName);

    const todayStr = new Date().toISOString().split('T')[0];
    const baseDate = `${todayStr}T`;

    let wakeTime = new Date(`${baseDate}${wakeVal}:00`);
    let sleepTime = new Date(`${baseDate}${sleepVal}:00`);
    if (sleepTime <= wakeTime) sleepTime.setDate(sleepTime.getDate() + 1);

    const parsedBlocks = dayData.blocks.map(b => {
        let bStart = new Date(`${baseDate}${b.start}:00`);
        let bEnd = new Date(`${baseDate}${b.end}:00`);
        if (bStart < wakeTime) bStart.setDate(bStart.getDate() + 1);
        if (bEnd <= bStart) bEnd.setDate(bEnd.getDate() + 1);
        return { label: b.label || 'Blocked', start: bStart, end: bEnd, isBlocked: true };
    }).sort((a, b) => a.start - b.start);

    // Initial open segments between blocked windows
    let rawOpenIntervals = [];
    let curTime = new Date(wakeTime);

    parsedBlocks.forEach(block => {
        if (curTime < block.start) {
            rawOpenIntervals.push({ start: new Date(curTime), end: new Date(block.start) });
        }
        curTime = new Date(Math.max(curTime, block.end));
    });
    if (curTime < sleepTime) {
        rawOpenIntervals.push({ start: new Date(curTime), end: new Date(sleepTime) });
    }

    // Apply custom division split times to open intervals
    const divisionDates = (dayData.divisions || []).map(divStr => {
        let d = new Date(`${baseDate}${divStr}:00`);
        if (d < wakeTime) d.setDate(d.getDate() + 1);
        return d;
    }).sort((a, b) => a - b);

    let splitOpenIntervals = [];
    rawOpenIntervals.forEach(interval => {
        let currentSubStart = new Date(interval.start);
        divisionDates.forEach(divDate => {
            if (divDate > currentSubStart && divDate < interval.end) {
                splitOpenIntervals.push({ start: new Date(currentSubStart), end: new Date(divDate) });
                currentSubStart = new Date(divDate);
            }
        });
        if (currentSubStart < interval.end) {
            splitOpenIntervals.push({ start: new Date(currentSubStart), end: new Date(interval.end) });
        }
    });

    // Merge split open intervals with blocked windows, ordered chronologically
    let combined = [];
    splitOpenIntervals.forEach(i => combined.push({ ...i, isBlocked: false }));
    parsedBlocks.forEach(b => combined.push({ ...b, isBlocked: true }));
    combined.sort((a, b) => a.start - b.start);

    let sliceNum = 1;
    todaySlices = combined.map(item => {
        if (item.isBlocked) {
            return {
                id: `blocked_${item.start.getTime()}`,
                label: `🚫 ${item.label} (${formatTimeStr(item.start)} - ${formatTimeStr(item.end)})`,
                start: item.start,
                end: item.end,
                isBlocked: true
            };
        } else {
            const id = `slice_${sliceNum++}`;
            return {
                id,
                label: `Slice ${sliceNum - 1}: ${formatTimeStr(item.start)} - ${formatTimeStr(item.end)}`,
                start: item.start,
                end: item.end,
                isBlocked: false
            };
        }
    });

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

// Time Validation
function checkTimeInBlockedWindow(timeVal) {
    if (!timeVal) return null;
    const todayStr = new Date().toISOString().split('T')[0];
    const targetDate = new Date(`${todayStr}T${timeVal}:00`);

    for (const slice of todaySlices) {
        if (slice.isBlocked && targetDate >= slice.start && targetDate < slice.end) {
            return slice.label;
        }
    }
    return null;
}

function findSliceForTime(timeVal) {
    if (!timeVal) return '';
    const todayStr = new Date().toISOString().split('T')[0];
    const targetDate = new Date(`${todayStr}T${timeVal}:00`);

    for (const slice of todaySlices) {
        if (!slice.isBlocked && targetDate >= slice.start && targetDate < slice.end) {
            return slice.id;
        }
    }
    return '';
}

// Settings Views
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
    const dayData = getDayData(schedule, selectedDay);

    const blockedContainer = document.getElementById('settingsBlockedContainer');
    if (blockedContainer) blockedContainer.innerHTML = '';
    dayData.blocks.forEach(b => addSettingsBlockedRow(b.label, b.start, b.end));

    const divContainer = document.getElementById('settingsDivisionsContainer');
    if (divContainer) divContainer.innerHTML = '';
    dayData.divisions.forEach(d => addSettingsDivisionRow(d));
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

// Clear All Blocks with Confirmation
function clearSettingsBlockedRows() {
    if (confirm("Are you sure you want to clear all blocked time windows for this day?")) {
        const container = document.getElementById('settingsBlockedContainer');
        if (container) container.innerHTML = '';
        showToast("Cleared all blocked time windows for selected day.");
    }
}

function addSettingsDivisionRow(time = '13:00') {
    const container = document.getElementById('settingsDivisionsContainer');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'division-row';
    row.innerHTML = `
        <span>Split at:</span>
        <input type="time" class="division-time" value="${time}">
        <button type="button" onclick="this.parentElement.remove()" class="icon-btn">✖</button>
    `;
    container.appendChild(row);
}

function saveWeeklySchedule() {
    const wakeTime = document.getElementById('globalWakeTime').value;
    const sleepTime = document.getElementById('globalSleepTime').value;
    const selectedDay = document.getElementById('settingsDaySelect').value;

    const schedule = getWeeklySchedule();
    schedule.wakeTime = wakeTime;
    schedule.sleepTime = sleepTime;

    const blockRows = document.querySelectorAll('#settingsBlockedContainer .blocked-row');
    const updatedBlocks = [];
    blockRows.forEach(row => {
        const label = row.querySelector('.block-label').value;
        const start = row.querySelector('.block-start').value;
        const end = row.querySelector('.block-end').value;
        if (start && end) {
            updatedBlocks.push({ label: label || 'Class', start, end });
        }
    });

    const divisionRows = document.querySelectorAll('#settingsDivisionsContainer .division-row');
    const updatedDivisions = [];
    divisionRows.forEach(row => {
        const timeVal = row.querySelector('.division-time').value;
        if (timeVal) updatedDivisions.push(timeVal);
    });

    schedule.days[selectedDay] = {
        blocks: updatedBlocks,
        divisions: updatedDivisions
    };

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

// 1. UPDATE: Task creation with exact custom notification and automatic slice placement
async function addTask(event) {
    event.preventDefault();
    const titleInput = document.getElementById('taskTitle');
    const priorityInput = document.getElementById('taskPriority');
    const startTimeInput = document.getElementById('taskStartTime');

    const startTime = startTimeInput ? startTimeInput.value : '';

    if (startTime) {
        const blockedReason = checkTimeInBlockedWindow(startTime);
        if (blockedReason) {
            // Updated custom notification message
            showToast("Yo, you can't do that. pick a diff time...");
            return;
        }
    }

    // Auto-determine which open slice contains this start time
    const autoSliceId = findSliceForTime(startTime);

    let metaString = '';
    if (autoSliceId) metaString += `[slice:${autoSliceId}]`;
    if (startTime) metaString += `[time:${startTime}]`;

    const newTask = {
        title: titleInput.value,
        description: metaString,
        priority: parseInt(priorityInput.value)
    };

    try {
        await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newTask)
        });
        titleInput.value = '';
        if (startTimeInput) startTimeInput.value = '';
        fetchTasks();
    } catch (error) {
        console.error('Error adding task:', error);
    }
}

// 2. NEW: Drag-and-Drop Event Handlers
function handleDragStart(e, taskId) {
    e.dataTransfer.setData('text/plain', taskId.toString());
    e.target.classList.add('dragging');
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
    const card = e.currentTarget;
    if (!card.classList.contains('blocked')) {
        card.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

async function handleDrop(e, targetSliceId) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    const taskId = parseInt(e.dataTransfer.getData('text/plain'));
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;

    const currentTime = getTaskTime(task);
    const cleanDesc = cleanDescription(task.description);

    // Update slice assignment metadata while preserving existing time & notes
    let newMeta = `[slice:${targetSliceId}]`;
    if (currentTime) newMeta += `[time:${currentTime}]`;

    const updatedDesc = newMeta ? `${newMeta}\n${cleanDesc}` : cleanDesc;

    try {
        await fetch(`${API_URL}/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...task,
                description: updatedDesc.trim()
            })
        });
        fetchTasks();
    } catch (err) {
        console.error('Error dropping task into new slice:', err);
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

function getTaskTime(task) {
    if (!task || !task.description) return '';
    const match = task.description.match(/\[time:(.*?)\]/);
    return match ? match[1] : '';
}

function cleanDescription(description) {
    if (!description) return '';
    return description
        .replace(/\[slice:(.*?)\]/g, '')
        .replace(/\[time:(.*?)\]/g, '')
        .trim();
}

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
    if (sliceSelect) sliceSelect.value = getTaskSlice(task);

    const timeInput = document.getElementById('editTaskStartTime');
    if (timeInput) timeInput.value = getTaskTime(task);

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
    const timeInput = document.getElementById('editTaskStartTime');

    let selectedSlice = sliceSelect ? sliceSelect.value : '';
    const startTime = timeInput ? timeInput.value : '';

    if (currentEditId === null || !newTitle || newTitle.trim() === '') return;

    if (startTime) {
        const blockedReason = checkTimeInBlockedWindow(startTime);
        if (blockedReason) {
            showToast(`⚠️ Cannot update task: ${startTime} falls in a blocked window (${blockedReason})`);
            return;
        }
        if (!selectedSlice) {
            selectedSlice = findSliceForTime(startTime);
        }
    }

    const existingTask = allTasks.find(t => t.id === currentEditId) || {};

    let metaString = '';
    if (selectedSlice) metaString += `[slice:${selectedSlice}]`;
    if (startTime) metaString += `[time:${startTime}]`;

    const finalDesc = metaString ? `${metaString}\n${rawDesc}` : rawDesc;

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

// Subtasks Logic
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

// Format 24-hour time string into readable 12-hour AM/PM format
function formatDisplayTime(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m, 0);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Board Rendering with Chronological Task Sorting
// 3. UPDATE: renderTasks function (Enforces past slice dimming & Drag-and-Drop attributes)
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

    const now = new Date();

    const buildTaskHTML = (task) => {
        const li = document.createElement('li');
        li.className = `task-item ${task.completed ? 'completed' : ''} ${task.rollover ? 'is-rollover' : ''}`;

        // Enable dragging on active tasks
        if (!task.completed) {
            li.setAttribute('draggable', 'true');
            li.ondragstart = (e) => handleDragStart(e, task.id);
            li.ondragend = handleDragEnd;
        }

        const cleanDesc = cleanDescription(task.description);
        const subtaskStats = getSubtaskStats(cleanDesc);
        let subtaskBadgeHTML = '';
        if (subtaskStats) {
            const isAllDone = subtaskStats.completed === subtaskStats.total;
            subtaskBadgeHTML = `<span class="subtask-badge ${isAllDone ? 'all-done' : ''}">${subtaskStats.completed}/${subtaskStats.total}</span>`;
        }

        // Visible time preview badge
        const taskTime = getTaskTime(task);
        let timeBadgeHTML = '';
        if (taskTime) {
            timeBadgeHTML = `<span class="task-time-badge">🕒 ${formatDisplayTime(taskTime)}</span>`;
        }

        let notesHTML = '';
        if (cleanDesc) {
            let cbIdx = 0;
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
                ${timeBadgeHTML}
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

    const sortTasksByTime = (taskList) => {
        return taskList.sort((a, b) => {
            const timeA = getTaskTime(a);
            const timeB = getTaskTime(b);
            if (timeA && !timeB) return -1;
            if (!timeA && timeB) return 1;
            if (!timeA && !timeB) return 0;
            return timeA.localeCompare(timeB);
        });
    };

    if (todaySlices.length > 0) {
        todaySlices.forEach(slice => {
            const isPastSlice = !slice.isBlocked && now > slice.end;

            const card = document.createElement('div');
            card.className = slice.isBlocked
                ? 'slice-card blocked'
                : isPastSlice
                    ? 'slice-card past'
                    : 'slice-card';

            // Enable drop target for open slices (even past ones)
            if (!slice.isBlocked) {
                card.ondragover = handleDragOver;
                card.ondragleave = handleDragLeave;
                card.ondrop = (e) => handleDrop(e, slice.id);
            }

            const header = document.createElement('div');
            header.className = 'slice-header';
            header.innerHTML = `<span class="slice-title">${slice.label}${isPastSlice ? ' (Ended)' : ''}</span>`;
            card.appendChild(header);

            if (slice.isBlocked) {
                card.innerHTML += `<p class="blocked-text">🔒 Tasks cannot be assigned during this period.</p>`;
            } else {
                const ul = document.createElement('ul');
                ul.className = 'task-list';
                const sliceTasks = sortTasksByTime(tasksBySlice[slice.id] || []);
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
        const sortedUnassigned = sortTasksByTime(unassignedTasks);
        sortedUnassigned.forEach(task => ul.appendChild(buildTaskHTML(task)));
        card.appendChild(ul);

        container.appendChild(card);
    }

    if (completedTaskList) {
        const sortedCompleted = sortTasksByTime(completedTasks);
        sortedCompleted.forEach(task => completedTaskList.appendChild(buildTaskHTML(task)));
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