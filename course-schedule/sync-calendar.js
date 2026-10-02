// Fetch the Purdue Academic and Add/Drop calendars and write calendar-data.json
// and adddrop-data.json for the page.
// Run: node course-schedule/sync-calendar.js   (Node 18+; also run daily by
// .github/workflows/sync-calendar.yml). The output has no run timestamp, so
// the files only change when Purdue changes the calendars.
"use strict";

var fs = require("fs");
var path = require("path");
var Cal = require("./calendar.js");

function write(name, data) {
  var file = path.join(__dirname, name);
  fs.writeFileSync(file, JSON.stringify(data, null, 1) + "\n");
  return file;
}

var academic = Cal.fetchCalendar().then(function (c) {
  if (c.events.length < 20) throw new Error("only " + c.events.length + " dates parsed; page layout may have changed");
  var file = write("calendar-data.json", {
    modified: c.modified,
    published: c.published,
    events: c.events.map(function (e) {
      return { start: e.start, end: e.end, name: e.name, dateText: e.dateText, acad: e.acad, source: e.source, priority: e.priority };
    })
  });
  console.log("Wrote " + c.events.length + " dates (" + Object.keys(c.published).join(", ") + ") to " + file);
});

var addDrop = Cal.fetchAddDrop().then(function (a) {
  if (!a.sessions.length) throw new Error("no course timelines parsed; Add/Drop page layout may have changed");
  var file = write("adddrop-data.json", a);
  var shorts = Object.keys(a.short).map(function (k) { return k + " (" + a.short[k].rows.length + " sections)"; });
  console.log("Wrote " + a.sessions.length + " sessions and short courses for " + (shorts.join(", ") || "no terms") + " to " + file);
});

Promise.allSettled([academic, addDrop]).then(function (results) {
  var failed = results.filter(function (r) { return r.status === "rejected"; });
  failed.forEach(function (r) { console.error("Calendar sync failed: " + r.reason.message); });
  if (failed.length) process.exit(1);
});
