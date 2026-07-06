/* ==========================================================================
 * MONOFY — Sincronização de projetos com o Google Drive (Fase D)
 * --------------------------------------------------------------------------
 * Módulo em arquivo próprio. Script clássico: usa o escopo global do app
 * (state, driveApiRequest, localStorage do histórico). NÃO usar type="module".
 *
 * Salva cada projeto (a mesma entrada do histórico: título, seções, referências,
 * capa, slides) como um JSON dentro de uma pasta "Monofy" no Drive do usuário,
 * usando o escopo drive.file (só enxerga os arquivos que o próprio app criou).
 * Assim o histórico do hub sincroniza entre aparelhos: salva na conta, e ao abrir
 * em outro lugar o site lê o arquivo e traz o projeto de volta.
 * ==========================================================================*/

(function () {
    'use strict';

    var FOLDER = 'Monofy';
    var _folderId = null;
    var _pulled = false;
    var _inFlight = {}; // evita salvar o mesmo projeto em paralelo

    function on() { return !!(window.state && state.driveAccessToken) && !state.isDemo; }
    function tok() { return state.driveAccessToken; }
    function persistHistory() { try { localStorage.setItem('monografia_history', JSON.stringify(state.history || [])); } catch (_) {} }

    window.driveIsConnected = on;

    async function ensureFolder() {
        if (_folderId) return _folderId;
        var q = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and name='" + FOLDER + "' and trashed=false");
        var data = await driveApiRequest('/files?q=' + q + '&fields=files(id,name)&spaces=drive');
        if (data.files && data.files.length) { _folderId = data.files[0].id; return _folderId; }
        var res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + tok(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' })
        });
        if (!res.ok) throw new Error('folder ' + res.status);
        _folderId = (await res.json()).id;
        return _folderId;
    }

    async function uploadJson(fileName, obj, existingId, parentId) {
        var meta = { name: fileName, mimeType: 'application/json' };
        if (!existingId && parentId) meta.parents = [parentId];
        var form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
        form.append('file', new Blob([JSON.stringify(obj)], { type: 'application/json' }));
        var url = existingId
            ? 'https://www.googleapis.com/upload/drive/v3/files/' + existingId + '?uploadType=multipart&fields=id'
            : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
        var res = await fetch(url, { method: existingId ? 'PATCH' : 'POST', headers: { Authorization: 'Bearer ' + tok() }, body: form });
        if (!res.ok) throw new Error('upload ' + res.status);
        return (await res.json()).id;
    }

    // Salva/atualiza UM projeto (entrada do histórico) como JSON no Drive.
    // Fire-and-forget: nunca lança pra fora (falha de rede não pode quebrar o app).
    window.driveSaveProject = async function (doc) {
        if (!on() || !doc || !doc.id) return null;
        if (_inFlight[doc.id]) return null;
        _inFlight[doc.id] = true;
        try {
            var folder = await ensureFolder();
            var fileName = 'projeto-' + doc.id + '.monofy.json';
            var payload = { app: 'monofy', kind: 'project', savedAt: Date.now(), project: doc };
            var id = await uploadJson(fileName, payload, doc.driveId || null, folder);
            if (doc.driveId !== id) { doc.driveId = id; persistHistory(); }
            _markDriveStatus('Salvo no Google Drive · ' + new Date().toLocaleTimeString());
            return id;
        } catch (e) {
            console.warn('driveSaveProject', e);
            if (String(e.message).indexOf('401') !== -1) { try { state.driveAccessToken = null; } catch (_) {} }
            return null;
        } finally {
            delete _inFlight[doc.id];
        }
    };

    async function listProjects() {
        var folder = await ensureFolder();
        var q = encodeURIComponent("'" + folder + "' in parents and name contains '.monofy.json' and trashed=false");
        var data = await driveApiRequest('/files?q=' + q + '&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&spaces=drive');
        return data.files || [];
    }

    async function download(fileId) {
        var res = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media', { headers: { Authorization: 'Bearer ' + tok() } });
        if (!res.ok) throw new Error('download ' + res.status);
        return res.json();
    }

    // Puxa do Drive os projetos que ainda não estão no histórico local e os adiciona.
    // Retorna quantos foram adicionados (para o hub re-renderizar se > 0).
    window.drivePullProjects = async function (force) {
        if (!on()) return 0;
        if (_pulled && !force) return 0;
        _pulled = true;
        try {
            var files = await listProjects();
            state.history = state.history || [];
            var known = {};
            state.history.forEach(function (d) { known[d.id] = true; if (d.driveId) known[d.driveId] = true; });
            var added = 0;
            for (var i = 0; i < files.length; i++) {
                var f = files[i];
                var m = f.name.match(/^projeto-(.+)\.monofy\.json$/);
                var pid = m ? m[1] : null;
                if (pid && known[pid]) continue;
                if (known[f.id]) continue;
                try {
                    var content = await download(f.id);
                    var proj = content && content.project;
                    if (proj && proj.id && !known[proj.id]) {
                        proj.driveId = f.id;
                        state.history.push(proj);
                        known[proj.id] = true;
                        added++;
                    }
                } catch (_) {}
            }
            if (added) persistHistory();
            return added;
        } catch (e) {
            console.warn('drivePullProjects', e);
            return 0;
        }
    };

    // Reflete um status curto de sincronização no hub (se o elemento existir).
    function _markDriveStatus(text) {
        var el = document.getElementById('hub-drive-status-text');
        if (el) el.textContent = text;
    }
    window.driveStatusMark = _markDriveStatus;
})();
