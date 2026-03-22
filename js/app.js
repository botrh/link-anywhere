const { createApp, ref, computed, onMounted, nextTick, watch } = Vue;

createApp({
    setup() {
        // ── State ──
        const boards = ref([]);
        const activeBoardId = ref(null);
        const user = ref(null);
        const syncStatus = ref({ show: false, state: '' });
        const themeColor = ref('blue');
        const searchQuery = ref('');
        const searchOverlayOpen = ref(false);
        const viewMode = ref('card');
        const isDark = ref(localStorage.getItem('theme-dark') === 'true');
        const toasts = ref([]);
        const confirmData = ref({ show: false, message: '', onConfirm: null, isDanger: false });
        const showSettings = ref(false);
        const modalInput = ref(null);
        const modal = ref({ show: false, isEdit: false, isBoard: false, isDivider: false, categoryId: null, data: { id: null, title: '', url: '' } });
        const dragTargetBoardId = ref(null);
        const mergeTargetCatId = ref(null);
        const draggingCategoryInfo = ref(null);
        const analyzingUrl = ref(false);
        const iconDropdownOpen = ref(false);
        const iconDropdownStyle = ref({});
        const iconTriggerRef = ref(null);
        const boardContainer = ref(null);
        const resizing = ref(null);

        // ── Theme ──
        watch(isDark, (val) => {
            localStorage.setItem('theme-dark', val);
            document.documentElement.classList.toggle('dark', val);
        }, { immediate: true });

        // ── Toast / Confirm ──
        const showToast = (message, type = 'success') => {
            const id = Date.now() + Math.random();
            toasts.value.push({ id, message, type });
            setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, 3000);
        };
        const showConfirm = (message, onConfirm, isDanger = false) => {
            confirmData.value = { show: true, message, onConfirm, isDanger };
        };
        const closeConfirm = () => confirmData.value.show = false;
        const executeConfirm = () => { if (confirmData.value.onConfirm) confirmData.value.onConfirm(); closeConfirm(); };

        // ── Computed ──
        const activeBoard = computed(() => activeBoardId.value ? (boards.value.find(b => b.id === activeBoardId.value) || null) : null);
        const modalTitle = computed(() => {
            if (modal.value.isBoard) return modal.value.isEdit ? 'Edit Collection' : 'New Collection';
            if (modal.value.isDivider) return modal.value.isEdit ? 'Edit Subcategory' : 'Add Subcategory';
            return modal.value.isEdit ? 'Edit' : 'Add';
        });
        const flatSearchResults = computed(() => {
            if (!searchQuery.value) return [];
            const q = searchQuery.value.toLowerCase();
            const results = [];
            boards.value.forEach(b => {
                b.columns.forEach(col => {
                    col.categories.forEach(cat => {
                        if (!cat.subcategories) return;
                        cat.subcategories.forEach(sub => {
                            sub.bookmarks.forEach(bm => {
                                if (bm.title.toLowerCase().includes(q) || (bm.url && bm.url.toLowerCase().includes(q))) {
                                    results.push({ board: b.title, category: cat.title + (sub.title ? ` > ${sub.title}` : ''), bookmark: bm });
                                }
                            });
                        });
                    });
                });
            });
            return results;
        });

        const filterCategories = (categories) => {
            if (!searchQuery.value) return categories;
            const q = searchQuery.value.toLowerCase();
            return categories.map(cat => {
                const match = cat.title.toLowerCase().includes(q);
                const bms = (cat.bookmarks || []).filter(bm => bm.title.toLowerCase().includes(q) || (bm.url && bm.url.toLowerCase().includes(q)) || bm.type === 'divider');
                if (match || bms.length > 0) return { ...cat, bookmarks: match ? cat.bookmarks : bms };
                return null;
            }).filter(Boolean);
        };

        const highlightText = (text) => {
            if (!searchQuery.value) return text;
            return text.replace(new RegExp(`(${searchQuery.value})`, 'gi'), '<mark class="search-highlight">$1</mark>');
        };

        // ── Sortable ──
        const { initSortable, onDragOverCollection: _onDragOver, onDragLeaveCollection: _onDragLeave, onDropToCollection: _onDrop, onMergeDragOver, onMergeDragLeave, onMergeDrop: _onMergeDrop } = createSortable({ activeBoard, saveData: () => debouncedSave(), draggingCategoryInfo, mergeTargetCatId, nextTick });

        const onDragOverCollection = (boardId) => _onDragOver(boardId, activeBoardId, dragTargetBoardId);
        const onDragLeaveCollection = (boardId) => _onDragLeave(boardId, dragTargetBoardId);
        const onDropToCollection = (targetBoardId) => _onDrop({ targetBoardId, activeBoardId, boards, dragTargetBoardId, saveData: () => debouncedSave() });
        const onMergeDrop = (targetCatId) => _onMergeDrop(targetCatId, { activeBoardId, boards, saveData: () => debouncedSave() });
        const moveCategoryToCollection = (currentColId, category, targetBoardId) => {
            showConfirm("Move to target collection?", () => {
                draggingCategoryInfo.value = { columnId: currentColId, category };
                onDropToCollection(targetBoardId);
            });
        };

        // ── Store ──
        const store = createStore({ boards, activeBoardId, themeColor, syncStatus, user, showToast, showConfirm, initSortable });
        const { loadLocalData, saveData, syncToCloud, migrateBoardsFormat, resetData: _resetData, importHtml, exportHtml } = store;
        const debouncedSave = saveData;
        const resetData = () => _resetData(showConfirm);

        // ── Auth ──
        const login = () => {
            if (auth) {
                const p = new firebase.auth.GoogleAuthProvider();
                auth.signInWithPopup(p).then(() => showToast('Login successful!')).catch(e => showToast(e.message, 'error'));
            } else {
                showToast("请先配置代码中的 firebaseConfig", "error");
            }
        };
        const logout = () => {
            if (auth) auth.signOut().then(() => { user.value = null; showToast("Signed out, back to local mode"); });
        };

        // ── Column / Category / Bookmark CRUD ──
        const switchBoard = (id) => { activeBoardId.value = id; saveData(); setTimeout(initSortable, 100); };
        watch(activeBoardId, () => setTimeout(initSortable, 100));

        const startResize = (e, column) => { e.preventDefault(); resizing.value = { column, startX: e.pageX, startWidth: column.width || 280 }; document.body.style.cursor = 'col-resize'; };
        const doResize = (e) => { if (!resizing.value) return; let w = resizing.value.startWidth + (e.pageX - resizing.value.startX); resizing.value.column.width = Math.min(600, Math.max(180, w)); };
        const stopResize = () => { if (resizing.value) { resizing.value = null; document.body.style.cursor = ''; saveData(); } };

        const openCreateBoardModal = () => { modal.value = { show: true, isEdit: false, isBoard: true, data: { title: '', icon: 'fas fa-bookmark' } }; nextTick(() => modalInput.value?.focus()); };
        const openEditBoardModal = (id) => { const b = boards.value.find(b => b.id === id); if (!b) return; modal.value = { show: true, isEdit: true, isBoard: true, data: { id: b.id, title: b.title, icon: b.icon || 'fas fa-bookmark' } }; nextTick(() => modalInput.value?.focus()); };
        const deleteBoard = (id) => { if (boards.value.length <= 1) { showToast("Cannot delete the last collection", "error"); return; } showConfirm("Delete this collection?", () => { boards.value = boards.value.filter(b => b.id !== id); if (activeBoardId.value === id) activeBoardId.value = boards.value[0].id; saveData(); }, true); };
        const deleteBoardFromModal = () => { const id = modal.value.data.id; modal.value.show = false; deleteBoard(id); };

        const createColumn = () => { if (!activeBoard.value) return; activeBoard.value.columns.push({ id: 'col-' + Date.now(), width: 280, categories: [] }); saveData(); setTimeout(initSortable, 50); };
        const deleteColumn = (id) => { showConfirm("Delete this entire column?", () => { activeBoard.value.columns = activeBoard.value.columns.filter(c => c.id !== id); saveData(); }, true); };

        const createCategory = (colId) => {
            let col;
            if (colId) { col = activeBoard.value.columns.find(c => c.id === colId); }
            else if (activeBoard.value) {
                if (activeBoard.value.columns.length === 0) activeBoard.value.columns.push({ id: 'col-' + Date.now(), width: 280, categories: [] });
                col = activeBoard.value.columns[0];
            }
            if (!col) return;
            const newId = 'cat-' + Date.now();
            col.categories.push({ id: newId, title: 'New Category', subcategories: [{ id: 'sub-' + Date.now(), title: null, bookmarks: [] }] });
            saveData(); setTimeout(initSortable, 50);
            nextTick(() => setTimeout(() => {
                const input = document.querySelector(`[data-cat-id="${newId}"] input`);
                if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
            }, 40));
        };
        const deleteCategory = (colId, catId) => { showConfirm("Delete this category and its bookmarks?", () => { const col = activeBoard.value.columns.find(c => c.id === colId); col.categories = col.categories.filter(c => c.id !== catId); saveData(); }, true); };

        const addBookmark = (catId) => { modal.value = { show: true, categoryId: catId, subId: null, data: { title: '', url: '', icon: '', note: '' } }; nextTick(() => modalInput.value?.focus()); };
        const addSubCategory = (catId) => { modal.value = { show: true, isDivider: true, isEdit: false, categoryId: catId, data: { title: '' } }; nextTick(() => modalInput.value?.focus()); };
        const editSubcategory = (catId, sub) => { modal.value = { show: true, isDivider: true, isEdit: true, categoryId: catId, data: { id: sub.id, title: sub.title } }; nextTick(() => modalInput.value?.focus()); };
        const deleteSubcategory = (catId, subId) => {
            showConfirm("Delete this subcategory and all its bookmarks?", () => {
                for (const col of activeBoard.value.columns) {
                    const cat = col.categories.find(c => c.id === catId);
                    if (cat) { cat.subcategories = cat.subcategories.filter(s => s.id !== subId); if (cat.subcategories.length === 0) cat.subcategories.push({ id: 'sub-' + Date.now(), title: null, bookmarks: [] }); break; }
                }
                saveData();
            }, true);
        };
        const editBookmark = (catId, subId, bm) => { modal.value = { show: true, isEdit: true, isDivider: false, categoryId: catId, subId, data: { ...bm, icon: bm.icon || '', note: bm.note || '' } }; nextTick(() => modalInput.value?.focus()); };
        const deleteBookmark = (catId, subId, bmId) => {
            for (const col of activeBoard.value.columns) {
                const cat = col.categories.find(c => c.id === catId);
                if (cat) { const sub = cat.subcategories.find(s => s.id === subId); if (sub) { sub.bookmarks = sub.bookmarks.filter(b => b.id !== bmId); break; } }
            }
            saveData();
        };

        const handleEnterKey = () => { if (modal.value.isBoard || modal.value.isDivider || modal.value.data.title) saveModal(); };

        const analyzeUrl = async () => {
            const url = modal.value.data.url; if (!url) return;
            analyzingUrl.value = true;
            try {
                const res = await fetch(`https://website-title.dfbwy233.workers.dev/?url=${encodeURIComponent(url)}`);
                const json = await res.json();
                if (json.title) { modal.value.data.title = json.title; if (!modal.value.data.icon) modal.value.data.icon = `https://www.google.com/s2/favicons?domain=${new URL(url).origin}&sz=64`; showToast('Title fetched'); }
                else showToast('Could not extract title', 'error');
            } catch (e) { showToast('Failed to fetch', 'error'); }
            finally { analyzingUrl.value = false; }
        };

        const saveModal = () => {
            const { categoryId, subId, data, isEdit, isBoard, isDivider } = modal.value;
            if (isBoard) {
                if (!data.title.trim()) return;
                if (isEdit) { const b = boards.value.find(b => b.id === data.id); if (b) { b.title = data.title; b.icon = data.icon || 'fas fa-bookmark'; saveData(); } }
                else { const nb = { id: Date.now(), title: data.title, icon: data.icon || 'fas fa-bookmark', columns: [{ id: 'c1', width: 280, categories: [] }] }; boards.value.push(nb); activeBoardId.value = nb.id; saveData(); }
            } else {
                let targetCat;
                for (const col of activeBoard.value.columns) { targetCat = col.categories.find(c => c.id === categoryId); if (targetCat) break; }
                if (!targetCat) return;
                if (isDivider) {
                    if (!data.title.trim()) return;
                    if (isEdit) { const sub = targetCat.subcategories.find(s => s.id === data.id); if (sub) sub.title = data.title; }
                    else { targetCat.subcategories.push({ id: 'sub-' + Date.now(), title: data.title, bookmarks: [] }); setTimeout(initSortable, 50); }
                } else {
                    if (!data.url) return;
                    if (!data.url.startsWith('http')) data.url = 'https://' + data.url;
                    if (!data.title) data.title = new URL(data.url).hostname.replace('www.', '');
                    let targetSub = subId ? targetCat.subcategories.find(s => s.id === subId) : targetCat.subcategories[targetCat.subcategories.length - 1];
                    if (!targetSub && targetCat.subcategories.length > 0) targetSub = targetCat.subcategories[0];
                    if (isEdit && targetSub) { const idx = targetSub.bookmarks.findIndex(b => b.id === data.id); if (idx !== -1) targetSub.bookmarks[idx] = { ...data }; }
                    else if (targetSub) targetSub.bookmarks.push({ id: 'bm-' + Date.now(), title: data.title, url: data.url, type: 'link', icon: data.icon || '', note: data.note || '' });
                }
                saveData();
            }
            modal.value.show = false;
        };

        // ── Icon dropdown ──
        const toggleIconDropdown = () => {
            if (!iconDropdownOpen.value && iconTriggerRef.value) {
                const rect = iconTriggerRef.value.getBoundingClientRect();
                iconDropdownStyle.value = { position: 'fixed', top: rect.bottom + 4 + 'px', left: rect.left + 'px', width: rect.width + 'px' };
            }
            iconDropdownOpen.value = !iconDropdownOpen.value;
        };

        const boardIcons = [
            'fas fa-bookmark','fas fa-home','fas fa-star','fas fa-heart','fas fa-fire',
            'fas fa-bolt','fas fa-globe','fas fa-link','fas fa-code','fas fa-terminal',
            'fas fa-database','fas fa-server','fas fa-cloud','fas fa-shield-alt','fas fa-lock',
            'fas fa-key','fas fa-tools','fas fa-wrench','fas fa-cog','fas fa-sliders-h',
            'fas fa-chart-bar','fas fa-chart-line','fas fa-chart-pie','fas fa-table','fas fa-th',
            'fas fa-columns','fas fa-list','fas fa-tasks','fas fa-clipboard','fas fa-sticky-note',
            'fas fa-file-alt','fas fa-folder','fas fa-folder-open','fas fa-archive','fas fa-box',
            'fas fa-book','fas fa-book-open','fas fa-graduation-cap','fas fa-pencil-alt','fas fa-pen',
            'fas fa-image','fas fa-photo-video','fas fa-film','fas fa-music','fas fa-headphones',
            'fas fa-gamepad','fas fa-dice','fas fa-puzzle-piece','fas fa-robot','fas fa-brain',
            'fas fa-flask','fas fa-atom','fas fa-microscope','fas fa-dna','fas fa-satellite',
            'fas fa-rocket','fas fa-plane','fas fa-car','fas fa-bicycle','fas fa-map-marker-alt',
            'fas fa-shopping-cart','fas fa-store','fas fa-credit-card','fas fa-wallet','fas fa-coins',
            'fas fa-briefcase','fas fa-building','fas fa-city','fas fa-users','fas fa-user-tie',
            'fas fa-envelope','fas fa-bell','fas fa-rss','fas fa-wifi','fas fa-mobile-alt',
            'fab fa-github','fab fa-gitlab','fab fa-bitbucket','fab fa-docker','fab fa-aws',
            'fab fa-google','fab fa-youtube','fab fa-twitter','fab fa-linkedin','fab fa-slack',
            'fab fa-figma','fab fa-notion','fab fa-trello','fab fa-jira','fab fa-confluence',
        ];

        // ── Helpers ──
        const getModalIcon = () => modal.value.isBoard ? 'fas fa-layer-group' : (modal.value.isDivider ? 'fas fa-minus' : 'fas fa-bookmark');
        const getFavicon = (url) => `https://www.google.com/s2/favicons?domain=${new URL(url).origin}&sz=32`;
        const handleImgError = (e) => e.target.src = "https://via.placeholder.com/32?text=•";
        const openUrl = (url) => { if (url) window.open(url.startsWith('http') ? url : 'https://' + url, '_blank'); };

        // ── Lifecycle ──
        onMounted(() => {
            loadLocalData();
            initSortable();
            if (auth) {
                auth.onAuthStateChanged(async (u) => {
                    user.value = u;
                    if (u) {
                        const doc = await db.collection("users").doc(u.uid).get();
                        if (doc.exists) {
                            const d = doc.data();
                            boards.value = d.boards || []; activeBoardId.value = d.activeBoardId; themeColor.value = d.themeColor || 'blue';
                            migrateBoardsFormat(boards.value);
                            saveData(); setTimeout(initSortable, 100);
                        } else { syncToCloud(); }
                    }
                });
            }
            document.addEventListener('mouseup', stopResize);
            document.addEventListener('mousemove', doResize);
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.icon-select-trigger') && !e.target.closest('.icon-dropdown')) iconDropdownOpen.value = false;
            });
            document.addEventListener('keydown', (e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                    e.preventDefault();
                    searchOverlayOpen.value = true;
                    nextTick(() => document.getElementById('searchInputOverlay')?.focus());
                }
            });
        });

        return {
            boards, activeBoardId, activeBoard, searchQuery, modal, modalTitle, showSettings,
            modalInput, user, syncStatus, isDark, toasts, showToast, confirmData, closeConfirm, executeConfirm,
            viewMode, searchOverlayOpen, flatSearchResults, highlightText, filterCategories,
            saveData, openCreateBoardModal, openEditBoardModal, deleteBoardFromModal, deleteBoard,
            createColumn, deleteColumn, createCategory, deleteCategory,
            addBookmark, addSubCategory, editSubcategory, deleteSubcategory, editBookmark, deleteBookmark,
            saveModal, handleEnterKey, getModalIcon, getFavicon, handleImgError, openUrl,
            startResize, switchBoard, boardContainer, resetData,
            onDragOverCollection, onDragLeaveCollection, onDropToCollection, dragTargetBoardId,
            onMergeDragOver, onMergeDragLeave, onMergeDrop, mergeTargetCatId, draggingCategoryInfo,
            login, logout, exportHtml, importHtml, moveCategoryToCollection,
            themeColor, analyzeUrl, analyzingUrl,
            iconDropdownOpen, iconDropdownStyle, iconTriggerRef, toggleIconDropdown, boardIcons,
        };
    }
}).mount('#app');
