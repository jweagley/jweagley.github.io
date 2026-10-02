// Purdue Academic Calendar: fetch + parse.
// Reads the Registrar's WordPress REST API. Purdue's bot protection blocks
// cross-origin requests from browsers, so fetchCalendar() runs in Node
// (sync-calendar.js, on a GitHub Actions schedule) and the page loads the
// resulting calendar-data.json from its own site.
(function (root) {
  "use strict";

  var API = "https://www.purdue.edu/registrar/wp-json/wp/v2/pages";
  // Higher priority wins when two pages publish the same academic year.
  var SOURCES = [
    { slug: "academic", kind: "official", priority: 3 },
    { slug: "academic-archive", kind: "archived", priority: 2 },
    { slug: "academic-projected", kind: "projected", priority: 1 }
  ];

  var MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  function decode(s) {
    return s
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#8217;|&rsquo;/g, "’")
      .replace(/&#8211;|&ndash;/g, "-")
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); })
      .replace(/[   ]/g, " ")
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  function utc(y, m, d) { return Date.UTC(y, m, d); }

  // "Dec. 26-27, 30-31" / "April 29-May 4" / "Jan. 18" -> [{start,end}] (UTC ms)
  function parseDates(text, year) {
    var out = [];
    var month = null;
    var segs = text.split(",");
    for (var i = 0; i < segs.length; i++) {
      var m = segs[i].trim().match(/^(?:([A-Za-z]+)\.?\s*)?(\d{1,2})(?:\s*-\s*(?:([A-Za-z]+)\.?\s*)?(\d{1,2}))?$/);
      if (!m) return [];
      if (m[1]) month = MONTHS[m[1].slice(0, 3).toLowerCase()];
      if (month == null) return [];
      var start = utc(year, month, +m[2]);
      var endMonth = month;
      if (m[3]) endMonth = MONTHS[m[3].slice(0, 3).toLowerCase()];
      if (endMonth == null) return [];
      var endYear = endMonth < month ? year + 1 : year;
      var end = m[4] ? utc(endYear, endMonth, +m[4]) : start;
      month = endMonth;
      year = endYear;
      out.push({ start: start, end: end });
    }
    return out;
  }

  // Parse one page's rendered HTML into events tagged with academic year.
  function parsePage(html, source) {
    var events = [];
    var acad = null; // "2026-27"
    var calYear = null; // 2026
    var published = {};
    var re = /<h2[^>]*>([\s\S]*?)<\/h2>|<button[^>]*>([\s\S]*?)<\/button>|<p[^>]*>([\s\S]*?)<\/p>|<tr[^>]*>([\s\S]*?)<\/tr>/g;
    var m;
    while ((m = re.exec(html))) {
      var heading = m[1] != null ? decode(m[1]) : m[2] != null ? decode(m[2]) : null;
      if (heading != null) {
        if (/^Additional Archived/i.test(heading)) break; // older archives have no year headings
        var a = heading.match(/^(\d{4})\s*-\s*(\d{2,4})\s+Academic Calendar/i);
        if (a) { acad = a[1] + "-" + a[2].slice(-2); calYear = null; continue; }
        if (/^\d{4}$/.test(heading)) calYear = +heading;
        continue;
      }
      if (m[3] != null) {
        var pub = decode(m[3]).match(/Calendar published:\s*([A-Za-z]+\.? \d{1,2}, \d{4})/i);
        if (pub && acad && !published[acad]) published[acad] = pub[1];
        continue;
      }
      if (!acad || !calYear) continue;
      var cells = [];
      var cre = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g, c;
      while ((c = cre.exec(m[4]))) cells.push(decode(c[1]));
      if (cells.length < 2 || /^date$/i.test(cells[0])) continue;
      var ranges = parseDates(cells[0], calYear);
      for (var i = 0; i < ranges.length; i++) {
        events.push({
          start: ranges[i].start,
          end: ranges[i].end,
          name: cells[1],
          dateText: cells[0],
          acad: acad,
          source: source.kind,
          priority: source.priority
        });
      }
    }
    return { events: events, published: published };
  }

  // Keep each academic year only from its highest-priority page.
  function merge(parsed) {
    var best = {};
    var published = {};
    parsed.forEach(function (p) {
      p.events.forEach(function (e) {
        if (!best[e.acad] || best[e.acad] < e.priority) best[e.acad] = e.priority;
      });
    });
    var events = [];
    parsed.forEach(function (p) {
      p.events.forEach(function (e) { if (best[e.acad] === e.priority) events.push(e); });
      Object.keys(p.published).forEach(function (k) {
        if (!published[k] || p.priority > published[k].priority)
          published[k] = { date: p.published[k], priority: p.priority };
      });
    });
    events.sort(function (a, b) { return a.start - b.start; });
    var pubOut = {};
    Object.keys(published).forEach(function (k) { pubOut[k] = published[k].date; });
    return { events: events, published: pubOut };
  }

  function fetchCalendar() {
    return Promise.all(
      SOURCES.map(function (src) {
        var url = API + "?slug=" + src.slug + "&_fields=content,link,modified";
        return fetch(url, { credentials: "omit" })
          .then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
          })
          .then(function (pages) {
            var page = pages.filter(function (p) { return /\/registrar\/calendars\//.test(p.link); })[0];
            if (!page) throw new Error("page not found: " + src.slug);
            var res = parsePage(page.content.rendered, src);
            res.priority = src.priority;
            res.kind = src.kind;
            res.modified = (page.modified || "").slice(0, 10);
            return res;
          })
          .catch(function (err) {
            // Projected/archive pages are optional; only the main page is required.
            if (src.slug === "academic") throw err;
            return { events: [], published: {}, priority: src.priority };
          });
      })
    ).then(function (parsed) {
      var merged = merge(parsed);
      merged.modified = {};
      parsed.forEach(function (p) { if (p.modified) merged.modified[p.kind] = p.modified; });
      return merged;
    });
  }

  // ---------- Queries ----------

  var CLOSURE = /university closed|break|recess/i;

  function isClosure(e) {
    return CLOSURE.test(e.name) && !/classes in session/i.test(e.name);
  }

  // Find the term's official begin/end. For Winter (Dec-Jan) we accept the
  // instance that starts or ends in the given year and prefer one that
  // overlaps the course dates.
  function findTerm(events, term, year, courseStart, courseEnd) {
    var beginRe = new RegExp("^" + term + " term classes begin", "i");
    var endRe = new RegExp("^" + term + " term .*ends?\\b", "i");
    var byAcad = {};
    events.forEach(function (e) {
      var t = byAcad[e.acad] || (byAcad[e.acad] = { acad: e.acad, source: e.source });
      if (beginRe.test(e.name)) t.begin = e.start;
      if (endRe.test(e.name) && (!t.end || e.end > t.end)) t.end = e.end;
    });
    var candidates = Object.keys(byAcad)
      .map(function (k) { return byAcad[k]; })
      .filter(function (t) {
        if (!t.begin) return false;
        var by = new Date(t.begin).getUTCFullYear();
        var ey = t.end ? new Date(t.end).getUTCFullYear() : by;
        return term === "Winter" ? by === year || ey === year : by === year;
      });
    if (candidates.length > 1 && courseStart != null) {
      var overlapping = candidates.filter(function (t) {
        return t.begin <= courseEnd && (t.end || t.begin) >= courseStart;
      });
      if (overlapping.length) candidates = overlapping;
    }
    return candidates[0] || null;
  }

  function closuresBetween(events, start, end) {
    return events.filter(function (e) { return isClosure(e) && e.start <= end && e.end >= start; });
  }

  var api = {
    fetchCalendar: fetchCalendar,
    parsePage: parsePage,
    parseDates: parseDates,
    merge: merge,
    findTerm: findTerm,
    closuresBetween: closuresBetween,
    isClosure: isClosure,
    SOURCES: SOURCES
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PurdueCalendar = api;
})(this);
