/* ==========================================================================
 * MONOFY — Tela inicial (hub estilo Canva)
 * --------------------------------------------------------------------------
 * Módulo separado do index.html (regra: cada módulo novo nasce em seu arquivo).
 * Carregado como <script src> comum, então compartilha o MESMO escopo global do
 * app (usa state, signOut, switchTab, loadFromHistory, startNewBlankProject,
 * generateSlidesWithAI, maybeStartOnboardingFlow etc. — todos globais).
 * NÃO usar type="module" aqui, senão os onclick inline e os globais quebram.
 * ==========================================================================*/

(function () {
    'use strict';

    function el(id) { return document.getElementById(id); }
    function safeName() {
        try {
            const p = window.state && state.profile;
            const raw = (p && (p.full_name || p.email)) || (window.state && state.session && state.session.user && state.session.user.email) || '';
            const first = String(raw).trim().split(/[\s@]+/)[0] || '';
            return first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
        } catch (_) { return ''; }
    }

    // Mostra o hub (esconde login e editor). Chamado logo após o login.
    window.enterHub = function enterHub() {
        const login = el('login-screen');
        const app = el('app-screen');
        const hub = el('hub-screen');
        if (login) { login.classList.add('opacity-0', 'pointer-events-none'); setTimeout(() => login.classList.add('hidden-state'), 400); }
        if (app) app.classList.add('opacity-0', 'pointer-events-none');
        if (!hub) return;
        renderHub();
        hub.classList.remove('hidden-state');
        requestAnimationFrame(() => hub.classList.remove('opacity-0', 'pointer-events-none'));
    };

    // Volta ao hub a partir do editor (botão "Início").
    window.goToHub = function goToHub() {
        exitFocus();
        var imed = el('image-editor-screen');
        if (imed) { imed.classList.add('opacity-0', 'pointer-events-none'); setTimeout(function () { imed.classList.add('hidden-state'); }, 350); }
        const app = el('app-screen');
        const hub = el('hub-screen');
        if (app) app.classList.add('opacity-0', 'pointer-events-none');
        if (!hub) return;
        renderHub();
        hub.classList.remove('hidden-state');
        requestAnimationFrame(() => hub.classList.remove('opacity-0', 'pointer-events-none'));
    };

    function hideHubShowApp() {
        const hub = el('hub-screen');
        const app = el('app-screen');
        if (hub) { hub.classList.add('opacity-0', 'pointer-events-none'); setTimeout(() => hub.classList.add('hidden-state'), 350); }
        if (app) app.classList.remove('opacity-0', 'pointer-events-none');
        if (typeof updateCoverPage === 'function') { try { updateCoverPage(); } catch (_) {} }
    }

    // ---- Modo foco: abre UMA aba (Perfil, Slides, Ajustes) como página própria,
    // escondendo o dock e a "moldura" do editor. Um botão flutuante "Início" volta ao hub.
    function ensureBackBtn() {
        var b = el('hub-focus-back');
        if (b) return b;
        b = document.createElement('button');
        b.id = 'hub-focus-back';
        b.className = 'hub-focus-back';
        b.innerHTML = '<i data-lucide="arrow-left" class="w-4 h-4"></i> Início';
        b.onclick = function () { window.goToHub(); };
        document.body.appendChild(b);
        if (window.lucide && lucide.createIcons) { try { lucide.createIcons(); } catch (_) {} }
        return b;
    }
    function exitFocus() { document.body.classList.remove('hub-focus'); }

    // Abre uma aba do app em modo foco (página própria, sem o dock/editor por trás).
    window.enterAppFocus = function enterAppFocus(tab) {
        hideHubShowApp();
        document.body.classList.add('hub-focus');
        ensureBackBtn();
        setTimeout(function () {
            try { if (typeof switchTab === 'function') switchTab(tab); } catch (_) {}
        }, 380);
    };

    // Card "Editor de trabalhos": abre o editor com o trabalho atual/último.
    // Se for conta nova (sem modelo escolhido ainda), dispara o seletor de modelo.
    window.hubOpenEditor = function hubOpenEditor() {
        exitFocus(); // editor completo = com dock e tudo
        hideHubShowApp();
        try {
            if (typeof switchTab === 'function') switchTab('generator');
            if (window.state && state.session && typeof maybeStartOnboardingFlow === 'function') {
                maybeStartOnboardingFlow(state.session);
            }
        } catch (_) {}
    };

    // Card "Novo projeto": abre o editor já limpando para um trabalho novo.
    window.hubNewProject = function hubNewProject() {
        hideHubShowApp();
        setTimeout(() => { try { if (typeof startNewBlankProject === 'function') startNewBlankProject(); } catch (_) {} }, 380);
    };

    // Card "Criar slides": abre os Slides como PÁGINA PRÓPRIA (modo foco, sem o
    // editor de trabalhos por trás) e já abre o seletor (arquivo / monografia / manual).
    window.hubCreateSlides = function hubCreateSlides() {
        window.enterAppFocus('slides');
        setTimeout(() => { try { if (typeof generateSlidesWithAI === 'function') generateSlidesWithAI(); } catch (_) {} }, 700);
    };

    // Card "Editor de imagem / Logos": abre o módulo image-editor.js.
    window.hubOpenImageEditor = function hubOpenImageEditor() {
        if (typeof window.openImageEditor === 'function') {
            window.openImageEditor();
        } else {
            alert('O Editor de Imagem ainda está carregando. Tente de novo em alguns segundos.');
        }
    };

    // Abre um projeto do histórico direto do hub (editor completo).
    window.hubOpenProject = function hubOpenProject(id) {
        exitFocus();
        hideHubShowApp();
        setTimeout(() => { try { if (typeof loadFromHistory === 'function') loadFromHistory(id); } catch (_) {} }, 380);
    };

    // Atalhos do topo do hub que precisam entrar no app primeiro.
    window.hubGoTab = function hubGoTab(tab) {
        hideHubShowApp();
        setTimeout(() => { try { if (typeof switchTab === 'function') switchTab(tab); } catch (_) {} }, 380);
    };

    var _autoPulled = false;

    function driveOn() { return typeof window.driveIsConnected === 'function' && window.driveIsConnected(); }

    function driveStatusHtml() {
        if (driveOn()) {
            return '<div class="flex items-center gap-2">' +
                '<span id="hub-drive-status-text" class="text-[11px] text-slate-400 hidden sm:inline"></span>' +
                '<button onclick="hubSyncDrive()" id="hub-drive-sync-btn" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition"><i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Sincronizar</button>' +
                '</div>';
        }
        return '<span class="text-[11px] text-slate-400 flex items-center gap-1"><i data-lucide="cloud-off" class="w-3.5 h-3.5"></i> Drive não conectado</span>';
    }

    // Puxa manualmente os projetos do Drive e re-renderiza o hub.
    window.hubSyncDrive = async function () {
        if (!driveOn()) return;
        var btn = el('hub-drive-sync-btn');
        var orig = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Sincronizando...'; if (window.lucide) lucide.createIcons(); }
        var n = 0;
        try { n = await window.drivePullProjects(true); } catch (_) {}
        renderHub();
        if (window.driveStatusMark) driveStatusMark(n > 0 ? (n + ' projeto(s) trazido(s) do Drive') : 'Tudo sincronizado ✓');
    };

    function historyCardsHtml() {
        var hist = (window.state && Array.isArray(state.history)) ? state.history : [];
        var cards = '';
        // Card fixo: novo projeto em branco.
        cards += '' +
            '<button onclick="hubNewProject()" class="hub-proj-card group text-left rounded-2xl border-2 border-dashed border-primary-300 dark:border-primary-700/50 bg-white/60 dark:bg-slate-800/40 hover:border-primary-500 hover:-translate-y-0.5 transition-all p-5 flex flex-col items-center justify-center min-h-[150px]">' +
            '<div class="w-12 h-12 rounded-2xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform"><i data-lucide="plus" class="w-6 h-6 text-primary-600 dark:text-primary-400"></i></div>' +
            '<span class="font-bold text-slate-700 dark:text-slate-200 text-sm">Novo projeto em branco</span>' +
            '</button>';
        hist.forEach(function (doc) {
            var title = (doc.title || 'Sem título').replace(/</g, '&lt;');
            var date = (doc.date || '').replace(/</g, '&lt;');
            var nSlides = (doc.slides && doc.slides.length) ? doc.slides.length : 0;
            var nSec = (doc.sections && doc.sections.length) ? doc.sections.length : 0;
            var driveBadge = doc.driveId
                ? '<span title="Salvo no Google Drive" class="shrink-0 text-emerald-500"><i data-lucide="cloud" class="w-4 h-4"></i></span>'
                : '';
            cards += '' +
                '<div class="hub-proj-card group rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all p-5 flex flex-col min-h-[150px]">' +
                '<div class="flex items-center justify-between mb-3">' +
                    '<div class="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400"><i data-lucide="book-open" class="w-5 h-5"></i></div>' +
                    driveBadge +
                '</div>' +
                '<h4 class="font-extrabold text-slate-800 dark:text-white text-sm leading-tight mb-1 line-clamp-2" title="' + title + '">' + title + '</h4>' +
                '<p class="text-[11px] text-slate-400 mb-3 flex items-center gap-1"><i data-lucide="clock" class="w-3 h-3"></i> ' + date + '</p>' +
                '<div class="text-[11px] text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-3">' +
                    '<span class="flex items-center gap-1"><i data-lucide="file-text" class="w-3 h-3"></i> ' + nSec + '</span>' +
                    '<span class="flex items-center gap-1"><i data-lucide="presentation" class="w-3 h-3"></i> ' + nSlides + '</span>' +
                '</div>' +
                '<button onclick="hubOpenProject(\'' + doc.id + '\')" class="mt-auto w-full py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold hover:bg-primary-600 hover:text-white transition-colors">Abrir e editar</button>' +
                '</div>';
        });
        return cards;
    }

    function renderHub() {
        var hub = el('hub-screen');
        if (!hub) return;
        var name = safeName();
        var greeting = name ? ('Olá, ' + name + '! 👋') : 'Olá! 👋';
        hub.innerHTML =
        '<div class="min-h-full w-full overflow-y-auto bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 custom-scrollbar">' +
            // Topo
            '<header class="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-slate-900/70 border-b border-slate-200/60 dark:border-slate-800/60">' +
                '<div class="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">' +
                    '<div class="flex items-center gap-2 select-none">' +
                        '<img src="icon/icon.png" alt="Monofy" class="w-9 h-9 rounded-xl object-contain shadow-md">' +
                        '<span class="font-black tracking-tight text-lg text-slate-800 dark:text-white">MONOFY</span>' +
                    '</div>' +
                    '<div class="flex items-center gap-2">' +
                        '<button onclick="enterAppFocus(\'settings\')" title="Ajustes e chave do Gemini" class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 text-xs font-bold hover:bg-primary-100 dark:hover:bg-primary-900/40 transition"><i data-lucide="settings-2" class="w-4 h-4"></i> Ajustes</button>' +
                        '<button onclick="enterAppFocus(\'myprofile\')" title="Meu perfil" class="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"><i data-lucide="user-circle" class="w-4 h-4"></i></button>' +
                        '<button onclick="signOut()" title="Sair" class="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"><i data-lucide="log-out" class="w-4 h-4"></i></button>' +
                    '</div>' +
                '</div>' +
            '</header>' +

            '<main class="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">' +
                '<h1 class="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mb-1">' + greeting + '</h1>' +
                '<p class="text-slate-500 dark:text-slate-400 mb-8">O que vamos criar hoje?</p>' +

                // Cards principais (estilo Canva)
                '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 mb-12">' +
                    hubMainCard('hubOpenEditor()', 'file-text', 'from-indigo-500 to-violet-600', 'Editor de trabalhos', 'Escreva e formate monografias, informes e trabalhos com IA — e monte os slides.') +
                    hubMainCard('hubCreateSlides()', 'presentation', 'from-sky-500 to-cyan-600', 'Criar slides', 'Envie um arquivo e a IA monta a apresentação, use sua monografia, ou faça manualmente.') +
                    hubMainCard('hubOpenImageEditor()', 'image', 'from-fuchsia-500 to-pink-600', 'Editor de imagem / Logos', 'Crie e edite logos, remova o fundo com IA e exporte PNG transparente.') +
                '</div>' +

                // Histórico
                '<div class="flex items-center justify-between mb-4 gap-3 flex-wrap">' +
                    '<h2 class="text-lg font-extrabold text-slate-800 dark:text-white flex items-center gap-2"><i data-lucide="folder" class="w-5 h-5 text-primary-500"></i> Seus projetos</h2>' +
                    driveStatusHtml() +
                '</div>' +
                '<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">' + historyCardsHtml() + '</div>' +

                '<p class="text-center text-[11px] text-slate-400 mt-10">' + (driveOn()
                    ? 'Seus projetos são salvos neste aparelho e sincronizados na pasta "Monofy" do seu Google Drive.'
                    : 'Seus projetos ficam salvos neste aparelho. Entre com o Google para sincronizar na nuvem.') + '</p>' +
            '</main>' +
        '</div>';

        if (window.lucide && typeof lucide.createIcons === 'function') { try { lucide.createIcons(); } catch (_) {} }

        // Primeira vez que o hub abre com o Drive conectado: puxa os projetos da nuvem
        // em segundo plano e re-renderiza se algo novo chegou (não trava a tela).
        if (driveOn() && !_autoPulled && typeof window.drivePullProjects === 'function') {
            _autoPulled = true;
            window.drivePullProjects(false).then(function (n) { if (n > 0) renderHub(); }).catch(function () {});
        }
    }

    function hubMainCard(onclick, icon, grad, title, desc) {
        return '' +
        '<button onclick="' + onclick + '" class="hub-main-card group text-left rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all">' +
            '<div class="w-14 h-14 rounded-2xl bg-gradient-to-br ' + grad + ' flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform"><i data-lucide="' + icon + '" class="w-7 h-7 text-white"></i></div>' +
            '<h3 class="font-extrabold text-slate-900 dark:text-white text-base mb-1">' + title + '</h3>' +
            '<p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">' + desc + '</p>' +
        '</button>';
    }

    function hubMainCardSoon(onclick, icon, grad, title, desc) {
        return '' +
        '<button onclick="' + onclick + '" class="hub-main-card group text-left rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all relative">' +
            '<span class="absolute top-4 right-4 text-[10px] px-2 py-0.5 rounded-full bg-fuchsia-100 dark:bg-fuchsia-900/40 text-fuchsia-700 dark:text-fuchsia-300 font-bold">Em breve</span>' +
            '<div class="w-14 h-14 rounded-2xl bg-gradient-to-br ' + grad + ' flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform"><i data-lucide="' + icon + '" class="w-7 h-7 text-white"></i></div>' +
            '<h3 class="font-extrabold text-slate-900 dark:text-white text-base mb-1">' + title + '</h3>' +
            '<p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">' + desc + '</p>' +
        '</button>';
    }
})();
