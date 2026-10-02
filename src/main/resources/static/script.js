const API_URL = '/api/tasks';
let currentEditId = null;
let currentDeleteId = null;
let allTasks = [];
let currentSlices = [];

// Load stored slices on boot
try {
    const savedSlices = localStorage.getItem('daily_time_slices');
    if (savedSlices) currentSlices = JSON.parse(savedSlices);
} catch (e) {
    console.error('Failed to load slices:', e);
}

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

function editTask(id) {
    currentEditId = id;
    const task = allTasks.find(t => t.id === id);

    document.getElementById('editTaskInput').value = task.title;
    document.getElementById('editTaskDescription').value = cleanDescription(task.description);

    const sliceSelect = document.getElementById('editTaskSlice');
    if (sliceSelect) {
        sliceSelect.value = getTaskSlice(task);
    }

    document.getElementById('editModal').classList.remove('hidden');
    updatePreview();
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
        window.alert('Task could not be saved. Please try again.');
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
}

async function toggleRollover(id) {
    try {
        await fetch(`${API_URL}/${id}/rollover`, { method: 'PUT' });
        fetchTasks();
    } catch (error) {
        console.error('Error toggling rollover:', error);
    }
}

// --- DYNAMIC SLICES & SCHEDULE GENERATOR ---

function openScheduleModal() {
    const modal = document.getElementById('scheduleModal');
    if (modal) modal.classList.remove('hidden');
}

function closeScheduleModal() {
    const modal = document.getElementById('scheduleModal');
    if (modal) modal.classList.add('hidden');
}

function updateSliceDropdowns() {
    const taskSliceSelect = document.getElementById('taskSlice');
    const editTaskSliceSelect = document.getElementById('editTaskSlice');

    const activeSlicesOnly = currentSlices.filter(s => !s.isBlocked);

    let optionsHTML = '<option value="">No Slice (Unassigned)</option>';
    activeSlicesOnly.forEach(slice => {
        optionsHTML += `<option value="${slice.id}">${slice.label}</option>`;
    });

    if (taskSliceSelect) taskSliceSelect.innerHTML = optionsHTML;
    if (editTaskSliceSelect) editTaskSliceSelect.innerHTML = optionsHTML;
}

function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

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

    let intervals = [];
    let currentTime = new Date(wakeTime);
    let sliceNum = 1;

    blockedWindows.forEach(block => {
        if (currentTime < block.start) {
            const id = `slice_${sliceNum++}`;
            const label = `Slice ${sliceNum - 1}: ${formatTime(currentTime)} - ${formatTime(block.start)}`;
            intervals.push({ id, label, start: new Date(currentTime), end: new Date(block.start), isBlocked: false });
        }
        intervals.push({
            id: `blocked_${Date.now()}_${Math.random()}`,
            label: `🚫 ${block.label} (${formatTime(block.start)} - ${formatTime(block.end)})`,
            start: block.start,
            end: block.end,
            isBlocked: true
        });
        currentTime = new Date(Math.max(currentTime, block.end));
    });

    if (currentTime < sleepTime) {
        const id = `slice_${sliceNum++}`;
        const label = `Slice ${sliceNum - 1}: ${formatTime(currentTime)} - ${formatTime(sleepTime)}`;
        intervals.push({ id, label, start: new Date(currentTime), end: new Date(sleepTime), isBlocked: false });
    }

    currentSlices = intervals;
    localStorage.setItem('daily_time_slices', JSON.stringify(currentSlices));

    updateSliceDropdowns();
    closeScheduleModal();
    renderTasks(allTasks);
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

// --- RENDER TASKS GROUPED BY SLICES ---

function renderTasks(tasks) {
    const container = document.getElementById('scheduleSlicesContainer');
    const fallbackList = document.getElementById('taskList');
    const completedTaskList = document.getElementById('completedTaskList');
    const completedSection = document.getElementById('completedSection');

    if (!container) return;

    container.innerHTML = '';
    if (fallbackList) fallbackList.innerHTML = '';
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

    if (currentSlices.length > 0) {
        currentSlices.forEach(slice => {
            const section = document.createElement('div');
            section.className = slice.isBlocked ? 'time-section blocked' : 'time-section active';
            section.style.marginBottom = '1.5rem';

            const header = document.createElement('h3');
            header.style.marginBottom = '0.5rem';
            header.innerText = slice.label;
            section.appendChild(header);

            if (slice.isBlocked) {
                const blockedNote = document.createElement('p');
                blockedNote.className = 'blocked-text';
                blockedNote.style.opacity = '0.7';
                blockedNote.innerText = 'Tasks cannot be assigned during this period.';
                section.appendChild(blockedNote);
            } else {
                const ul = document.createElement('ul');
                ul.className = 'task-list';

                const sliceTasks = tasksBySlice[slice.id] || [];
                sliceTasks.forEach(task => ul.appendChild(buildTaskHTML(task)));

                section.appendChild(ul);
            }

            container.appendChild(section);
        });
    }

    if (unassignedTasks.length > 0) {
        const unassignedSection = document.createElement('div');
        unassignedSection.className = 'time-section unassigned';
        unassignedSection.style.marginBottom = '1.5rem';

        const header = document.createElement('h3');
        header.innerText = 'Unassigned Tasks';
        unassignedSection.appendChild(header);

        const ul = document.createElement('ul');
        ul.className = 'task-list';
        unassignedTasks.forEach(task => ul.appendChild(buildTaskHTML(task)));
        unassignedSection.appendChild(ul);

        container.appendChild(unassignedSection);
    }

    if (completedTaskList) {
        completedTasks.forEach(task => completedTaskList.appendChild(buildTaskHTML(task)));
    }
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

document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generateSlicesBtn');
    if (generateBtn) generateBtn.addEventListener('click', generateSchedule);

    const addBlockBtn = document.getElementById('addBlockBtn');
    if (addBlockBtn) addBlockBtn.addEventListener('click', addBlockedRow);

    updateSliceDropdowns();
});

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registered:', reg.scope))
            .catch(err => console.error('Service Worker failed:', err));
    });
}

void fetchTasks();
setInterval(fetchTasks, 60000);