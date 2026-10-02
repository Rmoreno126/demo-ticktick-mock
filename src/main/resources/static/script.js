const API_URL = '/api/tasks';
let currentEditId = null;
let currentDeleteId = null;
let allTasks = [];

// --- FETCH & TASK MANAGEMENT ---

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

    const newTask = {
        title: titleInput.value,
        description: "",
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

function editTask(id) {
    currentEditId = id;
    const task = allTasks.find(t => t.id === id);

    document.getElementById('editTaskInput').value = task.title;
    document.getElementById('editTaskDescription').value = task.description || '';
    document.getElementById('editModal').classList.remove('hidden');

    updatePreview();
}

function closeEditModal() {
    document.getElementById('editModal').classList.add('hidden');
    currentEditId = null;
}

async function submitEdit() {
    const newTitle = document.getElementById('editTaskInput').value;
    const newDesc = document.getElementById('editTaskDescription').value;
    if (currentEditId === null || !newTitle || newTitle.trim() === '') return;

    const existingTask = allTasks.find(t => t.id === currentEditId) || {};

    try {
        const response = await fetch(`${API_URL}/${currentEditId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...existingTask,
                title: newTitle.trim(),
                description: newDesc
            })
        });
        if (!response.ok) {
            throw new Error(`Save failed with HTTP status ${response.status}`);
        }

        closeEditModal();
        await fetchTasks();
    } catch (error) {
        console.error('Error editing task:', error);
        window.alert('Task could not be saved. Your notes are still in the editor; please try again.');
    }
}

// --- SUBTASK & MARKDOWN PREVIEW ---

const SUBTASK_REGEX = /\[\s*([xX]?)\s*\]/g;

function getSubtaskStats(description) {
    if (!description) return null;
    const matches = [...description.matchAll(SUBTASK_REGEX)];
    if (!matches || matches.length === 0) return null;

    const total = matches.length;
    const completed = matches.filter(m => m[1].toLowerCase() === 'x').length;
    return { completed, total };
}

function updatePreview() {
    const rawText = document.getElementById('editTaskDescription').value;

    let cbIndex = 0;
    let processedText = rawText.replace(SUBTASK_REGEX, (match, group1) => {
        const isChecked = group1.toLowerCase() === 'x';
        const html = `<input type="checkbox" class="subtask-cb" ${isChecked ? 'checked' : ''} onclick="toggleSubtask(${cbIndex})">`;
        cbIndex++;
        return html;
    });

    document.getElementById('editTaskPreview').innerHTML = marked.parse(processedText);
}

async function toggleSubtask(targetIndex) {
    const textarea = document.getElementById('editTaskDescription');
    let text = textarea.value;

    let currentIndex = 0;
    textarea.value = text.replace(SUBTASK_REGEX, (match, group1) => {
        if (currentIndex === targetIndex) {
            currentIndex++;
            return group1.toLowerCase() === 'x' ? '[ ]' : '[x]';
        }
        currentIndex++;
        return match;
    });

    updatePreview();

    if (currentEditId) {
        const newTitle = document.getElementById('editTaskInput').value;
        const newDesc = textarea.value;
        const existingTask = allTasks.find(t => t.id === currentEditId) || {};

        try {
            await fetch(`${API_URL}/${currentEditId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...existingTask,
                    title: newTitle.trim(),
                    description: newDesc
                })
            });
            fetchTasks();
        } catch (error) {
            console.error('Error auto-saving subtask toggle:', error);
        }
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

function renderTasks(tasks) {
    const taskList = document.getElementById('taskList');
    const completedTaskList = document.getElementById('completedTaskList');
    const completedSection = document.getElementById('completedSection');

    if (!taskList) return;

    taskList.innerHTML = '';
    if (completedTaskList) completedTaskList.innerHTML = '';

    const activeTasks = tasks.filter(task => !task.completed);
    const completedTasks = tasks.filter(task => task.completed);

    if (completedSection) {
        if (completedTasks.length === 0) {
            completedSection.classList.add('hidden');
        } else {
            completedSection.classList.remove('hidden');
        }
    }

    const buildTaskHTML = (task) => {
        const li = document.createElement('li');
        li.className = `task-item ${task.completed ? 'completed' : ''} ${task.rollover ? 'is-rollover' : ''}`;

        const subtaskStats = getSubtaskStats(task.description);
        let subtaskBadgeHTML = '';
        if (subtaskStats) {
            const isAllDone = subtaskStats.completed === subtaskStats.total;
            subtaskBadgeHTML = `
                <span class="subtask-badge ${isAllDone ? 'all-done' : ''}">
                    ✓ ${subtaskStats.completed}/${subtaskStats.total}
                </span>
            `;
        }

        li.innerHTML = `
            <input type="checkbox" class="checkbox" ${task.completed ? 'checked' : ''} 
                   onchange="completeTask(${task.id})">
            <span class="task-title">${task.title}</span>
            ${subtaskBadgeHTML}
            <span class="priority-badge prio-${task.priority}">
                ${task.priority === 3 ? 'High' : task.priority === 2 ? 'Med' : 'Low'}
            </span>
            
            <div class="task-actions">
                <button class="icon-btn rollover-btn ${task.rollover ? 'active' : ''}" 
                        onclick="toggleRollover(${task.id})" 
                        title="Rollover to tomorrow">➔</button>
                <button class="icon-btn edit-btn" onclick="editTask(${task.id})">✎</button>
                <button class="icon-btn delete-btn" onclick="deleteTask(${task.id})">✖</button>
            </div>
        `;
        return li;
    };

    activeTasks.forEach(task => taskList.appendChild(buildTaskHTML(task)));
    if (completedTaskList) {
        completedTasks.forEach(task => completedTaskList.appendChild(buildTaskHTML(task)));
    }
}

// --- DYNAMIC TIME-SLICE & SCHEDULE GENERATOR ---

function generateSchedule() {
    const wakeVal = document.getElementById('startTime').value;
    const sleepVal = document.getElementById('endTime').value;

    const todayStr = new Date().toISOString().split('T')[0];
    const baseDate = `${todayStr}T`;

    let wakeTime = new Date(`${baseDate}${wakeVal}:00`);
    let sleepTime = new Date(`${baseDate}${sleepVal}:00`);

    if (sleepTime <= wakeTime) {
        sleepTime.setDate(sleepTime.getDate() + 1);
    }

    const blockedRows = document.querySelectorAll('.blocked-row');
    const blockedWindows = [];

    blockedRows.forEach(row => {
        const labelInput = row.querySelector('.block-label');
        const startInput = row.querySelector('.block-start');
        const endInput = row.querySelector('.block-end');

        const label = (labelInput && labelInput.value) ? labelInput.value : 'Blocked';
        const startVal = startInput ? startInput.value : null;
        const endVal = endInput ? endInput.value : null;

        if (startVal && endVal) {
            let bStart = new Date(`${baseDate}${startVal}:00`);
            let bEnd = new Date(`${baseDate}${endVal}:00`);
            if (bStart < wakeTime) bStart.setDate(bStart.getDate() + 1);
            if (bEnd <= bStart) bEnd.setDate(bEnd.getDate() + 1);

            blockedWindows.push({ label, start: bStart, end: bEnd, isBlocked: true });
        }
    });

    blockedWindows.sort((a, b) => a.start - b.start);

    let freeIntervals = [];
    let currentTime = new Date(wakeTime);

    blockedWindows.forEach(block => {
        if (currentTime < block.start) {
            freeIntervals.push({ start: new Date(currentTime), end: new Date(block.start), isBlocked: false });
        }
        freeIntervals.push(block);
        currentTime = new Date(Math.max(currentTime, block.end));
    });

    if (currentTime < sleepTime) {
        freeIntervals.push({ start: new Date(currentTime), end: new Date(sleepTime), isBlocked: false });
    }

    renderTimeSections(freeIntervals);
}

function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderTimeSections(intervals) {
    const container = document.getElementById('tasksContainer') || document.getElementById('taskList');
    if (!container) return;

    container.innerHTML = '';

    let sliceIndex = 1;

    intervals.forEach(interval => {
        const section = document.createElement('div');
        section.className = interval.isBlocked ? 'time-section blocked' : 'time-section active';

        const header = document.createElement('h3');
        if (interval.isBlocked) {
            header.innerText = `🚫 ${interval.label} (${formatTime(interval.start)} - ${formatTime(interval.end)})`;
            section.appendChild(header);
            section.innerHTML += `<p class="blocked-text">Tasks cannot be assigned during this period.</p>`;
        } else {
            const sliceId = `SLICE_${sliceIndex}`;
            header.innerText = `Slice ${sliceIndex}: ${formatTime(interval.start)} - ${formatTime(interval.end)}`;
            section.appendChild(header);
            section.innerHTML += `<div class="slice-task-list" data-slice="${sliceId}"></div>`;
            sliceIndex++;
        }

        container.appendChild(section);
    });

    const modal = document.getElementById('scheduleModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function addBlockedRow() {
    const container = document.getElementById('blockedWindowsContainer');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'blocked-row';
    row.innerHTML = `
        <input type="text" placeholder="Activity (e.g. Class)" class="block-label">
        <input type="time" class="block-start">
        <span>to</span>
        <input type="time" class="block-end">
    `;
    container.appendChild(row);
}

// --- UTILITY & INIT ---

function insertMarkdown(syntax) {
    const textarea = document.getElementById('editTaskDescription');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    if (syntax === '**bold**') {
        const selectedText = text.substring(start, end) || 'text';
        textarea.value = text.substring(0, start) + '**' + selectedText + '**' + text.substring(end);
    } else {
        textarea.value = text.substring(0, start) + syntax + text.substring(end);
    }

    textarea.focus();
    updatePreview();
}

// Event Listeners for Schedule Modal Buttons
document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generateSlicesBtn');
    if (generateBtn) {
        generateBtn.addEventListener('click', generateSchedule);
    }

    const addBlockBtn = document.getElementById('addBlockBtn');
    if (addBlockBtn) {
        addBlockBtn.addEventListener('click', addBlockedRow);
    }
});

// Register Service Worker for PWA support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('PWA Service Worker registered:', reg.scope))
            .catch(err => console.error('Service Worker registration failed:', err));
    });
}

void fetchTasks();
setInterval(fetchTasks, 60000);