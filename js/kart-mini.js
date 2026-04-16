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
      '.mini-door{position:absolute;left:75%;bottom:0;width:12%;height:9%;display:flex;align-items:flex-end;justify-content:center;padding-bottom:3px;font-family:"DM Mono",monospace;font-size:8px;font-weight:700;color:rgba(70,189,198,0.9);letter-spacing:1px;border-top:2px solid rgba(70,189,198,0.6);border-left:2px solid rgba(70,189,198,0.6);border-right:2px solid rgba(70,189,198,0.6);border-bottom:none;border-radius:4px 4px 0 0;background:rgba(70,189,198,0.07);z-index:6}',
      '.mini-shelf{position:absolute;z-index:5;background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.45);border-radius:2px;display:flex;align-items:center;justify-content:center}',
      '.mini-shelf.mini-hl{background:rgba(70,189,198,0.35);border-color:#46bdc6;box-shadow:0 0 8px rgba(70,189,198,0.5);animation:mini-pulse 1.4s ease-in-out infinite}',
      '@keyframes mini-pulse{0%,100%{box-shadow:0 0 6px rgba(70,189,198,0.4)}50%{box-shadow:0 0 14px rgba(70,189,198,0.7)}}',
      '.mini-wall-block{position:absolute;background:rgba(100,116,139,0.55);border:1px solid rgba(100,116,139,0.8);border-radius:2px;z-index:4;pointer-events:none}',
      '.mini-lbl{font-family:"DM Mono",monospace;font-size:8px;font-weight:700;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.6);pointer-events:none;line-height:1}',
      '.mini-kart-link{position:absolute;bottom:6px;right:6px;z-index:10;font-size:14px;text-decoration:none;opacity:.7;transition:opacity .15s}',
      '.mini-kart-link:hover{opacity:1}',
    ].join('');
    document.head.appendChild(s);
  }

  var SHELVES = [
    { id:"L", t:4,  l:4,  w:16, h:9  },
    { id:"M", t:4,  l:28, w:9,  h:16 },
    { id:"N", t:4,  l:40, w:16, h:9  },
    { id:"K", t:32, l:4,  w:9,  h:16 },
    { id:"J", t:52, l:4,  w:9,  h:16 },
    { id:"I", t:72, l:4,  w:9,  h:16 },
    { id:"H", t:36, l:20, w:16, h:9  },
    { id:"G", t:50, l:20, w:16, h:9  },
    { id:"F", t:38, l:58, w:9,  h:16 },
    { id:"E", t:72, l:13, w:16, h:9  },
    { id:"D", t:72, l:32, w:16, h:9  },
    { id:"C", t:72, l:51, w:16, h:9  },
    { id:"B", t:36, l:91, w:9,  h:16 },
    { id:"A", t:56, l:91, w:9,  h:16 },
  ];

  window.renderMiniKart = function (containerId, hylleplassering) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var m  = (hylleplassering || "").match(/^([A-N])/i);
    var hl = m ? m[1].toUpperCase() : null;

    var html = '<div class="mini-room">';
    html += '<div class="mini-sofakrok"></div>';
    html += '<div class="mini-door">DØR</div>';

    html += '<div class="mini-wall-block" style="top:4%;left:22%;width:4%;height:22%"></div>';
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
