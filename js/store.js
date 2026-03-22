// Data layer: load, save, migrate, import, export
// Depends on: auth, db (from firebase.js), Vue refs passed in

function createStore({ boards, activeBoardId, themeColor, syncStatus, user, showToast, showConfirm, initSortable }) {

    const migrateBoardsFormat = (boardsData) => {
        boardsData.forEach(b => {
            if (!b.columns) return;
            b.columns.forEach(col => {
                if (!col.categories) return;
                col.categories.forEach(cat => {
                    if (!cat.bookmarks) return;
                    const subcategories = [];
                    let currentSub = { id: 'sub-' + Math.random().toString(36).substr(2, 9), title: null, bookmarks: [] };
                    subcategories.push(currentSub);
                    cat.bookmarks.forEach(bm => {
                        if (bm.type === 'divider') {
                            if (currentSub.title === null && currentSub.bookmarks.length === 0 && subcategories.length > 1) subcategories.pop();
                            currentSub = { id: bm.id, title: bm.title, bookmarks: [] };
                            subcategories.push(currentSub);
                        } else {
                            currentSub.bookmarks.push(bm);
                        }
                    });
                    cat.subcategories = subcategories.filter(s => s.bookmarks.length > 0 || s.title !== null || subcategories.length === 1);
                    delete cat.bookmarks;
                });
            });
        });
    };

    const initDefaultData = () => {
        const def = {
            id: Date.now(), title: 'Home', icon: 'fas fa-bookmark',
            columns: [{ id: 'c1', width: 280, categories: [{
                id: 'cat1', title: 'Example',
                subcategories: [{ id: 'sub1', title: null, bookmarks: [{
                    id: 'b1', title: 'Google', url: 'https://google.com', type: 'link',
                    icon: 'https://www.google.com/s2/favicons?domain=google.com'
                }]}]
            }]}]
        };
        boards.value = [def];
        activeBoardId.value = def.id;
    };

    const loadLocalData = () => {
        let saved = localStorage.getItem('myPapalyData_v19')
            || localStorage.getItem('myPapalyData_v18')
            || localStorage.getItem('myPapalyData_v16');
        if (saved) {
            try {
                const p = JSON.parse(saved);
                boards.value = p.boards || [];
                activeBoardId.value = p.activeBoardId;
                themeColor.value = p.themeColor || 'blue';
            } catch (e) {}
        }
        migrateBoardsFormat(boards.value);
        if (boards.value.length === 0) initDefaultData();
    };

    const syncToCloud = async () => {
        if (!user.value || !db) return;
        syncStatus.value = { show: true, state: 'saving' };
        try {
            await db.collection("users").doc(user.value.uid).set({
                boards: boards.value,
                activeBoardId: activeBoardId.value,
                themeColor: themeColor.value,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            syncStatus.value = { show: true, state: 'saved' };
            setTimeout(() => syncStatus.value.show = false, 2000);
        } catch (e) {
            console.error(e);
            syncStatus.value = { show: true, state: 'error' };
        }
    };

    let saveTimeout;
    const debouncedSave = () => {
        localStorage.setItem('myPapalyData_v19', JSON.stringify({
            boards: boards.value, activeBoardId: activeBoardId.value, themeColor: themeColor.value
        }));
        if (user.value) {
            clearTimeout(saveTimeout);
            syncStatus.value = { show: true, state: 'saving' };
            saveTimeout = setTimeout(syncToCloud, 2000);
        }
    };

    const saveData = () => debouncedSave();

    const resetData = (showConfirm) => {
        showConfirm("Are you sure you want to clear all data and reset? This cannot be undone.", () => {
            localStorage.removeItem('myPapalyData_v19');
            location.reload();
        }, true);
    };

    // ── Import / Export ──

    const distributeCategoriesToColumns = (categories, columnCount = 4) => {
        const columns = Array.from({ length: columnCount }, () => ({
            id: 'col-' + Math.random().toString(36).substr(2, 9), width: 280, categories: [], _h: 0
        }));
        categories.forEach(cat => {
            const h = 40 + (cat.subcategories
                ? cat.subcategories.reduce((a, s) => a + (s.title ? 30 : 0) + (s.bookmarks ? s.bookmarks.length * 24 : 0), 0)
                : 0);
            let mi = 0;
            for (let i = 1; i < columns.length; i++) if (columns[i]._h < columns[mi]._h) mi = i;
            columns[mi].categories.push(cat);
            columns[mi]._h += h;
        });
        columns.forEach(c => delete c._h);
        return columns;
    };

    const importHtml = (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(ev.target.result, 'text/html');
            const rootDl = doc.querySelector('dl'); if (!rootDl) return alert("无效文件");
            const newBoards = [];

            const parseBookmarksToSubcats = (dl) => {
                const subcategories = [];
                let currentSub = { id: 'sub-' + Math.random(), title: null, bookmarks: [] };
                subcategories.push(currentSub);
                Array.from(dl.children).forEach(node => {
                    if (node.tagName !== 'DT') return;
                    const a = node.querySelector('a'), h3 = node.querySelector('h3'), subDl = node.querySelector('dl');
                    if (a) {
                        const icon = a.getAttribute('data-icon') || `https://www.google.com/s2/favicons?domain=${new URL(a.href).origin}&sz=32`;
                        currentSub.bookmarks.push({ id: 'bm-' + Math.random(), title: a.textContent.trim(), url: a.href, type: 'link', icon, note: a.getAttribute('data-note') || '' });
                    } else if (h3) {
                        currentSub = { id: 'sub-' + Math.random(), title: h3.textContent.trim(), bookmarks: [] };
                        subcategories.push(currentSub);
                        if (subDl) currentSub.bookmarks.push(...parseBookmarksToSubcats(subDl).flatMap(s => s.bookmarks));
                    }
                });
                return subcategories.filter(s => s.bookmarks.length > 0 || s.title !== null || subcategories.length === 1);
            };

            Array.from(rootDl.children).forEach(dt => {
                if (dt.tagName !== 'DT') return;
                const h3 = dt.querySelector('h3'), dl = dt.querySelector('dl');
                if (!h3 || !dl) return;
                const allCategories = [];
                Array.from(dl.children).forEach(catDt => {
                    if (catDt.tagName !== 'DT') return;
                    const catH3 = catDt.querySelector('h3'), catDl = catDt.querySelector('dl');
                    if (catH3 && catDl) {
                        allCategories.push({ id: 'cat-' + Math.random().toString(36).substr(2, 9), title: catH3.textContent.trim(), subcategories: parseBookmarksToSubcats(catDl) });
                    } else {
                        const link = catDt.querySelector('a');
                        if (link) {
                            let unc = allCategories.find(c => c.title === "未分类");
                            if (!unc) { unc = { id: 'cat-uncat', title: "未分类", subcategories: [{ id: 'sub-uncat', title: null, bookmarks: [] }] }; allCategories.push(unc); }
                            unc.subcategories[0].bookmarks.push({ id: 'bm-' + Math.random(), title: link.textContent.trim(), url: link.href, type: 'link' });
                        }
                    }
                });
                newBoards.push({ id: Date.now() + Math.random(), title: h3.textContent.trim(), icon: 'fas fa-columns', columns: distributeCategoriesToColumns(allCategories, 4) });
            });

            if (newBoards.length > 0) {
                boards.value = [...boards.value, ...newBoards];
                activeBoardId.value = boards.value[0].id;
                saveData(); setTimeout(initSortable, 100);
                showToast(`Imported ${newBoards.length} collections (Appended)`);
            } else {
                showToast("未识别到有效数据", "error");
            }
        };
        reader.readAsText(file);
    };

    const exportHtml = () => {
        let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n`;
        boards.value.forEach(board => {
            html += `    <DT><H3>${board.title}</H3>\n    <DL><p>\n`;
            board.columns.forEach(col => {
                col.categories.forEach(cat => {
                    html += `        <DT><H3>${cat.title}</H3>\n        <DL><p>\n`;
                    cat.subcategories.forEach(sub => {
                        if (sub.title !== null) html += `            <DT><H3>${sub.title}</H3><DL></DL>\n`;
                        sub.bookmarks.forEach(bm => {
                            const iconAttr = bm.icon ? ` data-icon="${bm.icon}"` : '';
                            const noteAttr = bm.note ? ` data-note="${bm.note.replace(/"/g, '&quot;')}"` : '';
                            html += `            <DT><A HREF="${bm.url}"${iconAttr}${noteAttr}>${bm.title}</A>\n`;
                        });
                    });
                    html += `        </DL><p>\n`;
                });
            });
            html += `    </DL><p>\n`;
        });
        html += `</DL>`;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
        a.download = `papaly_backup.html`;
        a.click();
    };

    return { loadLocalData, saveData, syncToCloud, migrateBoardsFormat, resetData, importHtml, exportHtml };
}
