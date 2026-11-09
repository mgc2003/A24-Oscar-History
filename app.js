/* A24 Oscar Tracker: loads the repository's JSON file and renders the page. */
(function () {
  "use strict";

  var DATA_URL = "JSON%20Artifact"; // the data file's name has a space and no extension

  var STATUS_LABELS = {
    released: "Released",
    upcoming_dated: "Upcoming",
    announced_year_only: "Announced (year only)",
    announced_tba: "Announced (TBA)",
    in_development_no_date: "In development"
  };

  var $ = function (id) { return document.getElementById(id); };

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "text") node.textContent = attrs[k];
        else if (k === "class") node.className = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }

  function plural(n, word, pluralWord) {
    return n + " " + (n === 1 ? word : (pluralWord || word + "s"));
  }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function formatDate(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    return MONTHS[+p[1] - 1] + " " + (+p[2]) + ", " + p[0];
  }

  // "88th (2016)" -> { ord: "88th", year: "2016" }
  function splitCeremony(label) {
    var m = /^(\S+)\s*\((\d{4})\)/.exec(label || "");
    return m ? { ord: m[1], year: m[2] } : { ord: label, year: "" };
  }

  function ceremonyNumber(label) { return parseInt(label, 10) || 0; }

  function hasNoms(film) {
    return film.oscars && film.oscars.nominations && film.oscars.nominations.length > 0;
  }
  function nomCount(film) {
    var o = film.oscars || {};
    return o.nominations_total != null ? o.nominations_total : (o.nominations || []).length;
  }
  function winCount(film) {
    var o = film.oscars || {};
    if (o.wins_total != null) return o.wins_total;
    return (o.nominations || []).filter(function (n) { return n.won === true; }).length;
  }

  /* ---------- Load ---------- */

  fetch(DATA_URL)
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(render)
    .catch(function (err) {
      var s = $("load-status");
      s.className = "load-status error";
      s.textContent = "Couldn't load the data file (" + err.message + "). " +
        (location.protocol === "file:"
          ? "Browsers block fetch() on file:// pages. Serve the folder over HTTP, for example with `python3 -m http.server`, or view it on GitHub Pages."
          : "Check that 'JSON Artifact' is in the same folder as index.html.");
    });

  function render(data) {
    $("load-status").textContent = "";
    var meta = data.metadata || {};
    var films = data.films || [];
    var nominated = films.filter(hasNoms);

    renderStats(meta, films, nominated);
    renderChart(meta, nominated);
    renderCeremonyNotes(meta);
    renderNominated(nominated);
    renderCategories(nominated);
    renderFilms(films);
    renderOther(data);
    renderAbout(meta);
  }

  /* ---------- Headline stats ---------- */

  function renderStats(meta, films, nominated) {
    var allNoms = [];
    nominated.forEach(function (f) { allNoms = allNoms.concat(f.oscars.nominations); });
    var wins = allNoms.filter(function (n) { return n.won === true; }).length;
    var bpWins = allNoms.filter(function (n) { return n.won === true && n.category === "Best Picture"; }).length;
    var released = films.filter(function (f) { return f.status === "released"; }).length;

    var stats = [
      { value: allNoms.length, label: "Oscar nominations" },
      { value: wins, label: "Oscar wins", gold: true },
      { value: nominated.length, label: "Nominated films, out of " + released + " released" },
      { value: bpWins, label: "Best Picture " + (bpWins === 1 ? "win" : "wins"), gold: true }
    ];
    var box = $("stats");
    stats.forEach(function (s) {
      box.appendChild(el("div", { class: "stat" + (s.gold ? " gold" : "") }, [
        el("div", { class: "value", text: String(s.value) }),
        el("div", { class: "label", text: s.label })
      ]));
    });

    var art = meta.studio_oscar_totals_per_a24_article;
    var note = "Counts are itemised nominations, each checked against the Academy's ceremony pages.";
    if (art) {
      note += " Wikipedia's A24 article gives " + art.nominations + " nominations and " + art.wins +
        " wins as of the " + art.as_of + "; the nomination gap is explained under About the data.";
    }
    $("stats-note").textContent = note;
  }

  /* ---------- Ceremony chart ---------- */

  function ceremonyRows(meta, nominated) {
    var map = {};
    var order = Object.keys(meta.itemised_nominations_by_ceremony || {});
    order.forEach(function (c) { map[c] = { ceremony: c, noms: 0, wins: 0, films: {} }; });
    nominated.forEach(function (f) {
      f.oscars.nominations.forEach(function (n) {
        var row = map[n.ceremony] || (map[n.ceremony] = { ceremony: n.ceremony, noms: 0, wins: 0, films: {} });
        row.noms++;
        if (n.won === true) row.wins++;
        var fr = row.films[f.title] || (row.films[f.title] = { noms: 0, wins: 0 });
        fr.noms++;
        if (n.won === true) fr.wins++;
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return ceremonyNumber(a.ceremony) - ceremonyNumber(b.ceremony); });
  }

  function renderChart(meta, nominated) {
    var rows = ceremonyRows(meta, nominated);
    var chart = $("chart");
    var lastW = 0, timer;
    drawChart(chart, rows);
    lastW = chart.clientWidth;
    window.addEventListener("resize", function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (chart.clientWidth !== lastW) { lastW = chart.clientWidth; drawChart(chart, rows); }
      }, 120);
    });
    renderChartTable(rows);
  }

  // Draws at the container's pixel width so text stays legible on phones.
  function drawChart(chart, rows) {
    chart.innerHTML = "";
    var max = Math.max.apply(null, rows.map(function (r) { return r.noms; }));
    var step = max > 12 ? 5 : 2;
    var top = Math.ceil(max / step) * step;

    var W = Math.max(300, chart.clientWidth - 24);
    var H = W < 560 ? 260 : 300, m = { t: 18, r: 4, b: 40, l: 26 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var band = iw / rows.length;
    var compact = band < 54;
    var bw = Math.min(40, band * 0.56);
    var y = function (v) { return m.t + ih - (v / top) * ih; };

    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "xMidYMid meet" });
    var grid = svgEl("g", { class: "grid" });
    var axis = svgEl("g", { class: "axis" });
    for (var v = 0; v <= top; v += step) {
      grid.appendChild(svgEl("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
      var t = svgEl("text", { x: m.l - 6, y: y(v) + 4, "text-anchor": "end" });
      t.textContent = v;
      axis.appendChild(t);
    }
    svg.appendChild(grid);
    svg.appendChild(axis);

    var tip = $("tooltip");
    var R = 4; // rounded data end

    rows.forEach(function (r, i) {
      var cx = m.l + band * i + band / 2;
      var x = cx - bw / 2;
      var col = svgEl("g", { class: "col", tabindex: "0" });
      var label = r.ceremony + ": " + plural(r.noms, "nomination") + ", " + plural(r.wins, "win");
      col.setAttribute("aria-label", label);

      col.appendChild(svgEl("rect", { class: "hit", x: m.l + band * i + 1, y: m.t, width: band - 2, height: ih, rx: 6 }));

      if (r.noms > 0) {
        var base = y(0);
        var winTop = y(r.wins);
        var nomTop = y(r.noms);
        // wins sit on the baseline; the rest of the nominations stack above with a 2px gap
        if (r.wins > 0) {
          var winsAreAll = r.wins === r.noms;
          col.appendChild(svgEl("path", { class: "bar-win", d: barPath(x, winTop, bw, base - winTop, winsAreAll ? R : 0) }));
        }
        if (r.noms > r.wins) {
          var bottom = r.wins > 0 ? winTop - 2 : base;
          col.appendChild(svgEl("path", { class: "bar-nom", d: barPath(x, nomTop, bw, bottom - nomTop, R) }));
        }
        var vt = svgEl("text", { class: "val", x: cx, y: nomTop - 6, "text-anchor": "middle" });
        vt.textContent = r.wins > 0 && !compact ? r.noms + " · " + r.wins + "★" : r.noms;
        col.appendChild(vt);
      } else {
        var zt = svgEl("text", { class: "val", x: cx, y: y(0) - 6, "text-anchor": "middle" });
        zt.textContent = "0";
        col.appendChild(zt);
      }

      var parts = splitCeremony(r.ceremony);
      var t1 = svgEl("text", { x: cx, y: H - m.b + 16, "text-anchor": "middle" });
      t1.textContent = compact ? parseInt(parts.ord, 10) : parts.ord;
      var t2 = svgEl("text", { x: cx, y: H - m.b + 30, "text-anchor": "middle" });
      t2.textContent = compact ? "’" + parts.year.slice(2) : parts.year;
      axis.appendChild(t1);
      axis.appendChild(t2);

      function show(evt) {
        col.classList.add("active");
        tip.innerHTML = "";
        tip.appendChild(el("strong", { text: r.ceremony + " Academy Awards" }));
        tip.appendChild(el("div", { class: "row" }, ["Nominations", el("b", { text: String(r.noms) })]));
        tip.appendChild(el("div", { class: "row" }, ["Wins", el("b", { text: String(r.wins) })]));
        var titles = Object.keys(r.films).sort(function (a, b) { return r.films[b].noms - r.films[a].noms; });
        if (titles.length) {
          tip.appendChild(el("ul", null, titles.map(function (tt) {
            var f = r.films[tt];
            return el("li", { text: tt + " (" + f.noms + (f.wins ? ", " + f.wins + " won" : "") + ")" });
          })));
        }
        tip.hidden = false;
        place(evt);
      }
      function place(evt) {
        var px, py;
        if (evt && evt.clientX != null && evt.type !== "focus") { px = evt.clientX; py = evt.clientY; }
        else { var b = col.getBoundingClientRect(); px = b.left + b.width / 2; py = b.top + b.height / 3; }
        var tw = tip.offsetWidth, th = tip.offsetHeight;
        var left = px + 14, topPx = py - th - 12;
        if (left + tw > window.innerWidth - 8) left = px - tw - 14;
        if (left < 8) left = 8;
        if (topPx < 8) topPx = py + 16;
        tip.style.left = left + "px";
        tip.style.top = topPx + "px";
      }
      function hide() { col.classList.remove("active"); tip.hidden = true; }
      col.addEventListener("pointerenter", show);
      col.addEventListener("pointermove", place);
      col.addEventListener("pointerleave", hide);
      col.addEventListener("focus", show);
      col.addEventListener("blur", hide);

      svg.appendChild(col);
    });

    chart.setAttribute("aria-label", "Bar chart of A24 Oscar nominations and wins at each ceremony from the " +
      rows[0].ceremony + " to the " + rows[rows.length - 1].ceremony + ". Use Show as table for the values.");
    chart.appendChild(svg);
  }

  function renderChartTable(rows) {
    var tbl = el("table", null, [
      el("thead", null, [el("tr", null, [
        el("th", { scope: "col", text: "Ceremony" }),
        el("th", { scope: "col", class: "num", text: "Nominations" }),
        el("th", { scope: "col", class: "num", text: "Wins" }),
        el("th", { scope: "col", text: "Films" })
      ])]),
      el("tbody", null, rows.map(function (r) {
        return el("tr", null, [
          el("td", { text: r.ceremony }),
          el("td", { class: "num", text: String(r.noms) }),
          el("td", { class: "num", text: String(r.wins) }),
          el("td", { text: Object.keys(r.films).join(", ") || "None" })
        ]);
      }))
    ]);
    $("chart-table").appendChild(tbl);

    var btn = $("chart-toggle");
    btn.addEventListener("click", function () {
      var open = $("chart-table").hidden;
      $("chart-table").hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      btn.textContent = open ? "Hide table" : "Show as table";
    });
  }

  // Bar path with only the top corners rounded.
  function barPath(x, y, w, h, r) {
    if (h <= 0) return "";
    r = Math.min(r, h, w / 2);
    return "M" + x + "," + (y + h) +
      "V" + (y + r) +
      "Q" + x + "," + y + " " + (x + r) + "," + y +
      "H" + (x + w - r) +
      "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) +
      "V" + (y + h) + "Z";
  }

  function renderCeremonyNotes(meta) {
    var box = $("ceremony-notes");
    (meta.ceremonies || []).forEach(function (c) {
      box.appendChild(el("div", null, [el("b", { text: c.ceremony }), c.detail]));
    });
  }

  /* ---------- Nominated film cards ---------- */

  function renderNominated(nominated) {
    var grid = $("nom-grid");
    var sortSel = $("nom-sort");
    var winnersOnly = $("nom-winners");

    function draw() {
      var list = nominated.slice();
      if (winnersOnly.checked) list = list.filter(function (f) { return winCount(f) > 0; });
      var key = sortSel.value;
      list.sort(function (a, b) {
        if (key === "noms") return nomCount(b) - nomCount(a) || winCount(b) - winCount(a);
        if (key === "wins") return winCount(b) - winCount(a) || nomCount(b) - nomCount(a);
        if (key === "title") return a.title.localeCompare(b.title);
        return (a.release_date || "").localeCompare(b.release_date || "");
      });
      grid.innerHTML = "";
      list.forEach(function (f) { grid.appendChild(filmCard(f)); });
    }
    sortSel.addEventListener("change", draw);
    winnersOnly.addEventListener("change", draw);
    draw();
  }

  function filmCard(f) {
    var noms = f.oscars.nominations.slice().sort(function (a, b) {
      return (b.won === true) - (a.won === true);
    });
    var wins = winCount(f);
    var bp = noms.some(function (n) { return n.category === "Best Picture" && n.won === true; });
    var ceremonies = [];
    noms.forEach(function (n) { if (ceremonies.indexOf(n.ceremony) < 0) ceremonies.push(n.ceremony); });

    return el("article", { class: "card" }, [
      el("h3", { text: f.title }),
      el("p", { class: "meta", text: [f.release_year, f.directors].filter(Boolean).join(" · ") }),
      el("div", { class: "tally" }, [
        el("span", { class: "badge", text: plural(nomCount(f), "nomination") }),
        wins ? el("span", { class: "badge win", text: plural(wins, "win") }) : null,
        bp ? el("span", { class: "badge bp", text: "Best Picture" }) : null
      ]),
      el("ul", { class: "noms" }, noms.map(function (n) {
        return el("li", { class: n.won === true ? "won" : "" }, [
          el("span", { class: "mark", "aria-hidden": "true", text: n.won === true ? "★" : "·" }),
          el("span", null, [
            el("span", { class: "cat", text: (n.category || "Category not recorded") }),
            n.won === true ? el("span", { class: "visually-hidden", text: " (won)" }) : null,
            n.nominee ? el("span", { class: "who", text: n.nominee }) : null
          ])
        ]);
      })),
      el("p", { class: "cer", text: ceremonies.join(", ") + " Academy Awards" })
    ]);
  }

  /* ---------- Categories ---------- */

  function renderCategories(nominated) {
    var map = {};
    nominated.forEach(function (f) {
      f.oscars.nominations.forEach(function (n) {
        var c = n.category || "Category not recorded";
        var row = map[c] || (map[c] = { name: c, noms: 0, wins: 0 });
        row.noms++;
        if (n.won === true) row.wins++;
      });
    });
    var rows = Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.noms - a.noms || b.wins - a.wins || a.name.localeCompare(b.name); });
    var max = rows.length ? rows[0].noms : 1;
    var box = $("cat-list");
    rows.forEach(function (r) {
      var pctW = (r.wins / max) * 100;
      var pctN = ((r.noms - r.wins) / max) * 100;
      box.appendChild(el("div", { class: "cat-row" }, [
        el("span", { class: "name", title: r.name, text: r.name.replace(/^Best /, "") }),
        el("span", { class: "bar", "aria-hidden": "true" }, [
          r.wins ? el("i", { class: "w", style: "width:" + pctW + "%" }) : null,
          r.noms > r.wins ? el("i", { class: "n", style: "width:" + pctN + "%" }) : null
        ]),
        el("span", { class: "n-val", text: r.noms + (r.wins ? " / " + r.wins + "★" : "") }),
        el("span", { class: "visually-hidden", text: ": " + plural(r.noms, "nomination") + ", " + plural(r.wins, "win") })
      ]));
    });
  }

  /* ---------- Full release table ---------- */

  function renderFilms(films) {
    var statusSel = $("f-status"), yearSel = $("f-year"), roleSel = $("f-role");
    var search = $("f-search"), oscarOnly = $("f-oscar");
    var body = $("f-body"), count = $("f-count");
    var sortKey = "date", sortDir = 1;

    Object.keys(STATUS_LABELS).forEach(function (k) {
      if (films.some(function (f) { return f.status === k; })) {
        statusSel.appendChild(el("option", { value: k, text: STATUS_LABELS[k] }));
      }
    });
    var years = [];
    films.forEach(function (f) { if (f.release_year && years.indexOf(f.release_year) < 0) years.push(f.release_year); });
    years.sort(function (a, b) { return b - a; }).forEach(function (yv) {
      yearSel.appendChild(el("option", { value: String(yv), text: String(yv) }));
    });

    var buttons = Array.prototype.slice.call(document.querySelectorAll("th button[data-sort]"));
    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-sort");
        if (k === sortKey) sortDir = -sortDir;
        else { sortKey = k; sortDir = k === "noms" ? -1 : 1; }
        draw();
      });
    });

    function draw() {
      var q = search.value.trim().toLowerCase();
      var list = films.filter(function (f) {
        if (statusSel.value && f.status !== statusSel.value) return false;
        if (yearSel.value && String(f.release_year) !== yearSel.value) return false;
        if (roleSel.value === "produced" && !f.a24_produced) return false;
        if (roleSel.value === "distribution" && f.a24_produced) return false;
        if (oscarOnly.checked && !hasNoms(f)) return false;
        if (q && (f.title + " " + (f.directors || "")).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      list.sort(function (a, b) {
        var r;
        if (sortKey === "title") r = a.title.localeCompare(b.title);
        else if (sortKey === "noms") r = (hasNoms(a) ? nomCount(a) : 0) - (hasNoms(b) ? nomCount(b) : 0) ||
          winCount(a) - winCount(b);
        else r = dateKey(a).localeCompare(dateKey(b));
        return r * sortDir || a.title.localeCompare(b.title);
      });

      buttons.forEach(function (b) {
        var on = b.getAttribute("data-sort") === sortKey;
        if (on) b.setAttribute("aria-sort", sortDir === 1 ? "ascending" : "descending");
        else b.removeAttribute("aria-sort");
      });

      body.innerHTML = "";
      if (!list.length) {
        body.appendChild(el("tr", null, [el("td", { colspan: "5", class: "empty", text: "No releases match these filters." })]));
      }
      var frag = document.createDocumentFragment();
      list.forEach(function (f) { frag.appendChild(filmRow(f)); });
      body.appendChild(frag);
      count.textContent = "Showing " + list.length + " of " + films.length + " films";
    }

    [statusSel, yearSel, roleSel, oscarOnly].forEach(function (c) { c.addEventListener("change", draw); });
    search.addEventListener("input", draw);
    draw();
  }

  // Undated titles sort after dated ones: year-only before fully unknown.
  function dateKey(f) {
    if (f.release_date) return f.release_date;
    if (f.release_year) return f.release_year + "-99";
    return "9999";
  }

  function filmRow(f) {
    var dateText = f.release_date ? formatDate(f.release_date) : (f.release_year ? String(f.release_year) : "TBA");
    var tags = [];
    if (f.status !== "released") tags.push(el("span", { class: "tag up", text: STATUS_LABELS[f.status] || f.status }));
    if (f.a24_produced) tags.push(el("span", { class: "tag", text: "A24 produced" }));
    if (f.re_release) tags.push(el("span", { class: "tag", text: "Re-release" + (f.original_release_year ? " of " + f.original_release_year : "") }));

    var osc;
    if (hasNoms(f)) {
      var w = winCount(f);
      osc = el("td", { class: "num osc" }, [
        plural(nomCount(f), "nom"),
        w ? el("span", null, [" · ", el("span", { class: "w", text: w + " won" })]) : null
      ]);
    } else {
      osc = el("td", { class: "num osc none", text: "–" });
    }

    return el("tr", { class: hasNoms(f) ? "has-osc" : "" }, [
      el("td", { class: "title", text: f.title }),
      el("td", { class: "date" }, [dateText, tags.length ? el("br") : null].concat(tags)),
      el("td", { class: "dir", text: f.directors || "" }),
      el("td", { class: "notes", text: f.notes || "" }),
      osc
    ]);
  }

  /* ---------- Development and other media ---------- */

  function renderOther(data) {
    var dev = $("dev-list");
    (data.films_in_development || []).forEach(function (f) {
      dev.appendChild(el("li", { text: f.title }));
    });
    var other = $("other-list");
    (data.other_media || []).forEach(function (o) {
      var kind = o.media_type ? o.media_type.charAt(0).toUpperCase() + o.media_type.slice(1) : "";
      other.appendChild(el("li", null, [
        el("span", { text: o.title }),
        el("span", { class: "sub", text: [kind, o.years].filter(Boolean).join(" · ") })
      ]));
    });
  }

  /* ---------- About ---------- */

  function link(url, text) {
    return el("a", { href: url, rel: "noopener", text: text || url });
  }

  function renderAbout(meta) {
    var box = $("about-body");
    if (meta.description) box.appendChild(el("p", { text: meta.description }));

    var dates = [];
    if (meta.retrieved) dates.push("Data retrieved " + formatDate(meta.retrieved) + ".");
    if (meta.status_as_of) dates.push("Release statuses are as of " + formatDate(meta.status_as_of) + ".");
    if (meta.release_date_note) dates.push(meta.release_date_note);
    if (dates.length) box.appendChild(el("p", { text: dates.join(" ") }));

    if (meta.verified_against_oscars_org && meta.verified_against_oscars_org.length) {
      var v = meta.verified_against_oscars_org;
      box.appendChild(el("p", {
        text: "Every listed nomination was checked against the Academy's own ceremony pages for the " +
          v[0] + " through " + v[v.length - 1] + " ceremonies."
      }));
    }
    if (meta.tally_note) {
      box.appendChild(el("p", null, [el("strong", { text: "Why the counts differ from Wikipedia. " }), "From the data file\u2019s notes: \u201c" + meta.tally_note + "\u201d"]));
    }

    var sources = (meta.sources || []).slice();
    var items = sources.map(function (s) { return el("li", null, [link(s)]); });
    (meta.oscar_details_sources || []).forEach(function (s) {
      var m = /(https?:\/\/[^\s,;]+)/.exec(s);
      if (!m) { items.push(el("li", { text: s })); return; }
      var before = s.slice(0, m.index).trim();
      var url = m[1];
      var after = s.slice(m.index + url.length);
      // Template URLs like .../{year} are not real links; show them as text.
      items.push(el("li", null, [before ? before + " " : "", /\{.*\}/.test(url) ? el("code", { text: url }) : link(url), after]));
    });
    if (items.length) {
      box.appendChild(el("h3", { text: "Sources" }));
      box.appendChild(el("ul", null, items));
    }
  }
})();
