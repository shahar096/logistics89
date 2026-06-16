
    const STORAGE_KEY = "orgPeopleEventsPWA_v7_fixed_units";
    function normalizeUnitName(unit) {
      const clean = String(unit || "").trim();
      if (clean === "מפח") return "מפח\"ט";
      return clean;
    }
    let people = [];
    let selectedUnit = "all";
    const allowedUnits = ['מפח"ט', '212', '217', '621', 'ביה"ס', 'יחס"מ', '6212', '6217', 'אחר'];
    const $ = (id) => document.getElementById(id);

    const firebaseConfig = {
      apiKey: "AIzaSyACCyeExz1Xf80N6xs4kaSTGO7YcWfOslS",
      authDomain: "logistics89-fa529.firebaseapp.com",
      projectId: "logistics89-fa529",
      storageBucket: "logistics89-fa529.firebasestorage.app",
      messagingSenderId: "898245761567",
      appId: "1:898245761567:web:7b9981639d4157a48bd32a",
      measurementId: "G-KTW88316MN"
    };

    let db = null;
    let peopleCollection = null;
    let tasksCollection = null;
    let schedulesCollection = null;
    let usersCollection = null;
    let tasks = [];
    let schedules = [];
    let selectedScheduleDate = null;
    let firebaseReady = false;

    try {
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
      peopleCollection = db.collection("people");
      tasksCollection = db.collection("tasks");
      schedulesCollection = db.collection("schedules");
      usersCollection = db.collection("systemUsers");
      firebaseReady = true;
    } catch (err) {
      console.error("Firebase init error", err);
    }

    function createId() { return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2); }

    function saveLocalBackup() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(people));
    }

    async function savePersonToCloud(person) {
      if (!firebaseReady || !peopleCollection) throw new Error("Firebase לא מחובר");
      await peopleCollection.doc(person.id).set(person);
    }

    async function deletePersonFromCloud(id) {
      if (!firebaseReady || !peopleCollection) throw new Error("Firebase לא מחובר");
      await peopleCollection.doc(id).delete();
    }

    async function saveTaskToCloud(task) {
      if (!firebaseReady || !tasksCollection) throw new Error("Firebase לא מחובר");
      await tasksCollection.doc(task.id).set(task);
    }
    async function deleteTaskFromCloud(id) {
      if (!firebaseReady || !tasksCollection) throw new Error("Firebase לא מחובר");
      await tasksCollection.doc(id).delete();
    }
    async function saveScheduleToCloud(item) {
      if (!firebaseReady || !schedulesCollection) throw new Error("Firebase לא מחובר");
      await schedulesCollection.doc(item.id).set(item);
    }
    async function deleteScheduleFromCloud(id) {
      if (!firebaseReady || !schedulesCollection) throw new Error("Firebase לא מחובר");
      await schedulesCollection.doc(id).delete();
    }

    function startCloudSync() {
      if (!firebaseReady || !peopleCollection) {
        people = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").map(p => ({ ...p, unit: normalizeUnitName(p.unit) }));
        render();
        alert("Firebase לא מחובר. הנתונים יישמרו רק במכשיר הזה.");
        return;
      }
      peopleCollection.onSnapshot(snapshot => {
        people = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .map(p => ({ ...p, unit: normalizeUnitName(p.unit) }));
        saveLocalBackup();
        updateSupervisorOptions();
        render();
      }, err => {
        console.error("Firestore sync error", err);
        people = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").map(p => ({ ...p, unit: normalizeUnitName(p.unit) }));
        render();
        alert("לא ניתן לקרוא נתונים מהענן. בדוק את חוקי Firestore או את החיבור לאינטרנט.");
      });
      tasksCollection.onSnapshot(snapshot => {
        tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTasks();
      });
      schedulesCollection.onSnapshot(snapshot => {
        const loadedSchedules = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        schedules = loadedSchedules;
        renderCalendar();

        const now = new Date();
        const minToday = new Date(2026, 4, 30);
        const effectiveNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()) < minToday ? minToday : now;
        const todayOnly = new Date(effectiveNow.getFullYear(), effectiveNow.getMonth(), effectiveNow.getDate());
        const toDate = (value) => {
          const s = String(value || "").trim();
          let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (m) return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
          m = s.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
          if (m) return new Date(Number(m[3]), Number(m[2])-1, Number(m[1]));
          const d = new Date(s);
          return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
        };
        const toMinutes = (time) => {
          const m = String(time || "").match(/^(\d{1,2}):(\d{2})/);
          return m ? Number(m[1]) * 60 + Number(m[2]) : null;
        };
        const isFutureForScheduleDashboard = (x) => {
          const d = toDate(x.date);
          if (!d) return false;
          if (d.getTime() > todayOnly.getTime()) return true;
          if (d.getTime() < todayOnly.getTime()) return false;
          const end = toMinutes(x.end);
          const start = toMinutes(x.start);
          const endTime = end !== null ? end : (start !== null ? start + Number(x.duration || 60) : 24*60);
          return endTime >= (effectiveNow.getHours() * 60 + effectiveNow.getMinutes());
        };

        window.allSchedules = loadedSchedules;
        window.futureSchedulesOnly = loadedSchedules.filter(isFutureForScheduleDashboard);
        schedules = window.futureSchedulesOnly;
        renderSchedule();

        schedules = loadedSchedules;
        if (selectedScheduleDate) renderDaySchedule(selectedScheduleDate);
      });
    }

    function todayIso() {
      const d = new Date();
      return d.toISOString().slice(0, 10);
    }

    function futureIso(days) {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    }

    if (!$("timelineStart").value) $("timelineStart").value = todayIso();
    if (!$("timelineEnd").value) $("timelineEnd").value = "2028-12-31";
    if ($("timelineStep") && !$("timelineStep").value) $("timelineStep").value = "month";

    function formatDate(dateString) {
      if (!dateString) return "";
      const d = new Date(dateString + "T00:00:00");
      return d.toLocaleDateString("he-IL");
    }

    function toDate(dateString) {
      return dateString ? new Date(dateString + "T00:00:00") : null;
    }

    function addByStep(date, step) {
      const d = new Date(date);
      if (step === "day") d.setDate(d.getDate() + 1);
      if (step === "week") d.setDate(d.getDate() + 7);
      if (step === "month") d.setMonth(d.getMonth() + 1);
      if (step === "year") d.setFullYear(d.getFullYear() + 1);
      return d;
    }

    function periodEnd(date, step) {
      const d = new Date(date);
      if (step === "day") return d;
      const next = addByStep(d, step);
      next.setDate(next.getDate() - 1);
      return next;
    }

    function iso(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
    function monthDay(dateString) { return dateString ? dateString.slice(5) : ""; }

    function todayMonthDay() {
      const now = new Date();
      return String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
    }

    function daysUntilNext(dateString) {
      if (!dateString) return 99999;
      const now = new Date();
      const parts = dateString.split("-").map(Number);
      const month = parts[1], day = parts[2];
      let next = new Date(now.getFullYear(), month - 1, day);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (next < today) next = new Date(now.getFullYear() + 1, month - 1, day);
      return Math.round((next - today) / (1000 * 60 * 60 * 24));
    }

    function parseSpecialEvents(text) {
      if (!text.trim()) return [];
      return text.split("\n").map(line => line.trim()).filter(Boolean).map(line => {
        const parts = line.split("|").map(x => x.trim());
        return { title: parts[0] || "אירוע מיוחד", date: parts[1] || "" };
      }).filter(e => e.date);
    }

    function buildEvents() {
      const events = [];
      people.forEach(person => {
        if (person.birthday) events.push({ name: person.fullName, type: "יום הולדת", date: person.birthday, personId: person.id });
        if (person.anniversary) events.push({ name: person.fullName, type: "יום נישואין", date: person.anniversary, personId: person.id });
        if (person.startDate) events.push({ name: person.fullName, type: "כניסה לתפקיד", date: person.startDate, personId: person.id });
        if (person.endDate) events.push({ name: person.fullName, type: "סיום תפקיד", date: person.endDate, personId: person.id });
        if (person.rankDate) events.push({ name: person.fullName, type: "קבלת דרגה", date: person.rankDate, personId: person.id });
        if (person.noteDueDate) events.push({ name: person.fullName, type: "הערה לביצוע", date: person.noteDueDate, personId: person.id, notes: person.notes || "" });
        (person.specialEvents || []).forEach(e => events.push({ name: person.fullName, type: e.title, date: e.date, personId: person.id }));
      });
      return events.sort((a, b) => daysUntilNext(a.date) - daysUntilNext(b.date));
    }

    function getTodayEvents() {
      const today = todayMonthDay();
      return buildEvents().filter(e => monthDay(e.date) === today);
    }

    function assignedUnits() {
      return [...new Set(people.map(p => normalizeUnitName(p.unit) || "ללא יחידה"))].filter(unit => unit !== "מפח").sort((a,b)=>a.localeCompare(b, "he"));
    }

    function uniqueUnits() {
      const fromPeople = assignedUnits();
      const extras = fromPeople.filter(unit => !allowedUnits.includes(unit)).sort((a,b)=>a.localeCompare(b, "he"));
      return [...allowedUnits, ...extras];
    }

    function eventHtml(e) {
      const days = daysUntilNext(e.date);
      const daysText = days === 0 ? "היום" : days === 1 ? "מחר" : "בעוד " + days + " ימים";
      const todayClass = days === 0 ? "today-badge" : "";
      return `<div class="item"><h3>${e.type} - ${e.name}</h3><p><span class="badge ${todayClass}">${daysText}</span></p><p>תאריך: ${formatDate(e.date)}</p></div>`;
    }

    function supervisorName(id) {
      const supervisor = people.find(x => x.id === id);
      return supervisor ? `${supervisor.fullName} - ${supervisor.role || "ללא תפקיד"}` : "-";
    }

    function updateSupervisorOptions() {
      const selectedUnit = normalizeUnitName($("unit").value);
      const currentId = $("personId").value;
      const currentValue = $("supervisorId").value;

      const options = people
        .map(p => ({ ...p, unit: normalizeUnitName(p.unit) }))
        .filter(p => p.id !== currentId && (!selectedUnit || p.unit === selectedUnit))
        .sort((a, b) => String(a.fullName || "").localeCompare(String(b.fullName || ""), "he"));

      $("supervisorId").innerHTML = `<option value="">ללא / לא הוגדר</option>` +
        options.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.fullName)} - ${escapeHtml(p.role || "ללא תפקיד")}</option>`).join("");

      if (options.some(p => p.id === currentValue)) $("supervisorId").value = currentValue;
    }

    function personHtml(p) {
      return `<div class="item">
        <h3>${p.fullName}</h3>
        <p><b>תפקיד:</b> ${p.role || "-"}</p>
        <p><b>יחידה:</b> ${p.unit || "-"}</p>
        <p><b>מחלקה:</b> ${p.department || "-"}</p>
        <p><b>דרגה נוכחית:</b> ${p.currentRank || "-"}</p>
        <p><b>כפוף ל:</b> ${supervisorName(p.supervisorId)}</p>
        <p><b>תקופה:</b> ${formatDate(p.startDate) || "-"} עד ${formatDate(p.endDate) || "מכהן כיום / לא הוגדר"}</p>
        <p><b>תאריך לקבלת דרגה:</b> ${formatDate(p.rankDate) || "-"}</p>
        <p><b>יום הולדת:</b> ${formatDate(p.birthday) || "-"}</p>
        <p><b>יום נישואין:</b> ${formatDate(p.anniversary) || "-"}</p>
        <p><b>תאריך לביצוע הערה:</b> ${formatDate(p.noteDueDate) || "-"}</p>
        <p><b>תמריצים / מענקים:</b> ${p.incentives || "-"}</p>
        <p><b>הערות:</b> ${p.notes || "-"}</p>
        <div class="item-actions">
          <button type="button" class="small" onclick="editPerson('${p.id}')">עריכה</button>
          <button type="button" class="small danger" onclick="deletePerson('${p.id}')">מחיקה</button>
        </div>
      </div>`;
    }

    function renderTodayBox() {
      const todayEvents = getTodayEvents();
      const box = $("todayBox");
      if (todayEvents.length === 0) {
        box.classList.remove("has-events");
        $("todayEvents").innerHTML = "אין אירועים מיוחדים היום.";
        return;
      }
      box.classList.add("has-events");
      $("todayEvents").innerHTML = todayEvents.map(e => `<div class="item"><h3>🎊 ${e.type} ל${e.name}</h3><p>חל היום!</p></div>`).join("");
    }

    function renderDashboard() {
      const events = buildEvents();
      $("peopleCount").textContent = people.length;
      $("unitsCount").textContent = assignedUnits().length;
      const upcoming = events.slice(0, 5);
      $("dashboardUpcoming").className = upcoming.length ? "list" : "list empty";
      $("dashboardUpcoming").innerHTML = upcoming.length ? upcoming.map(eventHtml).join("") : "אין עדיין נתונים";
    }

    function searchValue(id) {
      const el = $(id);
      return el ? el.value.trim().toLowerCase() : "";
    }

    function searchableText(values) {
      return values.map(v => String(v || "")).join(" ").toLowerCase();
    }

    function matchesSearch(values, query) {
      if (!query) return true;
      return searchableText(values).includes(query);
    }

    function renderPeople() {
      $("peopleList").className = people.length ? "list" : "list empty";
      $("peopleList").innerHTML = people.length ? people.map(personHtml).join("") : "אין עדיין בעלי תפקידים";
    }

    function renderUnits() {
      const query = searchValue("unitSearch");
      const searchedPeople = people.filter(p => matchesSearch([p.fullName, p.role, p.unit, p.department, p.currentRank, supervisorName(p.supervisorId), p.notes, p.incentives], query));
      const units = [...new Set(searchedPeople.map(p => p.unit || "ללא יחידה"))].sort((a,b)=>a.localeCompare(b,"he"));
      if (selectedUnit !== "all" && !units.includes(selectedUnit)) selectedUnit = "all";
      $("unitButtons").innerHTML = `<button type="button" class="unit-btn ${selectedUnit === "all" ? "active" : ""}" data-unit="all">כל היחידות (${searchedPeople.length})</button>` +
        units.map(unit => {
          const count = searchedPeople.filter(p => (p.unit || "ללא יחידה") === unit).length;
          return `<button type="button" class="unit-btn ${selectedUnit === unit ? "active" : ""}" data-unit="${escapeHtml(unit)}">${escapeHtml(unit)} (${count})</button>`;
        }).join("");

      document.querySelectorAll("#unitButtons .unit-btn").forEach(btn => {
        btn.addEventListener("click", () => selectUnit(btn.dataset.unit));
      });

      const filtered = selectedUnit === "all" ? searchedPeople : searchedPeople.filter(p => (p.unit || "ללא יחידה") === selectedUnit);
      $("unitPeopleList").className = filtered.length ? "list" : "list empty";
      $("unitPeopleList").innerHTML = filtered.length ? filtered.map(personHtml).join("") : "אין בעלי תפקידים ביחידה זו";
    }

    function selectUnit(unit) {
      selectedUnit = unit;
      renderUnits();
    }


    function escapeHtml(value) {
      return String(value || "").replace(/[&<>"']/g, ch => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#039;"}[ch]));
    }

    function updateTreeUnitOptions() {
      const select = $("treeUnitSelect");
      if (!select) return;
      const current = select.value;
      const units = uniqueUnits();
      select.innerHTML = units.map(unit => `<option value="${escapeHtml(unit)}">${escapeHtml(unit)}</option>`).join("");
      if (units.includes(current)) select.value = current;
      else if (units.length) select.value = units[0];
    }

    function renderTreeNode(person, childrenBySupervisor, isRoot = false, visited = new Set()) {
      if (visited.has(person.id)) return "";
      visited.add(person.id);
      const children = childrenBySupervisor.get(person.id) || [];
      const childHtml = children.map(child => renderTreeNode(child, childrenBySupervisor, false, new Set(visited))).join("");
      return `<div class="tree-node-wrap ${children.length ? "has-children" : ""}">
        <div class="tree-node ${isRoot ? "root" : ""}">
          <h3>${escapeHtml(person.fullName)}</h3>
          <p><b>${escapeHtml(person.currentRank || "ללא דרגה")}</b></p>
          <p>${escapeHtml(person.role || "ללא תפקיד")}</p>
          <p>${escapeHtml(person.department || "ללא מחלקה")}</p>
        </div>
        ${children.length ? `<div class="tree-children">${childHtml}</div>` : ""}
      </div>`;
    }

    function renderUnitTree() {
      updateTreeUnitOptions();
      const view = $("unitTreeView");
      const selected = $("treeUnitSelect") ? $("treeUnitSelect").value : "";
      const unitPeople = people.filter(p => (p.unit || "") === selected);
      if (!unitPeople.length) {
        view.className = "org-tree empty";
        view.innerHTML = "אין בעלי תפקידים ביחידה זו";
        return;
      }
      const ids = new Set(unitPeople.map(p => p.id));
      const childrenBySupervisor = new Map();
      unitPeople.forEach(p => {
        if (p.supervisorId && ids.has(p.supervisorId)) {
          if (!childrenBySupervisor.has(p.supervisorId)) childrenBySupervisor.set(p.supervisorId, []);
          childrenBySupervisor.get(p.supervisorId).push(p);
        }
      });
      childrenBySupervisor.forEach(arr => arr.sort((a,b) => (a.role || "").localeCompare(b.role || "", "he") || a.fullName.localeCompare(b.fullName, "he")));
      const roots = unitPeople.filter(p => !p.supervisorId || !ids.has(p.supervisorId))
        .sort((a,b) => (a.role || "").localeCompare(b.role || "", "he") || a.fullName.localeCompare(b.fullName, "he"));
      view.className = "org-tree";
      view.innerHTML = `<div class="tree-level">${roots.map(root => renderTreeNode(root, childrenBySupervisor, true)).join("")}</div>`;
    }

    function renderEvents() {
      const query = searchValue("eventsSearch");
      const events = buildEvents().filter(e => matchesSearch([e.type, e.name, e.date, formatDate(e.date), e.notes], query));
      $("eventsList").className = events.length ? "list" : "list empty";
      $("eventsList").innerHTML = events.length ? events.map(eventHtml).join("") : "אין עדיין אירועים";
    }

    function buildTimelineDates() {
      const start = toDate($("timelineStart").value || todayIso());
      const end = toDate($("timelineEnd").value || "2028-12-31");
      const step = $("timelineStep").value;
      const dates = [];
      let current = new Date(start);
      let safety = 0;

      while (current <= end && safety < 370) {
        dates.push(new Date(current));
        current = addByStep(current, step);
        safety++;
      }
      return dates;
    }

    function periodLabel(dateObj, step) {
      if (step === "day") return formatDate(iso(dateObj));
      if (step === "week") return "שבוע מ-" + formatDate(iso(dateObj));
      if (step === "month") return dateObj.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
      if (step === "year") return String(dateObj.getFullYear());
      return formatDate(iso(dateObj));
    }

    function eventInPeriod(eventDateString, periodStart, step) {
      const eventDate = toDate(eventDateString);
      if (!eventDate) return false;
      const end = periodEnd(periodStart, step);
      if (step === "day") return iso(eventDate) === iso(periodStart);
      if (step === "week") return eventDate >= periodStart && eventDate <= end;
      if (step === "month") return eventDate.getFullYear() === periodStart.getFullYear() && eventDate.getMonth() === periodStart.getMonth();
      if (step === "year") return eventDate.getFullYear() === periodStart.getFullYear();
      return false;
    }

    function recurringEventInPeriod(dateString, periodStart, step) {
      if (!dateString) return false;
      const md = monthDay(dateString);
      if (step === "day") return monthDay(iso(periodStart)) === md;
      if (step === "week") {
        const end = periodEnd(periodStart, step);
        let d = new Date(periodStart);
        while (d <= end) {
          if (monthDay(iso(d)) === md) return true;
          d.setDate(d.getDate() + 1);
        }
        return false;
      }
      if (step === "month") return Number(md.slice(0,2)) === periodStart.getMonth() + 1;
      if (step === "year") return true;
      return false;
    }

    function personEventsForPeriod(person, periodStart, step) {
      const events = [];
      if (person.birthday && recurringEventInPeriod(person.birthday, periodStart, step)) events.push("יום הולדת");
      if (person.anniversary && recurringEventInPeriod(person.anniversary, periodStart, step)) events.push("יום נישואין");
      if (person.rankDate && eventInPeriod(person.rankDate, periodStart, step)) events.push("קבלת דרגה");
      (person.specialEvents || []).forEach(e => {
        if (eventInPeriod(e.date, periodStart, step)) events.push(e.title);
      });
      return events;
    }

    function isActiveInPeriod(person, periodStart, step) {
      const start = toDate(person.startDate);
      const end = toDate(person.endDate);
      const pEnd = periodEnd(periodStart, step);
      if (!start) return false;
      if (end) return start <= pEnd && end >= periodStart;
      return start <= pEnd;
    }

    function hasEndedBefore(person, periodStart) {
      const end = toDate(person.endDate);
      return end && end < periodStart;
    }

    function renderTimeline() {
      const dates = buildTimelineDates();
      const step = $("timelineStep").value;
      const columnCount = dates.length;
      const gridTemplate = `230px repeat(${Math.max(columnCount, 1)}, 95px)`;

      let html = `<div class="timeline-row" style="grid-template-columns:${gridTemplate}"><div class="timeline-cell timeline-name timeline-head">בעל תפקיד</div>`;
      dates.forEach(d => html += `<div class="timeline-cell timeline-head">${periodLabel(d, step)}</div>`);
      html += `</div>`;

      const query = searchValue("timelineSearch");
      const timelinePeople = people.filter(p => matchesSearch([p.fullName, p.role, p.unit, p.department, p.currentRank, supervisorName(p.supervisorId), p.notes, p.incentives], query));
      if (!timelinePeople.length) {
        $("timelineGrid").innerHTML = `<div class="timeline-row" style="grid-template-columns:230px"><div class="timeline-cell timeline-name">אין נתונים</div></div>`;
        return;
      }

      timelinePeople.forEach(p => {
        html += `<div class="timeline-row" style="grid-template-columns:${gridTemplate}"><div class="timeline-cell timeline-name">${p.fullName}<br><span class="hint">${p.role || ""} | ${p.unit || ""}</span></div>`;
        dates.forEach(d => {
          let cls = "";
          if (isActiveInPeriod(p, d, step)) cls = "active-day";
          else if (hasEndedBefore(p, d)) cls = "ended-day";
          const evs = personEventsForPeriod(p, d, step);
          html += `<div class="timeline-cell ${cls}">${evs.map(e => `<span class="event-dot">${e}</span>`).join("")}</div>`;
        });
        html += `</div>`;
      });

      $("timelineGrid").innerHTML = html;
    }

    function render() {
      renderTodayBox();
      renderDashboard();
      renderPeople();
      renderUnits();
      renderUnitTree();
      renderEvents();
      renderTimeline();
      renderTasks();
      renderCalendar();
      renderSchedule();
      if ($("globalSearch") && $("globalSearch").value.trim()) renderGlobalSearch();
    }

    function resetForm() {
      $("personForm").reset();
      $("personId").value = "";
      updateSupervisorOptions();
      $("formTitle").textContent = "הוספת בעל תפקיד";
    }

    function editPerson(id) {
      const p = people.find(x => x.id === id);
      if (!p) return;
      $("personId").value = p.id;
      $("fullName").value = p.fullName || "";
      $("role").value = p.role || "";
      $("unit").value = p.unit || "";
      $("department").value = p.department || "";
      $("currentRank").value = p.currentRank || "";
      updateSupervisorOptions();
      $("supervisorId").value = p.supervisorId || "";
      $("startDate").value = p.startDate || "";
      $("endDate").value = p.endDate || "";
      $("rankDate").value = p.rankDate || "";
      $("birthday").value = p.birthday || "";
      $("anniversary").value = p.anniversary || "";
      
      $("notes").value = p.notes || "";
      $("noteDueDate").value = p.noteDueDate || "";
      if ($("incentives")) $("incentives").value = p.incentives || "";
      $("formTitle").textContent = "עריכת בעל תפקיד";
      switchTab("people");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    async function deletePerson(id) {
      if (!confirm("למחוק את בעל התפקיד?")) return;
      try {
        await deletePersonFromCloud(id);
      } catch (err) {
        console.error(err);
        alert("המחיקה לא נשמרה בענן. בדוק חיבור והרשאות Firestore.");
      }
    }

    function switchTab(tabName) {
      

    function taskPriorityScore(t) {
      const urgent = t.urgent === "כן" ? 1 : 0;
      const important = t.important === "כן" ? 1 : 0;
      if (urgent && important) return 0;
      if (urgent && !important) return 1;
      if (!urgent && important) return 2;
      return 3;
    }
    function renderTasks() {
      const openEl = $("tasksList");
      const doneEl = $("completedTasksList");
      if (!openEl) return;
      const sortTasks = arr => [...arr].sort((a,b) => taskPriorityScore(a)-taskPriorityScore(b) || String(a.dueDate||"").localeCompare(String(b.dueDate||"")));
      const query = searchValue("tasksSearch");
      const filteredTasks = tasks.filter(t => matchesSearch([t.title, t.dueDate, formatDate(t.dueDate), t.urgent, t.important, t.notes, t.completed ? "בוצע" : "פתוח"], query));
      const openTasks = sortTasks(filteredTasks.filter(t => !t.completed));
      const completedTasks = sortTasks(filteredTasks.filter(t => t.completed));
      openEl.className = openTasks.length ? "list" : "list empty";
      openEl.innerHTML = openTasks.length ? openTasks.map(t => {
        const cls = taskPriorityScore(t) === 0 ? "priority-high" : taskPriorityScore(t) < 3 ? "priority-medium" : "priority-low";
        return `<div class="item ${cls}"><h3>${escapeHtml(t.title)}</h3><p><b>גמר ביצוע:</b> ${formatDate(t.dueDate)}</p><p><b>דחוף:</b> ${t.urgent || "לא"} | <b>חשוב:</b> ${t.important || "לא"}</p><p><b>הערות:</b> ${escapeHtml(t.notes || "-")}</p><div class="item-actions"><button type="button" class="small" onclick="completeTask('${t.id}')" title="סמן כבוצע" aria-label="סמן כבוצע">✅</button><button type="button" class="small" onclick="editTask('${t.id}')" title="עריכה" aria-label="עריכה">✏️</button><button type="button" class="small danger" onclick="deleteTask('${t.id}')" title="מחיקה" aria-label="מחיקה">🗑️</button></div></div>`;
      }).join("") : "אין עדיין משימות";
      if (doneEl) {
        doneEl.className = completedTasks.length ? "list" : "list empty";
        doneEl.innerHTML = completedTasks.length ? completedTasks.map(t => `<div class="item priority-low"><h3>${escapeHtml(t.title)}</h3><p><b>גמר ביצוע:</b> ${formatDate(t.dueDate)}</p><p><b>דחוף:</b> ${t.urgent || "לא"} | <b>חשוב:</b> ${t.important || "לא"}</p><p><b>הערות:</b> ${escapeHtml(t.notes || "-")}</p><div class="item-actions"><button type="button" class="small" onclick="reopenTask('${t.id}')" title="החזרה לפתוחות" aria-label="החזרה לפתוחות">↩️</button><button type="button" class="small danger" onclick="deleteTask('${t.id}')" title="מחיקה" aria-label="מחיקה">🗑️</button></div></div>`).join("") : "אין עדיין משימות שבוצעו";
      }
    }
    function resetTaskForm() { if ($("taskForm")) $("taskForm").reset(); if ($("taskId")) $("taskId").value = ""; }
    function editTask(id) {
      const t = tasks.find(x => x.id === id); if (!t) return;
      $("taskId").value = t.id; $("taskTitle").value = t.title || ""; $("taskDueDate").value = t.dueDate || ""; $("taskUrgent").value = t.urgent || "לא"; $("taskImportant").value = t.important || "לא"; $("taskNotes").value = t.notes || ""; switchTab("tasks");
    }
    async function deleteTask(id) { if (!confirm("למחוק את המשימה?")) return; await deleteTaskFromCloud(id); }
    async function completeTask(id) { const t = tasks.find(x => x.id === id); if (!t) return; await saveTaskToCloud({ ...t, completed: true, completedAt: new Date().toISOString() }); }
    async function reopenTask(id) { const t = tasks.find(x => x.id === id); if (!t) return; await saveTaskToCloud({ ...t, completed: false, completedAt: "" }); }

    function initCalendarMonth() { if ($("calendarMonth") && !$("calendarMonth").value) $("calendarMonth").value = todayIso().slice(0,7); }
    function weekNumber(d) {
      const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const dayNum = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate()+4-dayNum);
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
      return Math.ceil((((date-yearStart)/86400000)+1)/7);
    }
    function renderCalendar() {
      const grid = $("calendarGrid"); if (!grid) return; initCalendarMonth();
      const [y,m] = $("calendarMonth").value.split("-").map(Number);
      const first = new Date(y, m-1, 1); const start = new Date(first); start.setDate(start.getDate() - start.getDay());
      const labels = ["שבוע","א","ב","ג","ד","ה","ו","ש"];
      let html = labels.map(l => `<div class="calendar-day" style="min-height:auto;font-weight:bold;text-align:center;background:#fee2e2">${l}</div>`).join("");
      for (let row=0; row<6; row++) {
        const weekDate = new Date(start); weekDate.setDate(start.getDate() + row*7);
        html += `<div class="calendar-day" style="min-height:auto;text-align:center;font-weight:bold;background:#fff1f2">ש${weekNumber(weekDate)}</div>`;
        for (let col=0; col<7; col++) {
          const i=row*7+col;
          const d = new Date(start); d.setDate(start.getDate()+i); const dateStr = iso(d);
          const dayItems = schedules.filter(x => x.date === dateStr).sort((a,b)=>String(a.start||"").localeCompare(String(b.start||"")));
          html += `<div class="calendar-day ${d.getMonth()!==m-1?'muted':''}" onclick="openScheduleModal('${dateStr}')"><div class="num">${d.getDate()}</div>${dayItems.slice(0,3).map(x=>`<span class="mini-event">${escapeHtml(x.start||"")} ${escapeHtml(x.title||"")}</span>`).join("")}</div>`;
        }
      }
      grid.innerHTML = html;
    }
    function openScheduleModal(dateStr) {
      selectedScheduleDate = dateStr; $("scheduleId").value=""; $("scheduleDate").value=dateStr; $("scheduleDateView").value=dateStr; $("modalDateTitle").textContent = "לו\"ז ליום " + formatDate(dateStr); $("scheduleForm").reset(); $("scheduleDate").value=dateStr; $("scheduleDateView").value=dateStr; $("scheduleDuration").value=60; $("scheduleStart").value="08:00"; renderDaySchedule(dateStr); $("scheduleModal").classList.add("open");
    }
    function renderDaySchedule(dateStr) {
      const el = $("dayScheduleList"); if (!el) return;
      const items = schedules.filter(x=>x.date===dateStr).sort((a,b)=>String(a.start||"").localeCompare(String(b.start||"")));
      el.className = items.length ? "list" : "list empty";
      el.innerHTML = items.length ? items.map(x=>`<div class="item"><h3>${escapeHtml(x.start)} | ${escapeHtml(x.title)}</h3><p><b>משך:</b> ${escapeHtml(x.duration)} דקות</p><p><b>משתתפים:</b> ${escapeHtml(x.participants||"-")}</p><p><b>הערות:</b> ${escapeHtml(x.notes||"-")}</p><div class="item-actions"><button type="button" class="small" onclick="editSchedule('${x.id}')" title="עריכה" aria-label="עריכה">✏️</button><button type="button" class="small danger" onclick="deleteSchedule('${x.id}')" title="מחיקה" aria-label="מחיקה">🗑️</button></div></div>`).join("") : "אין לו\"ז ביום זה";
    }
    function renderSchedule() {
      const el = $("scheduleList"); if (!el) return;
      const query = searchValue("scheduleSearch");
      const items = [...(window.futureSchedulesOnly || schedules)].filter(x => matchesSearch([x.date, formatDate(x.date), x.start, x.duration, x.title, x.participants, x.notes], query)).sort((a,b)=>String(a.date||"").localeCompare(String(b.date||"")) || String(a.start||"").localeCompare(String(b.start||"")));
      el.className = items.length ? "list" : "list empty";
      if (!items.length) { el.innerHTML = "אין עדיין לו\"ז"; return; }
      const grouped = new Map();
      items.forEach(x => { if (!grouped.has(x.date)) grouped.set(x.date, []); grouped.get(x.date).push(x); });
      el.innerHTML = [...grouped.entries()].map(([date, dayItems]) => {
        const d = new Date(date + "T00:00:00");
        const title = d.toLocaleDateString("he-IL", { weekday:"long", day:"2-digit", month:"2-digit", year:"numeric" });
        return `<div class="item"><h3>${title}</h3>${dayItems.map(x=>`<div style="padding:8px 0;border-top:1px solid #fee2e2"><b>${escapeHtml(x.start || "")}</b> | ${escapeHtml(x.title || "")}<br><span class="hint">משך: ${escapeHtml(x.duration || "")} דקות | משתתפים: ${escapeHtml(x.participants || "-")}</span><br><span>${escapeHtml(x.notes || "")}</span><div class="actions" style="margin-top:8px"><button type="button" class="secondary small" onclick="editSchedule('${x.id}')" title="עריכה" aria-label="עריכה">✏️</button><button type="button" class="danger small" onclick="deleteSchedule('${x.id}')" title="מחיקה" aria-label="מחיקה">🗑️</button></div></div>`).join("")}</div>`;
      }).join("");
    }
    function editSchedule(id) {
      const x=schedules.find(i=>i.id===id); if(!x) return; openScheduleModal(x.date); $("scheduleId").value=x.id; $("scheduleStart").value=x.start||"08:00"; $("scheduleDuration").value=x.duration||60; $("scheduleTitle").value=x.title||""; if ($("scheduleParticipants")) $("scheduleParticipants").value=x.participants||""; $("scheduleNotes").value=x.notes||"";
    }
    async function deleteSchedule(id) { if(!confirm("למחוק לו\"ז זה?")) return; await deleteScheduleFromCloud(id); }

    function rowsForExport(kind) {
      if (kind === "tasks") return [["משימה","גמר ביצוע","דחוף","חשוב","סטטוס","הערות"], ...tasks.map(t=>[t.title,t.dueDate,t.urgent,t.important,t.completed ? "בוצע" : "פתוח",t.notes])];
      if (kind === "schedule" || kind === "calendar") return [["תאריך","שעה","משך","תוכן","משתתפים","הערות"], ...schedules.map(x=>[x.date,x.start,x.duration,x.title,x.participants||"",x.notes])];
      if (kind === "events") return [["סוג","שם","תאריך","הערות"], ...buildEvents().map(e=>[e.type,e.name,e.date,e.notes||""])];
      if (kind === "unitTree" || kind === "units") return [["שם","תפקיד","יחידה","מחלקה","דרגה","כפוף ל"], ...people.map(p=>[p.fullName,p.role,p.unit,p.department,p.currentRank,supervisorName(p.supervisorId)])];
      if (kind === "timeline") return [["שם","תפקיד","יחידה","תחילת תפקיד","סיום תפקיד","קבלת דרגה"], ...people.map(p=>[p.fullName,p.role,p.unit,p.startDate,p.endDate,p.rankDate])];
      return [[]];
    }
    function exportCSV(kind) {
      const rows = rowsForExport(kind);
      const csv = "\ufeff" + rows.map(r => r.map(v => '"' + String(v ?? "").replaceAll('"','""') + '"').join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = kind + ".csv"; a.click(); URL.revokeObjectURL(a.href);
    }
    function printSection(id) { switchTab(id); setTimeout(()=>window.print(), 200); }

    function checkTodayNotifications() {
      const today = todayMonthDay();
      const todayList = buildEvents().filter(e => monthDay(e.date) === today);
      if (!todayList.length || !("Notification" in window)) return;
      const key = "notified-" + todayIso(); if (localStorage.getItem(key)) return;
      const notify = () => { todayList.forEach(e => new Notification("לוגיסטיקה 89", { body: `${e.type} - ${e.name} היום` })); localStorage.setItem(key,"1"); };
      const now = new Date();
      if (now.getHours() >= 9) {
        if (Notification.permission === "granted") notify();
        else if (Notification.permission !== "denied") Notification.requestPermission().then(p => { if (p === "granted") notify(); });
      }
    }

    function loginInit() {
      if (sessionStorage.getItem("logistics89LoggedIn") === "1") { $("loginOverlay").classList.add("hidden"); return; }
      $("loginBtn").addEventListener("click", () => {
        if ($("loginUser").value.trim() === "log" && $("loginPass").value === "8998") { sessionStorage.setItem("logistics89LoggedIn","1"); $("loginOverlay").classList.add("hidden"); }
        else $("loginError").textContent = "אחד הפרטים שהוזנו אינו נכון";
      });
    }

    document.querySelectorAll(".tab").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tabName));
      document.querySelectorAll(".tab-content").forEach(section => section.classList.toggle("active", section.id === tabName));
      if (tabName === "timeline") renderTimeline();
      if (tabName === "unitTree") renderUnitTree();
      if (tabName === "tasks") renderTasks();
      if (tabName === "calendar") renderCalendar();
      if (tabName === "schedule") renderSchedule();
    }

    

    function taskPriorityScore(t) {
      const urgent = t.urgent === "כן" ? 1 : 0;
      const important = t.important === "כן" ? 1 : 0;
      if (urgent && important) return 0;
      if (urgent && !important) return 1;
      if (!urgent && important) return 2;
      return 3;
    }
    function renderTasks() {
      const openEl = $("tasksList");
      const doneEl = $("completedTasksList");
      if (!openEl) return;
      const sortTasks = arr => [...arr].sort((a,b) => taskPriorityScore(a)-taskPriorityScore(b) || String(a.dueDate||"").localeCompare(String(b.dueDate||"")));
      const query = searchValue("tasksSearch");
      const filteredTasks = tasks.filter(t => matchesSearch([t.title, t.dueDate, formatDate(t.dueDate), t.urgent, t.important, t.notes, t.completed ? "בוצע" : "פתוח"], query));
      const openTasks = sortTasks(filteredTasks.filter(t => !t.completed));
      const completedTasks = sortTasks(filteredTasks.filter(t => t.completed));
      openEl.className = openTasks.length ? "list" : "list empty";
      openEl.innerHTML = openTasks.length ? openTasks.map(t => {
        const cls = taskPriorityScore(t) === 0 ? "priority-high" : taskPriorityScore(t) < 3 ? "priority-medium" : "priority-low";
        return `<div class="item ${cls}"><h3>${escapeHtml(t.title)}</h3><p><b>גמר ביצוע:</b> ${formatDate(t.dueDate)}</p><p><b>דחוף:</b> ${t.urgent || "לא"} | <b>חשוב:</b> ${t.important || "לא"}</p><p><b>הערות:</b> ${escapeHtml(t.notes || "-")}</p><div class="item-actions"><button type="button" class="small" onclick="completeTask('${t.id}')" title="סמן כבוצע" aria-label="סמן כבוצע">✅</button><button type="button" class="small" onclick="editTask('${t.id}')" title="עריכה" aria-label="עריכה">✏️</button><button type="button" class="small danger" onclick="deleteTask('${t.id}')" title="מחיקה" aria-label="מחיקה">🗑️</button></div></div>`;
      }).join("") : "אין עדיין משימות";
      if (doneEl) {
        doneEl.className = completedTasks.length ? "list" : "list empty";
        doneEl.innerHTML = completedTasks.length ? completedTasks.map(t => `<div class="item priority-low"><h3>${escapeHtml(t.title)}</h3><p><b>גמר ביצוע:</b> ${formatDate(t.dueDate)}</p><p><b>דחוף:</b> ${t.urgent || "לא"} | <b>חשוב:</b> ${t.important || "לא"}</p><p><b>הערות:</b> ${escapeHtml(t.notes || "-")}</p><div class="item-actions"><button type="button" class="small" onclick="reopenTask('${t.id}')" title="החזרה לפתוחות" aria-label="החזרה לפתוחות">↩️</button><button type="button" class="small danger" onclick="deleteTask('${t.id}')" title="מחיקה" aria-label="מחיקה">🗑️</button></div></div>`).join("") : "אין עדיין משימות שבוצעו";
      }
    }
    function resetTaskForm() { if ($("taskForm")) $("taskForm").reset(); if ($("taskId")) $("taskId").value = ""; }
    function editTask(id) {
      const t = tasks.find(x => x.id === id); if (!t) return;
      $("taskId").value = t.id; $("taskTitle").value = t.title || ""; $("taskDueDate").value = t.dueDate || ""; $("taskUrgent").value = t.urgent || "לא"; $("taskImportant").value = t.important || "לא"; $("taskNotes").value = t.notes || ""; switchTab("tasks");
    }
    async function deleteTask(id) { if (!confirm("למחוק את המשימה?")) return; await deleteTaskFromCloud(id); }
    async function completeTask(id) { const t = tasks.find(x => x.id === id); if (!t) return; await saveTaskToCloud({ ...t, completed: true, completedAt: new Date().toISOString() }); }
    async function reopenTask(id) { const t = tasks.find(x => x.id === id); if (!t) return; await saveTaskToCloud({ ...t, completed: false, completedAt: "" }); }

    function initCalendarMonth() { if ($("calendarMonth") && !$("calendarMonth").value) $("calendarMonth").value = todayIso().slice(0,7); }
    function weekNumber(d) {
      const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const dayNum = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate()+4-dayNum);
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
      return Math.ceil((((date-yearStart)/86400000)+1)/7);
    }
    function renderCalendar() {
      const grid = $("calendarGrid"); if (!grid) return; initCalendarMonth();
      const [y,m] = $("calendarMonth").value.split("-").map(Number);
      const first = new Date(y, m-1, 1); const start = new Date(first); start.setDate(start.getDate() - start.getDay());
      const labels = ["שבוע","א","ב","ג","ד","ה","ו","ש"];
      let html = labels.map(l => `<div class="calendar-day" style="min-height:auto;font-weight:bold;text-align:center;background:#fee2e2">${l}</div>`).join("");
      for (let row=0; row<6; row++) {
        const weekDate = new Date(start); weekDate.setDate(start.getDate() + row*7);
        html += `<div class="calendar-day" style="min-height:auto;text-align:center;font-weight:bold;background:#fff1f2">ש${weekNumber(weekDate)}</div>`;
        for (let col=0; col<7; col++) {
          const i=row*7+col;
          const d = new Date(start); d.setDate(start.getDate()+i); const dateStr = iso(d);
          const dayItems = schedules.filter(x => x.date === dateStr).sort((a,b)=>String(a.start||"").localeCompare(String(b.start||"")));
          html += `<div class="calendar-day ${d.getMonth()!==m-1?'muted':''}" onclick="openScheduleModal('${dateStr}')"><div class="num">${d.getDate()}</div>${dayItems.slice(0,3).map(x=>`<span class="mini-event">${escapeHtml(x.start||"")} ${escapeHtml(x.title||"")}</span>`).join("")}</div>`;
        }
      }
      grid.innerHTML = html;
    }
    function openScheduleModal(dateStr) {
      selectedScheduleDate = dateStr; $("scheduleId").value=""; $("scheduleDate").value=dateStr; $("scheduleDateView").value=dateStr; $("modalDateTitle").textContent = "לו\"ז ליום " + formatDate(dateStr); $("scheduleForm").reset(); $("scheduleDate").value=dateStr; $("scheduleDateView").value=dateStr; $("scheduleDuration").value=60; $("scheduleStart").value="08:00"; renderDaySchedule(dateStr); $("scheduleModal").classList.add("open");
    }
    function renderDaySchedule(dateStr) {
      const el = $("dayScheduleList"); if (!el) return;
      const items = schedules.filter(x=>x.date===dateStr).sort((a,b)=>String(a.start||"").localeCompare(String(b.start||"")));
      el.className = items.length ? "list" : "list empty";
      el.innerHTML = items.length ? items.map(x=>`<div class="item"><h3>${escapeHtml(x.start)} | ${escapeHtml(x.title)}</h3><p><b>משך:</b> ${escapeHtml(x.duration)} דקות</p><p><b>משתתפים:</b> ${escapeHtml(x.participants||"-")}</p><p><b>הערות:</b> ${escapeHtml(x.notes||"-")}</p><div class="item-actions"><button type="button" class="small" onclick="editSchedule('${x.id}')" title="עריכה" aria-label="עריכה">✏️</button><button type="button" class="small danger" onclick="deleteSchedule('${x.id}')" title="מחיקה" aria-label="מחיקה">🗑️</button></div></div>`).join("") : "אין לו\"ז ביום זה";
    }
    function renderSchedule() {
      const el = $("scheduleList"); if (!el) return;
      const query = searchValue("scheduleSearch");
      const items = [...(window.futureSchedulesOnly || schedules)].filter(x => matchesSearch([x.date, formatDate(x.date), x.start, x.duration, x.title, x.participants, x.notes], query)).sort((a,b)=>String(a.date||"").localeCompare(String(b.date||"")) || String(a.start||"").localeCompare(String(b.start||"")));
      el.className = items.length ? "list" : "list empty";
      if (!items.length) { el.innerHTML = "אין עדיין לו\"ז"; return; }
      const grouped = new Map();
      items.forEach(x => { if (!grouped.has(x.date)) grouped.set(x.date, []); grouped.get(x.date).push(x); });
      el.innerHTML = [...grouped.entries()].map(([date, dayItems]) => {
        const d = new Date(date + "T00:00:00");
        const title = d.toLocaleDateString("he-IL", { weekday:"long", day:"2-digit", month:"2-digit", year:"numeric" });
        return `<div class="item"><h3>${title}</h3>${dayItems.map(x=>`<div style="padding:8px 0;border-top:1px solid #fee2e2"><b>${escapeHtml(x.start || "")}</b> | ${escapeHtml(x.title || "")}<br><span class="hint">משך: ${escapeHtml(x.duration || "")} דקות | משתתפים: ${escapeHtml(x.participants || "-")}</span><br><span>${escapeHtml(x.notes || "")}</span></div>`).join("")}</div>`;
      }).join("");
    }
    function editSchedule(id) {
      const x=schedules.find(i=>i.id===id); if(!x) return; openScheduleModal(x.date); $("scheduleId").value=x.id; $("scheduleStart").value=x.start||"08:00"; $("scheduleDuration").value=x.duration||60; $("scheduleTitle").value=x.title||""; if ($("scheduleParticipants")) $("scheduleParticipants").value=x.participants||""; $("scheduleNotes").value=x.notes||"";
    }
    async function deleteSchedule(id) { if(!confirm("למחוק לו\"ז זה?")) return; await deleteScheduleFromCloud(id); }

    function rowsForExport(kind) {
      if (kind === "tasks") return [["משימה","גמר ביצוע","דחוף","חשוב","סטטוס","הערות"], ...tasks.map(t=>[t.title,t.dueDate,t.urgent,t.important,t.completed ? "בוצע" : "פתוח",t.notes])];
      if (kind === "schedule" || kind === "calendar") return [["תאריך","שעה","משך","תוכן","משתתפים","הערות"], ...schedules.map(x=>[x.date,x.start,x.duration,x.title,x.participants||"",x.notes])];
      if (kind === "events") return [["סוג","שם","תאריך","הערות"], ...buildEvents().map(e=>[e.type,e.name,e.date,e.notes||""])];
      if (kind === "unitTree" || kind === "units") return [["שם","תפקיד","יחידה","מחלקה","דרגה","כפוף ל"], ...people.map(p=>[p.fullName,p.role,p.unit,p.department,p.currentRank,supervisorName(p.supervisorId)])];
      if (kind === "timeline") return [["שם","תפקיד","יחידה","תחילת תפקיד","סיום תפקיד","קבלת דרגה"], ...people.map(p=>[p.fullName,p.role,p.unit,p.startDate,p.endDate,p.rankDate])];
      return [[]];
    }
    function exportCSV(kind) {
      const rows = rowsForExport(kind);
      const csv = "\ufeff" + rows.map(r => r.map(v => '"' + String(v ?? "").replaceAll('"','""') + '"').join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = kind + ".csv"; a.click(); URL.revokeObjectURL(a.href);
    }
    function printSection(id) { switchTab(id); setTimeout(()=>window.print(), 200); }

    function checkTodayNotifications() {
      const today = todayMonthDay();
      const todayList = buildEvents().filter(e => monthDay(e.date) === today);
      if (!todayList.length || !("Notification" in window)) return;
      const key = "notified-" + todayIso(); if (localStorage.getItem(key)) return;
      const notify = () => { todayList.forEach(e => new Notification("לוגיסטיקה 89", { body: `${e.type} - ${e.name} היום` })); localStorage.setItem(key,"1"); };
      const now = new Date();
      if (now.getHours() >= 9) {
        if (Notification.permission === "granted") notify();
        else if (Notification.permission !== "denied") Notification.requestPermission().then(p => { if (p === "granted") notify(); });
      }
    }

    function loginInit() {
      if (sessionStorage.getItem("logistics89LoggedIn") === "1") { $("loginOverlay").classList.add("hidden"); return; }
      $("loginBtn").addEventListener("click", () => {
        if ($("loginUser").value.trim() === "log" && $("loginPass").value === "8998") { sessionStorage.setItem("logistics89LoggedIn","1"); $("loginOverlay").classList.add("hidden"); }
        else $("loginError").textContent = "אחד הפרטים שהוזנו אינו נכון";
      });
    }

    document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
    $("resetForm").addEventListener("click", resetForm);
    $("refreshTimeline").addEventListener("click", renderTimeline);
    $("timelineStep").addEventListener("change", renderTimeline);
    $("timelineStart").addEventListener("change", renderTimeline);
    $("timelineEnd").addEventListener("change", renderTimeline);
    $("unit").addEventListener("change", updateSupervisorOptions);
    $("supervisorId").addEventListener("focus", updateSupervisorOptions);
    $("supervisorId").addEventListener("click", updateSupervisorOptions);
    $("treeUnitSelect").addEventListener("change", renderUnitTree);
    $("refreshTree").addEventListener("click", renderUnitTree);
    if ($("resetTaskForm")) $("resetTaskForm").addEventListener("click", resetTaskForm);
    if ($("taskForm")) $("taskForm").addEventListener("submit", async (e) => { e.preventDefault(); const id=$("taskId").value||createId(); const existing=tasks.find(t=>t.id===id)||{}; await saveTaskToCloud({ ...existing, id, title: $("taskTitle").value.trim(), dueDate: $("taskDueDate").value, urgent: $("taskUrgent").value, important: $("taskImportant").value, notes: $("taskNotes").value.trim(), completed: existing.completed || false, colorTag: $("taskColorTag") ? $("taskColorTag").value : (existing.colorTag || "") }); resetTaskForm(); });
    if ($("calendarMonth")) $("calendarMonth").addEventListener("change", renderCalendar);
    if ($("prevMonth")) $("prevMonth").addEventListener("click", () => { initCalendarMonth(); const [y,m]=$("calendarMonth").value.split("-").map(Number); const d=new Date(y, m-2, 1); $("calendarMonth").value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; renderCalendar(); });
    if ($("nextMonth")) $("nextMonth").addEventListener("click", () => { initCalendarMonth(); const [y,m]=$("calendarMonth").value.split("-").map(Number); const d=new Date(y, m, 1); $("calendarMonth").value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; renderCalendar(); });
    if ($("closeScheduleModal")) $("closeScheduleModal").addEventListener("click", () => $("scheduleModal").classList.remove("open"));
    if ($("scheduleForm")) $("scheduleForm").addEventListener("submit", async (e) => { e.preventDefault(); const id=$("scheduleId").value||createId(); const item={ id, date: $("scheduleDate").value, start: $("scheduleStart").value || "08:00", duration: $("scheduleDuration").value, title: $("scheduleTitle").value.trim(), participants: ($("scheduleParticipants") ? $("scheduleParticipants").value.trim() : ""), notes: $("scheduleNotes").value.trim() }; await saveScheduleToCloud(item); openScheduleModal(item.date); });

    [["unitSearch", renderUnits], ["timelineSearch", renderTimeline], ["eventsSearch", renderEvents], ["tasksSearch", renderTasks], ["scheduleSearch", renderSchedule]].forEach(([id, fn]) => {
      if ($(id)) $(id).addEventListener("input", fn);
    });
    if ($("globalSearch")) $("globalSearch").addEventListener("input", renderGlobalSearch);
    if ($("backupAllBtn")) $("backupAllBtn").addEventListener("click", downloadFullBackup);


    function renderGlobalSearch() {
      const input = $("globalSearch");
      const box = $("globalSearchResults");
      if (!input || !box) return;
      const query = input.value.trim().toLowerCase();
      if (!query) {
        box.style.display = "none";
        box.className = "list empty";
        box.innerHTML = "אין תוצאות";
        return;
      }
      const results = [];
      const addResult = (source, title, details, tab) => {
        const text = searchableText([source, title, details]);
        if (text.includes(query)) results.push({ source, title, details, tab });
      };
      people.forEach(p => addResult("בעל תפקיד", p.fullName || "ללא שם", `${p.role || ""} ${p.unit || ""} ${p.department || ""} ${p.currentRank || ""} ${p.notes || ""} ${p.incentives || ""} ${colorTagLabels[p.colorTag] || ""}`, "people"));
      tasks.forEach(t => addResult(t.completed ? "משימה שבוצעה" : "משימה", t.title || "ללא כותרת", `${t.dueDate || ""} דחוף: ${t.urgent || ""} חשוב: ${t.important || ""} ${t.notes || ""} ${colorTagLabels[t.colorTag] || ""}`, "tasks"));
      schedules.forEach(item => addResult("לו\"ז", item.title || "ללא כותרת", `${formatDate(item.date)} ${item.start || ""} ${item.participants || ""} ${item.notes || ""}`, "schedule"));
      buildEvents().forEach(e => addResult("אירוע מיוחד", `${e.type || "אירוע"} - ${e.name || ""}`, `${formatDate(e.date)} ${e.notes || ""}`, "events"));
      auditLogs.forEach(a => addResult("יומן שינויים", a.action || "פעולה", `${a.targetType || ""} ${a.description || ""} ${a.username || ""} ${formatDate((a.createdAt || "").slice(0,10))}`, "audit"));
      box.style.display = "grid";
      box.className = results.length ? "list" : "list empty";
      box.innerHTML = results.length ? results.slice(0, 40).map(r => `
        <div class="item">
          <div class="search-source">${escapeHtml(r.source)}</div>
          <h3>${escapeHtml(r.title)}</h3>
          <p>${escapeHtml(r.details || "-")}</p>
          <button type="button" class="small" onclick="switchTab('${r.tab}')">פתח דשבורד</button>
        </div>`).join("") : "אין תוצאות";
    }

    function downloadFullBackup() {
      const backup = {
        exportedAt: new Date().toISOString(),
        version: "V27",
        people,
        tasks,
        schedules,
        auditLogs,
        systemUsers: systemUsers.map(u => ({ ...u, password: undefined }))
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `logistics89_backup_${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    $("personForm").addEventListener("submit", async function(e) {
      e.preventDefault();
      const fullName = $("fullName").value.trim();
      const role = $("role").value.trim();
      const unit = normalizeUnitName($("unit").value.trim());
      if (!fullName || !role || !unit) {
        alert("צריך למלא לפחות שם מלא, תפקיד ויחידה.");
        return;
      }
      const id = $("personId").value || createId();
      const person = {
        id, fullName, role, unit,
        department: $("department").value.trim(),
        currentRank: $("currentRank").value,
        supervisorId: $("supervisorId").value,
        startDate: $("startDate").value,
        endDate: $("endDate").value,
        rankDate: $("rankDate").value,
        birthday: $("birthday").value,
        anniversary: $("anniversary").value,
        specialEvents: [],
        notes: $("notes").value.trim(),
        noteDueDate: $("noteDueDate").value,
        incentives: $("incentives") ? $("incentives").value.trim() : "",
        colorTag: $("personColorTag") ? $("personColorTag").value : ""
      };
      try {
        await savePersonToCloud(person);
        resetForm();
        switchTab("dashboard");
        alert("נשמר בהצלחה בענן.");
      } catch (err) {
        console.error(err);
        alert("השמירה לא הצליחה בענן. בדוק חיבור והרשאות Firestore.");
      }
    });

    loginInit();
    initCalendarMonth();
    updateSupervisorOptions();
    render();
    startCloudSync();
    setTimeout(checkTodayNotifications, 1500);
    /* V36 fix: schedule dashboard shows only items from current time forward */
    (function applyV36ScheduleCurrentFutureFix(){
      function parseScheduleDateValue(value){
        const s = String(value || "").trim();
        let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        m = s.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
        if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
      }

      function minutesFromTime(t){
        const m = String(t || "").match(/^(\d{1,2}):(\d{2})/);
        return m ? Number(m[1]) * 60 + Number(m[2]) : null;
      }

      function scheduleEndMinutes(x){
        const end = minutesFromTime(x.end);
        if (end !== null) return end;
        const start = minutesFromTime(x.start);
        if (start === null) return 24 * 60;
        const duration = Number(x.duration || 0);
        return start + (duration > 0 ? duration : 60);
      }

      function isScheduleFromNowForward(x){
        const d = parseScheduleDateValue(x.date);
        if (!d) return false;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (d.getTime() > today.getTime()) return true;
        if (d.getTime() < today.getTime()) return false;

        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        return scheduleEndMinutes(x) >= nowMinutes;
      }

      function compareSchedules(a,b){
        const da = parseScheduleDateValue(a.date)?.getTime() || 0;
        const db = parseScheduleDateValue(b.date)?.getTime() || 0;
        if (da !== db) return da - db;
        return String(a.start || "").localeCompare(String(b.start || ""));
      }

      renderSchedule = function() {
        const el = document.getElementById("scheduleList");
        if (!el) return;

        const query = searchValue("scheduleSearch");
        const items = [...(window.futureSchedulesOnly || schedules)]
          .filter(isScheduleFromNowForward)
          .filter(x => matchesSearch([x.date, formatDate(x.date), x.start, x.end, x.title, x.location, x.participants, x.notes], query))
          .sort(compareSchedules);

        el.className = items.length ? "list" : "list empty";
        if (!items.length) {
          el.innerHTML = "אין לו״ז עתידי להצגה";
          return;
        }

        const grouped = new Map();
        items.forEach(x => {
          const key = x.date || "";
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key).push(x);
        });

        el.innerHTML = [...grouped.entries()].map(([date, dayItems]) => {
          const d = parseScheduleDateValue(date) || new Date(date + "T00:00:00");
          const title = d.toLocaleDateString("he-IL", { weekday:"long", day:"2-digit", month:"2-digit", year:"numeric" });
          return `<div class="item"><h3>${title}</h3>${dayItems.map(x=>`<div class="sched-card sched-${typeof scheduleColorValue === "function" ? scheduleColorValue(x) : (x.color || "red")}" style="padding:8px 10px;border-top:1px solid #fee2e2"><b><span class="sched-dot dot-${typeof scheduleColorValue === "function" ? scheduleColorValue(x) : (x.color || "red")}"></span>${typeof scheduleTimeRange === "function" ? scheduleTimeRange(x) : `${escapeHtml(x.start || "")} - ${escapeHtml(x.end || "")}`}</b> | ${escapeHtml(x.title || "")}<br><span class="hint">מיקום: ${escapeHtml(x.location || "-")} | משתתפים: ${escapeHtml(x.participants || "-")}</span><br><span>${escapeHtml(x.notes || "")}</span><div class="actions" style="margin-top:8px"><button type="button" class="secondary small" onclick="editSchedule('${x.id}')" title="עריכה" aria-label="עריכה">✏️</button><button type="button" class="danger small" onclick="deleteSchedule('${x.id}')" title="מחיקה" aria-label="מחיקה">🗑️</button></div></div>`).join("")}</div>`;
        }).join("");
      };

      setInterval(() => {
        const active = document.querySelector('.tab.active')?.dataset?.tab;
        if (active === "schedule") renderSchedule();
      }, 60000);

      renderSchedule();
    })();

  

    // V18: התחברות דינמית, הרשאות בסיסיות, יומן שינויים והתראות פנימיות
    let currentUser = { username: "", role: "admin", isAdmin: false, authType: "" };
    let auditLogs = [];
    let systemUsers = [];
    const DEFAULT_AUTH = { username: "shahar", password: "8998", role: "admin" };

    function getAuthDocRef() {
      if (!firebaseReady || !db) return null;
      return db.collection("settings").doc("auth");
    }

    async function loadAuthSettings() {
      try {
        const ref = getAuthDocRef();
        if (!ref) return DEFAULT_AUTH;
        const snap = await ref.get();
        if (!snap.exists) {
          await ref.set(DEFAULT_AUTH);
          return DEFAULT_AUTH;
        }
        const data = { ...DEFAULT_AUTH, ...snap.data() };
        // תיקון מנהל ראשי: אם קיימים פרטי ברירת מחדל ישנים, מעדכנים ל-shahar/8998
        if (data.username === "log" || !data.username) {
          await ref.set({ ...data, username: "shahar", password: "8998", role: "admin", updatedAt: new Date().toISOString() }, { merge: true });
          return DEFAULT_AUTH;
        }
        return data;
      } catch (err) {
        console.error("auth settings error", err);
        return DEFAULT_AUTH;
      }
    }

    function canEdit() { return true; }
    function requireEdit() { return true; }

    function applyPermissionsUI() {
      const old = document.getElementById("readonlyBanner");
      if (old) old.remove();
    }

    async function logAudit(action, targetType, description) {
      try {
        if (!firebaseReady || !db) return;
        await db.collection("auditLog").add({
          action,
          targetType,
          description,
          username: currentUser.username || "לא ידוע",
          role: currentUser.role || "admin",
          createdAt: new Date().toISOString()
        });
      } catch (err) { console.error("audit log error", err); }
    }

    function renderAudit() {
      const el = document.getElementById("auditList");
      if (!el) return;
      const items = [...auditLogs].sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))).slice(0,150);
      el.className = items.length ? "list" : "list empty";
      el.innerHTML = items.length ? items.map(x => {
        const d = x.createdAt ? new Date(x.createdAt).toLocaleString("he-IL") : "";
        return `<div class="item"><h3>${escapeHtml(x.action || "שינוי")} - ${escapeHtml(x.targetType || "מערכת")}</h3><p>${escapeHtml(x.description || "")}</p><p class="audit-meta">${escapeHtml(d)} | משתמש: ${escapeHtml(x.username || "-")} | הרשאה: ${escapeHtml(x.role || "-")}</p></div>`;
      }).join("") : "אין עדיין שינויים";
    }

    function startAuditSync() {
      try {
        if (!firebaseReady || !db) return;
        db.collection("auditLog").orderBy("createdAt", "desc").limit(150).onSnapshot(snapshot => {
          auditLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          renderAudit();
        });
      } catch (err) { console.error("audit sync error", err); }
    }

    function notificationDateLabel(date) {
      const diff = Math.round((new Date(date + "T00:00:00") - new Date(todayIso() + "T00:00:00")) / 86400000);
      if (diff === 0) return "היום";
      if (diff === 1) return "מחר";
      if (diff > 1) return `בעוד ${diff} ימים`;
      return `באיחור של ${Math.abs(diff)} ימים`;
    }

    function renderNotifications() {
      const el = document.getElementById("notificationsList");
      if (!el) return;
      const today = todayIso();
      const soon = futureIso(7);
      const alerts = [];

      tasks.filter(t => !t.completed && t.dueDate && t.dueDate <= soon).forEach(t => {
        alerts.push({ date: t.dueDate, title: "משימה", text: t.title, note: `${t.urgent === "כן" ? "דחוף" : "לא דחוף"} | ${t.important === "כן" ? "חשוב" : "לא חשוב"}` });
      });
      buildEvents().filter(e => e.date && monthDay(e.date) >= monthDay(today) && daysUntilNext(e.date) <= 7).forEach(e => {
        alerts.push({ date: today.slice(0,5) + monthDay(e.date), title: e.type, text: e.name, note: e.notes || "" });
      });
      schedules.filter(s => s.date && s.date >= today && s.date <= soon).forEach(s => {
        alerts.push({ date: s.date, title: "לו״ז", text: `${s.start || ""} ${s.title || ""}`, note: s.participants || s.notes || "" });
      });

      alerts.sort((a,b)=>String(a.date||"").localeCompare(String(b.date||"")));
      el.className = alerts.length ? "list" : "list empty";
      el.innerHTML = alerts.length ? alerts.map(a => {
        const cls = a.date === today ? "notification-today" : "notification-soon";
        return `<div class="item ${cls}"><h3>${escapeHtml(a.title)} - ${escapeHtml(a.text)}</h3><p><b>${escapeHtml(notificationDateLabel(a.date))}</b> | ${formatDate(a.date)}</p><p>${escapeHtml(a.note || "")}</p></div>`;
      }).join("") : "אין התראות לשבוע הקרוב";
    }


    function getUsersCollection() {
      return (firebaseReady && db) ? db.collection("systemUsers") : null;
    }

    async function findSystemUser(username) {
      const col = getUsersCollection();
      if (!col || !username) return null;
      const snap = await col.where("username", "==", username).limit(1).get();
      if (snap.empty) return null;
      const doc = snap.docs[0];
      return { id: doc.id, ...doc.data() };
    }

    function isCurrentMainAdmin() {
      return currentUser && currentUser.authType === "mainAdmin";
    }

    function requireAdminDashboard() {
      return !!(currentUser && (currentUser.isAdmin === true || currentUser.authType === "mainAdmin" || currentUser.username === "shahar"));
    }

    const USERS_ADMIN_HTML = `
      <div class="card">
        <h2>ניהול משתמשים</h2>
        <p class="hint">מסך מנהל ליצירת משתמשים נוספים למערכת ולעדכון פרטי המשתמש שלך.</p>
      </div>
      <div class="grid two">
        <div class="card">
          <h2>יצירת משתמש חדש</h2>
          <form id="createUserForm">
            <label>שם משתמש <input id="newSystemUsername" autocomplete="off" /></label>
            <label>סיסמה <input id="newSystemPassword" type="password" autocomplete="new-password" /></label>
            <div class="actions"><button type="submit">יצירת משתמש</button></div>
            <p id="createUserMsg" class="hint"></p>
          </form>
        </div>
        <div class="card">
          <h2>שינוי הפרטים שלי</h2>
          <form id="changeSelfForm">
            <label>סיסמה נוכחית <input id="selfCurrentPassword" type="password" autocomplete="current-password" /></label>
            <label>שם משתמש חדש <input id="selfNewUsername" autocomplete="off" /></label>
            <label>סיסמה חדשה <input id="selfNewPassword" type="password" autocomplete="new-password" /></label>
            <div class="actions"><button type="submit">עדכון הפרטים שלי</button></div>
            <p id="changeSelfMsg" class="hint"></p>
          </form>
        </div>
      </div>
      <div class="card">
        <h2>משתמשים קיימים</h2>
        <div id="usersAdminList" class="list empty">אין משתמשים נוספים</div>
      </div>`;

    function renderUsersAdmin() {
      const section = document.getElementById("usersAdmin");
      if (!section) return;

      if (!requireAdminDashboard()) {
        section.innerHTML = '<div class="card"><h2>ניהול משתמשים</h2><p class="hint">המסך זמין למנהל בלבד.</p></div>';
        return;
      }

      if (!document.getElementById("usersAdminList")) {
        section.innerHTML = USERS_ADMIN_HTML;
      }

      const list = document.getElementById("usersAdminList");
      if (!list) return;
      const items = [...systemUsers].sort((a,b)=>String(a.username||"").localeCompare(String(b.username||""), "he"));
      list.className = items.length ? "list" : "list empty";
      list.innerHTML = items.length ? items.map(u => `
        <div class="item">
          <h3>${escapeHtml(u.username || "")}</h3>
          <p>נוצר בתאריך: ${escapeHtml(u.createdAt ? new Date(u.createdAt).toLocaleString("he-IL") : "-")}</p>
          <div class="actions"><button type="button" class="danger small" onclick="deleteSystemUser('${u.id}')">מחיקת משתמש</button></div>
        </div>`).join("") : "אין משתמשים נוספים";
    }

    function startUsersSync() {
      try {
        const col = getUsersCollection();
        if (!col) return;
        col.orderBy("username").onSnapshot(snapshot => {
          systemUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          renderUsersAdmin();
        });
      } catch (err) { console.error("users sync error", err); }
    }

    window.deleteSystemUser = async function(id) {
      if (!requireAdminDashboard()) { alert("הפעולה זמינה למנהל בלבד"); return; }
      const user = systemUsers.find(u => u.id === id);
      if (!confirm(`למחוק את המשתמש ${user?.username || ""}?`)) return;
      await getUsersCollection().doc(id).delete();
      await logAudit("מחיקת משתמש", "ניהול משתמשים", user?.username || id);
    };

    // החלפת התחברות קיימת במנגנון דינמי עם אפשרות שינוי פרטים
    const loginBtnV18 = document.getElementById("loginBtn");
    if (loginBtnV18) {
      loginBtnV18.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        const settings = await loadAuthSettings();
        const user = document.getElementById("loginUser").value.trim();
        const pass = document.getElementById("loginPass").value;
        let ok = false;
        let loginProfile = null;

        if ((user === settings.username && pass === settings.password) || (user === "shahar" && pass === "8998")) {
          ok = true;
          loginProfile = { username: user, role: "admin", isAdmin: true, authType: "mainAdmin" };
          // מוודאים ש-shahar מוגדר כמנהל הראשי בענן
          if (user === "shahar" && pass === "8998") {
            try { await getAuthDocRef().set({ username: "shahar", password: "8998", role: "admin", updatedAt: new Date().toISOString() }, { merge: true }); } catch (err) {}
          }
        } else {
          const found = await findSystemUser(user);
          if (found && found.password === pass && found.active !== false) {
            ok = true;
            loginProfile = { username: found.username, role: "user", isAdmin: false, authType: "systemUser", userId: found.id };
          }
        }

        if (ok) {
          currentUser = loginProfile;
          sessionStorage.setItem("logistics89LoggedIn", "1");
          sessionStorage.setItem("logistics89User", JSON.stringify(currentUser));
          document.getElementById("loginOverlay").classList.add("hidden");
          applyPermissionsUI();
          renderUsersAdmin();
          setTimeout(renderUsersAdmin, 300);
          await logAudit("כניסה למערכת", "משתמש", `${user} נכנס למערכת`);
        } else {
          document.getElementById("loginError").textContent = "אחד הפרטים שהוזנו אינו נכון";
        }
      }, true);
    }

    const savedUser = sessionStorage.getItem("logistics89User");
    if (savedUser) {
      try {
        currentUser = JSON.parse(savedUser);
        if (currentUser && currentUser.username === "shahar") {
          currentUser.role = "admin";
          currentUser.isAdmin = true;
          currentUser.authType = "mainAdmin";
          sessionStorage.setItem("logistics89User", JSON.stringify(currentUser));
        }
      } catch (err) {}
    }
    applyPermissionsUI();

    const toggleChangeLogin = document.getElementById("toggleChangeLogin");
    if (toggleChangeLogin) toggleChangeLogin.addEventListener("click", () => {
      document.getElementById("changeLoginBox").classList.toggle("open");
    });

    const saveLoginDetailsBtn = document.getElementById("saveLoginDetails");
    if (saveLoginDetailsBtn) saveLoginDetailsBtn.addEventListener("click", async () => {
      const currentUserInput = document.getElementById("currentLoginUser").value.trim();
      const currentPassInput = document.getElementById("currentLoginPass").value;
      const newUser = document.getElementById("newLoginUser").value.trim();
      const newPass = document.getElementById("newLoginPass").value;
      const settings = await loadAuthSettings();
      if (currentUserInput !== settings.username || currentPassInput !== settings.password) {
        document.getElementById("loginError").textContent = "הפרטים הנוכחיים אינם נכונים";
        return;
      }
      if (!newUser || !newPass) {
        document.getElementById("loginError").textContent = "צריך למלא שם משתמש וסיסמה חדשים";
        return;
      }
      const ref = getAuthDocRef();
      if (!ref) { document.getElementById("loginError").textContent = "אין חיבור ל-Firebase"; return; }
      await ref.set({ username: newUser, password: newPass, role: "admin", updatedAt: new Date().toISOString() });
      document.getElementById("loginError").textContent = "פרטי ההתחברות עודכנו בהצלחה";
      await logAudit("עדכון פרטי התחברות", "מערכת", `שם המשתמש הראשי עודכן ל-${newUser}`);
    });

    // עטיפת שמירות ומחיקות בענן עם הרשאות ויומן שינויים
    savePersonToCloud = async function(person) {
      requireEdit();
      const exists = people.find(p => p.id === person.id);
      await peopleCollection.doc(person.id).set(person);
      await logAudit(exists ? "עריכת בעל תפקיד" : "הוספת בעל תפקיד", "כוח אדם", `${person.fullName || ""} | ${person.role || ""} | ${person.unit || ""}`);
    };
    deletePersonFromCloud = async function(id) {
      requireEdit();
      const p = people.find(x => x.id === id);
      await peopleCollection.doc(id).delete();
      await logAudit("מחיקת בעל תפקיד", "כוח אדם", p ? `${p.fullName || ""} | ${p.role || ""}` : id);
    };
    saveTaskToCloud = async function(task) {
      requireEdit();
      const exists = tasks.find(t => t.id === task.id);
      await tasksCollection.doc(task.id).set(task);
      await logAudit(task.completed && !exists?.completed ? "סימון משימה כבוצעה" : (exists ? "עריכת משימה" : "הוספת משימה"), "משימות", `${task.title || ""} | ${task.dueDate || ""}`);
    };
    deleteTaskFromCloud = async function(id) {
      requireEdit();
      const t = tasks.find(x => x.id === id);
      await tasksCollection.doc(id).delete();
      await logAudit("מחיקת משימה", "משימות", t ? t.title : id);
    };
    saveScheduleToCloud = async function(item) {
      requireEdit();
      const exists = schedules.find(s => s.id === item.id);
      await schedulesCollection.doc(item.id).set(item);
      await logAudit(exists ? "עריכת לו״ז" : "הוספת לו״ז", "לוח שנה", `${item.date || ""} ${item.start || ""} | ${item.title || ""}`);
    };
    deleteScheduleFromCloud = async function(id) {
      requireEdit();
      const s = schedules.find(x => x.id === id);
      await schedulesCollection.doc(id).delete();
      await logAudit("מחיקת לו״ז", "לוח שנה", s ? `${s.date || ""} ${s.title || ""}` : id);
    };

    const renderV17 = render;
    render = function() {
      renderV17();
      renderNotifications();
      renderAudit();
      applyPermissionsUI();
    };

    const switchTabV17 = switchTab;
    switchTab = function(tabName) {
      switchTabV17(tabName);
      if (tabName === "notifications") renderNotifications();
      if (tabName === "audit") renderAudit();
      if (tabName === "usersAdmin") renderUsersAdmin();
    };

    const rowsForExportV17 = rowsForExport;
    rowsForExport = function(kind) {
      if (kind === "audit") return [["תאריך","פעולה","תחום","תיאור","משתמש","הרשאה"], ...auditLogs.map(x=>[x.createdAt,x.action,x.targetType,x.description,x.username,x.role])];
      return rowsForExportV17(kind);
    };




    document.addEventListener("submit", async (e) => {
      if (e.target && e.target.id === "createUserForm") {
        e.preventDefault();
        e.stopPropagation();
        if (!requireAdminDashboard()) { alert("הפעולה זמינה למנהל בלבד"); return; }
        const username = document.getElementById("newSystemUsername").value.trim();
        const password = document.getElementById("newSystemPassword").value;
        const msg = document.getElementById("createUserMsg");
        if (!username || !password) { msg.textContent = "צריך למלא שם משתמש וסיסמה"; return; }
        const settings = await loadAuthSettings();
        if (username === settings.username || await findSystemUser(username)) { msg.textContent = "שם המשתמש כבר קיים במערכת"; return; }
        const id = createId();
        await getUsersCollection().doc(id).set({ username, password, active: true, createdAt: new Date().toISOString(), createdBy: currentUser.username || "admin" });
        document.getElementById("newSystemUsername").value = "";
        document.getElementById("newSystemPassword").value = "";
        msg.textContent = "המשתמש נוצר בהצלחה";
        await logAudit("יצירת משתמש", "ניהול משתמשים", username);
        renderUsersAdmin();
      }

      if (e.target && e.target.id === "changeSelfForm") {
        e.preventDefault();
        e.stopPropagation();
        const msg = document.getElementById("changeSelfMsg");
        const currentPass = document.getElementById("selfCurrentPassword").value;
        const newUsername = document.getElementById("selfNewUsername").value.trim();
        const newPassword = document.getElementById("selfNewPassword").value;
        if (!newUsername || !newPassword || !currentPass) { msg.textContent = "צריך למלא את כל השדות"; return; }

        if (isCurrentMainAdmin()) {
          const settings = await loadAuthSettings();
          if (currentPass !== settings.password && !(currentUser.username === "shahar" && currentPass === "8998")) { msg.textContent = "הסיסמה הנוכחית אינה נכונה"; return; }
          if (newUsername !== settings.username && await findSystemUser(newUsername)) { msg.textContent = "שם המשתמש כבר קיים במערכת"; return; }
          await getAuthDocRef().set({ username: newUsername, password: newPassword, role: "admin", updatedAt: new Date().toISOString() });
          currentUser.username = newUsername;
          currentUser.isAdmin = true;
          currentUser.authType = "mainAdmin";
        } else {
          const current = await findSystemUser(currentUser.username);
          if (!current || current.password !== currentPass) { msg.textContent = "הסיסמה הנוכחית אינה נכונה"; return; }
          const existing = await findSystemUser(newUsername);
          if (existing && existing.id !== current.id) { msg.textContent = "שם המשתמש כבר קיים במערכת"; return; }
          await getUsersCollection().doc(current.id).set({ ...current, username: newUsername, password: newPassword, updatedAt: new Date().toISOString() });
          currentUser.username = newUsername;
        }
        sessionStorage.setItem("logistics89User", JSON.stringify(currentUser));
        msg.textContent = "הפרטים עודכנו בהצלחה";
        document.getElementById("selfCurrentPassword").value = "";
        document.getElementById("selfNewUsername").value = "";
        document.getElementById("selfNewPassword").value = "";
        await logAudit("עדכון פרטים אישיים", "ניהול משתמשים", currentUser.username);
      }
    }, true);

    const createUserForm = document.getElementById("createUserForm");
    if (createUserForm) createUserForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!requireAdminDashboard()) { alert("הפעולה זמינה למנהל בלבד"); return; }
      const username = document.getElementById("newSystemUsername").value.trim();
      const password = document.getElementById("newSystemPassword").value;
      const msg = document.getElementById("createUserMsg");
      if (!username || !password) { msg.textContent = "צריך למלא שם משתמש וסיסמה"; return; }
      const settings = await loadAuthSettings();
      if (username === settings.username || await findSystemUser(username)) { msg.textContent = "שם המשתמש כבר קיים במערכת"; return; }
      const id = createId();
      await getUsersCollection().doc(id).set({ username, password, active: true, createdAt: new Date().toISOString(), createdBy: currentUser.username || "admin" });
      document.getElementById("newSystemUsername").value = "";
      document.getElementById("newSystemPassword").value = "";
      msg.textContent = "המשתמש נוצר בהצלחה";
      await logAudit("יצירת משתמש", "ניהול משתמשים", username);
    });

    const changeSelfForm = document.getElementById("changeSelfForm");
    if (changeSelfForm) changeSelfForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = document.getElementById("changeSelfMsg");
      const currentPass = document.getElementById("selfCurrentPassword").value;
      const newUsername = document.getElementById("selfNewUsername").value.trim();
      const newPassword = document.getElementById("selfNewPassword").value;
      if (!newUsername || !newPassword || !currentPass) { msg.textContent = "צריך למלא את כל השדות"; return; }

      if (isCurrentMainAdmin()) {
        const settings = await loadAuthSettings();
        if (currentPass !== settings.password) { msg.textContent = "הסיסמה הנוכחית אינה נכונה"; return; }
        if (newUsername !== settings.username && await findSystemUser(newUsername)) { msg.textContent = "שם המשתמש כבר קיים במערכת"; return; }
        await getAuthDocRef().set({ username: newUsername, password: newPassword, role: "admin", updatedAt: new Date().toISOString() });
        currentUser.username = newUsername;
      } else {
        const current = await findSystemUser(currentUser.username);
        if (!current || current.password !== currentPass) { msg.textContent = "הסיסמה הנוכחית אינה נכונה"; return; }
        const existing = await findSystemUser(newUsername);
        if (existing && existing.id !== current.id) { msg.textContent = "שם המשתמש כבר קיים במערכת"; return; }
        await getUsersCollection().doc(current.id).set({ ...current, username: newUsername, password: newPassword, updatedAt: new Date().toISOString() });
        currentUser.username = newUsername;
      }
      sessionStorage.setItem("logistics89User", JSON.stringify(currentUser));
      msg.textContent = "הפרטים עודכנו בהצלחה";
      document.getElementById("selfCurrentPassword").value = "";
      document.getElementById("selfNewUsername").value = "";
      document.getElementById("selfNewPassword").value = "";
      await logAudit("עדכון פרטים אישיים", "ניהול משתמשים", currentUser.username);
    });

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", async () => {
      try { await logAudit("התנתקות", "משתמש", `${currentUser.username || "משתמש"} התנתק מהמערכת`); } catch (err) {}
      sessionStorage.removeItem("logistics89LoggedIn");
      sessionStorage.removeItem("logistics89User");
      document.getElementById("loginUser").value = "";
      document.getElementById("loginPass").value = "";
      document.getElementById("loginError").textContent = "";
      document.getElementById("loginOverlay").classList.remove("hidden");
    });

    window.addEventListener("beforeunload", () => {
      sessionStorage.removeItem("logistics89LoggedIn");
      sessionStorage.removeItem("logistics89User");
    });

    // חיבור תצוגת התראות ויומן שינויים לטעינה שוטפת
    startAuditSync();
    startUsersSync();
    setInterval(renderNotifications, 60000);
    renderNotifications();
    renderAudit();
    /* V36 fix: schedule dashboard shows only items from current time forward */
    (function applyV36ScheduleCurrentFutureFix(){
      function parseScheduleDateValue(value){
        const s = String(value || "").trim();
        let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        m = s.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
        if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
      }

      function minutesFromTime(t){
        const m = String(t || "").match(/^(\d{1,2}):(\d{2})/);
        return m ? Number(m[1]) * 60 + Number(m[2]) : null;
      }

      function scheduleEndMinutes(x){
        const end = minutesFromTime(x.end);
        if (end !== null) return end;
        const start = minutesFromTime(x.start);
        if (start === null) return 24 * 60;
        const duration = Number(x.duration || 0);
        return start + (duration > 0 ? duration : 60);
      }

      function isScheduleFromNowForward(x){
        const d = parseScheduleDateValue(x.date);
        if (!d) return false;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (d.getTime() > today.getTime()) return true;
        if (d.getTime() < today.getTime()) return false;

        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        return scheduleEndMinutes(x) >= nowMinutes;
      }

      function compareSchedules(a,b){
        const da = parseScheduleDateValue(a.date)?.getTime() || 0;
        const db = parseScheduleDateValue(b.date)?.getTime() || 0;
        if (da !== db) return da - db;
        return String(a.start || "").localeCompare(String(b.start || ""));
      }

      renderSchedule = function() {
        const el = document.getElementById("scheduleList");
        if (!el) return;

        const query = searchValue("scheduleSearch");
        const items = [...(window.futureSchedulesOnly || schedules)]
          .filter(isScheduleFromNowForward)
          .filter(x => matchesSearch([x.date, formatDate(x.date), x.start, x.end, x.title, x.location, x.participants, x.notes], query))
          .sort(compareSchedules);

        el.className = items.length ? "list" : "list empty";
        if (!items.length) {
          el.innerHTML = "אין לו״ז עתידי להצגה";
          return;
        }

        const grouped = new Map();
        items.forEach(x => {
          const key = x.date || "";
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key).push(x);
        });

        el.innerHTML = [...grouped.entries()].map(([date, dayItems]) => {
          const d = parseScheduleDateValue(date) || new Date(date + "T00:00:00");
          const title = d.toLocaleDateString("he-IL", { weekday:"long", day:"2-digit", month:"2-digit", year:"numeric" });
          return `<div class="item"><h3>${title}</h3>${dayItems.map(x=>`<div class="sched-card sched-${typeof scheduleColorValue === "function" ? scheduleColorValue(x) : (x.color || "red")}" style="padding:8px 10px;border-top:1px solid #fee2e2"><b><span class="sched-dot dot-${typeof scheduleColorValue === "function" ? scheduleColorValue(x) : (x.color || "red")}"></span>${typeof scheduleTimeRange === "function" ? scheduleTimeRange(x) : `${escapeHtml(x.start || "")} - ${escapeHtml(x.end || "")}`}</b> | ${escapeHtml(x.title || "")}<br><span class="hint">מיקום: ${escapeHtml(x.location || "-")} | משתתפים: ${escapeHtml(x.participants || "-")}</span><br><span>${escapeHtml(x.notes || "")}</span><div class="actions" style="margin-top:8px"><button type="button" class="secondary small" onclick="editSchedule('${x.id}')" title="עריכה" aria-label="עריכה">✏️</button><button type="button" class="danger small" onclick="deleteSchedule('${x.id}')" title="מחיקה" aria-label="מחיקה">🗑️</button></div></div>`).join("")}</div>`;
        }).join("");
      };

      setInterval(() => {
        const active = document.querySelector('.tab.active')?.dataset?.tab;
        if (active === "schedule") renderSchedule();
      }, 60000);

      renderSchedule();
    })();

  

    // V27: סטטיסטיקות, תיוג צבעים וסידור תמריצים
    const colorTagLabels = { red: "אדום - דחוף / לטיפול", yellow: "צהוב - במעקב", green: "ירוק - תקין", blue: "כחול - מידע כללי" };
    function colorTagHtml(value) {
      if (!value) return "";
      return `<span class="color-tag tag-${escapeHtml(value)}">${escapeHtml(colorTagLabels[value] || value)}</span>`;
    }
    function countBy(items, getter) {
      const map = new Map();
      items.forEach(item => {
        const key = getter(item) || "לא הוגדר";
        map.set(key, (map.get(key) || 0) + 1);
      });
      return [...map.entries()].sort((a,b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "he"));
    }
    function statsListHtml(rows) {
      return rows.length ? rows.map(([name, count]) => `<div class="stats-line"><span>${escapeHtml(name)}</span><b>${count}</b></div>`).join("") : "אין נתונים";
    }
    function isEventWithinNextMonth(e) {
      if (!e || !e.date) return false;
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const future = new Date(today); future.setDate(future.getDate() + 30);
      let d = toDate(e.date);
      if (!d) return false;
      if (e.type === "יום הולדת" || e.type === "יום נישואין") {
        d = new Date(today.getFullYear(), d.getMonth(), d.getDate());
        if (d < today) d.setFullYear(d.getFullYear() + 1);
      }
      return d >= today && d <= future;
    }
    function renderStats() {
      if (!document.getElementById("statsPeopleTotal")) return;
      const openTasks = tasks.filter(t => !t.completed).length;
      const closedTasks = tasks.filter(t => t.completed).length;
      const upcomingEvents = buildEvents().filter(isEventWithinNextMonth).length;
      document.getElementById("statsPeopleTotal").textContent = people.length;
      document.getElementById("statsOpenTasks").textContent = openTasks;
      document.getElementById("statsClosedTasks").textContent = closedTasks;
      document.getElementById("statsUpcomingEvents").textContent = upcomingEvents;
      document.getElementById("statsByUnit").className = people.length ? "list" : "list empty";
      document.getElementById("statsByUnit").innerHTML = statsListHtml(countBy(people, p => p.unit));
      document.getElementById("statsByRank").className = people.length ? "list" : "list empty";
      document.getElementById("statsByRank").innerHTML = statsListHtml(countBy(people, p => p.currentRank));
      document.getElementById("statsByDepartment").className = people.length ? "list" : "list empty";
      document.getElementById("statsByDepartment").innerHTML = statsListHtml(countBy(people, p => p.department));
      document.getElementById("statsByTaskColor").className = tasks.length ? "list" : "list empty";
      document.getElementById("statsByTaskColor").innerHTML = statsListHtml(countBy(tasks, t => colorTagLabels[t.colorTag] || "ללא תיוג"));
    }

    personHtml = function(p) {
      return `<div class="item">
        <h3>${escapeHtml(p.fullName || "")}</h3>
        ${colorTagHtml(p.colorTag)}
        <p><b>תפקיד:</b> ${escapeHtml(p.role || "-")}</p>
        <p><b>יחידה:</b> ${escapeHtml(p.unit || "-")}</p>
        <p><b>מחלקה:</b> ${escapeHtml(p.department || "-")}</p>
        <p><b>דרגה נוכחית:</b> ${escapeHtml(p.currentRank || "-")}</p>
        <p><b>כפוף ל:</b> ${escapeHtml(supervisorName(p.supervisorId))}</p>
        <p><b>תקופה:</b> ${formatDate(p.startDate) || "-"} עד ${formatDate(p.endDate) || "מכהן כיום / לא הוגדר"}</p>
        <p><b>תאריך לקבלת דרגה:</b> ${formatDate(p.rankDate) || "-"}</p>
        <p><b>יום הולדת:</b> ${formatDate(p.birthday) || "-"}</p>
        <p><b>יום נישואין:</b> ${formatDate(p.anniversary) || "-"}</p>
        <p><b>תמריצים / מענקים:</b> ${escapeHtml(p.incentives || "-")}</p>
        <p><b>הערות:</b> ${escapeHtml(p.notes || "-")}</p>
        <p><b>תאריך לביצוע הערה:</b> ${formatDate(p.noteDueDate) || "-"}</p>
        <div class="item-actions">
          <button type="button" class="small" onclick="editPerson('${p.id}')">עריכה</button>
          <button type="button" class="small danger" onclick="deletePerson('${p.id}')">מחיקה</button>
        </div>
      </div>`;
    };

    const editPersonV27Base = editPerson;
    editPerson = function(id) {
      editPersonV27Base(id);
      const p = people.find(x => x.id === id);
      if (p && document.getElementById("personColorTag")) document.getElementById("personColorTag").value = p.colorTag || "";
    };

    const resetFormV27Base = resetForm;
    resetForm = function() {
      resetFormV27Base();
      if (document.getElementById("personColorTag")) document.getElementById("personColorTag").value = "";
    };

    renderTasks = function() {
      const openEl = document.getElementById("tasksList");
      const doneEl = document.getElementById("completedTasksList");
      if (!openEl) return;
      const sortTasks = arr => [...arr].sort((a,b) => taskPriorityScore(a)-taskPriorityScore(b) || String(a.dueDate||"").localeCompare(String(b.dueDate||"")));
      const query = searchValue("tasksSearch");
      const filteredTasks = tasks.filter(t => matchesSearch([t.title, t.dueDate, formatDate(t.dueDate), t.urgent, t.important, t.notes, t.completed ? "בוצע" : "פתוח", colorTagLabels[t.colorTag]], query));
      const openTasks = sortTasks(filteredTasks.filter(t => !t.completed));
      const completedTasks = sortTasks(filteredTasks.filter(t => t.completed));
      openEl.className = openTasks.length ? "list" : "list empty";
      openEl.innerHTML = openTasks.length ? openTasks.map(t => {
        const cls = taskPriorityScore(t) === 0 ? "priority-high" : taskPriorityScore(t) < 3 ? "priority-medium" : "priority-low";
        return `<div class="item ${cls}"><h3>${escapeHtml(t.title)}</h3>${colorTagHtml(t.colorTag)}<p><b>גמר ביצוע:</b> ${formatDate(t.dueDate)}</p><p><b>דחוף:</b> ${t.urgent || "לא"} | <b>חשוב:</b> ${t.important || "לא"}</p><p><b>הערות:</b> ${escapeHtml(t.notes || "-")}</p><div class="item-actions"><button type="button" class="small" onclick="completeTask('${t.id}')" title="סמן כבוצע" aria-label="סמן כבוצע">✅</button><button type="button" class="small" onclick="editTask('${t.id}')" title="עריכה" aria-label="עריכה">✏️</button><button type="button" class="small danger" onclick="deleteTask('${t.id}')" title="מחיקה" aria-label="מחיקה">🗑️</button></div></div>`;
      }).join("") : "אין עדיין משימות";
      if (doneEl) {
        doneEl.className = completedTasks.length ? "list" : "list empty";
        doneEl.innerHTML = completedTasks.length ? completedTasks.map(t => `<div class="item priority-low"><h3>${escapeHtml(t.title)}</h3>${colorTagHtml(t.colorTag)}<p><b>גמר ביצוע:</b> ${formatDate(t.dueDate)}</p><p><b>דחוף:</b> ${t.urgent || "לא"} | <b>חשוב:</b> ${t.important || "לא"}</p><p><b>הערות:</b> ${escapeHtml(t.notes || "-")}</p><div class="item-actions"><button type="button" class="small" onclick="reopenTask('${t.id}')" title="החזרה לפתוחות" aria-label="החזרה לפתוחות">↩️</button><button type="button" class="small danger" onclick="deleteTask('${t.id}')" title="מחיקה" aria-label="מחיקה">🗑️</button></div></div>`).join("") : "אין עדיין משימות שבוצעו";
      }
    };

    const editTaskV27Base = editTask;
    editTask = function(id) {
      editTaskV27Base(id);
      const t = tasks.find(x => x.id === id);
      if (t && document.getElementById("taskColorTag")) document.getElementById("taskColorTag").value = t.colorTag || "";
    };
    const resetTaskFormV27Base = resetTaskForm;
    resetTaskForm = function() {
      resetTaskFormV27Base();
      if (document.getElementById("taskColorTag")) document.getElementById("taskColorTag").value = "";
    };

    const renderV27Base = render;
    render = function() {
      renderV27Base();
      renderStats();
    };
    const switchTabV27Base = switchTab;
    switchTab = function(tabName) {
      switchTabV27Base(tabName);
      if (tabName === "stats") renderStats();
    };
    const rowsForExportV27Base = rowsForExport;
    rowsForExport = function(kind) {
      if (kind === "stats") {
        const rows = [["מדד","ערך"]];
        rows.push(["סה״כ בעלי תפקידים", people.length]);
        rows.push(["משימות פתוחות", tasks.filter(t => !t.completed).length]);
        rows.push(["משימות שבוצעו", tasks.filter(t => t.completed).length]);
        rows.push(["אירועים בחודש הקרוב", buildEvents().filter(isEventWithinNextMonth).length]);
        rows.push([],["אנשים לפי יחידה", ""]);
        countBy(people, p => p.unit).forEach(([k,v]) => rows.push([k,v]));
        rows.push([],["אנשים לפי דרגה", ""]);
        countBy(people, p => p.currentRank).forEach(([k,v]) => rows.push([k,v]));
        rows.push([],["בעלי תפקידים לפי מחלקה", ""]);
        countBy(people, p => p.department).forEach(([k,v]) => rows.push([k,v]));
        rows.push([],["משימות לפי תיוג צבע", ""]);
        countBy(tasks, t => colorTagLabels[t.colorTag] || "ללא תיוג").forEach(([k,v]) => rows.push([k,v]));
        return rows;
      }
      const rows = rowsForExportV27Base(kind);
      if ((kind === "unitTree" || kind === "units") && rows && rows[0]) {
        return [[...rows[0], "תיוג צבע", "תמריצים / מענקים"], ...people.map(p=>[p.fullName,p.role,p.unit,p.department,p.currentRank,supervisorName(p.supervisorId), colorTagLabels[p.colorTag] || "", p.incentives || ""])]
      }
      return rows;
    };

    const oldPersonSubmit = document.getElementById("personForm");
    if (oldPersonSubmit) {
      oldPersonSubmit.addEventListener("submit", () => {
        setTimeout(() => renderStats(), 500);
      });
    }

    /* V31 updates: calendar week column, schedule location, icon buttons for people */
    (function applyV31Updates(){
      const style = document.createElement("style");
      style.textContent = `
        .calendar-grid { grid-template-columns: 74px repeat(7, minmax(0,1fr)); }
        .calendar-week-cell { min-height:110px; border:1px solid var(--border); border-radius:16px; padding:8px; background:#fff1f2; display:flex; align-items:center; justify-content:center; font-weight:800; color:var(--primary); text-align:center; }
        .calendar-week-head { min-height:auto; font-weight:bold; text-align:center; background:#fecaca; }
        @media (max-width: 760px) { .calendar-grid { grid-template-columns: 56px repeat(7, minmax(78px,1fr)); overflow-x:auto; } .calendar-week-cell{font-size:12px;} }
      `;
      document.head.appendChild(style);

      const form = document.getElementById("scheduleForm");
      if (form && !document.getElementById("scheduleLocation")) {
        const titleLabel = document.getElementById("scheduleTitle")?.closest("label");
        if (titleLabel) titleLabel.insertAdjacentHTML("afterend", '<label>מיקום <input id="scheduleLocation" /></label>');
      }

      renderCalendar = function() {
        const grid = document.getElementById("calendarGrid"); if (!grid) return; initCalendarMonth();
        const [y,m] = document.getElementById("calendarMonth").value.split("-").map(Number);
        const first = new Date(y, m-1, 1);
        const start = new Date(first); start.setDate(start.getDate() - start.getDay());
        const labels = ["שבוע","א","ב","ג","ד","ה","ו","ש"];
        let html = labels.map((l,idx) => `<div class="calendar-day ${idx===0?'calendar-week-head':''}" style="min-height:auto;font-weight:bold;text-align:center;background:${idx===0?'#fecaca':'#fee2e2'}">${l}</div>`).join("");
        for (let row=0; row<6; row++) {
          const weekStart = new Date(start); weekStart.setDate(start.getDate() + row*7);
          html += `<div class="calendar-week-cell">שבוע<br>${weekNumber(weekStart)}</div>`;
          for (let col=0; col<7; col++) {
            const d = new Date(weekStart); d.setDate(weekStart.getDate()+col); const dateStr = iso(d);
            const dayItems = schedules.filter(x => x.date === dateStr).sort((a,b)=>String(a.start||"").localeCompare(String(b.start||"")));
            html += `<div class="calendar-day ${d.getMonth()!==m-1?'muted':''}" onclick="openScheduleModal('${dateStr}')"><div class="num">${d.getDate()}</div>${dayItems.slice(0,3).map(x=>`<span class="mini-event">${escapeHtml(x.start||"")} ${escapeHtml(x.title||"")}</span>`).join("")}</div>`;
          }
        }
        grid.innerHTML = html;
      };

      const oldOpenScheduleModal = openScheduleModal;
      openScheduleModal = function(dateStr) {
        oldOpenScheduleModal(dateStr);
        if (document.getElementById("scheduleLocation")) document.getElementById("scheduleLocation").value = "";
      };

      renderDaySchedule = function(dateStr) {
        const el = document.getElementById("dayScheduleList"); if (!el) return;
        const items = schedules.filter(x=>x.date===dateStr).sort((a,b)=>String(a.start||"").localeCompare(String(b.start||"")));
        el.className = items.length ? "list" : "list empty";
        el.innerHTML = items.length ? items.map(x=>`<div class="item"><h3>${escapeHtml(x.start)} | ${escapeHtml(x.title)}</h3><p><b>משך:</b> ${escapeHtml(x.duration)} דקות</p><p><b>מיקום:</b> ${escapeHtml(x.location||"-")}</p><p><b>משתתפים:</b> ${escapeHtml(x.participants||"-")}</p><p><b>הערות:</b> ${escapeHtml(x.notes||"-")}</p><div class="item-actions"><button type="button" class="small" onclick="editSchedule('${x.id}')" title="עריכה" aria-label="עריכה">✏️</button><button type="button" class="small danger" onclick="deleteSchedule('${x.id}')" title="מחיקה" aria-label="מחיקה">🗑️</button></div></div>`).join("") : "אין לו\"ז ביום זה";
      };

      renderSchedule = function() {
        const el = document.getElementById("scheduleList"); if (!el) return;
        const query = searchValue("scheduleSearch");
        const items = [...(window.futureSchedulesOnly || schedules)].filter(x => matchesSearch([x.date, formatDate(x.date), x.start, x.duration, x.title, x.location, x.participants, x.notes], query)).sort((a,b)=>String(a.date||"").localeCompare(String(b.date||"")) || String(a.start||"").localeCompare(String(b.start||"")));
        el.className = items.length ? "list" : "list empty";
        if (!items.length) { el.innerHTML = "אין עדיין לו\"ז"; return; }
        const grouped = new Map();
        items.forEach(x => { if (!grouped.has(x.date)) grouped.set(x.date, []); grouped.get(x.date).push(x); });
        el.innerHTML = [...grouped.entries()].map(([date, dayItems]) => {
          const d = new Date(date + "T00:00:00");
          const title = d.toLocaleDateString("he-IL", { weekday:"long", day:"2-digit", month:"2-digit", year:"numeric" });
          return `<div class="item"><h3>${title}</h3>${dayItems.map(x=>`<div style="padding:8px 0;border-top:1px solid #fee2e2"><b>${escapeHtml(x.start || "")}</b> | ${escapeHtml(x.title || "")}<br><span class="hint">משך: ${escapeHtml(x.duration || "")} דקות | מיקום: ${escapeHtml(x.location || "-")} | משתתפים: ${escapeHtml(x.participants || "-")}</span><br><span>${escapeHtml(x.notes || "")}</span><div class="actions" style="margin-top:8px"><button type="button" class="secondary small" onclick="editSchedule('${x.id}')" title="עריכה" aria-label="עריכה">✏️</button><button type="button" class="danger small" onclick="deleteSchedule('${x.id}')" title="מחיקה" aria-label="מחיקה">🗑️</button></div></div>`).join("")}</div>`;
        }).join("");
      };

      editSchedule = function(id) {
        const x=schedules.find(i=>i.id===id); if(!x) return;
        openScheduleModal(x.date);
        document.getElementById("scheduleId").value=x.id;
        document.getElementById("scheduleStart").value=x.start||"08:00";
        document.getElementById("scheduleDuration").value=x.duration||60;
        document.getElementById("scheduleTitle").value=x.title||"";
        if (document.getElementById("scheduleLocation")) document.getElementById("scheduleLocation").value=x.location||"";
        if (document.getElementById("scheduleParticipants")) document.getElementById("scheduleParticipants").value=x.participants||"";
        document.getElementById("scheduleNotes").value=x.notes||"";
      };

      const oldForm = document.getElementById("scheduleForm");
      if (oldForm) {
        const newForm = oldForm.cloneNode(true);
        oldForm.parentNode.replaceChild(newForm, oldForm);
        document.getElementById("closeScheduleModal")?.addEventListener("click", () => document.getElementById("scheduleModal")?.classList.remove("open"));
        newForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const id=document.getElementById("scheduleId").value||createId();
          const item={
            id,
            date: document.getElementById("scheduleDate").value,
            start: document.getElementById("scheduleStart").value || "08:00",
            duration: document.getElementById("scheduleDuration").value,
            title: document.getElementById("scheduleTitle").value.trim(),
            location: (document.getElementById("scheduleLocation") ? document.getElementById("scheduleLocation").value.trim() : ""),
            participants: (document.getElementById("scheduleParticipants") ? document.getElementById("scheduleParticipants").value.trim() : ""),
            notes: document.getElementById("scheduleNotes").value.trim()
          };
          await saveScheduleToCloud(item);
          openScheduleModal(item.date);
        });
      }

      personHtml = function(p) {
        return `<div class="item">
          <h3>${escapeHtml(p.fullName || "")}</h3>
          ${typeof colorTagHtml === "function" ? colorTagHtml(p.colorTag) : ""}
          <p><b>תפקיד:</b> ${escapeHtml(p.role || "-")}</p>
          <p><b>יחידה:</b> ${escapeHtml(p.unit || "-")}</p>
          <p><b>מחלקה:</b> ${escapeHtml(p.department || "-")}</p>
          <p><b>דרגה נוכחית:</b> ${escapeHtml(p.currentRank || "-")}</p>
          <p><b>כפוף ל:</b> ${escapeHtml(supervisorName(p.supervisorId))}</p>
          <p><b>תקופה:</b> ${formatDate(p.startDate) || "-"} עד ${formatDate(p.endDate) || "מכהן כיום / לא הוגדר"}</p>
          <p><b>תאריך לקבלת דרגה:</b> ${formatDate(p.rankDate) || "-"}</p>
          <p><b>יום הולדת:</b> ${formatDate(p.birthday) || "-"}</p>
          <p><b>יום נישואין:</b> ${formatDate(p.anniversary) || "-"}</p>
          <p><b>תמריצים / מענקים:</b> ${escapeHtml(p.incentives || "-")}</p>
          <p><b>הערות:</b> ${escapeHtml(p.notes || "-")}</p>
          <p><b>תאריך לביצוע הערה:</b> ${formatDate(p.noteDueDate) || "-"}</p>
          <div class="item-actions">
            <button type="button" class="small" onclick="editPerson('${p.id}')" title="עריכה" aria-label="עריכה">✏️</button>
            <button type="button" class="small danger" onclick="deletePerson('${p.id}')" title="מחיקה" aria-label="מחיקה">🗑️</button>
          </div>
        </div>`;
      };

      const rowsForExportV31Base = rowsForExport;
      rowsForExport = function(kind) {
        if (kind === "schedule" || kind === "calendar") return [["תאריך","שעה","משך","תוכן","מיקום","משתתפים","הערות"], ...schedules.map(x=>[x.date,x.start,x.duration,x.title,x.location||"",x.participants||"",x.notes])];
        return rowsForExportV31Base(kind);
      };

      render();
    })();


    /* V33 updates: schedule end time and six color options */
    (function applyV33ScheduleUpdates(){
      const style = document.createElement("style");
      style.textContent = `
        .sched-dot{display:inline-block;width:10px;height:10px;border-radius:999px;margin-left:6px;vertical-align:middle;background:#ef4444}
        .sched-card{border-right:6px solid #ef4444}
        .sched-red{border-right-color:#ef4444!important}.dot-red{background:#ef4444!important}
        .sched-orange{border-right-color:#f97316!important}.dot-orange{background:#f97316!important}
        .sched-yellow{border-right-color:#eab308!important}.dot-yellow{background:#eab308!important}
        .sched-green{border-right-color:#22c55e!important}.dot-green{background:#22c55e!important}
        .sched-blue{border-right-color:#3b82f6!important}.dot-blue{background:#3b82f6!important}
        .sched-purple{border-right-color:#a855f7!important}.dot-purple{background:#a855f7!important}
      `;
      document.head.appendChild(style);

      const form = document.getElementById("scheduleForm");
      if (form) {
        const duration = document.getElementById("scheduleDuration");
        if (duration) {
          const label = duration.closest("label");
          if (label) label.outerHTML = '<label>שעת סיום <input id="scheduleEnd" type="time" required /></label>';
        }
        if (!document.getElementById("scheduleEnd")) {
          const startLabel = document.getElementById("scheduleStart")?.closest("label");
          if (startLabel) startLabel.insertAdjacentHTML("afterend", '<label>שעת סיום <input id="scheduleEnd" type="time" required /></label>');
        }
        if (!document.getElementById("scheduleColor")) {
          const locationLabel = document.getElementById("scheduleLocation")?.closest("label") || document.getElementById("scheduleTitle")?.closest("label");
          if (locationLabel) locationLabel.insertAdjacentHTML("afterend", '<label>צבע לו\"ז <select id="scheduleColor"><option value="red">אדום</option><option value="orange">כתום</option><option value="yellow">צהוב</option><option value="green">ירוק</option><option value="blue">כחול</option><option value="purple">סגול</option></select></label>');
        }
      }

      function scheduleColorValue(x){ return ["red","orange","yellow","green","blue","purple"].includes(x?.color) ? x.color : "red"; }
      function scheduleTimeRange(x){ return `${escapeHtml(x.start || "")} - ${escapeHtml(x.end || "")}`; }
      function defaultEndFromStart(start){
        if (!start || !/^\d{2}:\d{2}$/.test(start)) return "09:00";
        const [h,m]=start.split(":").map(Number); const d=new Date(2000,0,1,h,m); d.setHours(d.getHours()+1);
        return String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
      }

      const startInput = document.getElementById("scheduleStart");
      if (startInput && !startInput.dataset.v33Bound) {
        startInput.dataset.v33Bound = "1";
        startInput.addEventListener("change", () => {
          const endInput = document.getElementById("scheduleEnd");
          if (endInput && !endInput.value) endInput.value = defaultEndFromStart(startInput.value);
        });
      }

      renderCalendar = function() {
        const grid = document.getElementById("calendarGrid"); if (!grid) return; initCalendarMonth();
        const [y,m] = document.getElementById("calendarMonth").value.split("-").map(Number);
        const first = new Date(y, m-1, 1);
        const start = new Date(first); start.setDate(start.getDate() - start.getDay());
        const labels = ["שבוע","א","ב","ג","ד","ה","ו","ש"];
        let html = labels.map((l,idx) => `<div class="calendar-day ${idx===0?'calendar-week-head':''}" style="min-height:auto;font-weight:bold;text-align:center;background:${idx===0?'#fecaca':'#fee2e2'}">${l}</div>`).join("");
        for (let row=0; row<6; row++) {
          const weekStart = new Date(start); weekStart.setDate(start.getDate() + row*7);
          html += `<div class="calendar-week-cell">שבוע<br>${weekNumber(weekStart)}</div>`;
          for (let col=0; col<7; col++) {
            const d = new Date(weekStart); d.setDate(weekStart.getDate()+col); const dateStr = iso(d);
            const dayItems = schedules.filter(x => x.date === dateStr).sort((a,b)=>String(a.start||"").localeCompare(String(b.start||"")));
            html += `<div class="calendar-day ${d.getMonth()!==m-1?'muted':''}" onclick="openScheduleModal('${dateStr}')"><div class="num">${d.getDate()}</div>${dayItems.slice(0,3).map(x=>`<span class="mini-event"><span class="sched-dot dot-${scheduleColorValue(x)}"></span>${escapeHtml(x.start||"")}${x.end ? "-" + escapeHtml(x.end) : ""} ${escapeHtml(x.title||"")}</span>`).join("")}</div>`;
          }
        }
        grid.innerHTML = html;
      };

      openScheduleModal = function(dateStr) {
        selectedScheduleDate = dateStr;
        document.getElementById("scheduleId").value="";
        document.getElementById("scheduleDate").value=dateStr;
        document.getElementById("scheduleDateView").value=dateStr;
        document.getElementById("modalDateTitle").textContent = "לו\"ז ליום " + formatDate(dateStr);
        document.getElementById("scheduleForm").reset();
        document.getElementById("scheduleDate").value=dateStr;
        document.getElementById("scheduleDateView").value=dateStr;
        document.getElementById("scheduleStart").value="08:00";
        if (document.getElementById("scheduleEnd")) document.getElementById("scheduleEnd").value="09:00";
        if (document.getElementById("scheduleColor")) document.getElementById("scheduleColor").value="red";
        renderDaySchedule(dateStr);
        document.getElementById("scheduleModal").classList.add("open");
      };

      renderDaySchedule = function(dateStr) {
        const el = document.getElementById("dayScheduleList"); if (!el) return;
        const items = schedules.filter(x=>x.date===dateStr).sort((a,b)=>String(a.start||"").localeCompare(String(b.start||"")));
        el.className = items.length ? "list" : "list empty";
        el.innerHTML = items.length ? items.map(x=>`<div class="item sched-card sched-${scheduleColorValue(x)}"><h3><span class="sched-dot dot-${scheduleColorValue(x)}"></span>${scheduleTimeRange(x)} | ${escapeHtml(x.title)}</h3><p><b>מיקום:</b> ${escapeHtml(x.location||"-")}</p><p><b>משתתפים:</b> ${escapeHtml(x.participants||"-")}</p><p><b>הערות:</b> ${escapeHtml(x.notes||"-")}</p><div class="item-actions"><button type="button" class="small" onclick="editSchedule('${x.id}')" title="עריכה" aria-label="עריכה">✏️</button><button type="button" class="small danger" onclick="deleteSchedule('${x.id}')" title="מחיקה" aria-label="מחיקה">🗑️</button></div></div>`).join("") : "אין לו\"ז ביום זה";
      };

      renderSchedule = function() {
        const el = document.getElementById("scheduleList"); if (!el) return;
        const query = searchValue("scheduleSearch");
        const now = new Date();
        const today = iso(now);
        const currentTime = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
        const isUpcomingSchedule = (x) => {
          const date = x.date || "";
          if (date > today) return true;
          if (date < today) return false;
          const compareTime = x.end || x.start || "00:00";
          return compareTime >= currentTime;
        };
        const items = [...(window.futureSchedulesOnly || schedules)]
          .filter(isUpcomingSchedule)
          .filter(x => matchesSearch([x.date, formatDate(x.date), x.start, x.end, x.title, x.location, x.participants, x.notes], query))
          .sort((a,b)=>String(a.date||"").localeCompare(String(b.date||"")) || String(a.start||"").localeCompare(String(b.start||"")));
        el.className = items.length ? "list" : "list empty";
        if (!items.length) { el.innerHTML = "אין עדיין לו\"ז"; return; }
        const grouped = new Map();
        items.forEach(x => { if (!grouped.has(x.date)) grouped.set(x.date, []); grouped.get(x.date).push(x); });
        el.innerHTML = [...grouped.entries()].map(([date, dayItems]) => {
          const d = new Date(date + "T00:00:00");
          const title = d.toLocaleDateString("he-IL", { weekday:"long", day:"2-digit", month:"2-digit", year:"numeric" });
          return `<div class="item"><h3>${title}</h3>${dayItems.map(x=>`<div class="sched-card sched-${scheduleColorValue(x)}" style="padding:8px 10px;border-top:1px solid #fee2e2"><b><span class="sched-dot dot-${scheduleColorValue(x)}"></span>${scheduleTimeRange(x)}</b> | ${escapeHtml(x.title || "")}<br><span class="hint">מיקום: ${escapeHtml(x.location || "-")} | משתתפים: ${escapeHtml(x.participants || "-")}</span><br><span>${escapeHtml(x.notes || "")}</span><div class="actions" style="margin-top:8px"><button type="button" class="secondary small" onclick="editSchedule('${x.id}')" title="עריכה" aria-label="עריכה">✏️</button><button type="button" class="danger small" onclick="deleteSchedule('${x.id}')" title="מחיקה" aria-label="מחיקה">🗑️</button></div></div>`).join("")}</div>`;
        }).join("");
      };

      editSchedule = function(id) {
        const x=schedules.find(i=>i.id===id); if(!x) return;
        openScheduleModal(x.date);
        document.getElementById("scheduleId").value=x.id;
        document.getElementById("scheduleStart").value=x.start||"08:00";
        if (document.getElementById("scheduleEnd")) document.getElementById("scheduleEnd").value=x.end||defaultEndFromStart(x.start||"08:00");
        document.getElementById("scheduleTitle").value=x.title||"";
        if (document.getElementById("scheduleLocation")) document.getElementById("scheduleLocation").value=x.location||"";
        if (document.getElementById("scheduleColor")) document.getElementById("scheduleColor").value=scheduleColorValue(x);
        if (document.getElementById("scheduleParticipants")) document.getElementById("scheduleParticipants").value=x.participants||"";
        document.getElementById("scheduleNotes").value=x.notes||"";
      };

      const oldForm = document.getElementById("scheduleForm");
      if (oldForm) {
        const newForm = oldForm.cloneNode(true);
        oldForm.parentNode.replaceChild(newForm, oldForm);
        document.getElementById("closeScheduleModal")?.addEventListener("click", () => document.getElementById("scheduleModal")?.classList.remove("open"));
        newForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const id=document.getElementById("scheduleId").value||createId();
          const item={
            id,
            date: document.getElementById("scheduleDate").value,
            start: document.getElementById("scheduleStart").value || "08:00",
            end: (document.getElementById("scheduleEnd") ? document.getElementById("scheduleEnd").value : "09:00"),
            title: document.getElementById("scheduleTitle").value.trim(),
            location: (document.getElementById("scheduleLocation") ? document.getElementById("scheduleLocation").value.trim() : ""),
            color: (document.getElementById("scheduleColor") ? document.getElementById("scheduleColor").value : "red"),
            participants: (document.getElementById("scheduleParticipants") ? document.getElementById("scheduleParticipants").value.trim() : ""),
            notes: document.getElementById("scheduleNotes").value.trim()
          };
          await saveScheduleToCloud(item);
          openScheduleModal(item.date);
        });
      }

      const rowsForExportV33Base = rowsForExport;
      rowsForExport = function(kind) {
        if (kind === "schedule" || kind === "calendar") return [["תאריך","שעת התחלה","שעת סיום","תוכן","מיקום","צבע","משתתפים","הערות"], ...schedules.map(x=>[x.date,x.start||"",x.end||"",x.title||"",x.location||"",x.color||"",x.participants||"",x.notes||""])];
        return rowsForExportV33Base(kind);
      };

      render();
    })();

    /* V36 fix: schedule dashboard shows only items from current time forward */
    (function applyV36ScheduleCurrentFutureFix(){
      function parseScheduleDateValue(value){
        const s = String(value || "").trim();
        let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        m = s.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
        if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
      }

      function minutesFromTime(t){
        const m = String(t || "").match(/^(\d{1,2}):(\d{2})/);
        return m ? Number(m[1]) * 60 + Number(m[2]) : null;
      }

      function scheduleEndMinutes(x){
        const end = minutesFromTime(x.end);
        if (end !== null) return end;
        const start = minutesFromTime(x.start);
        if (start === null) return 24 * 60;
        const duration = Number(x.duration || 0);
        return start + (duration > 0 ? duration : 60);
      }

      function isScheduleFromNowForward(x){
        const d = parseScheduleDateValue(x.date);
        if (!d) return false;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (d.getTime() > today.getTime()) return true;
        if (d.getTime() < today.getTime()) return false;

        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        return scheduleEndMinutes(x) >= nowMinutes;
      }

      function compareSchedules(a,b){
        const da = parseScheduleDateValue(a.date)?.getTime() || 0;
        const db = parseScheduleDateValue(b.date)?.getTime() || 0;
        if (da !== db) return da - db;
        return String(a.start || "").localeCompare(String(b.start || ""));
      }

      renderSchedule = function() {
        const el = document.getElementById("scheduleList");
        if (!el) return;

        const query = searchValue("scheduleSearch");
        const items = [...(window.futureSchedulesOnly || schedules)]
          .filter(isScheduleFromNowForward)
          .filter(x => matchesSearch([x.date, formatDate(x.date), x.start, x.end, x.title, x.location, x.participants, x.notes], query))
          .sort(compareSchedules);

        el.className = items.length ? "list" : "list empty";
        if (!items.length) {
          el.innerHTML = "אין לו״ז עתידי להצגה";
          return;
        }

        const grouped = new Map();
        items.forEach(x => {
          const key = x.date || "";
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key).push(x);
        });

        el.innerHTML = [...grouped.entries()].map(([date, dayItems]) => {
          const d = parseScheduleDateValue(date) || new Date(date + "T00:00:00");
          const title = d.toLocaleDateString("he-IL", { weekday:"long", day:"2-digit", month:"2-digit", year:"numeric" });
          return `<div class="item"><h3>${title}</h3>${dayItems.map(x=>`<div class="sched-card sched-${typeof scheduleColorValue === "function" ? scheduleColorValue(x) : (x.color || "red")}" style="padding:8px 10px;border-top:1px solid #fee2e2"><b><span class="sched-dot dot-${typeof scheduleColorValue === "function" ? scheduleColorValue(x) : (x.color || "red")}"></span>${typeof scheduleTimeRange === "function" ? scheduleTimeRange(x) : `${escapeHtml(x.start || "")} - ${escapeHtml(x.end || "")}`}</b> | ${escapeHtml(x.title || "")}<br><span class="hint">מיקום: ${escapeHtml(x.location || "-")} | משתתפים: ${escapeHtml(x.participants || "-")}</span><br><span>${escapeHtml(x.notes || "")}</span><div class="actions" style="margin-top:8px"><button type="button" class="secondary small" onclick="editSchedule('${x.id}')" title="עריכה" aria-label="עריכה">✏️</button><button type="button" class="danger small" onclick="deleteSchedule('${x.id}')" title="מחיקה" aria-label="מחיקה">🗑️</button></div></div>`).join("")}</div>`;
        }).join("");
      };

      setInterval(() => {
        const active = document.querySelector('.tab.active')?.dataset?.tab;
        if (active === "schedule") renderSchedule();
      }, 60000);

      renderSchedule();
    })();


    /* V37 final schedule filter: hide everything before current moment.
       Uses the later value between browser date and 2026-05-30 to avoid old cached/device-date issues. */
    (function applyV37ScheduleAbsoluteFilter(){
      const MIN_TODAY = new Date(2026, 4, 30); // 30.05.2026

      function dateOnly(d){
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
      }

      function effectiveNow(){
        const now = new Date();
        return dateOnly(now).getTime() < MIN_TODAY.getTime() ? new Date(MIN_TODAY) : now;
      }

      function parseDate(value){
        const s = String(value || "").trim();
        let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        m = s.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
        if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : dateOnly(d);
      }

      function minutes(t){
        const m = String(t || "").trim().match(/^(\d{1,2}):(\d{2})/);
        return m ? Number(m[1]) * 60 + Number(m[2]) : null;
      }

      function endMinutes(x){
        const e = minutes(x.end);
        if (e !== null) return e;
        const s = minutes(x.start);
        if (s === null) return 24 * 60;
        const duration = Number(x.duration || 0);
        return s + (duration > 0 ? duration : 60);
      }

      function isCurrentOrFuture(x){
        const d = parseDate(x.date);
        if (!d) return false;

        const now = effectiveNow();
        const today = dateOnly(now);

        if (d.getTime() > today.getTime()) return true;
        if (d.getTime() < today.getTime()) return false;

        return endMinutes(x) >= (now.getHours() * 60 + now.getMinutes());
      }

      function compare(a,b){
        const da = parseDate(a.date)?.getTime() || 0;
        const db = parseDate(b.date)?.getTime() || 0;
        if (da !== db) return da - db;
        return String(a.start || "").localeCompare(String(b.start || ""));
      }

      window.renderSchedule = renderSchedule = function(){
        const el = document.getElementById("scheduleList");
        if (!el) return;

        const query = typeof searchValue === "function" ? searchValue("scheduleSearch") : "";
        const items = [...(window.futureSchedulesOnly || schedules || [])]
          .filter(isCurrentOrFuture)
          .filter(x => !query || matchesSearch([x.date, formatDate(x.date), x.start, x.end, x.title, x.location, x.participants, x.notes], query))
          .sort(compare);

        el.className = items.length ? "list" : "list empty";
        if (!items.length) {
          el.innerHTML = "אין לו״ז עתידי להצגה";
          return;
        }

        const grouped = new Map();
        items.forEach(x => {
          const key = x.date || "";
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key).push(x);
        });

        el.innerHTML = [...grouped.entries()].map(([date, dayItems]) => {
          const d = parseDate(date) || new Date(date + "T00:00:00");
          const title = d.toLocaleDateString("he-IL", { weekday:"long", day:"2-digit", month:"2-digit", year:"numeric" });
          return `<div class="item"><h3>${title}</h3>${dayItems.map(x=>`<div class="sched-card sched-${typeof scheduleColorValue === "function" ? scheduleColorValue(x) : (x.color || "red")}" style="padding:8px 10px;border-top:1px solid #fee2e2"><b><span class="sched-dot dot-${typeof scheduleColorValue === "function" ? scheduleColorValue(x) : (x.color || "red")}"></span>${typeof scheduleTimeRange === "function" ? scheduleTimeRange(x) : `${escapeHtml(x.start || "")} - ${escapeHtml(x.end || "")}`}</b> | ${escapeHtml(x.title || "")}<br><span class="hint">מיקום: ${escapeHtml(x.location || "-")} | משתתפים: ${escapeHtml(x.participants || "-")}</span><br><span>${escapeHtml(x.notes || "")}</span><div class="actions" style="margin-top:8px"><button type="button" class="secondary small" onclick="editSchedule('${x.id}')" title="עריכה" aria-label="עריכה">✏️</button><button type="button" class="danger small" onclick="deleteSchedule('${x.id}')" title="מחיקה" aria-label="מחיקה">🗑️</button></div></div>`).join("")}</div>`;
        }).join("");
      };

      const oldRender = window.render;
      if (typeof oldRender === "function") {
        window.render = render = function(){
          oldRender();
          const active = document.querySelector('.tab.active')?.dataset?.tab;
          if (active === "schedule") window.renderSchedule();
        };
      }

      setTimeout(() => {
        const active = document.querySelector('.tab.active')?.dataset?.tab;
        if (active === "schedule") window.renderSchedule();
      }, 500);
    })();


    /* V38+ Courses dashboard */
    (function addCoursesDashboard(){
      const COURSES_STORAGE_KEY = "logistics89Courses_v1";
      window.courses = window.courses || [];
      let coursesCollection = null;
      function courseCol(){ if (!coursesCollection && typeof firebaseReady !== "undefined" && firebaseReady && db) coursesCollection = db.collection("courses"); return coursesCollection; }
      function saveCoursesLocal(){ try { localStorage.setItem(COURSES_STORAGE_KEY, JSON.stringify(window.courses || [])); } catch (err) {} }
      function loadCoursesLocal(){ try { window.courses = JSON.parse(localStorage.getItem(COURSES_STORAGE_KEY) || "[]"); } catch (err) { window.courses = []; } }
      window.updateCoursePersonOptions = function(){
        const select = document.getElementById("coursePersonId"); if (!select) return;
        const current = select.value;
        const options = [...(people || [])].sort((a,b)=>String(a.fullName||"").localeCompare(String(b.fullName||""), "he"));
        select.innerHTML = '<option value="">בחר בעל תפקיד</option>' + options.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.fullName || "")} - ${escapeHtml(p.role || "ללא תפקיד")} | ${escapeHtml(p.unit || "")}</option>`).join("");
        if (options.some(p => p.id === current)) select.value = current;
      };
      function coursePersonName(personId){ const p = (people || []).find(x => x.id === personId); return p ? (p.fullName || "-") : "בעל תפקיד לא קיים"; }
      function courseHtml(c){
        const person = (people || []).find(p => p.id === c.personId);
        return `<div class="item"><h3>${escapeHtml(c.courseName || "קורס")}</h3><p><b>בעל תפקיד:</b> ${escapeHtml(coursePersonName(c.personId))}${person ? ` | ${escapeHtml(person.role || "")}${person.unit ? " | " + escapeHtml(person.unit) : ""}` : ""}</p><p><b>מועד התחלה:</b> ${formatDate(c.startDate) || "-"}</p><p><b>מועד סיום:</b> ${formatDate(c.endDate) || "-"}</p><p><b>הערות:</b> ${escapeHtml(c.notes || "-")}</p><div class="item-actions"><button type="button" class="small" onclick="editCourse('${c.id}')">עריכה</button><button type="button" class="small danger" onclick="deleteCourse('${c.id}')">מחיקה</button></div></div>`;
      }
      window.renderCourses = function(){
        updateCoursePersonOptions(); const el = document.getElementById("coursesList"); if (!el) return;
        const q = typeof searchValue === "function" ? searchValue("coursesSearch") : "";
        const items = [...(window.courses || [])].filter(c => (people || []).some(p => p.id === c.personId)).filter(c => !q || matchesSearch([coursePersonName(c.personId), c.courseName, c.startDate, formatDate(c.startDate), c.endDate, formatDate(c.endDate), c.notes], q)).sort((a,b)=>String(a.startDate||"").localeCompare(String(b.startDate||"")) || String(a.courseName||"").localeCompare(String(b.courseName||""), "he"));
        el.className = items.length ? "list" : "list empty"; el.innerHTML = items.length ? items.map(courseHtml).join("") : "אין עדיין קורסים";
      };
      window.resetCourseForm = function(){ const form = document.getElementById("courseForm"); if (form) form.reset(); const id = document.getElementById("courseId"); if (id) id.value = ""; const btn = document.querySelector('#courseForm button[type="submit"]'); if (btn) btn.textContent = "הוספה"; };
      window.saveCourseToCloud = async function(course){
        requireEdit(); const col = courseCol();
        if (col) { const exists = (window.courses || []).find(c => c.id === course.id); await col.doc(course.id).set(course); if (typeof logAudit === "function") await logAudit(exists ? "עריכת קורס" : "הוספת קורס", "קורסים", `${coursePersonName(course.personId)} | ${course.courseName || ""}`); }
        else { const idx = (window.courses || []).findIndex(c => c.id === course.id); if (idx >= 0) window.courses[idx] = course; else window.courses.push(course); saveCoursesLocal(); renderCourses(); render(); }
      };
      window.deleteCourse = async function(id){
        if (!confirm("למחוק קורס זה?")) return; requireEdit(); const c = (window.courses || []).find(x => x.id === id); const col = courseCol();
        if (col) { await col.doc(id).delete(); if (typeof logAudit === "function") await logAudit("מחיקת קורס", "קורסים", c ? `${coursePersonName(c.personId)} | ${c.courseName || ""}` : id); }
        else { window.courses = (window.courses || []).filter(x => x.id !== id); saveCoursesLocal(); renderCourses(); render(); }
      };
      window.editCourse = function(id){
        const c = (window.courses || []).find(x => x.id === id); if (!c) return; switchTab("courses"); updateCoursePersonOptions();
        document.getElementById("courseId").value = c.id; document.getElementById("coursePersonId").value = c.personId || ""; document.getElementById("courseName").value = c.courseName || ""; document.getElementById("courseStartDate").value = c.startDate || ""; document.getElementById("courseEndDate").value = c.endDate || ""; document.getElementById("courseNotes").value = c.notes || "";
        const btn = document.querySelector('#courseForm button[type="submit"]'); if (btn) btn.textContent = "שמירה";
      };
      window.startCoursesSync = function(){
        const col = courseCol(); if (!col) { loadCoursesLocal(); renderCourses(); return; }
        col.onSnapshot(snapshot => { window.courses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); saveCoursesLocal(); renderCourses(); renderDashboard(); renderEvents(); renderTodayBox(); renderNotifications(); }, err => { console.error("Courses sync error", err); loadCoursesLocal(); renderCourses(); });
      };
      const originalBuildEvents = buildEvents;
      buildEvents = function(){
        const events = originalBuildEvents();
        (window.courses || []).forEach(c => { if (!(people || []).some(p => p.id === c.personId)) return; const name = coursePersonName(c.personId); if (c.startDate) events.push({ name, type: "תחילת קורס", date: c.startDate, personId: c.personId, notes: c.courseName || "" }); if (c.endDate) events.push({ name, type: "סיום קורס", date: c.endDate, personId: c.personId, notes: c.courseName || "" }); });
        return events.sort((a,b)=>daysUntilNext(a.date)-daysUntilNext(b.date));
      };
      const originalEventHtml = eventHtml;
      eventHtml = function(e){ if (e.type === "תחילת קורס" || e.type === "סיום קורס") { const days = daysUntilNext(e.date); const daysText = days === 0 ? "היום" : days === 1 ? "מחר" : "בעוד " + days + " ימים"; const todayClass = days === 0 ? "today-badge" : ""; return `<div class="item"><h3>${escapeHtml(e.type)} - ${escapeHtml(e.name)}</h3><p><span class="badge ${todayClass}">${daysText}</span></p><p>תאריך: ${formatDate(e.date)}</p><p><b>קורס:</b> ${escapeHtml(e.notes || "-")}</p></div>`; } return originalEventHtml(e); };
      const originalRenderNotifications = renderNotifications;
      renderNotifications = function(){
        originalRenderNotifications(); const el = document.getElementById("notificationsList"); if (!el) return; const today = todayIso(); const soon = futureIso(7); const courseAlerts = [];
        (window.courses || []).forEach(c => { if (!(people || []).some(p => p.id === c.personId)) return; if (c.startDate && c.startDate >= today && c.startDate <= soon) courseAlerts.push({ date:c.startDate, title:"תחילת קורס", text:coursePersonName(c.personId), note:c.courseName || "" }); if (c.endDate && c.endDate >= today && c.endDate <= soon) courseAlerts.push({ date:c.endDate, title:"סיום קורס", text:coursePersonName(c.personId), note:c.courseName || "" }); });
        if (!courseAlerts.length) return; const existing = el.classList.contains("empty") ? "" : el.innerHTML; const html = courseAlerts.sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(a => { const cls = a.date === today ? "notification-today" : "notification-soon"; return `<div class="item ${cls}"><h3>${escapeHtml(a.title)} - ${escapeHtml(a.text)}</h3><p><b>${escapeHtml(notificationDateLabel(a.date))}</b> | ${formatDate(a.date)}</p><p>${escapeHtml(a.note || "")}</p></div>`; }).join(""); el.className = "list"; el.innerHTML = existing + html;
      };
      const originalRowsForExport = rowsForExport;
      rowsForExport = function(kind){ if (kind === "courses") return [["שם בעל התפקיד","שם הקורס","מועד התחלה","מועד סיום","הערות"], ...(window.courses || []).map(c=>[coursePersonName(c.personId), c.courseName, c.startDate, c.endDate, c.notes || ""])]; return originalRowsForExport(kind); };
      const originalRender = render;
      render = function(){ originalRender(); updateCoursePersonOptions(); renderCourses(); };
      const originalSwitchTab = switchTab;
      switchTab = function(tabName){ originalSwitchTab(tabName); if (tabName === "courses") { updateCoursePersonOptions(); renderCourses(); } };
      document.addEventListener("submit", async (e) => {
        if (!e.target || e.target.id !== "courseForm") return; e.preventDefault(); e.stopPropagation();
        const personId = document.getElementById("coursePersonId").value; if (!(people || []).some(p => p.id === personId)) { alert("צריך לבחור בעל תפקיד שקיים במערכת."); return; }
        const startDate = document.getElementById("courseStartDate").value; const endDate = document.getElementById("courseEndDate").value; if (startDate && endDate && endDate < startDate) { alert("מועד הסיום לא יכול להיות לפני מועד ההתחלה."); return; }
        const id = document.getElementById("courseId").value || createId(); const existing = (window.courses || []).find(c => c.id === id) || {};
        const course = { ...existing, id, personId, courseName: document.getElementById("courseName").value.trim(), startDate, endDate, notes: document.getElementById("courseNotes").value.trim(), updatedAt: new Date().toISOString() };
        if (!course.courseName) { alert("צריך למלא שם קורס."); return; } await saveCourseToCloud(course); resetCourseForm(); renderCourses();
      }, true);
      document.addEventListener("click", (e) => { if (e.target && e.target.id === "resetCourseForm") resetCourseForm(); });
      document.addEventListener("input", (e) => { if (e.target && e.target.id === "coursesSearch") renderCourses(); });
      setTimeout(() => { startCoursesSync(); renderCourses(); }, 800);
    })();

  