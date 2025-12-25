(() => {
  const MAX = 10;

  const norm = (s) => (s ?? "")
    .toString()
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const normNoSpace = (s) => norm(s).replace(/\s+/g, "");

  function tokenAt(text, caret){
    const s = Math.max(0, Math.min(caret, text.length));
    let i = s;
    while (i > 0) {
      const c = text.charCodeAt(i - 1);
      if (c === 10 || c === 13 || c === 9 || c === 32) break;
      if (c === 44 || c === 59) break;
      if (c === 40 || c === 41) break;
      if (c === 91 || c === 93) break;
      if (c === 123 || c === 125) break;
      if (c === 60 || c === 62) break;
      if (c === 61) break;
      i--;
    }
    const start = i;
    const tok = text.slice(start, s);
    return { start, end: s, tok };
  }

  function buildIndex(arr){
    const idx = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      const it = arr[i] || {};
      const tex = it.tex || "";
      const title = it.title || "";
      const keys = Array.isArray(it.keys) ? it.keys : [];
      const k = keys.map(norm).filter(Boolean);
      idx[i] = {
        i,
        tex,
        title,
        keys: k,
        ntex: normNoSpace(tex),
        ntitle: norm(title)
      };
    }
    return idx;
  }

  function score(q, e){
    if (!q) return -1;

    const ntex = e.ntex;
    const ntitle = e.ntitle;

    if (ntex.startsWith(q)) return 100000 - ntex.length;

    const pTex = ntex.indexOf(q);
    if (pTex >= 0) return 90000 - pTex * 20 - ntex.length;

    for (let j = 0; j < e.keys.length; j++) {
      const k = e.keys[j];
      if (k.startsWith(q)) return 80000 - k.length;
    }

    for (let j = 0; j < e.keys.length; j++) {
      const k = e.keys[j];
      const p = k.indexOf(q);
      if (p >= 0) return 70000 - p * 10 - k.length;
    }

    if (ntitle.startsWith(q)) return 60000 - ntitle.length;

    const pT = ntitle.indexOf(q);
    if (pT >= 0) return 50000 - pT * 10 - ntitle.length;

    return -1;
  }

  function suggest(q, data, idx){
    const qq = normNoSpace(q);
    if (!qq) return [];
    const scored = [];
    for (let i = 0; i < idx.length; i++) {
      const e = idx[i];
      const s = score(qq, e);
      if (s >= 0) scored.push([s, e.i]);
    }
    scored.sort((a,b) => b[0] - a[0]);
    const out = [];
    for (let k = 0; k < scored.length && out.length < MAX; k++) out.push(data[scored[k][1]]);
    return out;
  }

  function waitApi(cb){
    const tryNow = () => {
      const api = window.TEXFAST_API;
      if (api && api.src && api.acEl && api.getHelp && api.replaceRange) { cb(api); return true; }
      return false;
    };
    if (tryNow()) return;

    const onReady = () => { if (tryNow()) window.removeEventListener("texfast:apiReady", onReady); };
    window.addEventListener("texfast:apiReady", onReady);

    let n = 0;
    const timer = setInterval(() => {
      if (tryNow() || ++n > 300) {
        clearInterval(timer);
        window.removeEventListener("texfast:apiReady", onReady);
      }
    }, 20);
  }

  function mount(api){
    const src = api.src;
    const box = api.acEl;

    let idx = null;
    let open = false;
    let sel = -1;
    let lastRange = { start: 0, end: 0, tok: "" };
    let lastList = [];
    let lastSig = "";

    function close(){
      open = false;
      sel = -1;
      lastList = [];
      box.style.display = "none";
      box.innerHTML = "";
    }

    function render(list){
      box.innerHTML = "";
      if (!list.length) { close(); return; }
    
      const hint = document.createElement("div");
      hint.className = "ac-hint";
      hint.textContent = "↑↓ выбрать • Enter/Tab вставить • Esc закрыть";
      box.appendChild(hint);
    
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        const row = document.createElement("div");
        row.className = "ac-row" + (i === sel ? " sel" : "");
    
        const t = document.createElement("div");
        t.className = "ac-tex";
        t.textContent = it.tex || "";
    
        const s = document.createElement("div");
        s.className = "ac-title";
        s.textContent = it.title || "";
    
        row.appendChild(t);
        row.appendChild(s);
    
        row.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          apply(i);
        });
    
        box.appendChild(row);
      }
    
      open = true;
      box.style.display = "block";
    }


    function apply(i){
      if (!lastList.length) return;
      const it = lastList[Math.max(0, Math.min(i, lastList.length - 1))];
      if (!it || !it.tex) return;
      api.replaceRange(lastRange.start, lastRange.end, it.tex);
      close();
    }

    function move(d){
      const rows = box.querySelectorAll(".ac-row");
      if (!rows.length) return;
      sel += d;
      if (sel < 0) sel = rows.length - 1;
      if (sel >= rows.length) sel = 0;
      for (let i = 0; i < rows.length; i++) rows[i].classList.toggle("sel", i === sel);
      rows[sel].scrollIntoView({ block: "nearest" });
    }

    function update(){
      const h = api.getHelp();
      if (!h.loaded || !Array.isArray(h.data) || !h.data.length) { close(); return; }
      if (!idx || idx.length !== h.data.length) idx = buildIndex(h.data);

      if ((src.selectionStart ?? 0) !== (src.selectionEnd ?? 0)) { close(); return; }

      const caret = src.selectionStart ?? 0;
      const tr = tokenAt(src.value, caret);

      const q = tr.tok.trim();
      const good = q.length >= 2;

      const sig = q + "|" + caret;
      if (sig === lastSig) return;
      lastSig = sig;

      if (!good) { close(); return; }

      lastRange = tr;
      sel = 0;
      lastList = suggest(q, h.data, idx);
      render(lastList);
    }

    src.addEventListener("input", update);
    src.addEventListener("click", update);
    src.addEventListener("keyup", (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") update();
    });

    src.addEventListener("keydown", (e) => {
      if (!open) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") update();
      }
      if (!open) return;

      if (e.key === "ArrowDown") { e.preventDefault(); move(+1); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); move(-1); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); apply(sel >= 0 ? sel : 0); return; }
      if (e.key === "Escape")    { e.preventDefault(); close(); return; }
    });

    document.addEventListener("mousedown", (e) => {
      if (e.target === src || box.contains(e.target)) return;
      close();
    });

    const onHelp = () => update();
    window.addEventListener("texfast:helpLoaded", onHelp);

    update();
  }

  document.addEventListener("DOMContentLoaded", () => {
    waitApi((api) => mount(api));
  });
})();
