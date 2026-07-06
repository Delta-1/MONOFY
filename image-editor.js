/* ==========================================================================
 * MONOFY — Editor de Imagem / Criador de Logos (Fase B)
 * --------------------------------------------------------------------------
 * Módulo em arquivo próprio (regra: cada módulo novo nasce separado).
 * Script clássico: compartilha o escopo global do app (state, showConfirmModal,
 * showError, SUPABASE_URL etc.). NÃO usar type="module".
 *
 * Foco: criação de logos. Canvas com camadas (texto, formas, imagem enviada),
 * arrastar/redimensionar/rotacionar, cores e fontes, remover fundo com IA e
 * exportar PNG transparente. Design salvo automaticamente no aparelho.
 * ==========================================================================*/

(function () {
    'use strict';

    var AI_COST_REMOVE_BG = 5; // créditos por remoção de fundo com IA

    var VIRTUAL = 1024; // resolução interna do canvas (px)
    var FONTS = ['Arial', 'Times New Roman', 'Georgia', 'Verdana', 'Impact', 'Courier New', 'Trebuchet MS', 'Tinos'];
    var SHAPES = [
        { kind: 'circle',    icon: 'circle',         label: 'Círculo' },
        { kind: 'ring',      icon: 'circle-dashed',  label: 'Anel' },
        { kind: 'rect',      icon: 'square',         label: 'Quadrado' },
        { kind: 'roundrect', icon: 'squircle',       label: 'Arredondado' },
        { kind: 'triangle',  icon: 'triangle',       label: 'Triângulo' },
        { kind: 'star',      icon: 'star',           label: 'Estrela' },
        { kind: 'hexagon',   icon: 'hexagon',        label: 'Hexágono' }
    ];

    var ed = {
        built: false,
        canvas: null, ctx: null,
        layers: [], selectedId: null,
        bgColor: '',            // '' = transparente
        undoStack: [], busy: false,
        drag: null              // { mode:'move'|'resize', startX, startY, orig }
    };

    function uid() { return 'ly-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6); }
    function sel() { return ed.layers.find(function (l) { return l.id === ed.selectedId; }) || null; }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

    /* ---------------- abrir / fechar ---------------- */

    window.openImageEditor = function () {
        var screen = document.getElementById('image-editor-screen');
        if (!screen) return;
        if (!ed.built) buildUI(screen);
        loadDesign();
        var hub = document.getElementById('hub-screen');
        if (hub) { hub.classList.add('opacity-0', 'pointer-events-none'); setTimeout(function () { hub.classList.add('hidden-state'); }, 350); }
        screen.classList.remove('hidden-state');
        requestAnimationFrame(function () { screen.classList.remove('opacity-0', 'pointer-events-none'); });
        refreshAll();
    };

    window.closeImageEditor = function () {
        var screen = document.getElementById('image-editor-screen');
        if (screen) { screen.classList.add('opacity-0', 'pointer-events-none'); setTimeout(function () { screen.classList.add('hidden-state'); }, 350); }
        if (typeof window.goToHub === 'function') window.goToHub();
    };

    /* ---------------- persistência local ---------------- */

    function serialize() {
        return JSON.stringify({
            bgColor: ed.bgColor,
            layers: ed.layers.map(function (l) {
                var c = {}; for (var k in l) if (k !== '_img') c[k] = l[k];
                return c;
            })
        });
    }

    function saveDesign() { try { localStorage.setItem('monofy_logo_design', serialize()); } catch (_) {} }

    function loadDesign() {
        try {
            var raw = localStorage.getItem('monofy_logo_design');
            if (!raw) return;
            var d = JSON.parse(raw);
            ed.bgColor = d.bgColor || '';
            ed.layers = (d.layers || []);
            ed.layers.forEach(function (l) { if (l.type === 'image' && l.src) rebuildImg(l); });
            ed.selectedId = ed.layers.length ? ed.layers[ed.layers.length - 1].id : null;
        } catch (_) {}
    }

    function rebuildImg(l) {
        var img = new Image();
        img.onload = function () { l._img = img; render(); };
        img.src = l.src;
    }

    function pushUndo() {
        ed.undoStack.push(serialize());
        if (ed.undoStack.length > 25) ed.undoStack.shift();
    }

    window.imgEdUndo = function () {
        var prev = ed.undoStack.pop();
        if (!prev) return;
        try {
            var d = JSON.parse(prev);
            ed.bgColor = d.bgColor || '';
            ed.layers = d.layers || [];
            ed.layers.forEach(function (l) { if (l.type === 'image' && l.src) rebuildImg(l); });
            if (!sel()) ed.selectedId = ed.layers.length ? ed.layers[ed.layers.length - 1].id : null;
            refreshAll();
        } catch (_) {}
    };

    /* ---------------- camadas ---------------- */

    window.imgEdAddText = function () {
        pushUndo();
        var l = { id: uid(), type: 'text', text: 'SUA LOGO', font: 'Arial', fontSize: 120, bold: true, color: '#1e293b', x: VIRTUAL / 2, y: VIRTUAL / 2, rotation: 0, opacity: 1 };
        ed.layers.push(l); ed.selectedId = l.id; refreshAll();
    };

    window.imgEdAddShape = function (kind) {
        pushUndo();
        var l = { id: uid(), type: 'shape', shape: kind, color: '#6366f1', x: VIRTUAL / 2, y: VIRTUAL / 2, w: 420, h: 420, rotation: 0, opacity: 1 };
        ed.layers.push(l); ed.selectedId = l.id; refreshAll();
    };

    window.imgEdUploadImage = function (ev) {
        var file = ev.target.files && ev.target.files[0];
        ev.target.value = '';
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (e) {
            pushUndo();
            var img = new Image();
            img.onload = function () {
                var scale = Math.min(1, 640 / img.naturalWidth, 640 / img.naturalHeight);
                var l = { id: uid(), type: 'image', src: e.target.result, x: VIRTUAL / 2, y: VIRTUAL / 2, w: Math.round(img.naturalWidth * scale), h: Math.round(img.naturalHeight * scale), rotation: 0, opacity: 1, _img: img };
                ed.layers.push(l); ed.selectedId = l.id; refreshAll();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };

    window.imgEdSelect = function (id) { ed.selectedId = id; refreshAll(); };

    window.imgEdDelete = function () {
        var l = sel(); if (!l) return;
        pushUndo();
        ed.layers = ed.layers.filter(function (x) { return x.id !== l.id; });
        ed.selectedId = ed.layers.length ? ed.layers[ed.layers.length - 1].id : null;
        refreshAll();
    };

    window.imgEdDuplicate = function () {
        var l = sel(); if (!l) return;
        pushUndo();
        var c = JSON.parse(JSON.stringify(l, function (k, v) { return k === '_img' ? undefined : v; }));
        c.id = uid(); c.x += 40; c.y += 40;
        if (c.type === 'image' && c.src) rebuildImg(c);
        ed.layers.push(c); ed.selectedId = c.id; refreshAll();
    };

    window.imgEdMoveZ = function (dir) {
        var i = ed.layers.findIndex(function (x) { return x.id === ed.selectedId; });
        if (i === -1) return;
        var j = i + dir;
        if (j < 0 || j >= ed.layers.length) return;
        pushUndo();
        var t = ed.layers[i]; ed.layers[i] = ed.layers[j]; ed.layers[j] = t;
        refreshAll();
    };

    window.imgEdCenter = function () {
        var l = sel(); if (!l) return;
        pushUndo(); l.x = VIRTUAL / 2; l.y = VIRTUAL / 2; refreshAll();
    };

    window.imgEdClearAll = function () {
        if (!ed.layers.length) return;
        if (!confirm('Limpar o desenho inteiro e começar do zero?')) return;
        pushUndo();
        ed.layers = []; ed.selectedId = null; ed.bgColor = '';
        refreshAll();
    };

    /* ---------------- propriedades ---------------- */

    window.imgEdProp = function (prop, value) {
        var l = sel(); if (!l) return;
        if (prop === 'fontSize' || prop === 'rotation' || prop === 'opacity' || prop === 'w' || prop === 'h') value = parseFloat(value);
        if (prop === 'bold') value = !!value;
        if (prop === 'scale') { // slider de tamanho para formas/imagens: escala proporcional
            var f = parseFloat(value) / 100;
            if (l._baseW == null) { l._baseW = l.w; l._baseH = l.h; }
            l.w = Math.max(24, Math.round(l._baseW * f));
            l.h = Math.max(24, Math.round(l._baseH * f));
            render(); saveDesign(); return;
        }
        l[prop] = value;
        render(); saveDesign();
        if (prop === 'text') renderLayerList(); // nome da camada acompanha o texto
    };

    window.imgEdPropCommit = function () { pushUndo(); };

    window.imgEdBg = function (value) { ed.bgColor = value; render(); saveDesign(); };
    window.imgEdBgClear = function () { ed.bgColor = ''; render(); saveDesign(); syncProps(); };

    /* ---------------- modelos rápidos ---------------- */

    window.imgEdTemplate = function (n) {
        pushUndo();
        ed.layers = []; ed.bgColor = '';
        var C = VIRTUAL / 2;
        if (n === 1) { // selo circular
            ed.layers.push({ id: uid(), type: 'shape', shape: 'circle', color: '#1d4ed8', x: C, y: C, w: 720, h: 720, rotation: 0, opacity: 1 });
            ed.layers.push({ id: uid(), type: 'shape', shape: 'ring', color: '#ffffff', x: C, y: C, w: 640, h: 640, rotation: 0, opacity: 1 });
            ed.layers.push({ id: uid(), type: 'text', text: 'SUA MARCA', font: 'Georgia', fontSize: 96, bold: true, color: '#ffffff', x: C, y: C, rotation: 0, opacity: 1 });
        } else if (n === 2) { // escudo acadêmico
            ed.layers.push({ id: uid(), type: 'shape', shape: 'hexagon', color: '#0f766e', x: C, y: C, w: 700, h: 700, rotation: 0, opacity: 1 });
            ed.layers.push({ id: uid(), type: 'shape', shape: 'hexagon', color: '#ffffff', x: C, y: C, w: 600, h: 600, rotation: 0, opacity: 0.15 });
            ed.layers.push({ id: uid(), type: 'text', text: 'INSTITUTO', font: 'Trebuchet MS', fontSize: 84, bold: true, color: '#ffffff', x: C, y: C - 40, rotation: 0, opacity: 1 });
            ed.layers.push({ id: uid(), type: 'text', text: 'desde 2024', font: 'Georgia', fontSize: 48, bold: false, color: '#ccfbf1', x: C, y: C + 70, rotation: 0, opacity: 1 });
        } else if (n === 3) { // minimalista
            ed.layers.push({ id: uid(), type: 'shape', shape: 'roundrect', color: '#111827', x: C, y: C - 90, w: 300, h: 300, rotation: 0, opacity: 1 });
            ed.layers.push({ id: uid(), type: 'text', text: 'M', font: 'Impact', fontSize: 200, bold: false, color: '#ffffff', x: C, y: C - 90, rotation: 0, opacity: 1 });
            ed.layers.push({ id: uid(), type: 'text', text: 'MARCA', font: 'Verdana', fontSize: 88, bold: true, color: '#111827', x: C, y: C + 190, rotation: 0, opacity: 1 });
        } else { // estrela
            ed.layers.push({ id: uid(), type: 'shape', shape: 'star', color: '#f59e0b', x: C, y: C - 60, w: 560, h: 560, rotation: 0, opacity: 1 });
            ed.layers.push({ id: uid(), type: 'text', text: 'PREMIUM', font: 'Impact', fontSize: 110, bold: false, color: '#78350f', x: C, y: C + 300, rotation: 0, opacity: 1 });
        }
        ed.selectedId = ed.layers[ed.layers.length - 1].id;
        refreshAll();
    };

    /* ---------------- remover fundo (IA) ---------------- */

    window.imgEdRemoveBg = async function () {
        var l = sel();
        if (!l || l.type !== 'image') { alert('Selecione uma camada de IMAGEM para remover o fundo.'); return; }
        if (ed.busy) return;
        if (window.state && state.isDemo) { alert('Modo demonstração: IA desativada.'); return; }
        if (!window.state || !state.session) { alert('Faça login para usar a IA.'); return; }

        var ok;
        if (typeof showConfirmModal === 'function') {
            ok = await showConfirmModal('Remover fundo com IA', 'A IA vai remover o fundo desta imagem, deixando-o transparente. Isso consome <b>' + AI_COST_REMOVE_BG + ' créditos</b>. Continuar?');
        } else {
            ok = confirm('Remover o fundo desta imagem com IA? Custa ' + AI_COST_REMOVE_BG + ' créditos.');
        }
        if (!ok) return;

        ed.busy = true;
        var btn = document.getElementById('imged-removebg-btn');
        var orig = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="imged-spin"></span> Removendo fundo...'; }

        try {
            var m = String(l.src).match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
            if (!m) throw new Error('Formato de imagem não suportado.');
            var res = await fetch(SUPABASE_URL + '/functions/v1/ai-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + state.session.access_token },
                body: JSON.stringify({
                    image: m[2], mime: m[1],
                    instruction: 'Remove the background of this image completely. Keep ONLY the main subject, unchanged, on a fully transparent background. Output a PNG with alpha transparency. Do not add anything, do not restyle the subject.',
                    cost: AI_COST_REMOVE_BG, reason: 'ai_remove_bg'
                })
            });
            var data = await res.json();
            if (!res.ok || data.error) {
                if (res.status === 402 || data.error === 'insufficient_credits') throw new Error('Créditos insuficientes (precisa de ' + AI_COST_REMOVE_BG + '). Compre créditos na aba Créditos.');
                throw new Error(data.error || 'Erro ao processar a imagem.');
            }
            pushUndo();
            l.src = 'data:' + (data.mime || 'image/png') + ';base64,' + data.image;
            rebuildImg(l);
            if (state.profile && state.profile.role !== 'admin') {
                state.profile.credits -= AI_COST_REMOVE_BG;
                var disp = document.getElementById('user-credits-display');
                if (disp) disp.innerText = state.profile.credits;
            }
            saveDesign();
        } catch (err) {
            if (typeof showError === 'function') showError('Remover fundo: ' + (err.message || err));
            else alert('Erro: ' + (err.message || err));
        } finally {
            ed.busy = false;
            if (btn) { btn.disabled = false; btn.innerHTML = orig; }
        }
    };

    /* ---------------- exportar ---------------- */

    window.imgEdExport = function (size) {
        size = size || 1024;
        var out = document.createElement('canvas');
        out.width = size; out.height = size;
        var ctx = out.getContext('2d');
        var f = size / VIRTUAL;
        if (ed.bgColor) { ctx.fillStyle = ed.bgColor; ctx.fillRect(0, 0, size, size); }
        ctx.scale(f, f);
        ed.layers.forEach(function (l) { drawLayer(ctx, l); });
        var a = document.createElement('a');
        a.href = out.toDataURL('image/png');
        a.download = 'logo-monofy-' + size + 'px.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };

    /* ---------------- desenho ---------------- */

    function textMetrics(l) {
        var ctx = ed.ctx;
        ctx.font = (l.bold ? 'bold ' : '') + l.fontSize + 'px "' + l.font + '"';
        var w = ctx.measureText(l.text || ' ').width;
        return { w: Math.max(24, w), h: Math.max(24, l.fontSize * 1.15) };
    }

    function layerBox(l) {
        if (l.type === 'text') { var mtx = textMetrics(l); return { w: mtx.w, h: mtx.h }; }
        return { w: l.w, h: l.h };
    }

    function shapePath(ctx, kind, w, h) {
        var hw = w / 2, hh = h / 2;
        ctx.beginPath();
        if (kind === 'circle') {
            ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
        } else if (kind === 'ring') {
            ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
            ctx.ellipse(0, 0, hw * 0.78, hh * 0.78, 0, 0, Math.PI * 2, true);
        } else if (kind === 'rect') {
            ctx.rect(-hw, -hh, w, h);
        } else if (kind === 'roundrect') {
            var r = Math.min(w, h) * 0.18;
            if (ctx.roundRect) ctx.roundRect(-hw, -hh, w, h, r);
            else ctx.rect(-hw, -hh, w, h);
        } else if (kind === 'triangle') {
            ctx.moveTo(0, -hh); ctx.lineTo(hw, hh); ctx.lineTo(-hw, hh); ctx.closePath();
        } else if (kind === 'star') {
            for (var i = 0; i < 10; i++) {
                var r2 = (i % 2 === 0) ? hw : hw * 0.42;
                var a = -Math.PI / 2 + i * Math.PI / 5;
                var px = Math.cos(a) * r2, py = Math.sin(a) * r2 * (hh / hw);
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
        } else if (kind === 'hexagon') {
            for (var j = 0; j < 6; j++) {
                var a2 = -Math.PI / 2 + j * Math.PI / 3;
                var qx = Math.cos(a2) * hw, qy = Math.sin(a2) * hh;
                if (j === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy);
            }
            ctx.closePath();
        }
    }

    function drawLayer(ctx, l) {
        ctx.save();
        ctx.globalAlpha = (l.opacity == null ? 1 : l.opacity);
        ctx.translate(l.x, l.y);
        ctx.rotate((l.rotation || 0) * Math.PI / 180);
        if (l.type === 'text') {
            ctx.font = (l.bold ? 'bold ' : '') + l.fontSize + 'px "' + l.font + '"';
            ctx.fillStyle = l.color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(l.text || '', 0, 0);
        } else if (l.type === 'shape') {
            shapePath(ctx, l.shape, l.w, l.h);
            ctx.fillStyle = l.color;
            ctx.fill('evenodd');
        } else if (l.type === 'image' && l._img) {
            ctx.drawImage(l._img, -l.w / 2, -l.h / 2, l.w, l.h);
        }
        ctx.restore();
    }

    function render() {
        var ctx = ed.ctx;
        if (!ctx) return;
        ctx.clearRect(0, 0, VIRTUAL, VIRTUAL);
        if (ed.bgColor) { ctx.fillStyle = ed.bgColor; ctx.fillRect(0, 0, VIRTUAL, VIRTUAL); }
        ed.layers.forEach(function (l) { drawLayer(ctx, l); });

        var l = sel();
        if (l) { // caixa de seleção + alça de redimensionar
            var box = layerBox(l);
            ctx.save();
            ctx.translate(l.x, l.y);
            ctx.rotate((l.rotation || 0) * Math.PI / 180);
            ctx.strokeStyle = '#6366f1';
            ctx.lineWidth = 3;
            ctx.setLineDash([10, 8]);
            ctx.strokeRect(-box.w / 2 - 10, -box.h / 2 - 10, box.w + 20, box.h + 20);
            ctx.setLineDash([]);
            ctx.fillStyle = '#6366f1';
            ctx.fillRect(box.w / 2 - 2, box.h / 2 - 2, 26, 26); // alça (canto inferior direito)
            ctx.restore();
        }
    }

    /* ---------------- interação (arrastar / redimensionar) ---------------- */

    function canvasPoint(ev) {
        var r = ed.canvas.getBoundingClientRect();
        return { x: (ev.clientX - r.left) * (VIRTUAL / r.width), y: (ev.clientY - r.top) * (VIRTUAL / r.height) };
    }

    function toLocal(l, p) {
        var dx = p.x - l.x, dy = p.y - l.y;
        var a = -(l.rotation || 0) * Math.PI / 180;
        return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
    }

    function hitTest(p) {
        for (var i = ed.layers.length - 1; i >= 0; i--) {
            var l = ed.layers[i];
            var box = layerBox(l);
            var q = toLocal(l, p);
            if (Math.abs(q.x) <= box.w / 2 + 14 && Math.abs(q.y) <= box.h / 2 + 14) return l;
        }
        return null;
    }

    function onHandle(l, p) {
        var box = layerBox(l);
        var q = toLocal(l, p);
        return (q.x >= box.w / 2 - 14 && q.x <= box.w / 2 + 40 && q.y >= box.h / 2 - 14 && q.y <= box.h / 2 + 40);
    }

    function pointerDown(ev) {
        var p = canvasPoint(ev);
        var l = sel();
        if (l && onHandle(l, p)) {
            pushUndo();
            ed.drag = { mode: 'resize', start: p, orig: JSON.parse(JSON.stringify(l, function (k, v) { return k === '_img' ? undefined : v; })) };
            ev.preventDefault(); return;
        }
        var hit = hitTest(p);
        if (hit) {
            if (hit.id !== ed.selectedId) { ed.selectedId = hit.id; refreshAll(); }
            pushUndo();
            ed.drag = { mode: 'move', start: p, orig: { x: hit.x, y: hit.y } };
            ev.preventDefault();
        } else if (ed.selectedId) {
            ed.selectedId = null; refreshAll();
        }
    }

    function pointerMove(ev) {
        if (!ed.drag) return;
        var l = sel(); if (!l) { ed.drag = null; return; }
        var p = canvasPoint(ev);
        if (ed.drag.mode === 'move') {
            l.x = ed.drag.orig.x + (p.x - ed.drag.start.x);
            l.y = ed.drag.orig.y + (p.y - ed.drag.start.y);
        } else { // resize proporcional pela distância ao centro
            var d0 = Math.hypot(ed.drag.start.x - l.x, ed.drag.start.y - l.y) || 1;
            var d1 = Math.hypot(p.x - l.x, p.y - l.y);
            var f = Math.max(0.08, d1 / d0);
            if (l.type === 'text') l.fontSize = Math.max(14, Math.round((ed.drag.orig.fontSize || 60) * f));
            else { l.w = Math.max(24, Math.round(ed.drag.orig.w * f)); l.h = Math.max(24, Math.round(ed.drag.orig.h * f)); }
        }
        render();
        ev.preventDefault();
    }

    function pointerUp() {
        if (ed.drag) { ed.drag = null; saveDesign(); syncProps(); }
    }

    /* ---------------- UI ---------------- */

    function buildUI(screen) {
        ed.built = true;
        var shapesHtml = SHAPES.map(function (s) {
            return '<button onclick="imgEdAddShape(\'' + s.kind + '\')" title="' + s.label + '" class="imged-tool"><i data-lucide="' + s.icon + '" class="w-4 h-4"></i></button>';
        }).join('');
        var fontsHtml = FONTS.map(function (f) { return '<option value="' + f + '">' + f + '</option>'; }).join('');

        screen.innerHTML =
        '<div class="h-full w-full flex flex-col bg-slate-100 dark:bg-slate-900">' +
            // topo
            '<header class="shrink-0 backdrop-blur bg-white/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-3 sm:px-5 py-2.5 flex items-center justify-between gap-2">' +
                '<div class="flex items-center gap-2 min-w-0">' +
                    '<button onclick="closeImageEditor()" title="Voltar ao início" class="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"><i data-lucide="arrow-left" class="w-4 h-4"></i></button>' +
                    '<div class="flex items-center gap-2 select-none min-w-0"><div class="w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center shadow"><i data-lucide="image" class="w-4 h-4 text-white"></i></div><span class="font-extrabold text-slate-800 dark:text-white text-sm truncate">Editor de Logos</span><span class="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-fuchsia-100 dark:bg-fuchsia-900/40 text-fuchsia-700 dark:text-fuchsia-300 shrink-0">Beta</span></div>' +
                '</div>' +
                '<div class="flex items-center gap-2">' +
                    '<button onclick="imgEdUndo()" title="Desfazer" class="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"><i data-lucide="undo-2" class="w-4 h-4"></i></button>' +
                    '<div class="relative">' +
                        '<button onclick="document.getElementById(\'imged-export-menu\').classList.toggle(\'hidden-state\')" class="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-primary-600 text-white text-xs font-bold hover:bg-slate-800 dark:hover:bg-primary-700 transition"><i data-lucide="download" class="w-4 h-4"></i> Baixar PNG</button>' +
                        '<div id="imged-export-menu" class="hidden-state absolute right-0 mt-1 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden text-xs font-semibold text-slate-700 dark:text-slate-200">' +
                            '<button onclick="imgEdExport(512);document.getElementById(\'imged-export-menu\').classList.add(\'hidden-state\')" class="w-full text-left px-4 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-700">PNG 512 px</button>' +
                            '<button onclick="imgEdExport(1024);document.getElementById(\'imged-export-menu\').classList.add(\'hidden-state\')" class="w-full text-left px-4 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-700">PNG 1024 px</button>' +
                            '<button onclick="imgEdExport(2048);document.getElementById(\'imged-export-menu\').classList.add(\'hidden-state\')" class="w-full text-left px-4 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-700">PNG 2048 px</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</header>' +

            '<div class="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 p-3 sm:p-4 overflow-y-auto lg:overflow-hidden custom-scrollbar">' +
                // ferramentas (esquerda)
                '<aside class="shrink-0 lg:w-52 flex lg:flex-col gap-3">' +
                    '<div class="flex-1 lg:flex-none bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 shadow-sm">' +
                        '<p class="imged-label">Adicionar</p>' +
                        '<div class="flex flex-wrap gap-1.5">' +
                            '<button onclick="imgEdAddText()" title="Texto" class="imged-tool"><i data-lucide="type" class="w-4 h-4"></i></button>' +
                            shapesHtml +
                            '<label title="Enviar imagem" class="imged-tool cursor-pointer"><i data-lucide="image-plus" class="w-4 h-4"></i><input type="file" accept="image/*" class="hidden" onchange="imgEdUploadImage(event)"></label>' +
                        '</div>' +
                        '<p class="imged-label mt-3">Modelos rápidos</p>' +
                        '<div class="grid grid-cols-4 lg:grid-cols-2 gap-1.5">' +
                            '<button onclick="imgEdTemplate(1)" class="imged-tpl">⭕ Selo</button>' +
                            '<button onclick="imgEdTemplate(2)" class="imged-tpl">🛡️ Escudo</button>' +
                            '<button onclick="imgEdTemplate(3)" class="imged-tpl">◼️ Mínimo</button>' +
                            '<button onclick="imgEdTemplate(4)" class="imged-tpl">⭐ Estrela</button>' +
                        '</div>' +
                        '<p class="imged-label mt-3">Fundo do desenho</p>' +
                        '<div class="flex items-center gap-2">' +
                            '<input type="color" id="imged-bg-color" onchange="imgEdBg(this.value)" class="w-8 h-8 rounded cursor-pointer border border-slate-200 dark:border-slate-700 bg-transparent">' +
                            '<button onclick="imgEdBgClear()" class="imged-tpl flex-1">Transparente</button>' +
                        '</div>' +
                        '<button onclick="imgEdClearAll()" class="mt-3 w-full text-[11px] font-bold text-red-500 hover:text-red-600 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition">Limpar tudo</button>' +
                    '</div>' +
                '</aside>' +

                // canvas (centro)
                '<div class="flex-1 min-w-0 flex items-start lg:items-center justify-center">' +
                    '<div class="w-full max-w-[560px]">' +
                        '<canvas id="imged-canvas" width="' + VIRTUAL + '" height="' + VIRTUAL + '" class="imged-canvas w-full rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 touch-none select-none"></canvas>' +
                        '<p class="text-center text-[11px] text-slate-400 mt-2">Toque para selecionar · arraste para mover · quadradinho roxo redimensiona</p>' +
                    '</div>' +
                '</div>' +

                // propriedades + camadas (direita)
                '<aside class="shrink-0 lg:w-64 flex flex-col gap-3">' +
                    '<div id="imged-props" class="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 shadow-sm"></div>' +
                    '<div class="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 shadow-sm flex-1 min-h-[120px] overflow-y-auto custom-scrollbar">' +
                        '<p class="imged-label">Camadas</p>' +
                        '<div id="imged-layers" class="space-y-1"></div>' +
                    '</div>' +
                '</aside>' +
            '</div>' +
        '</div>';

        ed.canvas = document.getElementById('imged-canvas');
        ed.ctx = ed.canvas.getContext('2d');
        ed.canvas.addEventListener('pointerdown', pointerDown);
        window.addEventListener('pointermove', pointerMove);
        window.addEventListener('pointerup', pointerUp);
        if (window.lucide && lucide.createIcons) { try { lucide.createIcons(); } catch (_) {} }
    }

    function renderLayerList() {
        var wrap = document.getElementById('imged-layers');
        if (!wrap) return;
        if (!ed.layers.length) {
            wrap.innerHTML = '<p class="text-[11px] text-slate-400 italic">Nenhuma camada ainda. Adicione texto, forma ou imagem.</p>';
            return;
        }
        var html = '';
        for (var i = ed.layers.length - 1; i >= 0; i--) { // topo primeiro
            var l = ed.layers[i];
            var icon = l.type === 'text' ? 'type' : (l.type === 'image' ? 'image' : 'shapes');
            var name = l.type === 'text' ? (l.text || 'Texto') : (l.type === 'image' ? 'Imagem' : ({ circle: 'Círculo', ring: 'Anel', rect: 'Quadrado', roundrect: 'Arredondado', triangle: 'Triângulo', star: 'Estrela', hexagon: 'Hexágono' }[l.shape] || 'Forma'));
            var active = l.id === ed.selectedId;
            html += '<button onclick="imgEdSelect(\'' + l.id + '\')" class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs font-semibold transition ' +
                (active ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 ring-1 ring-primary-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800') + '">' +
                '<i data-lucide="' + icon + '" class="w-3.5 h-3.5 shrink-0"></i><span class="truncate">' + esc(name).slice(0, 22) + '</span></button>';
        }
        wrap.innerHTML = html;
        if (window.lucide && lucide.createIcons) { try { lucide.createIcons(); } catch (_) {} }
    }

    function syncProps() {
        var wrap = document.getElementById('imged-props');
        if (!wrap) return;
        var l = sel();
        if (!l) {
            wrap.innerHTML = '<p class="imged-label">Propriedades</p><p class="text-[11px] text-slate-400 italic">Selecione uma camada no desenho ou na lista.</p>';
            return;
        }
        var common =
            '<div class="grid grid-cols-2 gap-1.5 mb-2">' +
                '<button onclick="imgEdMoveZ(1)" class="imged-tpl" title="Trazer pra frente"><i data-lucide="arrow-up" class="w-3 h-3 inline"></i> Frente</button>' +
                '<button onclick="imgEdMoveZ(-1)" class="imged-tpl" title="Enviar pra trás"><i data-lucide="arrow-down" class="w-3 h-3 inline"></i> Trás</button>' +
                '<button onclick="imgEdDuplicate()" class="imged-tpl"><i data-lucide="copy" class="w-3 h-3 inline"></i> Duplicar</button>' +
                '<button onclick="imgEdCenter()" class="imged-tpl"><i data-lucide="crosshair" class="w-3 h-3 inline"></i> Centralizar</button>' +
            '</div>' +
            '<label class="imged-slider">Rotação <input type="range" min="-180" max="180" step="1" value="' + (l.rotation || 0) + '" oninput="imgEdProp(\'rotation\', this.value)" onchange="imgEdPropCommit()"></label>' +
            '<label class="imged-slider">Opacidade <input type="range" min="0.1" max="1" step="0.05" value="' + (l.opacity == null ? 1 : l.opacity) + '" oninput="imgEdProp(\'opacity\', this.value)" onchange="imgEdPropCommit()"></label>';

        var specific = '';
        if (l.type === 'text') {
            specific =
                '<input type="text" value="' + esc(l.text) + '" oninput="imgEdProp(\'text\', this.value)" onchange="imgEdPropCommit()" class="w-full mb-2 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400">' +
                '<div class="flex items-center gap-1.5 mb-2">' +
                    '<select onchange="imgEdProp(\'font\', this.value);imgEdPropCommit()" class="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200">' +
                        FONTS.map(function (f) { return '<option value="' + f + '"' + (f === l.font ? ' selected' : '') + '>' + f + '</option>'; }).join('') +
                    '</select>' +
                    '<button onclick="imgEdProp(\'bold\', ' + (l.bold ? 'false' : 'true') + ');imgEdPropCommit();" class="imged-tool ' + (l.bold ? '!bg-primary-100 dark:!bg-primary-900/40 !text-primary-600' : '') + '" title="Negrito"><i data-lucide="bold" class="w-4 h-4"></i></button>' +
                    '<input type="color" value="' + (l.color || '#1e293b') + '" onchange="imgEdProp(\'color\', this.value);imgEdPropCommit()" class="w-8 h-8 rounded cursor-pointer border border-slate-200 dark:border-slate-700 bg-transparent" title="Cor">' +
                '</div>';
        } else if (l.type === 'shape') {
            specific =
                '<div class="flex items-center gap-2 mb-2">' +
                    '<span class="text-[11px] font-bold text-slate-500 dark:text-slate-400">Cor</span>' +
                    '<input type="color" value="' + (l.color || '#6366f1') + '" onchange="imgEdProp(\'color\', this.value);imgEdPropCommit()" class="w-9 h-9 rounded cursor-pointer border border-slate-200 dark:border-slate-700 bg-transparent">' +
                '</div>';
        } else if (l.type === 'image') {
            specific =
                '<button id="imged-removebg-btn" onclick="imgEdRemoveBg()" class="w-full mb-2 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white text-xs font-extrabold shadow hover:opacity-90 transition disabled:opacity-50">' +
                    '<i data-lucide="wand-2" class="w-4 h-4"></i> Remover fundo (IA · ' + AI_COST_REMOVE_BG + ' créditos)' +
                '</button>';
        }

        wrap.innerHTML =
            '<p class="imged-label">Propriedades — ' + (l.type === 'text' ? 'Texto' : l.type === 'image' ? 'Imagem' : 'Forma') + '</p>' +
            specific + common +
            '<button onclick="imgEdDelete()" class="mt-2 w-full text-[11px] font-bold text-red-500 hover:text-red-600 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition"><i data-lucide="trash-2" class="w-3 h-3 inline"></i> Apagar camada</button>';
        if (window.lucide && lucide.createIcons) { try { lucide.createIcons(); } catch (_) {} }
    }

    function refreshAll() { render(); renderLayerList(); syncProps(); saveDesign(); }
})();
