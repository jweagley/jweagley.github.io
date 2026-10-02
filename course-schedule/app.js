// UI glue for the Course Schedule Builder.
(function () {
  "use strict";

  var Cal = window.PurdueCalendar, S = window.CourseSchedule;
  var $ = function (id) { return document.getElementById(id); };

  var calendar = null;      // { events, published, modified } from calendar-data.json
  var weeks = [];           // raw weeks from buildWeeks
  var breakOverride = {};   // week start (ms) -> true/false, set by the user
  var datesTouched = false; // stop auto-filling once the user edits dates
  var logo = null;
  var termInfo = null;

  // ---------- Calendar loading ----------

  function setStatus(kind, html) {
    var el = $("cal-status");
    el.className = "cal-status " + kind;
    el.querySelector(".msg").innerHTML = html;
  }

  var OFFICIAL = '<a href="https://www.purdue.edu/registrar/calendars/academic/" target="_blank" rel="noopener">official calendar</a>';

  // calendar-data.json is refreshed daily from the Registrar by a GitHub Action.
  fetch("calendar-data.json", { cache: "no-cache" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (c) {
      calendar = c;
      var updated = c.modified && c.modified.official ? " Registrar page last updated " + S.fmtLong(S.parseInputDate(c.modified.official)).replace(/^\w+, /, "") + "." : "";
      setStatus("ok", "Purdue Academic Calendar loaded, " + firstAcad(c) + " through " + lastAcad(c) + "." + updated);
    })
    .catch(function () {
      calendar = { events: [], published: {}, modified: {} };
      setStatus("warn", "The Purdue calendar data couldn’t be loaded, so holidays won’t be marked. Check dates against the " + OFFICIAL + ".");
    })
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
      start: S.parseInputDate($("start").value),
      end: S.parseInputDate($("end").value)
    };
  }

  function isBreak(w) {
    return w.start in breakOverride ? breakOverride[w.start] : w.suggestBreak;
  }

  function update() {
    if (!calendar) return;
    var f = readForm();
    $("error").textContent = "";

    termInfo = f.year ? Cal.findTerm(calendar.events, f.term, f.year, f.start, f.end) : null;

    if (termInfo && !datesTouched) {
      $("start").value = toInput(termInfo.begin);
      $("end").value = toInput(termInfo.end || termInfo.begin);
      f = readForm();
    }

    var hint = $("term-hint");
    if (termInfo) {
      hint.innerHTML = f.term + " " + f.year + " on the Purdue calendar: <strong>" + S.fmtLong(termInfo.begin) + "</strong> to <strong>" +
        S.fmtLong(termInfo.end || termInfo.begin) + "</strong>" + (termInfo.source === "official" ? "" : " (" + termInfo.source + ")") +
        '. <button type="button" class="linkish" id="use-term">Use term dates</button>';
      $("use-term").onclick = function () { datesTouched = false; breakOverride = {}; update(); };
    } else {
      hint.textContent = f.year ? "The Purdue calendar doesn’t list " + f.term + " " + f.year + " yet. Enter course dates manually." : "";
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

  ["title", "number", "intro", "bullets", "source-note", "fillable"].forEach(function (id) {
    $(id).addEventListener("input", update);
  });
  ["term", "year"].forEach(function (id) {
    $(id).addEventListener("change", function () { datesTouched = false; breakOverride = {}; update(); });
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
