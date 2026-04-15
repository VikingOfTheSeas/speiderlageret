// kart-mini.js – embeddable mini room map for item/boks pages
(function () {
  // Inject CSS once
  if (!document.getElementById('kart-mini-css')) {
    var s = document.createElement('style');
    s.id = 'kart-mini-css';
    s.textContent = [
      '.mini-room{position:relative;width:100%;aspect-ratio:4/3;background:#10253e;border-radius:8px;overflow:hidden;border:1px solid rgba(70,189,198,0.2)}',
      '.mini-room::before{content:"";position:absolute;inset:4%;border:2px solid rgba(70,189,198,0.25);border-radius:5px;background-image:radial-gradient(circle,rgba(70,189,198,0.06) 1px,transparent 1px);background-size:12px 12px}',
      '.mini-sofakrok{position:absolute;top:7%;right:7%;width:18%;height:18%;background:rgba(70,189,198,0.12);border:1px solid rgba(70,189,198,0.35);border-radius:4px;z-index:2}',
      '.mini-door{position:absolute;left:4%;bottom:0;width:14%;height:9%;display:flex;align-items:flex-end;justify-content:center;padding-bottom:3px;font-family:"DM Mono",monospace;font-size:8px;font-weight:700;color:rgba(70,189,198,0.9);letter-spacing:1px;border-top:2px solid rgba(70,189,198,0.6);border-left:2px solid rgba(70,189,198,0.6);border-right:2px solid rgba(70,189,198,0.6);border-bottom:none;border-radius:4px 4px 0 0;background:rgba(70,189,198,0.07);z-index:6}',
      '.mini-shelf{position:absolute;z-index:5;background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.45);border-radius:2px;display:flex;align-items:center;justify-content:center}',
      '.mini-shelf.mini-hl{background:rgba(70,189,198,0.35);border-color:#46bdc6;box-shadow:0 0 8px rgba(70,189,198,0.5);animation:mini-pulse 1.4s ease-in-out infinite}',
      '@keyframes mini-pulse{0%,100%{box-shadow:0 0 6px rgba(70,189,198,0.4)}50%{box-shadow:0 0 14px rgba(70,189,198,0.7)}}',
      '.mini-lbl{font-family:"DM Mono",monospace;font-size:8px;font-weight:700;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.6);pointer-events:none;line-height:1}',
      '.mini-kart-link{position:absolute;bottom:6px;right:6px;z-index:10;font-size:14px;text-decoration:none;opacity:.7;transition:opacity .15s}',
      '.mini-kart-link:hover{opacity:1}',
    ].join('');
    document.head.appendChild(s);
  }

  var SHELVES = [
    { id:"L", t:8,  l:8,  w:10, h:8  },
    { id:"M", t:8,  l:30, w:5,  h:16 },
    { id:"N", t:8,  l:40, w:10, h:7  },
    { id:"K", t:28, l:6,  w:6,  h:12 },
    { id:"J", t:44, l:6,  w:6,  h:12 },
    { id:"I", t:60, l:6,  w:6,  h:12 },
    { id:"H", t:32, l:32, w:14, h:7  },
    { id:"G", t:42, l:32, w:14, h:7  },
    { id:"F", t:56, l:32, w:14, h:7  },
    { id:"E", t:66, l:32, w:14, h:7  },
    { id:"B", t:44, l:87, w:6,  h:12 },
    { id:"A", t:60, l:87, w:6,  h:12 },
    { id:"D", t:80, l:32, w:14, h:7  },
    { id:"C", t:80, l:50, w:14, h:7  },
  ];

  window.renderMiniKart = function (containerId, hylleplassering) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var m  = (hylleplassering || "").match(/^([A-N])/i);
    var hl = m ? m[1].toUpperCase() : null;

    var html = '<div class="mini-room">';
    html += '<div class="mini-sofakrok"></div>';
    html += '<div class="mini-door">DØR</div>';

    SHELVES.forEach(function (s) {
      var act = s.id === hl;
      html += '<div class="mini-shelf' + (act ? ' mini-hl' : '') +
        '" style="top:' + s.t + '%;left:' + s.l + '%;width:' + s.w + '%;height:' + s.h + '%">' +
        '<span class="mini-lbl">' + s.id + '</span></div>';
    });

    if (hl) {
      html += '<a href="kart.html?hylle=' + hl + '" class="mini-kart-link" title="Åpne kart">🗺️</a>';
    }
    html += '</div>';
    container.innerHTML = html;
  };
})();
