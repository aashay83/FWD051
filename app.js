// Attendance OS — shared JavaScript for all four pages

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function loadData(key, fallback) {
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return value ?? fallback;
    } catch (error) {
        console.error(`Could not read ${key} from localStorage:`, error);
        return fallback;
    }
}

let subjects = loadData("subjects", []);
let timetable = loadData("timetable", []);
let attendance = loadData("attendance", {});
let remindersEnabled = localStorage.getItem("classRemindersEnabled") === "true";
let selectedDay = days[(new Date().getDay() + 6) % 7];

function save() {
    localStorage.setItem("subjects", JSON.stringify(subjects));
    localStorage.setItem("timetable", JSON.stringify(timetable));
    localStorage.setItem("attendance", JSON.stringify(attendance));
}

function today() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const date = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${date}`;
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
}

function getStats(subjectId) {
    const records = Object.values(attendance).filter(record => record.subject === subjectId);
    const present = records.filter(record => record.status === "Present").length;
    const total = records.length;
    return {
        present,
        total,
        absent: total - present,
        percentage: total ? present / total * 100 : 0
    };
}

function safeMiss(present, total, target = 75) {
    const rate = target / 100;
    return Math.max(0, Math.floor((present - rate * total) / rate));
}

function needed(present, total, target = 75) {
    const rate = target / 100;
    if (rate >= 1) return Math.max(0, total - present);
    return Math.max(0, Math.ceil((rate * total - present) / (1 - rate)));
}

// SUBJECTS PAGE
function renderSubjects() {
    const list = document.getElementById("subjectList");
    const select = document.getElementById("classSubject");
    if (list) {
        list.innerHTML = subjects.map(subject => {
            const stats = getStats(subject.id);
            return `
                <div class="card subject-row">
                    <div>
                        <h3>${escapeHTML(subject.name)}</h3>
                        <p class="muted">${escapeHTML(subject.code || "No code")} · Target ${subject.target}%</p>
                        <p>${stats.present}/${stats.total} attended</p>
                        <div class="progress"><div style="width:${stats.percentage}%"></div></div>
                        <strong>${stats.percentage.toFixed(1)}%</strong>
                    </div>
                    <button class="danger" type="button" onclick="deleteSubject('${subject.id}')">Delete</button>
                </div>`;
        }).join("") || '<p class="muted">No subjects added yet.</p>';
    }

    if (select) {
        const previous = select.value;
        select.innerHTML = subjects.map(subject =>
            `<option value="${subject.id}">${escapeHTML(subject.name)}</option>`
        ).join("");
        if (!subjects.length) select.innerHTML = '<option value="">Add a subject first</option>';
        else if (subjects.some(subject => subject.id === previous)) select.value = previous;
    }
}

function addSubject() {
    const nameInput = document.getElementById("subjectName");
    const codeInput = document.getElementById("subjectCode");
    const targetInput = document.getElementById("target");
    if (!nameInput || !codeInput || !targetInput) return;

    const name = nameInput.value.trim();
    const code = codeInput.value.trim();
    const target = Number(targetInput.value);

    if (!name) return alert("Enter subject name!");
    if (!Number.isFinite(target) || target < 1 || target > 100) {
        return alert("Enter an attendance target between 1 and 100.");
    }

    subjects.push({ id: Date.now().toString() + Math.random(), name, code, target });
    nameInput.value = "";
    codeInput.value = "";
    save();
    renderAll();
}

function deleteSubject(id) {
    if (!confirm("Delete this subject, its timetable classes and all related attendance records?")) return;

    const classIds = timetable.filter(item => item.subject === id).map(item => item.id);
    subjects = subjects.filter(subject => subject.id !== id);
    timetable = timetable.filter(item => item.subject !== id);

    Object.keys(attendance).forEach(key => {
        if (classIds.some(classId => key.endsWith("_" + classId))) delete attendance[key];
    });

    save();
    renderAll();
}

// TIMETABLE PAGE
function renderTimetable() {
    const daysContainer = document.getElementById("days");
    const dayTitle = document.getElementById("selectedDay");
    const classContainer = document.getElementById("dayClasses");

    if (daysContainer) {
        daysContainer.innerHTML = days.map(day => `
            <button class="day ${day === selectedDay ? "selected" : ""}" type="button" onclick="selectDay('${day}')">
                ${day.slice(0, 3)}
                <strong>${timetable.filter(item => item.day === day).length}</strong>
            </button>
        `).join("");
    }

    if (dayTitle) dayTitle.textContent = selectedDay;

    if (classContainer) {
        const classes = timetable.filter(item => item.day === selectedDay)
            .sort((a, b) => a.start.localeCompare(b.start));

        classContainer.innerHTML = classes.length ? classes.map(item => {
            const subject = subjects.find(entry => entry.id === item.subject);
            return `
                <div class="class-row">
                    <div>
                        <strong>${escapeHTML(subject ? subject.name : "Deleted subject")}</strong>
                        <p class="muted">${escapeHTML(item.start)} – ${escapeHTML(item.end)}</p>
                    </div>
                    <button type="button" onclick="openAttendanceForClass('${item.id}')">Mark</button>
                    <button class="danger" type="button" onclick="deleteClass('${item.id}')">×</button>
                </div>`;
        }).join("") : '<p class="muted">No classes scheduled.</p>';
    }
}

function selectDay(day) {
    selectedDay = day;
    renderTimetable();
}

function addClass() {
    const subject = document.getElementById("classSubject")?.value;
    const day = document.getElementById("classDay")?.value;
    const start = document.getElementById("startTime")?.value;
    const end = document.getElementById("endTime")?.value;

    if (!subject) return alert("Add a subject first!");
    if (!start || !end || end <= start) return alert("Enter a valid time range.");

    timetable.push({ id: Date.now().toString() + Math.random(), subject, day, start, end });
    selectedDay = day;
    save();
    renderAll();
}

function deleteClass(id) {
    if (!confirm("Delete this class and its attendance records?")) return;
    timetable = timetable.filter(item => item.id !== id);
    Object.keys(attendance).forEach(key => {
        if (key.endsWith("_" + id)) delete attendance[key];
    });
    save();
    renderAll();
}

// ATTENDANCE PAGE
function openAttendanceForClass(classId) {
    const classSelect = document.getElementById("recordClass");
    if (classSelect) {
        classSelect.value = classId;
        const record = attendance[today() + "_" + classId];
        const status = document.getElementById("recordStatus");
        if (status) status.value = record?.status || "Present";
        const date = document.getElementById("recordDate");
        if (date) date.value = today();
        document.getElementById("recordDate")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
        window.location.href = "attendance.html";
    }
}

function renderAttendancePage() {
    const classSelect = document.getElementById("recordClass");
    const dateInput = document.getElementById("recordDate");
    const filter = document.getElementById("filterSubject");
    const history = document.getElementById("attendanceHistory");

    if (classSelect) {
        const previous = classSelect.value;
        classSelect.innerHTML = timetable.map(item => {
            const subject = subjects.find(entry => entry.id === item.subject);
            return `<option value="${item.id}">${escapeHTML(subject?.name || "Deleted subject")} — ${escapeHTML(item.day)} (${escapeHTML(item.start)}–${escapeHTML(item.end)})</option>`;
        }).join("");
        if (!timetable.length) classSelect.innerHTML = '<option value="">Add a class in Timetable first</option>';
        else if (timetable.some(item => item.id === previous)) classSelect.value = previous;
    }

    if (dateInput && !dateInput.value) dateInput.value = today();

    if (filter) {
        const previous = filter.value || "all";
        filter.innerHTML = '<option value="all">All subjects</option>' +
            subjects.map(subject => `<option value="${subject.id}">${escapeHTML(subject.name)}</option>`).join("");
        if (previous === "all" || subjects.some(subject => subject.id === previous)) filter.value = previous;
    }

    if (history) {
        const selectedSubject = filter?.value || "all";
        const records = Object.entries(attendance)
            .map(([key, record]) => ({ key, ...record }))
            .filter(record => selectedSubject === "all" || record.subject === selectedSubject)
            .sort((a, b) => b.date.localeCompare(a.date));

        history.innerHTML = records.length ? records.map(record => {
            const subject = subjects.find(entry => entry.id === record.subject);
            const classId = record.key.slice(record.key.lastIndexOf("_") + 1);
            return `
                <div class="class-row">
                    <div>
                        <strong>${escapeHTML(subject?.name || "Deleted subject")}</strong>
                        <p class="muted">${escapeHTML(record.date)}</p>
                    </div>
                    <span class="${record.status === "Present" ? "attendance-present" : "attendance-absent"}">${escapeHTML(record.status)}</span>
                    <button type="button" onclick="editAttendance('${record.key}')">Edit</button>
                    <button class="danger" type="button" onclick="deleteAttendance('${record.key}')">×</button>
                </div>`;
        }).join("") : '<p class="muted">No attendance records yet. Mark a class above to get started.</p>';
    }
}

function saveAttendance() {
    const classId = document.getElementById("recordClass")?.value;
    const date = document.getElementById("recordDate")?.value;
    const status = document.getElementById("recordStatus")?.value;
    if (!classId) return alert("Add a class to your timetable first.");
    if (!date) return alert("Choose a date.");

    const session = timetable.find(item => item.id === classId);
    if (!session) return alert("That timetable class could not be found.");

    attendance[date + "_" + classId] = { subject: session.subject, status, date };
    save();
    renderAll();
    alert("Attendance saved.");
}

function editAttendance(key) {
    const record = attendance[key];
    if (!record) return;
    const answer = prompt("Type P for Present or A for Absent:", record.status === "Present" ? "P" : "A");
    if (!answer) return;
    const status = answer.trim().toUpperCase();
    if (status !== "P" && status !== "A") return alert("Enter P or A.");

    record.status = status === "P" ? "Present" : "Absent";
    save();
    renderAll();
}

function deleteAttendance(key) {
    if (!confirm("Delete this attendance record?")) return;
    delete attendance[key];
    save();
    renderAll();
}

// DASHBOARD PAGE
function renderDashboard() {
    const overall = document.getElementById("overall");
    if (!overall) return;

    const records = Object.values(attendance);
    const present = records.filter(record => record.status === "Present").length;
    const total = records.length;
    const absent = total - present;
    const percentage = total ? present / total * 100 : 0;

    overall.textContent = percentage.toFixed(1) + "%";
    document.getElementById("present").textContent = present;
    document.getElementById("absent").textContent = absent;
    document.getElementById("safe").textContent = total && percentage >= 75 ? safeMiss(present, total) : 0;
    document.getElementById("progressBar").style.width = percentage + "%";
    document.getElementById("status").textContent = !total
        ? "Mark your first class to begin tracking."
        : percentage >= 75
            ? `You're meeting your 75% target. You can miss ${safeMiss(present, total)} more classes.`
            : `You need to attend the next ${needed(present, total)} classes to reach 75%.`;

    const subjectStats = document.getElementById("subjectStats");
    subjectStats.innerHTML = subjects.map(subject => {
        const stats = getStats(subject.id);
        return `
            <div class="card">
                <h3>${escapeHTML(subject.name)}</h3>
                <h2>${stats.percentage.toFixed(1)}%</h2>
                <div class="progress"><div style="width:${stats.percentage}%"></div></div>
                <p class="muted">${stats.present}/${stats.total} attended · ${stats.absent} absent</p>
            </div>`;
    }).join("") || '<p class="muted">Add subjects to see statistics.</p>';

    const weekday = days[(new Date().getDay() + 6) % 7];
    const classes = timetable.filter(item => item.day === weekday).sort((a, b) => a.start.localeCompare(b.start));
    document.getElementById("todayClasses").innerHTML = classes.map(item => {
        const subject = subjects.find(entry => entry.id === item.subject);
        const record = attendance[today() + "_" + item.id];
        return `
            <div class="class-row">
                <div>
                    <strong>${escapeHTML(subject?.name || "Deleted subject")}</strong>
                    <p class="muted">${escapeHTML(item.start)} – ${escapeHTML(item.end)}</p>
                </div>
                <span>${record ? escapeHTML(record.status) : "Not marked"}</span>
                <button type="button" onclick="openAttendanceForClass('${item.id}')">Mark</button>
            </div>`;
    }).join("") || '<p class="muted">No classes today.</p>';
}

// THEME
function setupTheme() {
    const savedTheme = localStorage.getItem("attendanceTheme");
    if (savedTheme === "light") document.body.classList.add("light");

    const button = document.getElementById("themeBtn");
    if (button) {
        button.addEventListener("click", () => {
            document.body.classList.toggle("light");
            localStorage.setItem("attendanceTheme", document.body.classList.contains("light") ? "light" : "dark");
        });
    }
}

// REMINDERS
const REMINDER_LEAD_MINUTES = 5;

function updateReminderButton() {
    const button = document.getElementById("reminderBtn");
    if (!button) return;

    if (!("Notification" in window)) {
        button.textContent = "🔔 Notifications unavailable";
        button.disabled = true;
        return;
    }

    button.disabled = false;
    button.textContent = remindersEnabled && Notification.permission === "granted"
        ? "🔔 Disable reminders"
        : "🔕 Enable reminders";
}

function setReminderPreference(enabled) {
    remindersEnabled = enabled;
    localStorage.setItem("classRemindersEnabled", String(enabled));
    updateReminderButton();
}

async function toggleReminders() {
    if (remindersEnabled) {
        setReminderPreference(false);
        alert("Class reminders disabled.");
        return;
    }

    if (!("Notification" in window)) return alert("Your browser does not support notifications.");
    if (Notification.permission === "denied") {
        return alert("Notifications are blocked by your browser. Allow them in your site settings first.");
    }

    if (Notification.permission === "default") {
        try {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") {
                updateReminderButton();
                return alert("Notification permission was not granted.");
            }
        } catch (error) {
            console.error(error);
            return alert("Could not enable notifications.");
        }
    }

    setReminderPreference(true);
    alert("Class reminders enabled! You'll receive a notification 5 minutes before class while this page is open.");
    checkClassReminders();
}

function checkClassReminders() {
    if (!remindersEnabled || !("Notification" in window) || Notification.permission !== "granted") return;

    const now = new Date();
    const weekday = days[(now.getDay() + 6) % 7];
    const currentDate = today();

    timetable.filter(item => item.day === weekday && item.start).forEach(item => {
        const [hours, minutes] = item.start.split(":").map(Number);
        const classStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
        const reminderTime = new Date(classStart.getTime() - REMINDER_LEAD_MINUTES * 60 * 1000);

        if (now < reminderTime || now >= classStart) return;

        const reminderKey = `classReminder_${currentDate}_${item.id}`;
        if (localStorage.getItem(reminderKey) === "sent") return;

        const subject = subjects.find(entry => entry.id === item.subject);
        const formattedTime = classStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

        try {
            const notification = new Notification("Class starts in 5 minutes", {
                body: `${subject ? subject.name : "Your class"} starts at ${formattedTime}. Time to get ready!`,
                tag: reminderKey
            });
            notification.onclick = () => {
                window.focus();
                notification.close();
            };
            localStorage.setItem(reminderKey, "sent");
        } catch (error) {
            console.error("Could not show notification:", error);
        }
    });
}

// INITIALISE ONLY THE ELEMENTS THAT EXIST ON THE CURRENT PAGE
function renderAll() {
    renderSubjects();
    renderTimetable();
    renderAttendancePage();
    renderDashboard();
}

document.addEventListener("DOMContentLoaded", () => {
    setupTheme();
    updateReminderButton();

    document.getElementById("addSubject")?.addEventListener("click", addSubject);
    document.getElementById("addClass")?.addEventListener("click", addClass);
    document.getElementById("saveAttendance")?.addEventListener("click", saveAttendance);
    document.getElementById("filterSubject")?.addEventListener("change", renderAttendancePage);
    document.getElementById("reminderBtn")?.addEventListener("click", toggleReminders);

    renderAll();

    // The reminder checker runs only while a page of Attendance OS is open.
    setInterval(checkClassReminders, 15000);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) checkClassReminders();
    });
});
