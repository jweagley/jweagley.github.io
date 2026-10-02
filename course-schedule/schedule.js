// Split a course's date range into weeks and attach campus closures.
(function (root) {
  "use strict";

  var DAY = 86400000;

  function fmt(ms) {
    var d = new Date(ms);
    return d.getUTCMonth() + 1 + "/" + d.getUTCDate();
  }

  function fmtRange(a, b) {
    return a === b ? fmt(a) : fmt(a) + "–" + fmt(b);
  }

  // "Martin Luther King Jr. Day (university closed)" -> "Martin Luther King Jr. Day"
  function cleanName(name) {
    return name.replace(/\s*\((university closed|classes in session)\)\s*/i, "").trim();
  }

  function titleCase(s) {
    return s.replace(/\b(break|recess|holiday)\b/gi, function (w) { return w[0].toUpperCase() + w.slice(1).toLowerCase(); });
  }

  // Weeks run 7 days from the course start date; the last week is cut at the end date.
  // A week where closures cover 3+ weekdays is suggested as a break week.
  function buildWeeks(start, end, closures) {
    var weeks = [];
    for (var ws = start; ws <= end; ws += 7 * DAY) {
      var we = Math.min(ws + 6 * DAY, end);
      var inWeek = closures.filter(function (c) { return c.start <= we && c.end >= ws; });

      var closedWeekdays = 0;
      for (var d = ws; d <= we; d += DAY) {
        var dow = new Date(d).getUTCDay();
        if (dow === 0 || dow === 6) continue;
        if (inWeek.some(function (c) { return c.start <= d && c.end >= d; })) closedWeekdays++;
      }

      var notes = inWeek.map(function (c) {
        var s = Math.max(c.start, ws), e = Math.min(c.end, we);
        var closed = /university closed/i.test(c.name);
        return {
          text: (closed ? "University closed " : "") + fmtRange(s, e) + " – " + titleCase(cleanName(c.name)),
          closed: closed
        };
      });

      var named = inWeek.filter(function (c) { return /break|recess/i.test(c.name); })[0];
      weeks.push({
        start: ws,
        end: we,
        notes: notes,
        hasClosure: inWeek.length > 0,
        suggestBreak: closedWeekdays >= 3,
        breakName: named ? titleCase(cleanName(named.name)) : "University Closed"
      });
    }
    return weeks;
  }

  // Number weeks, skipping the ones flagged as breaks.
  function numberWeeks(weeks, isBreak) {
    var n = 0;
    return weeks.map(function (w, i) {
      var brk = isBreak(w, i);
      return Object.assign({}, w, {
        isBreak: brk,
        number: brk ? null : ++n,
        label: brk ? w.breakName + " Week of " + fmt(w.start) + " – " + fmt(w.end) : "Week " + n,
        range: fmt(w.start) + " – " + fmt(w.end)
      });
    });
  }

  function parseInputDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || "");
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
  }

  function fmtLong(ms) {
    return new Date(ms).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }

  var api = { buildWeeks: buildWeeks, numberWeeks: numberWeeks, parseInputDate: parseInputDate, fmt: fmt, fmtRange: fmtRange, fmtLong: fmtLong, DAY: DAY };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CourseSchedule = api;
})(this);
