// kart-mini.js – embeddable mini room map for item/boks pages
(function () {
  // Inject CSS once
  if (!document.getElementById('kart-mini-css')) {
    var s = document.createElement('style');
    s.id = 'kart-mini-css';
    s.textContent = [
      '.mini-room{position:relative;width:100%;aspect-ratio:4/3;background:#10253e;border-radius:8px;overflow:hidden;border:1px solid rgba(70,189,198,0.2)}',
      '.mini-room::before{content:"";position:absolute;inset:4%;border:2px solid rgba(70,189,198,0.25);border-radius:5px;background-image:radial-gradient(circle,rgba(70,189,198,0.06) 1px,transparent 1px);background-size:12px 12px}',
      '.mini-sofakrok{position:absolute;top:19.7%;left:61%;width:20.6%;height:33.6%;background:rgba(70,189,198,0.12);border:1px solid rgba(70,189,198,0.35);border-radius:4px;z-index:2}',
      '.mini-door{position:absolute;left:65%;bottom:0;width:11.25%;height:12.9%;display:flex;align-items:flex-end;justify-content:center;padding-bottom:3px;font-family:"DM Mono",monospace;font-size:8px;font-weight:700;color:rgba(70,189,198,0.9);letter-spacing:1px;border-top:2px solid rgba(70,189,198,0.6);border-left:2px solid rgba(70,189,198,0.6);border-right:2px solid rgba(70,189,198,0.6);border-bottom:none;border-radius:4px 4px 0 0;background:rgba(70,189,198,0.07);z-index:6}',
      '.mini-shelf{position:absolute;z-index:5;background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.45);border-radius:2px;display:flex;align-items:center;justify-content:center;width:15%;height:14.4%}',
      '.mini-shelf[data-orientation="v"]{transform:rotate(90deg)}',
      '.mini-shelf.mini-hl{background:rgba(70,189,198,0.35);border-color:#46bdc6;box-shadow:0 0 8px rgba(70,189,198,0.5);animation:mini-pulse 1.4s ease-in-out infinite}',
      '.mini-shelf[data-orientation="v"].mini-hl{transform:rotate(90deg)}',
      '@keyframes mini-pulse{0%,100%{box-shadow:0 0 6px rgba(70,189,198,0.4)}50%{box-shadow:0 0 14px rgba(70,189,198,0.7)}}',
      '.mini-wall-block{position:absolute;background:rgba(100,116,139,0.55);border:1px solid rgba(100,116,139,0.8);border-radius:2px;z-index:4;pointer-events:none}',
      '.mini-shelf[data-orientation="v"] .mini-lbl{transform:rotate(-90deg)}',
      '.mini-lbl{font-family:"DM Mono",monospace;font-size:8px;font-weight:700;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.6);pointer-events:none;line-height:1}',
      '.mini-kart-link{position:absolute;bottom:6px;right:6px;z-index:10;font-size:14px;text-decoration:none;opacity:.7;transition:opacity .15s}',
      '.mini-kart-link:hover{opacity:1}',
    ].join('');
    document.head.appendChild(s);
  }

  // Default shelves (used when no custom layout saved in localStorage)
  // v = vertical (rotated 90°), h = horizontal (default)
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

  function getShelves() {
    try {
      var raw = localStorage.getItem("kartShelves");
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length) {
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
      }
    } catch (e) {}
    return DEFAULT_SHELVES;
  }

  window.renderMiniKart = function (containerId, hylleplassering) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var shelves = getShelves();
    // Match shelf by prefix (longest-first to avoid partial matches)
    var up = (hylleplassering || "").toUpperCase();
    var ids = shelves.map(function (s) { return s.id; }).sort(function (a, b) { return b.length - a.length; });
    var hl = null;
    for (var i = 0; i < ids.length; i++) {
      if (up.indexOf(ids[i].toUpperCase()) === 0) { hl = ids[i]; break; }
    }

    var html = '<div class="mini-room">';
    html += '<div class="mini-sofakrok"></div>';
    html += '<div class="mini-door">DØR</div>';
    html += '<div class="mini-wall-block" style="top:8.5%;left:22%;width:4.7%;height:9.6%"></div>';

    shelves.forEach(function (s) {
      var act = s.id === hl;
      html += '<div class="mini-shelf' + (act ? ' mini-hl' : '') +
        '" data-orientation="' + s.o + '" style="top:' + s.t + '%;left:' + s.l + '%">' +
        '<span class="mini-lbl">' + (s.name || s.id) + '</span></div>';
    });

    if (hl) {
      html += '<a href="kart.html?hylle=' + encodeURIComponent(hl) + '" class="mini-kart-link" title="Åpne kart">🗺️</a>';
    }
    html += '</div>';
    container.innerHTML = html;
  };
})();
