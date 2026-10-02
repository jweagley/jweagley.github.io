// UI glue for the Course Schedule Builder.
(function () {
  "use strict";

  var Cal = window.PurdueCalendar, S = window.CourseSchedule;
  var $ = function (id) { return document.getElementById(id); };

  var calendar = null;      // { events, published, modified } from calendar-data.json
  var addDrop = null;       // { sessions, short, modified } from adddrop-data.json
  var weeks = [];           // raw weeks from buildWeeks
  var breakOverride = {};   // week start (ms) -> true/false, set by the user
  var datesTouched = false; // stop auto-filling once the user edits dates
  var shortPick = null;     // CRN chosen from the short-course lookup
  var logo = null;
  var termInfo = null;

  // ---------- Calendar loading ----------

  function setStatus(kind, html) {
    var el = $("cal-status");
    el.className = "cal-status " + kind;
    el.querySelector(".msg").innerHTML = html;
  }

  var OFFICIAL = '<a href="https://www.purdue.edu/registrar/calendars/academic/" target="_blank" rel="noopener">official calendar</a>';

  function getJson(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  // Both files are refreshed daily from the Registrar by a GitHub Action.
  // Add/Drop data (course-length dates, short courses) is optional.
  var addDropLoad = getJson("adddrop-data.json")
    .then(function (a) { addDrop = a; })
    .catch(function () { addDrop = { sessions: [], short: {} }; });

  getJson("calendar-data.json")
    .then(function (c) {
      calendar = c;
      var updated = c.modified && c.modified.official ? " Registrar page last updated " + S.fmtLong(S.parseInputDate(c.modified.official)).replace(/^\w+, /, "") + "." : "";
      setStatus("ok", "Purdue Academic Calendar loaded, " + firstAcad(c) + " through " + lastAcad(c) + "." + updated);
    })
    .catch(function () {
      calendar = { events: [], published: {}, modified: {} };
      setStatus("warn", "The Purdue calendar data couldn’t be loaded, so holidays won’t be marked. Check dates against the " + OFFICIAL + ".");
    })
    .then(function () { return addDropLoad; })
    .then(function () {
      pickDefaultTerm();
      update();
    })
    .catch(function (err) {
      setStatus("warn", "Something went wrong setting up the page (" + esc(err.message) + "). Try reloading.");
    });

  function acads(c) { return c.events.map(function (e) { return e.acad; }).sort(); }
  function firstAcad(c) { return acads(c)[0]; }
  function lastAcad(c) { var a = acads(c); return a[a.length - 1]; }

  // Default to the next term that hasn't started yet.
  function pickDefaultTerm() {
    var today = Date.now();
    var next = calendar.events.filter(function (e) {
      return /^(Fall|Spring|Summer) term classes begin/i.test(e.name) && e.start > today;
    })[0];
    if (next) {
      $("term").value = next.name.split(" ")[0];
      $("year").value = new Date(next.start).getUTCFullYear();
    } else {
      $("year").value = new Date().getFullYear();
    }
  }

  // ---------- Schedule model ----------

  function toInput(ms) { return new Date(ms).toISOString().slice(0, 10); }

  function readForm() {
    return {
      title: $("title").value.trim(),
      number: $("number").value.trim(),
      term: $("term").value,
      year: parseInt($("year").value, 10),
      length: $("length").value,
      start: S.parseInputDate($("start").value),
      end: S.parseInputDate($("end").value)
    };
  }

  // ---------- Course lengths ----------

  var ADD_DROP = '<a href="https://www.purdue.edu/registrar/calendars/add-drop/" target="_blank" rel="noopener">Add/Drop calendar</a>';

  function termSessions(f) {
    return addDrop.sessions.filter(function (s) { return s.term === f.term && s.year === f.year; });
  }

  function findSession(f, re) {
    return termSessions(f).filter(function (s) { return re.test(s.label); })[0] || null;
  }

  function weeksLong(s) {
    return (S.parseInputDate(s.end) - S.parseInputDate(s.start)) / S.DAY / 7;
  }

  // Options for the Course length menu: [value, label]
  function lengthOptions(f) {
    var opts = [];
    if (f.term === "Fall" || f.term === "Spring") {
      opts.push(["full", "16 weeks (full term)"], ["first8", "8 weeks: first half"], ["second8", "8 weeks: second half"]);
    } else if (f.term === "Summer") {
      var sevens = termSessions(f).filter(function (s) { return /seven|7[- ]?week/i.test(s.label) || (weeksLong(s) > 6.2 && weeksLong(s) < 7.8); });
      if (sevens.length) sevens.forEach(function (s, i) { opts.push(["seven:" + i, "7 weeks: " + s.label]); });
      else opts.push(["seven", "7 weeks"]);
    } else {
      opts.push(["full", "Full term"]);
    }
    opts.push(["short", "Short course (look up by course number)"], ["manual", "Other (enter dates)"]);
    return opts;
  }

  function syncLengthMenu(f) {
    var sel = $("length");
    var opts = lengthOptions(f);
    var key = opts.map(function (o) { return o[0]; }).join("|");
    if (sel.dataset.key !== key) {
      var prev = sel.value;
      sel.innerHTML = opts.map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + "</option>"; }).join("");
      sel.dataset.key = key;
      if (opts.some(function (o) { return o[0] === prev; })) sel.value = prev;
    }
    return sel.value;
  }

  // "GRAD 589/588" -> ["GRAD58900", "GRAD58800"]; "GRAD50200" -> ["GRAD50200"]
  function courseIds(number) {
    var s = number.toUpperCase().replace(/\s+/g, "");
    var subj = (s.match(/^[A-Z]+/) || [""])[0];
    if (!subj) return [];
    return (s.slice(subj.length).match(/\d{3,5}[A-Z]?/g) || []).map(function (n) {
      return subj + (/^\d{3}$/.test(n) ? n + "00" : n);
    });
  }

  function shortMatches(f) {
    var table = addDrop.short[f.term + " " + f.year];
    if (!table) return null;
    var ids = courseIds(f.number);
    return table.rows.filter(function (r) { return ids.indexOf(r[0]) >= 0; });
  }

  // Work out the dates the chosen length implies: { start, end, hint } or { hint } when unknown.
  function lengthDates(f) {
    var termName = f.term + " " + f.year;
    if (f.length === "full") {
      var full = findSession(f, /^full term/i);
      if (full) return { start: full.start, end: full.end, hint: "Full term from the " + ADD_DROP + "." };
      if (termInfo) return { start: toInput(termInfo.begin), end: toInput(termInfo.end || termInfo.begin), hint: "Full term from the Academic Calendar" + (termInfo.source === "official" ? "." : " (" + termInfo.source + ").") };
      return { hint: "The Purdue calendar doesn’t list " + termName + " yet. Enter the course dates." };
    }
    if (f.length === "first8" || f.length === "second8") {
      var half = findSession(f, f.length === "first8" ? /first eight/i : /second eight/i);
      if (half) return { start: half.start, end: half.end, hint: half.label + " from the " + ADD_DROP + "." };
      return { hint: termName + " 8-week dates aren’t posted on the " + ADD_DROP + " yet. Enter the course dates." };
    }
    if (/^seven/.test(f.length)) {
      var i = f.length.split(":")[1];
      var sevens = termSessions(f).filter(function (s) { return /seven|7[- ]?week/i.test(s.label) || (weeksLong(s) > 6.2 && weeksLong(s) < 7.8); });
      if (i != null && sevens[+i]) return { start: sevens[+i].start, end: sevens[+i].end, hint: sevens[+i].label + " from the " + ADD_DROP + "." };
      return { hint: termName + " 7-week dates aren’t posted on the " + ADD_DROP + " yet. Enter the course dates." };
    }
    if (f.length === "short") {
      var rows = shortMatches(f);
      if (!rows) return { hint: termName + " short-course dates aren’t posted on the " + ADD_DROP + " yet. Enter the course dates." };
      if (!courseIds(f.number).length) return { hint: "Enter a course number above (like GRAD 502) to look up its short-course dates." };
      if (!rows.length) return { hint: "No short-course sections for " + esc(f.number) + " in " + termName + " on the " + ADD_DROP + ". Check the course number or enter the dates." };
      var pick = rows.filter(function (r) { return r[1] === shortPick; })[0];
      var distinct = rows.filter(function (r, k) { return rows.findIndex(function (x) { return x[3] === r[3] && x[4] === r[4]; }) === k; });
      if (!pick && distinct.length === 1) pick = rows[0];
      if (!pick) return { hint: "Pick a section below to fill in its dates." };
      return { start: pick[3], end: pick[4], crn: pick[1], hint: pick[0] + " (CRN " + pick[1] + ") from the " + ADD_DROP + " short-course list." };
    }
    return { hint: "Enter the course start and end dates." };
  }

  function renderShortResults(f, chosen) {
    var box = $("short-results");
    var rows = f.length === "short" ? shortMatches(f) : null;
    if (!rows || rows.length < 2) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    box.innerHTML = '<p class="short-head">' + rows.length + " sections found</p>" + rows.map(function (r) {
      return '<label class="check"><input type="radio" name="short-crn" value="' + esc(r[1]) + '"' + (chosen === r[1] ? " checked" : "") + "> " +
        "CRN " + esc(r[1]) + " · " + S.fmtRange(S.parseInputDate(r[3]), S.parseInputDate(r[4])) + ", " + r[4].slice(0, 4) +
        ' <span class="sub">(' + esc(r[0]) + ", session " + esc(r[2]) + ")</span></label>";
    }).join("");
  }

  function isBreak(w) {
    return w.start in breakOverride ? breakOverride[w.start] : w.suggestBreak;
  }

  function update() {
    if (!calendar) return;
    var f = readForm();
    $("error").textContent = "";

    termInfo = f.year ? Cal.findTerm(calendar.events, f.term, f.year, f.start, f.end) : null;
    f.length = syncLengthMenu(f);
    var auto = f.year ? lengthDates(f) : { hint: "" };
    renderShortResults(f, auto.crn);
    var hint = $("term-hint");
    if (auto.start && !datesTouched) {
      $("start").value = auto.start;
      $("end").value = auto.end;
      f = Object.assign(readForm(), { length: f.length });
      hint.innerHTML = auto.hint;
    } else if (auto.start) {
      hint.innerHTML = 'You changed the dates. <button type="button" class="linkish" id="use-length">Reset to ' +
        esc(S.fmtRange(S.parseInputDate(auto.start), S.parseInputDate(auto.end))) + "</button>";
      $("use-length").onclick = function () { datesTouched = false; breakOverride = {}; update(); };
    } else {
      if (!datesTouched && f.length !== "manual") { $("start").value = ""; $("end").value = ""; f = Object.assign(readForm(), { length: f.length }); }
      hint.innerHTML = auto.hint;
    }

    var notices = [];
    if (f.start == null || f.end == null) {
      weeks = [];
    } else if (f.end < f.start) {
      weeks = [];
      notices.push(["error", "The end date is before the start date."]);
    } else if ((f.end - f.start) / S.DAY > 7 * 60) {
      weeks = [];
      notices.push(["error", "That date range is over 60 weeks. Check the year on each date."]);
    } else {
      var closures = Cal.closuresBetween(calendar.events, f.start, f.end);
      weeks = S.buildWeeks(f.start, f.end, closures);
      if (termInfo && (f.start < termInfo.begin - 14 * S.DAY || f.end > (termInfo.end || termInfo.begin) + 14 * S.DAY))
        notices.push(["warn", "These course dates fall partly outside the " + f.term + " " + f.year + " term. Holidays are still taken from the calendar for the dates you entered."]);
      if (termInfo && termInfo.source === "projected")
        notices.push(["warn", "The " + termInfo.acad + " calendar is still <em>projected</em>, so its dates may change before it’s final."]);
      var lastYear = lastAcad(calendar);
      if (lastYear && f.end > Date.UTC(2000 + +lastYear.slice(-2), 7, 31))
        notices.push(["warn", "Purdue’s calendar only goes through " + lastYear + ", so holidays after that aren’t included."]);
      if (!closures.length) notices.push(["info", "No campus closures or breaks fall within these dates."]);
    }

    $("notices").innerHTML = notices.map(function (n) { return '<p class="notice ' + n[0] + '">' + n[1] + "</p>"; }).join("");
    renderPreview(f);
    $("download").disabled = weeks.length === 0;
  }

  function numbered() {
    return S.numberWeeks(weeks, isBreak);
  }

  // ---------- Preview ----------

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderPreview(f) {
    var doc = $("doc");
    if (!weeks.length) {
      doc.innerHTML = '<p class="empty">Choose a term and course dates to see the schedule.</p>';
      return;
    }
    var bullets = +$("bullets").value;
    var bulletHtml = "<ul>" + new Array(bullets + 1).join('<li><span class="ph">Click to add a deliverable</span></li>') + "</ul>";
    var rows = numbered().map(function (w) {
      var toggle = w.hasClosure
        ? '<label class="brk"><input type="checkbox" data-start="' + w.start + '"' + (w.isBreak ? " checked" : "") + "> Break week (no number)</label>"
        : "";
      if (w.isBreak)
        return '<tr class="break"><td colspan="2">' + esc(w.label) + toggle + "</td></tr>";
      return "<tr><td class=\"wk\"><strong>" + esc(w.label) + "</strong><br>" + esc(w.range) +
        w.notes.map(function (n) { return '<span class="note">' + esc(n.text) + "</span>"; }).join("") + toggle +
        "</td><td>" + bulletHtml + "</td></tr>";
    }).join("");

    doc.innerHTML =
      '<div class="doc-logo">' + (logo ? '<img src="' + logo.url + '" alt="Logo">' : '<span class="wm">PURDUE</span> <span class="wm2">UNIVERSITY</span>') + "</div>" +
      '<p class="doc-title">' + esc(docTitle(f)) + "</p>" +
      (docSubtitle(f) ? '<p class="doc-sub">' + esc(docSubtitle(f)) + "</p>" : "") +
      ($("intro").value.trim() ? '<p class="doc-intro">' + esc($("intro").value.trim()) + "</p>" : "") +
      '<table><thead><tr><th>Week/Date</th><th>Weekly Deliverables</th></tr></thead><tbody>' + rows + "</tbody></table>" +
      ($("source-note").checked ? '<p class="doc-source">' + esc(sourceNote()) + "</p>" : "");
  }

  $("doc").addEventListener("change", function (e) {
    if (e.target.matches("input[data-start]")) {
      breakOverride[+e.target.dataset.start] = e.target.checked;
      update();
    }
  });

  function docTitle(f) { return (f.title || "Course") + " Schedule"; }
  function docSubtitle(f) { return [f.number, f.term + " " + (f.year || "")].filter(Boolean).join(" | ").trim(); }

  function sourceNote() {
    var acads = {};
    weeks.forEach(function (w) {
      calendar.events.forEach(function (e) { if (e.start <= w.end && e.end >= w.start) acads[e.acad] = e.source; });
    });
    var parts = Object.keys(acads).sort().map(function (a) { return acads[a] + " " + a + " calendar"; });
    return "Holidays and breaks from the Purdue Academic Calendar (" + (parts.join(", ") || "no calendar data for these dates") + "; generated " +
      S.fmtLong(Date.now()).replace(/^\w+, /, "") + "). Dates are subject to change.";
  }

  // ---------- Inputs ----------

  ["title", "intro", "bullets", "source-note", "fillable"].forEach(function (id) {
    $(id).addEventListener("input", update);
  });
  $("number").addEventListener("input", function () {
    if ($("length").value === "short") { shortPick = null; datesTouched = false; breakOverride = {}; }
    update();
  });
  ["term", "year", "length"].forEach(function (id) {
    $(id).addEventListener("change", function () { datesTouched = false; shortPick = null; breakOverride = {}; update(); });
  });
  $("short-results").addEventListener("change", function (e) {
    if (e.target.name === "short-crn") { shortPick = e.target.value; datesTouched = false; breakOverride = {}; update(); }
  });
  ["start", "end"].forEach(function (id) {
    $(id).addEventListener("change", function () { datesTouched = true; update(); });
  });

  // Official Purdue horizontal logo (PU-H-Full-RGB) is the default; an upload replaces it.
  var LOGO_W = Math.round(2.2 * 914400); // inches -> EMU (Word needs integers)
  var defaultLogo = null;
  fetch("purdue-logo.png")
    .then(function (r) { if (!r.ok) throw new Error(); return r.arrayBuffer(); })
    .then(function (buf) {
      defaultLogo = { url: "purdue-logo.png", data: new Uint8Array(buf), ext: "png", cx: LOGO_W, cy: Math.round(LOGO_W * 327 / 1800) };
      if (!logo) { logo = defaultLogo; update(); }
    })
    .catch(function () { /* falls back to the text wordmark */ });

  $("logo").addEventListener("change", function () {
    var file = this.files[0];
    if (logo && logo !== defaultLogo) URL.revokeObjectURL(logo.url);
    logo = defaultLogo;
    if (!file) return update();
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      file.arrayBuffer().then(function (buf) {
        logo = { url: url, data: new Uint8Array(buf), ext: file.type === "image/png" ? "png" : "jpeg", cx: LOGO_W, cy: Math.round(LOGO_W * img.naturalHeight / img.naturalWidth) };
        update();
      });
    };
    img.onerror = function () { $("error").textContent = "That image couldn’t be read. Try a PNG or JPG."; };
    img.src = url;
  });

  // ---------- Download ----------

  $("form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!weeks.length) return;
    var f = readForm();
    var model = {
      title: docTitle(f),
      subtitle: docSubtitle(f),
      intro: $("intro").value.trim(),
      weeks: numbered(),
      bullets: +$("bullets").value,
      fillable: $("fillable").checked,
      sourceNote: $("source-note").checked ? sourceNote() : "",
      logo: logo
    };
    window.ScheduleDocx.build(model)
      .generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
      .then(function (blob) {
        var name = [f.number || f.title || "Course", f.term, f.year, "Schedule"].join(" ").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() + ".docx";
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      })
      .catch(function (err) { $("error").textContent = "Couldn’t create the document: " + err.message; });
  });
})();
