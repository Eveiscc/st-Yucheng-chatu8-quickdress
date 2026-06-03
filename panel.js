import { saveSettingsDebounced } from '../../../../script.js';
import { ids, mobileViewportWidth } from './constants.js';
import { bindDragHandle, clampPosition } from './drag.js';
import { getSettings } from './settings.js';
import { applyThemeColors } from './themeColors.js';
import {
    appendTextToInput,
    clearChatu8DerivedCache,
    getActiveCharacterIds,
    getChatu8Settings,
    getPhotoImageId,
    getPrimaryName,
    getSecondaryName,
    replaceCharacterOutfitsByCharacter,
} from './chatu8Bridge.js';
import {
    buildWearInstructions,
} from './instructionTemplate.js';
import {
    getDraftOutfitIds,
    getLatestSelectionsByCharacter,
    getOutfitScrollTop,
    getRemovableCandidateOutfitIds,
    getReplacementOutfitsByCharacter,
    getVisibleCandidateOutfitIds,
    hideOutfitsByCharacter,
    resetDraftOutfitsFromChatu8,
    setDraftOutfitChecked,
    setOutfitScrollTop,
    splitOutfitsByCurrentActivation,
} from './selectionState.js';
import { bindOutfitPreview, hidePreview } from './preview.js';
import { createAspectToolbar } from './aspectPanel.js';

let viewportListenersBound = false;
let outfitInputSerial = 0;
let deleteMode = false;
let deleteOutfitsByCharacter = {};
let panelStateDirty = false;
let pendingScrollFrame = 0;
const pendingScrollTopByCharacter = new Map();
let hiddenPanelCharacterIds = new Set();
let hiddenPanelCharacterSignature = '';
let pendingPanelRenderFrame = 0;

function markPanelStateDirty() {
    panelStateDirty = true;
}

function commitPendingScrollTops() {
    let changed = false;
    for (const [characterId, scrollTop] of pendingScrollTopByCharacter.entries()) {
        changed = setOutfitScrollTop(characterId, scrollTop, { persist: false }) || changed;
    }
    pendingScrollTopByCharacter.clear();
    if (changed) {
        markPanelStateDirty();
    }
}

function flushPendingScrollTops() {
    if (pendingScrollFrame) {
        cancelAnimationFrame(pendingScrollFrame);
        pendingScrollFrame = 0;
    }
    commitPendingScrollTops();
}

function flushPanelState({ persist = true } = {}) {
    flushPendingScrollTops();
    if (!panelStateDirty) {
        return false;
    }

    panelStateDirty = false;
    if (persist) {
        saveSettingsDebounced();
    }
    return true;
}

function rememberOutfitScrollTop(characterId, scrollTop) {
    pendingScrollTopByCharacter.set(characterId, scrollTop);
    if (pendingScrollFrame) {
        return;
    }

    pendingScrollFrame = requestAnimationFrame(() => {
        pendingScrollFrame = 0;
        commitPendingScrollTops();
    });
}

function getPanelCharacterSignature(chatu8) {
    return [
        String(chatu8?.characterEnablePresetId || ''),
        ...getActiveCharacterIds(chatu8),
    ].join('\u0000');
}

function resetHiddenPanelCharacters() {
    hiddenPanelCharacterIds = new Set();
    hiddenPanelCharacterSignature = '';
}

function getVisiblePanelCharacterIds(chatu8) {
    const signature = getPanelCharacterSignature(chatu8);
    if (signature !== hiddenPanelCharacterSignature) {
        hiddenPanelCharacterSignature = signature;
        hiddenPanelCharacterIds = new Set();
    }

    return getActiveCharacterIds(chatu8)
        .filter((characterId) => !hiddenPanelCharacterIds.has(characterId));
}

function cancelScheduledPanelRender() {
    if (!pendingPanelRenderFrame) {
        return;
    }

    cancelAnimationFrame(pendingPanelRenderFrame);
    pendingPanelRenderFrame = 0;
}

function schedulePanelRender() {
    if (pendingPanelRenderFrame) {
        return;
    }

    pendingPanelRenderFrame = requestAnimationFrame(() => {
        pendingPanelRenderFrame = 0;
        if (getSettings().enabled && getSettings().panelOpen) {
            renderPanelContent();
        }
    });
}

function showPanelOpeningState(panel) {
    const body = panel.querySelector('[data-qd-body]');
    const latest = panel.querySelector('[data-qd-latest]');
    if (body) {
        body.replaceChildren(createEmptyState('正在同步智绘姬角色...'));
    }
    if (latest) {
        latest.textContent = '正在同步智绘姬角色...';
        latest.title = '';
    }
    syncModeButtons(panel);
}

export function setPanelOpen(open) {
    const settings = getSettings();
    const nextOpen = Boolean(open);
    if (!nextOpen) {
        flushPanelState({ persist: false });
        resetHiddenPanelCharacters();
    }

    settings.panelOpen = nextOpen;
    if (!settings.panelOpen) {
        deleteMode = false;
        deleteOutfitsByCharacter = {};
    }
    saveSettingsDebounced();
    syncPanelVisibility();
}

export function togglePanel() {
    setPanelOpen(!getSettings().panelOpen);
}

export function syncPanelVisibility() {
    const panel = ensurePanelShell();
    const overlay = panel.closest(`#${ids.overlay}`);
    const isOpen = getSettings().enabled && getSettings().panelOpen;
    const wasClosed = overlay.hidden || panel.hidden;
    syncPanelViewport();
    overlay.hidden = !isOpen;
    panel.hidden = !isOpen;

    if (isOpen) {
        if (wasClosed) {
            showPanelOpeningState(panel);
            schedulePanelRender();
        } else {
            cancelScheduledPanelRender();
            renderPanelContent();
        }
    } else {
        cancelScheduledPanelRender();
        flushPanelState();
        hidePreview();
    }
}

function ensurePanelOverlay() {
    let overlay = document.getElementById(ids.overlay);
    if (overlay) {
        bindViewportListeners();
        return overlay;
    }

    overlay = document.createElement('div');
    overlay.id = ids.overlay;
    overlay.className = 'chatu8-qd-overlay';
    overlay.hidden = true;
    document.body.append(overlay);
    bindViewportListeners();
    syncPanelViewport();
    return overlay;
}

function bindViewportListeners() {
    if (viewportListenersBound) {
        return;
    }

    viewportListenersBound = true;
    const refresh = () => syncPanelViewport();
    window.visualViewport?.addEventListener('resize', refresh);
    window.visualViewport?.addEventListener('scroll', refresh);
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);
}

function syncPanelViewport() {
    const overlay = document.getElementById(ids.overlay);
    if (!overlay) {
        return;
    }

    const viewport = window.visualViewport;
    const width = viewport?.width || window.innerWidth;
    const height = viewport?.height || window.innerHeight;
    const left = viewport?.offsetLeft || 0;
    const top = viewport?.offsetTop || 0;
    const isMobile = width < mobileViewportWidth;

    overlay.style.setProperty('--chatu8-qd-vv-left', `${left}px`);
    overlay.style.setProperty('--chatu8-qd-vv-top', `${top}px`);
    overlay.style.setProperty('--chatu8-qd-vv-width', `${width}px`);
    overlay.style.setProperty('--chatu8-qd-vv-height', `${height}px`);
    overlay.classList.toggle('chatu8-qd-mobile', isMobile);
    overlay.classList.toggle('chatu8-qd-desktop', !isMobile);

    const panel = document.getElementById(ids.panel);
    if (panel) {
        setPanelColumnMetrics(panel, Number(panel.dataset.qdCharacterCount) || 0);
    }
    if (panel && !panel.hidden) {
        requestAnimationFrame(() => applyPanelPosition(panel));
    }
}

function setPanelColumnMetrics(panel, characterCount) {
    const overlay = panel.closest(`#${ids.overlay}`);
    const isMobile = overlay?.classList.contains('chatu8-qd-mobile')
        ?? ((window.visualViewport?.width || window.innerWidth) < mobileViewportWidth);
    const maxVisibleColumns = isMobile ? 2 : 3;
    const normalizedCount = Math.max(0, Number(characterCount) || 0);
    const visibleColumns = Math.max(1, Math.min(normalizedCount || 1, maxVisibleColumns));

    panel.dataset.qdCharacterCount = String(normalizedCount);
    panel.dataset.qdVisibleColumns = String(visibleColumns);
}

function ensurePanelShell() {
    const overlay = ensurePanelOverlay();
    let panel = document.getElementById(ids.panel);
    if (panel) {
        if (panel.parentElement !== overlay) {
            overlay.append(panel);
        }
        bindPanelDrag(panel);
        applyThemeColors(overlay, panel);
        applyPanelPosition(panel);
        return panel;
    }

    panel = document.createElement('section');
    panel.id = ids.panel;
    panel.className = 'chatu8-qd-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '玉成-智绘姬快速换装');
    panel.innerHTML = `
        <header class="chatu8-qd-panel-header">
            <div class="chatu8-qd-panel-title-area">
                <div class="chatu8-qd-panel-title">玉成</div>
                <div class="chatu8-qd-active-characters" data-qd-active-characters title=""></div>
            </div>
            <div class="chatu8-qd-panel-actions">
                <button class="menu_button chatu8-qd-icon-button" type="button" data-qd-action="toggle-delete" title="从换装列表移除">
                    <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
                </button>
                <span class="chatu8-qd-delete-hint" data-qd-delete-hint hidden title="只能移除未启用服装">只能移除未启用服装</span>
                <button class="menu_button chatu8-qd-icon-button" type="button" data-qd-action="refresh" title="刷新">
                    <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
                </button>
                <button class="menu_button chatu8-qd-icon-button" type="button" data-qd-action="close" title="关闭">
                    <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
            </div>
        </header>
        <div class="chatu8-qd-panel-body" data-qd-body></div>
        <footer class="chatu8-qd-panel-footer">
            <div class="chatu8-qd-latest" data-qd-latest></div>
            <div class="chatu8-qd-footer-actions" data-qd-normal-actions>
                <button class="menu_button chatu8-qd-replace-button" type="button" data-qd-action="replace">
                    <i class="fa-solid fa-list-check" aria-hidden="true"></i>
                    <span>替换角色服装列表</span>
                </button>
                <button class="menu_button chatu8-qd-wear-button" type="button" data-qd-action="wear">
                    <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
                    <span>立即穿上</span>
                </button>
            </div>
            <div class="chatu8-qd-footer-actions" data-qd-delete-actions hidden>
                <button class="menu_button chatu8-qd-cancel-delete-button" type="button" data-qd-action="cancel-delete">
                    <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
                    <span>退出删除</span>
                </button>
                <button class="menu_button chatu8-qd-confirm-delete-button" type="button" data-qd-action="confirm-delete">
                    <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
                    <span>确认移除</span>
                </button>
            </div>
        </footer>
    `;

    panel.addEventListener('click', onPanelClick);
    panel.addEventListener('change', onPanelChange);
    overlay.append(panel);
    bindPanelDrag(panel);
    applyThemeColors(overlay, panel);
    applyPanelPosition(panel);
    return panel;
}

function bindPanelDrag(panel) {
    const header = panel.querySelector('.chatu8-qd-panel-header');
    bindDragHandle(header, {
        target: panel,
        ignoreSelector: 'button, input, textarea, select, a, [data-qd-no-drag]',
        getPosition: (rect) => {
            const overlayRect = panel.closest(`#${ids.overlay}`).getBoundingClientRect();
            return { left: rect.left - overlayRect.left, top: rect.top - overlayRect.top };
        },
        getBounds: () => {
            const overlayRect = panel.closest(`#${ids.overlay}`).getBoundingClientRect();
            return { width: overlayRect.width, height: overlayRect.height };
        },
        setPosition: (position) => {
            const settings = getSettings();
            settings.panelPosition = position;
            setPanelFixedPosition(panel, position);
        },
        onDragEnd: () => saveSettingsDebounced(),
    });
}

function setPanelFixedPosition(panel, position) {
    panel.classList.add('is-positioned');
    panel.style.left = `${position.left}px`;
    panel.style.top = `${position.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
}

function applyPanelPosition(panel, position = getSettings().panelPosition) {
    if (!position) {
        panel.classList.remove('is-positioned');
        panel.style.removeProperty('left');
        panel.style.removeProperty('top');
        panel.style.removeProperty('right');
        panel.style.removeProperty('bottom');
        return;
    }

    const overlay = panel.closest(`#${ids.overlay}`);
    const overlayRect = overlay.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    if (!panelRect.width || !panelRect.height || !overlayRect.width || !overlayRect.height) {
        return;
    }

    const clamped = clampPosition(position, panelRect, overlayRect);
    setPanelFixedPosition(panel, clamped);
}

export function renderPanelContent() {
    const panel = ensurePanelShell();
    const body = panel.querySelector('[data-qd-body]');
    const chatu8 = getChatu8Settings();

    clearChatu8DerivedCache();
    outfitInputSerial = 0;
    applyThemeColors(panel);
    panel.classList.toggle('is-delete-mode', deleteMode);
    setPanelColumnMetrics(panel, 0);
    body.replaceChildren();
    syncActiveCharacterSummary(panel, chatu8);
    if (getSettings().aspectFeatureEnabled) {
        body.append(createAspectToolbar());
    }

    if (!chatu8) {
        body.append(createEmptyState('没有读取到智绘姬配置。'));
        updateFooterState(panel, null);
        syncModeButtons(panel);
        return;
    }

    const allActiveCharacterIds = getActiveCharacterIds(chatu8);
    const activeCharacterIds = getVisiblePanelCharacterIds(chatu8);
    setPanelColumnMetrics(panel, activeCharacterIds.length);

    if (allActiveCharacterIds.length === 0) {
        body.append(createEmptyState('当前启用角色列表为空。'));
        updateFooterState(panel, chatu8);
        syncModeButtons(panel);
        return;
    }

    if (activeCharacterIds.length === 0) {
        body.append(createEmptyState('当前启用角色已从玉成面板隐藏；刷新或重新保存智绘姬激活角色方案后会重新进入。'));
        updateFooterState(panel, chatu8);
        syncModeButtons(panel);
        return;
    }

    const columns = document.createElement('div');
    columns.className = 'chatu8-qd-columns';

    for (const characterId of activeCharacterIds) {
        columns.append(createCharacterColumn(chatu8, characterId));
    }

    body.append(columns);
    updateFooterState(panel, chatu8);
    syncModeButtons(panel);
    requestAnimationFrame(() => applyPanelPosition(panel));
}

function createEmptyState(text) {
    const empty = document.createElement('div');
    empty.className = 'chatu8-qd-empty';
    empty.textContent = text;
    return empty;
}

function cleanActiveCharacterName(name) {
    const value = String(name || '').trim();
    const withoutBracketParts = value.replace(/\[[^\]]*]\s*/g, '').trim();
    return withoutBracketParts || value;
}

function getActiveCharacterDisplayNames(chatu8) {
    return getActiveCharacterIds(chatu8)
        .map((characterId) => {
            const characterPreset = chatu8?.characterPresets?.[characterId];
            return cleanActiveCharacterName(getPrimaryName(characterPreset, characterId));
        })
        .filter(Boolean);
}

function syncActiveCharacterSummary(panel, chatu8) {
    const target = panel.querySelector('[data-qd-active-characters]');
    if (!target) {
        return;
    }

    const names = getActiveCharacterDisplayNames(chatu8);
    const text = names.length > 0
        ? `已启用角色：${names.join('、')}`
        : '已启用角色：无';
    target.textContent = text;
    target.title = text;
}

function createCharacterColumn(chatu8, characterId) {
    const characterPreset = chatu8.characterPresets?.[characterId];
    const characterName = getPrimaryName(characterPreset, characterId);
    const renderIds = characterPreset
        ? (deleteMode
            ? getRemovableCandidateOutfitIds(chatu8, characterId, characterPreset)
            : getVisibleCandidateOutfitIds(chatu8, characterId, characterPreset))
        : [];
    const draftIds = new Set(characterPreset ? getDraftOutfitIds(chatu8, characterId, characterPreset) : []);
    const deleteIds = new Set(deleteOutfitsByCharacter[characterId] || []);
    const checkedCount = deleteMode
        ? renderIds.filter((outfitId) => deleteIds.has(outfitId)).length
        : renderIds.filter((outfitId) => draftIds.has(outfitId)).length;
    const column = document.createElement('section');
    column.className = 'chatu8-qd-character-column';
    column.dataset.characterId = characterId;
    column.dataset.outfitCount = String(renderIds.length);

    const header = document.createElement('header');
    header.className = 'chatu8-qd-character-header';

    const titleRow = document.createElement('div');
    titleRow.className = 'chatu8-qd-character-title-row';

    const title = document.createElement('div');
    title.className = 'chatu8-qd-character-name';
    title.textContent = characterName || characterId;
    title.title = characterId;

    const titleMain = document.createElement('div');
    titleMain.className = 'chatu8-qd-character-title-main';
    titleMain.append(title);

    if (deleteMode) {
        const hideCharacterButton = document.createElement('button');
        hideCharacterButton.type = 'button';
        hideCharacterButton.className = 'menu_button chatu8-qd-character-hide';
        hideCharacterButton.dataset.qdAction = 'hide-character-from-panel';
        hideCharacterButton.title = '仅从玉成面板移除此角色，不改智绘姬设置';
        hideCharacterButton.innerHTML = '<i class="fa-solid fa-trash-can" aria-hidden="true"></i><span>移除角色</span>';
        titleMain.append(hideCharacterButton);
    }

    titleRow.append(titleMain);

    const titleActions = document.createElement('div');
    titleActions.className = 'chatu8-qd-character-actions';

    if (deleteMode && renderIds.length > 0) {
        const selectAllButton = document.createElement('button');
        selectAllButton.type = 'button';
        selectAllButton.className = 'menu_button chatu8-qd-character-select-all';
        selectAllButton.dataset.qdAction = 'toggle-character-delete-selection';
        selectAllButton.title = checkedCount === renderIds.length ? '取消全选此角色服装' : '全选此角色服装';
        selectAllButton.setAttribute('aria-pressed', String(checkedCount === renderIds.length));
        selectAllButton.innerHTML = checkedCount === renderIds.length
            ? '<i class="fa-solid fa-square-check" aria-hidden="true"></i>'
            : '<i class="fa-regular fa-square-check" aria-hidden="true"></i>';
        titleActions.append(selectAllButton);
    }

    if (titleActions.childElementCount > 0) {
        titleRow.append(titleActions);
    }

    const meta = document.createElement('div');
    meta.className = 'chatu8-qd-character-meta';
    meta.dataset.qdCharacterMeta = 'true';
    meta.textContent = buildColumnMetaText(checkedCount, renderIds.length);

    header.append(titleRow, meta);
    column.append(header);

    if (!characterPreset) {
        column.append(createEmptyState('角色数据不存在。'));
        return column;
    }

    if (renderIds.length === 0) {
        column.append(createEmptyState(deleteMode ? '没有可移除的未激活服装。' : '没有角色服装。'));
        return column;
    }

    const list = document.createElement('div');
    list.className = 'chatu8-qd-outfit-list';
    list.dataset.characterId = characterId;
    list.addEventListener('scroll', () => {
        rememberOutfitScrollTop(characterId, list.scrollTop);
    }, { passive: true });

    for (const outfitId of renderIds) {
        const outfitPreset = chatu8.outfitPresets?.[outfitId];
        if (outfitPreset) {
            list.append(createOutfitRow({
                characterId,
                characterName,
                outfitId,
                outfitPreset,
                checked: deleteMode ? deleteIds.has(outfitId) : draftIds.has(outfitId),
            }));
        }
    }

    column.append(list);
    requestAnimationFrame(() => {
        list.scrollTop = getOutfitScrollTop(characterId);
    });
    return column;
}

function buildColumnMetaText(checkedCount, totalCount) {
    return deleteMode
        ? `${checkedCount}/${totalCount} 待移除`
        : `${checkedCount}/${totalCount} 已勾选`;
}

function createOutfitRow({ characterId, characterName, outfitId, outfitPreset, checked }) {
    const outfitName = getPrimaryName(outfitPreset, outfitId);
    const secondaryName = getSecondaryName(outfitPreset, outfitName);
    const imageId = getPhotoImageId(outfitPreset);
    const row = document.createElement('div');
    const checkboxId = `chatu8-qd-outfit-${outfitInputSerial += 1}`;

    row.className = 'chatu8-qd-outfit-row';
    row.classList.toggle('is-enabled', checked && !deleteMode);
    row.classList.toggle('is-delete-selected', checked && deleteMode);
    row.dataset.characterId = characterId;
    row.dataset.outfitId = outfitId;
    row.dataset.imageId = imageId;
    row.dataset.previewCaption = `${characterName}, ${outfitName}`;
    row.tabIndex = 0;
    row.setAttribute('role', 'group');

    const checkbox = document.createElement('input');
    checkbox.id = checkboxId;
    checkbox.type = 'checkbox';
    checkbox.checked = checked;
    checkbox.dataset.characterId = characterId;
    checkbox.dataset.outfitId = outfitId;
    checkbox.setAttribute('aria-label', outfitName);

    const text = document.createElement('label');
    text.className = 'chatu8-qd-outfit-text';
    text.htmlFor = checkboxId;

    const name = document.createElement('span');
    name.className = 'chatu8-qd-outfit-name';
    name.textContent = outfitName;

    const meta = document.createElement('span');
    meta.className = 'chatu8-qd-outfit-meta';
    meta.textContent = secondaryName || outfitId;

    const photoMark = document.createElement('button');
    photoMark.type = 'button';
    photoMark.className = imageId ? 'chatu8-qd-photo-mark is-ready' : 'chatu8-qd-photo-mark';
    photoMark.title = imageId ? '查看参考图' : '无参考图';
    photoMark.disabled = !imageId;
    photoMark.dataset.qdPreviewTrigger = 'true';
    photoMark.innerHTML = '<i class="fa-regular fa-image" aria-hidden="true"></i>';

    text.append(name, meta);
    row.append(checkbox, text, photoMark);
    bindOutfitRowToggle(row, checkbox);
    bindOutfitPreview(row, photoMark);
    return row;
}

function bindOutfitRowToggle(row, checkbox) {
    const toggle = () => {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    };

    row.addEventListener('click', (event) => {
        if (event.target.closest('input, label, button')) {
            return;
        }

        toggle();
    });

    row.addEventListener('keydown', (event) => {
        if (!['Enter', ' '].includes(event.key) || event.target !== row) {
            return;
        }

        event.preventDefault();
        toggle();
    });
}

function onPanelClick(event) {
    const button = event.target.closest('[data-qd-action]');
    if (!button) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    const action = button.dataset.qdAction;
    if (action === 'close') {
        setPanelOpen(false);
    } else if (action === 'refresh') {
        resetHiddenPanelCharacters();
        hidePreview();
        deletePanelStatus();
        resetDraftOutfitsFromChatu8(getChatu8Settings());
        renderPanelContent();
        setPanelStatus('已同步智绘姬激活状态');
    } else if (action === 'toggle-delete') {
        deleteMode = !deleteMode;
        deleteOutfitsByCharacter = {};
        hidePreview();
        deletePanelStatus();
        renderPanelContent();
    } else if (action === 'cancel-delete') {
        deleteMode = false;
        deleteOutfitsByCharacter = {};
        hidePreview();
        deletePanelStatus();
        renderPanelContent();
    } else if (action === 'confirm-delete') {
        confirmDeleteSelections();
    } else if (action === 'toggle-character-delete-selection') {
        toggleCharacterDeleteSelection(button);
    } else if (action === 'hide-character-from-panel') {
        hideCharacterFromPanel(button);
    } else if (action === 'wear') {
        writeCurrentSelections();
    } else if (action === 'replace') {
        replaceCurrentSelections();
    }
}

function onPanelChange(event) {
    const checkbox = event.target.closest('.chatu8-qd-outfit-row input[type="checkbox"]');
    if (!checkbox) {
        return;
    }

    const characterId = checkbox.dataset.characterId;
    const outfitId = checkbox.dataset.outfitId;
    deletePanelStatus();

    if (deleteMode) {
        setDeleteOutfitChecked(characterId, outfitId, checkbox.checked);
    } else {
        setDraftOutfitChecked(characterId, outfitId, checkbox.checked, { persist: false });
        markPanelStateDirty();
    }

    syncChangedSelection(checkbox);
}

function setDeleteOutfitChecked(characterId, outfitId, checked) {
    const nextIds = new Set(deleteOutfitsByCharacter[characterId] || []);
    if (checked) {
        nextIds.add(outfitId);
    } else {
        nextIds.delete(outfitId);
    }

    if (nextIds.size > 0) {
        deleteOutfitsByCharacter = {
            ...deleteOutfitsByCharacter,
            [characterId]: [...nextIds],
        };
    } else {
        const { [characterId]: _removed, ...rest } = deleteOutfitsByCharacter;
        deleteOutfitsByCharacter = rest;
    }
}

function toggleCharacterDeleteSelection(button) {
    if (!deleteMode) {
        return;
    }

    const column = button.closest('.chatu8-qd-character-column');
    const characterId = column?.dataset.characterId;
    if (!column || !characterId) {
        return;
    }

    const checkboxes = [...column.querySelectorAll('.chatu8-qd-outfit-row input[type="checkbox"]')];
    const outfitIds = checkboxes
        .map((checkbox) => checkbox.dataset.outfitId)
        .filter(Boolean);
    const selectedIds = new Set(deleteOutfitsByCharacter[characterId] || []);
    const shouldSelectAll = outfitIds.some((outfitId) => !selectedIds.has(outfitId));
    const nextIds = shouldSelectAll ? outfitIds : [];

    if (nextIds.length > 0) {
        deleteOutfitsByCharacter = {
            ...deleteOutfitsByCharacter,
            [characterId]: nextIds,
        };
    } else {
        const { [characterId]: _removed, ...rest } = deleteOutfitsByCharacter;
        deleteOutfitsByCharacter = rest;
    }

    for (const checkbox of checkboxes) {
        checkbox.checked = shouldSelectAll;
        checkbox.closest('.chatu8-qd-outfit-row')?.classList.toggle('is-delete-selected', shouldSelectAll);
    }

    const meta = column.querySelector('[data-qd-character-meta]');
    if (meta) {
        meta.textContent = buildColumnMetaText(nextIds.length, Number(column.dataset.outfitCount) || outfitIds.length);
    }

    button.setAttribute('aria-pressed', String(shouldSelectAll));
    button.title = shouldSelectAll ? '取消全选此角色服装' : '全选此角色服装';
    button.innerHTML = shouldSelectAll
        ? '<i class="fa-solid fa-square-check" aria-hidden="true"></i>'
        : '<i class="fa-regular fa-square-check" aria-hidden="true"></i>';

    deletePanelStatus();
    updateFooterState(document.getElementById(ids.panel), getChatu8Settings());
}

function hideCharacterFromPanel(button) {
    if (!deleteMode) {
        return;
    }

    const column = button.closest('.chatu8-qd-character-column');
    const characterId = column?.dataset.characterId;
    if (!column || !characterId) {
        return;
    }

    const characterName = column.querySelector('.chatu8-qd-character-name')?.textContent || characterId;
    hiddenPanelCharacterIds.add(characterId);
    const { [characterId]: _removed, ...rest } = deleteOutfitsByCharacter;
    deleteOutfitsByCharacter = rest;
    hidePreview();
    renderPanelContent();
    setPanelStatus(`已从面板移除 ${characterName}；不改智绘姬设置`);
}

function syncChangedSelection(checkbox) {
    const panel = document.getElementById(ids.panel);
    const row = checkbox.closest('.chatu8-qd-outfit-row');
    const column = checkbox.closest('.chatu8-qd-character-column');
    const meta = column?.querySelector('[data-qd-character-meta]');

    row?.classList.toggle('is-enabled', checkbox.checked && !deleteMode);
    row?.classList.toggle('is-delete-selected', checkbox.checked && deleteMode);

    if (column && meta) {
        const checkedCount = column.querySelectorAll('.chatu8-qd-outfit-row input[type="checkbox"]:checked').length;
        meta.textContent = buildColumnMetaText(checkedCount, Number(column.dataset.outfitCount) || checkedCount);
    }

    updateFooterStateFromDom(panel);
}

function syncModeButtons(panel) {
    const trashButton = panel.querySelector('[data-qd-action="toggle-delete"]');
    const deleteHint = panel.querySelector('[data-qd-delete-hint]');
    const normalActions = panel.querySelector('[data-qd-normal-actions]');
    const deleteActions = panel.querySelector('[data-qd-delete-actions]');

    trashButton?.classList.toggle('is-active', deleteMode);
    trashButton?.setAttribute('aria-pressed', String(deleteMode));
    if (deleteHint) {
        deleteHint.hidden = !deleteMode;
    }
    if (normalActions) {
        normalActions.hidden = deleteMode;
    }
    if (deleteActions) {
        deleteActions.hidden = !deleteMode;
    }
}

function updateFooterState(panel, chatu8) {
    if (!panel) {
        return;
    }

    const latest = panel.querySelector('[data-qd-latest]');
    const wearButton = panel.querySelector('[data-qd-action="wear"]');
    const replaceButton = panel.querySelector('[data-qd-action="replace"]');
    const confirmDeleteButton = panel.querySelector('[data-qd-action="confirm-delete"]');
    const status = panel.dataset.qdStatus;

    syncModeButtons(panel);

    if (!chatu8) {
        if (latest) {
            latest.textContent = '请确认智绘姬已启用并完成加载';
        }
        if (wearButton) {
            wearButton.disabled = true;
        }
        if (replaceButton) {
            replaceButton.disabled = true;
        }
        if (confirmDeleteButton) {
            confirmDeleteButton.disabled = true;
        }
        return;
    }

    if (deleteMode) {
        const deleteCount = countDeleteSelections();
        if (latest) {
            latest.textContent = status || (deleteCount > 0
                ? `将从换装列表移除 ${deleteCount} 套服装`
                : '删除模式：勾选要从快速换装列表移除的服装');
        }
        if (confirmDeleteButton) {
            confirmDeleteButton.disabled = deleteCount === 0;
        }
        return;
    }

    const checkedCharacterCount = countCheckedCharactersFromDom(panel);
    const activeCharacterCount = countCharacterColumnsFromDom(panel);
    if (latest) {
        latest.textContent = status || (checkedCharacterCount > 0
            ? `将写入 ${checkedCharacterCount} 个角色`
            : '可写入输入框或替换服装列表');
        latest.title = '';
    }
    if (wearButton) {
        wearButton.disabled = checkedCharacterCount === 0;
    }
    if (replaceButton) {
        replaceButton.disabled = activeCharacterCount === 0;
    }
}

function updateFooterStateFromDom(panel) {
    if (!panel) {
        return;
    }

    const latest = panel.querySelector('[data-qd-latest]');
    const wearButton = panel.querySelector('[data-qd-action="wear"]');
    const replaceButton = panel.querySelector('[data-qd-action="replace"]');
    const confirmDeleteButton = panel.querySelector('[data-qd-action="confirm-delete"]');
    const status = panel.dataset.qdStatus;

    syncModeButtons(panel);

    if (deleteMode) {
        const deleteCount = countDeleteSelections();
        if (latest) {
            latest.textContent = status || (deleteCount > 0
                ? `将从换装列表移除 ${deleteCount} 套服装`
                : '删除模式：勾选要从快速换装列表移除的服装');
        }
        if (confirmDeleteButton) {
            confirmDeleteButton.disabled = deleteCount === 0;
        }
        return;
    }

    const checkedCharacterCount = countCheckedCharactersFromDom(panel);
    const activeCharacterCount = countCharacterColumnsFromDom(panel);
    if (latest) {
        latest.textContent = status || (checkedCharacterCount > 0
            ? `将写入 ${checkedCharacterCount} 个角色`
            : '可写入输入框或替换服装列表');
        latest.title = '';
    }
    if (wearButton) {
        wearButton.disabled = checkedCharacterCount === 0;
    }
    if (replaceButton) {
        replaceButton.disabled = activeCharacterCount === 0;
    }
}

function countCharacterColumnsFromDom(panel) {
    return panel?.querySelectorAll('.chatu8-qd-character-column').length || 0;
}

function countCheckedCharactersFromDom(panel) {
    return [...(panel?.querySelectorAll('.chatu8-qd-character-column') || [])]
        .filter((column) => column.querySelector('.chatu8-qd-outfit-row input[type="checkbox"]:checked'))
        .length;
}

function countDeleteSelections() {
    return Object.values(deleteOutfitsByCharacter)
        .reduce((count, outfitIds) => count + outfitIds.length, 0);
}

function setPanelStatus(message) {
    const panel = document.getElementById(ids.panel);
    if (!panel) {
        return;
    }

    panel.dataset.qdStatus = message;
    updateFooterState(panel, getChatu8Settings());
}

function deletePanelStatus() {
    const panel = document.getElementById(ids.panel);
    if (panel) {
        delete panel.dataset.qdStatus;
    }
}

function writeCurrentSelections() {
    const chatu8 = getChatu8Settings();
    const visibleCharacterIds = new Set(getVisiblePanelCharacterIds(chatu8));
    const selections = getLatestSelectionsByCharacter(chatu8)
        .filter((selection) => visibleCharacterIds.has(selection.characterId));
    const text = buildWearInstructions(selections);

    if (appendTextToInput(text)) {
        flushPanelState();
        setPanelStatus(`已写入 ${selections.length} 个角色`);
    }
}

function replaceCurrentSelections() {
    const chatu8 = getChatu8Settings();
    const visibleCharacterIds = new Set(getVisiblePanelCharacterIds(chatu8));
    const entries = getReplacementOutfitsByCharacter(chatu8)
        .filter((entry) => visibleCharacterIds.has(entry.characterId));
    if (entries.length === 0) {
        flushPanelState();
        setPanelStatus('当前没有可替换的启用角色');
        return;
    }

    flushPanelState();
    const result = replaceCharacterOutfitsByCharacter(entries);
    const status = buildReplaceStatus(result);
    renderPanelContent();
    setPanelStatus(status);
}

function formatCharacterNames(characterIds) {
    const chatu8 = getChatu8Settings();
    return [...new Set(characterIds)]
        .map((characterId) => getPrimaryName(chatu8?.characterPresets?.[characterId], characterId))
        .filter(Boolean)
        .join('、');
}

function buildReplaceFailureStatus(result) {
    const names = formatCharacterNames(result.failedCharacterIds || []);
    if (names) {
        return `替换未完全生效：${names} 未写入`;
    }

    return '替换未完全生效，请刷新后重试';
}

function buildReplaceStatus(result) {
    if (!result.ok) {
        return buildReplaceFailureStatus(result);
    }

    if (result.savedVisibleCharacterIds.length > 0) {
        return `已替换 ${result.replacedCount} 个角色，并同步智绘姬当前页`;
    }

    if (result.visibleSaveFailed) {
        return `已替换 ${result.replacedCount} 个角色；当前页原保存按钮未触发`;
    }

    return `已替换 ${result.replacedCount} 个角色，切换角色后可看到列表`;
}

function confirmDeleteSelections() {
    const deleteCount = countDeleteSelections();
    if (deleteCount === 0) {
        updateFooterState(document.getElementById(ids.panel), getChatu8Settings());
        return;
    }

    flushPanelState();
    const { activeCount, inactiveCount, inactiveOutfitsByCharacter } = splitOutfitsByCurrentActivation(
        getChatu8Settings(),
        deleteOutfitsByCharacter,
    );
    const result = hideOutfitsByCharacter(inactiveOutfitsByCharacter);
    deleteMode = false;
    deleteOutfitsByCharacter = {};
    const panel = document.getElementById(ids.panel);
    if (panel) {
        const hiddenCount = result.hiddenCount || inactiveCount;
        panel.dataset.qdStatus = activeCount > 0
            ? `已移除 ${hiddenCount} 套；${activeCount} 套仍在智绘姬激活中`
            : `已从换装列表移除 ${hiddenCount} 套服装`;
    }
    hidePreview();
    renderPanelContent();
}
