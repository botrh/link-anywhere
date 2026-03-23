// Drag & drop logic using SortableJS
// Depends on: Sortable (global), Vue nextTick, activeBoard ref, saveData fn

function createSortable({ activeBoard, saveData, draggingCategoryInfo, mergeTargetCatId, nextTick }) {

    const initSortable = () => {
        nextTick(() => {
            // Column reorder
            const colContainer = document.getElementById('columns-container');
            if (colContainer) {
                new Sortable(colContainer, {
                    animation: 150,
                    handle: '.column-drag-handle',
                    draggable: '.column-wrapper',
                    onEnd: (evt) => {
                        const item = activeBoard.value.columns.splice(evt.oldIndex, 1)[0];
                        activeBoard.value.columns.splice(evt.newIndex, 0, item);
                        saveData();
                    }
                });
            }

            // Category reorder across columns
            document.querySelectorAll('.category-sortable-area').forEach(el => {
                new Sortable(el, {
                    group: 'shared-categories',
                    animation: 150,
                    handle: '.category-drag-handle',
                    draggable: '.cat-card',
                    ghostClass: 'sortable-ghost',
                    chosenClass: 'sortable-chosen',
                    fallbackOnBody: true,
                    onStart: (evt) => {
                        try {
                            const fromColId = evt.from.dataset.colId;
                            const fromCol = activeBoard.value.columns.find(c => c.id == fromColId);
                            if (fromCol) draggingCategoryInfo.value = { columnId: fromColId, category: fromCol.categories[evt.oldIndex] };
                        } catch (e) { draggingCategoryInfo.value = null; }
                    },
                    onEnd: (evt) => {
                        // If draggingCategoryInfo is already null, it means onDropToCollection
                        // or onMergeDrop already handled this drag — skip to avoid double-processing
                        if (draggingCategoryInfo.value === null) {
                            mergeTargetCatId.value = null;
                            return;
                        }
                        const fromCol = activeBoard.value.columns.find(c => c.id == evt.from.dataset.colId);
                        const toCol = activeBoard.value.columns.find(c => c.id == evt.to.dataset.colId);
                        if (fromCol && toCol) {
                            const item = fromCol.categories.splice(evt.oldIndex, 1)[0];
                            toCol.categories.splice(evt.newIndex, 0, item);
                            saveData();
                        }
                        draggingCategoryInfo.value = null;
                        mergeTargetCatId.value = null;
                    }
                });
            });

            // Subcategory reorder
            document.querySelectorAll('.subcategory-list').forEach(el => {
                new Sortable(el, {
                    group: 'shared-subcategories',
                    animation: 150,
                    handle: '.subcat-drag-handle',
                    draggable: '.subcategory-wrapper',
                    fallbackOnBody: true,
                    onEnd: (evt) => {
                        let fromCat, toCat;
                        for (const col of activeBoard.value.columns) {
                            if (!fromCat) fromCat = col.categories.find(c => c.id == evt.from.dataset.catId);
                            if (!toCat) toCat = col.categories.find(c => c.id == evt.to.dataset.catId);
                        }
                        if (fromCat && toCat) {
                            const item = fromCat.subcategories.splice(evt.oldIndex, 1)[0];
                            toCat.subcategories.splice(evt.newIndex, 0, item);
                            saveData();
                        }
                    }
                });
            });

            // Bookmark reorder
            document.querySelectorAll('.bookmark-list').forEach(el => {
                new Sortable(el, {
                    group: 'shared-bookmarks',
                    animation: 100,
                    ghostClass: 'sortable-ghost',
                    onEnd: (evt) => {
                        let fromSub, toSub;
                        for (const col of activeBoard.value.columns) {
                            const fC = col.categories.find(c => c.id == evt.from.dataset.catId);
                            if (fC && !fromSub) fromSub = fC.subcategories.find(s => s.id == evt.from.dataset.subId);
                            const tC = col.categories.find(c => c.id == evt.to.dataset.catId);
                            if (tC && !toSub) toSub = tC.subcategories.find(s => s.id == evt.to.dataset.subId);
                        }
                        if (fromSub && toSub) {
                            const item = fromSub.bookmarks.splice(evt.oldIndex, 1)[0];
                            toSub.bookmarks.splice(evt.newIndex, 0, item);
                            saveData();
                        }
                    }
                });
            });
        });
    };

    // Drag category to a nav tab (different board)
    const onDragOverCollection = (boardId, activeBoardId, dragTargetBoardId) => {
        if (draggingCategoryInfo.value && boardId !== activeBoardId.value) dragTargetBoardId.value = boardId;
    };
    const onDragLeaveCollection = (boardId, dragTargetBoardId) => {
        if (dragTargetBoardId.value === boardId) dragTargetBoardId.value = null;
    };
    const onDropToCollection = ({ targetBoardId, activeBoardId, boards, dragTargetBoardId, saveData }) => {
        if (!draggingCategoryInfo.value || !targetBoardId || targetBoardId === activeBoardId.value) return;
        const { columnId, category } = draggingCategoryInfo.value;
        const currentBoard = boards.value.find(b => b.id === activeBoardId.value);
        if (!currentBoard) { draggingCategoryInfo.value = null; dragTargetBoardId.value = null; return; }
        const sourceCol = currentBoard.columns.find(c => c.id === columnId);
        if (!sourceCol) { draggingCategoryInfo.value = null; dragTargetBoardId.value = null; return; }
        sourceCol.categories = sourceCol.categories.filter(c => c.id !== category.id);
        const targetBoard = boards.value.find(b => b.id === targetBoardId);
        if (!targetBoard) { draggingCategoryInfo.value = null; dragTargetBoardId.value = null; return; }
        if (targetBoard.columns.length === 0) targetBoard.columns.push({ id: 'col-' + Date.now(), width: 280, categories: [] });
        const destCol = targetBoard.columns[0];
        destCol.categories.push(JSON.parse(JSON.stringify(category)));
        saveData(); dragTargetBoardId.value = null; draggingCategoryInfo.value = null;
    };

    // Merge category into another
    const onMergeDragOver = (targetCatId) => {
        if (draggingCategoryInfo.value && draggingCategoryInfo.value.category.id !== targetCatId) mergeTargetCatId.value = targetCatId;
    };
    const onMergeDragLeave = (targetCatId) => {
        if (mergeTargetCatId.value === targetCatId) mergeTargetCatId.value = null;
    };
    const onMergeDrop = (targetCatId, { activeBoardId, boards, saveData }) => {
        if (!draggingCategoryInfo.value || !targetCatId) return;
        const { columnId, category: srcCat } = draggingCategoryInfo.value;
        if (srcCat.id === targetCatId) return;
        const board = boards.value.find(b => b.id === activeBoardId.value);
        let targetCat;
        for (const col of board.columns) { targetCat = col.categories.find(c => c.id === targetCatId); if (targetCat) break; }
        if (targetCat) {
            targetCat.subcategories.push({ id: 'sub-' + Date.now(), title: srcCat.title, bookmarks: JSON.parse(JSON.stringify(srcCat.subcategories.flatMap(s => s.bookmarks))) });
            const srcCol = board.columns.find(c => c.id === columnId);
            srcCol.categories = srcCol.categories.filter(c => c.id !== srcCat.id);
            saveData(); setTimeout(initSortable, 50);
        }
        mergeTargetCatId.value = null; draggingCategoryInfo.value = null;
    };

    return { initSortable, onDragOverCollection, onDragLeaveCollection, onDropToCollection, onMergeDragOver, onMergeDragLeave, onMergeDrop };
}
