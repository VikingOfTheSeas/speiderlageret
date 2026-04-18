// kart-mini.js – embeddable mini room map for item/boks pages.
// Pulls shelf layout + shape positions from Supabase (kart_config row id=1)
// so every client renders the same map. Falls back to localStorage, then
// to built-in defaults if the cloud is unreachable.
(function () {
  // Inject CSS once
  if (!document.getElementById('kart-mini-css')) {
    var s = document.createElement('style');
    s.id = 'kart-mini-css';
    s.textContent = [
      '.mini-kart-wrap{position:relative;display:block;text-decoration:none;color:inherit;cursor:pointer}',
      '.mini-kart-wrap .mini-room{transition:border-color .15s,box-shadow .15s}',
      '.mini-kart-wrap:hover .mini-room{border-color:rgba(70,189,198,0.5);box-shadow:0 0 0 2px rgba(70,189,198,0.15)}',
      '.mini-kart-cta{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:8px;padding:9px 14px;background:rgba(70,189,198,0.14);border:1px solid rgba(70,189,198,0.4);border-radius:8px;color:#46bdc6;font-family:"DM Sans",sans-serif;font-size:13px;font-weight:600}',
      '.mini-kart-wrap:hover .mini-kart-cta{background:rgba(70,189,198,0.22);border-color:rgba(70,189,198,0.55)}',
      '.mini-room{position:relative;width:100%;aspect-ratio:4/3;background:#10253e;border-radius:8px;overflow:hidden;border:1px solid rgba(70,189,198,0.2)}',
      '.mini-room::before{content:"";position:absolute;inset:4%;border:2px solid rgba(70,189,198,0.25);border-radius:5px;background-image:radial-gradient(circle,rgba(70,189,198,0.06) 1px,transparent 1px);background-size:12px 12px}',
      '.mini-sofakrok{position:absolute;background:rgba(70,189,198,0.12);border:1px solid rgba(70,189,198,0.35);border-radius:4px;z-index:2}',
      '.mini-door{position:absolute;display:flex;align-items:flex-end;justify-content:center;padding-bottom:3px;font-family:"DM Mono",monospace;font-size:8px;font-weight:700;color:rgba(70,189,198,0.9);letter-spacing:1px;border-top:2px solid rgba(70,189,198,0.6);border-left:2px solid rgba(70,189,198,0.6);border-right:2px solid rgba(70,189,198,0.6);border-bottom:none;border-radius:4px 4px 0 0;background:rgba(70,189,198,0.07);z-index:6}',
      '.mini-shelf{position:absolute;z-index:5;background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.45);border-radius:2px;display:flex;align-items:center;justify-content:center;width:15%;height:14.4%}',
      '.mini-shelf[data-orientation="v"]{transform:rotate(90deg)}',
      '.mini-shelf.mini-hl{background:rgba(70,189,198,0.35);border-color:#46bdc6;box-shadow:0 0 8px rgba(70,189,198,0.5);animation:mini-pulse 1.4s ease-in-out infinite}',
      '.mini-shelf[data-orientation="v"].mini-hl{transform:rotate(90deg)}',
      '@keyframes mini-pulse{0%,100%{box-shadow:0 0 6px rgba(70,189,198,0.4)}50%{box-shadow:0 0 14px rgba(70,189,198,0.7)}}',
      '.mini-wall-block{position:absolute;background:rgba(100,116,139,0.55);border:1px solid rgba(100,116,139,0.8);border-radius:2px;z-index:4;pointer-events:none}',
      '.mini-shelf[data-orientation="v"] .mini-lbl{transform:rotate(-90deg)}',
      '.mini-lbl{font-family:"DM Mono",monospace;font-size:8px;font-weight:700;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.6);pointer-events:none;line-height:1}',
    ].join('');
    document.head.appendChild(s);
  }

  // Defaults — match kart.html's DEFAULT_SHELVES and DEFAULT_SHAPES.
  var DEFAULT_SHELVES = [
    { id:"L", name:"L", t:4,    l:5,    o:"h" },
    { id:"M", name:"M", t:7,    l:30,   o:"v" },
    { id:"N", name:"N", t:4.6,  l:44.7, o:"h" },
    { id:"K", name:"K", t:36.5, l:2.6,  o:"v" },
    { id:"J", name:"J", t:56.9, l:2.6,  o:"v" },
    { id:"I", name:"I", t:77.4, l:2.5,  o:"v" },
    { id:"H", name:"H", t:47.2, l:23.5, o:"h" },
    { id:"G", name:"G", t:62.1, l:23.5, o:"h" },
    { id:"F", name:"F", t:54.4, l:49.8, o:"v" },
    { id:"E", name:"E", t:80.3, l:15.7, o:"h" },
    { id:"D", name:"D", t:80.4, l:32,   o:"h" },
    { id:"C", name:"C", t:80.5, l:48.5, o:"h" },
    { id:"B", name:"B", t:56.6, l:81.2, o:"v" },
    { id:"A", name:"A", t:77.5, l:81.1, o:"v" },
  ];

  var DEFAULT_SHAPES = {
    door:     { top: "87.1%", left: "65%", width: "11.25%", height: "12.9%" },
    sofakrok: { top: "19.7%", left: "61%", width: "20.6%",  height: "33.6%" },
    wall:     { top: "8.5%",  left: "22%", width: "4.7%",   height: "9.6%"  },
  };

  // Cached cloud state so we only hit Supabase once per page load.
  var cloudCache = null;
  var cloudPromise = null;

  function normalizeShelves(arr) {
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr.map(function (s) {
      return {
        id: s.id,
        name: s.name || s.id,
        t: parseFloat(s.top),
        l: parseFloat(s.left),
        o: s.orientation || "h",
      };
    });
  }

  function readLocalShelves() {
    try {
      var raw = localStorage.getItem("kartShelves");
      if (!raw) return null;
      return normalizeShelves(JSON.parse(raw));
    } catch (e) { return null; }
  }

  function readLocalShapes() {
    try {
      var raw = localStorage.getItem("kartShapes");
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      return obj;
    } catch (e) { return null; }
  }

  function mergeShapes(override) {
    return {
      door:     Object.assign({}, DEFAULT_SHAPES.door,     (override && override.door)     || {}),
      sofakrok: Object.assign({}, DEFAULT_SHAPES.sofakrok, (override && override.sofakrok) || {}),
      wall:     Object.assign({}, DEFAULT_SHAPES.wall,     (override && override.wall)     || {}),
    };
  }

  async function loadCloudConfig() {
    if (cloudCache) return cloudCache;
    if (cloudPromise) return cloudPromise;
    // `db` is a top-level `const` from config.js — globally scoped but
    // not on `window`. Reference it directly via typeof guard.
    if (typeof db === "undefined" || !db) return null;
    cloudPromise = (async function () {
      try {
        var res = await db
          .from("kart_config")
          .select("shelves,shapes")
          .eq("id", 1)
          .maybeSingle();
        if (res.error) { console.warn("mini-kart cloud load:", res.error.message); return null; }
        cloudCache = res.data || null;
        return cloudCache;
      } catch (e) { console.warn("mini-kart cloud load:", e); return null; }
    })();
    return cloudPromise;
  }

  function shapeStyle(sh) {
    return 'top:' + sh.top + ';left:' + sh.left + ';width:' + sh.width + ';height:' + sh.height;
  }

  function buildHtml(shelves, shapes, hylleplassering) {
    var up = (hylleplassering || "").toUpperCase();
    var ids = shelves.map(function (s) { return s.id; })
      .sort(function (a, b) { return b.length - a.length; });
    var hl = null;
    for (var i = 0; i < ids.length; i++) {
      if (up.indexOf(ids[i].toUpperCase()) === 0) { hl = ids[i]; break; }
    }

    var href  = 'kart.html' + (hl ? '?hylle=' + encodeURIComponent(hl) : '');
    var label = hl ? 'Vis hylle ' + hl + ' på kart' : 'Åpne kart';

    var html = '<a href="' + href + '" class="mini-kart-wrap">';
    html += '<div class="mini-room">';
    html += '<div class="mini-sofakrok" style="' + shapeStyle(shapes.sofakrok) + '"></div>';
    html += '<div class="mini-door" style="' + shapeStyle(shapes.door) + '">DØR</div>';
    html += '<div class="mini-wall-block" style="' + shapeStyle(shapes.wall) + '"></div>';

    shelves.forEach(function (s) {
      var act = s.id === hl;
      html += '<div class="mini-shelf' + (act ? ' mini-hl' : '') +
        '" data-orientation="' + s.o + '" style="top:' + s.t + '%;left:' + s.l + '%">' +
        '<span class="mini-lbl">' + (s.name || s.id) + '</span></div>';
    });

    html += '</div>';
    html += '<div class="mini-kart-cta">📍 ' + label + ' →</div>';
    html += '</a>';
    return html;
  }

  function pickShelves(cloud) {
    if (cloud) {
      var fromCloud = normalizeShelves(cloud.shelves);
      if (fromCloud) return fromCloud;
    }
    var local = readLocalShelves();
    if (local) return local;
    return DEFAULT_SHELVES;
  }

  function pickShapes(cloud) {
    if (cloud && cloud.shapes && typeof cloud.shapes === "object") {
      return mergeShapes(cloud.shapes);
    }
    var local = readLocalShapes();
    if (local) return mergeShapes(local);
    return DEFAULT_SHAPES;
  }

  window.renderMiniKart = function (containerId, hylleplassering) {
    var container = document.getElementById(containerId);
    if (!container) return;

    // 1) Immediate render from local/default data so the UI never blanks.
    var shelves = pickShelves(null);
    var shapes  = pickShapes(null);
    container.innerHTML = buildHtml(shelves, shapes, hylleplassering);

    // 2) Fetch cloud data and re-render if different. Fire-and-forget.
    loadCloudConfig().then(function (cloud) {
      if (!cloud || !container.isConnected) return;
      var cloudShelves = pickShelves(cloud);
      var cloudShapes  = pickShapes(cloud);
      var cloudHtml    = buildHtml(cloudShelves, cloudShapes, hylleplassering);
      if (container.innerHTML !== cloudHtml) container.innerHTML = cloudHtml;
    });
  };
})();
