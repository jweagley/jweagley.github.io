// Fetch the Purdue Academic Calendar and write calendar-data.json for the page.
// Run: node course-schedule/sync-calendar.js   (Node 18+; also run daily by
// .github/workflows/sync-calendar.yml). The output has no run timestamp, so
// the file only changes when Purdue changes the calendar.
"use strict";

var fs = require("fs");
var path = require("path");
var Cal = require("./calendar.js");

Cal.fetchCalendar()
  .then(function (c) {
    if (c.events.length < 20) throw new Error("only " + c.events.length + " dates parsed; page layout may have changed");
    var out = {
      modified: c.modified,
      published: c.published,
      events: c.events.map(function (e) {
        return { start: e.start, end: e.end, name: e.name, dateText: e.dateText, acad: e.acad, source: e.source, priority: e.priority };
      })
    };
    var file = path.join(__dirname, "calendar-data.json");
    fs.writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
    console.log("Wrote " + out.events.length + " dates (" + Object.keys(c.published).join(", ") + ") to " + file);
  })
  .catch(function (err) {
    console.error("Calendar sync failed: " + err.message);
    process.exit(1);
  });
