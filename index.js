import { eventSource, event_types } from '../../../../script.js';
import { getSettings } from './settings.js';
import { syncEntryButton } from './entryButtons.js';
import { renderSettingsPanel } from './settingsPanel.js';
import { renderPanelContent, syncPanelVisibility } from './panel.js';
import { initAspectHook } from './aspectHook.js';
import { ids } from './constants.js';

let initialized = false;
let mutationRefreshTimer = null;
let mountObserverRetryTimer = null;
let domRefreshObservers = [];
const refreshRootSelectors = Object.freeze([
    '#extensions_settings',
    '#extensions_settings2',
    '#qr--bar',
    '#send_form',
]);

function refreshUi() {
    renderSettingsPanel();
    syncEntryButton();
    if (getSettings().panelOpen) {
        renderPanelContent();
    }
}

function getElementFromNode(node) {
    if (node?.nodeType === 1) {
        return node;
    }
    return node?.parentElement || null;
}

function isInsideSelfManagedRoot(node) {
    const element = getElementFromNode(node);
    return Boolean(element?.closest?.(`#${ids.overlay}, #${ids.preview}`));
}

function isSelfManagedMutation(mutation) {
    if (isInsideSelfManagedRoot(mutation.target)) {
        return true;
    }

    const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
    return changedNodes.length > 0 && changedNodes.every(isInsideSelfManagedRoot);
}

function hasRefreshRelevantMutation(mutations) {
    return mutations.some((mutation) => !isSelfManagedMutation(mutation));
}

function getUniqueElements(elements) {
    return [...new Set(elements.filter(Boolean))];
}

function getRefreshRoots() {
    return getUniqueElements(refreshRootSelectors
        .map((selector) => document.querySelector(selector)));
}

function disconnectDomRefreshObservers() {
    for (const observer of domRefreshObservers) {
        observer.disconnect();
    }
    domRefreshObservers = [];
}

function observeDomRefreshTarget(target, options) {
    const observer = new MutationObserver(scheduleDomRefresh);
    observer.observe(target, options);
    domRefreshObservers.push(observer);
}

function bindDomRefreshObservers() {
    clearTimeout(mountObserverRetryTimer);
    disconnectDomRefreshObservers();

    const roots = getRefreshRoots();
    const parents = getUniqueElements(roots
        .map((root) => root.parentElement)
        .filter((parent) => !roots.includes(parent)));

    for (const root of roots) {
        observeDomRefreshTarget(root, { childList: true, subtree: true });
    }
    for (const parent of parents) {
        observeDomRefreshTarget(parent, { childList: true });
    }
    if (!roots.includes(document.body) && !parents.includes(document.body)) {
        observeDomRefreshTarget(document.body, { childList: true });
    }

    if (roots.length === 0) {
        mountObserverRetryTimer = setTimeout(() => {
            renderSettingsPanel();
            syncEntryButton();
            bindDomRefreshObservers();
        }, 1000);
    }
}

function scheduleDomRefresh(mutations = []) {
    if (mutations.length > 0 && !hasRefreshRelevantMutation(mutations)) {
        return;
    }

    clearTimeout(mutationRefreshTimer);
    mutationRefreshTimer = setTimeout(() => {
        renderSettingsPanel();
        syncEntryButton();
        bindDomRefreshObservers();
    }, 250);
}

function bindSillyTavernEvents() {
    if (event_types?.EXTENSION_SETTINGS_LOADED) {
        eventSource.on(event_types.EXTENSION_SETTINGS_LOADED, refreshUi);
    }
    if (event_types?.CHAT_CHANGED) {
        eventSource.on(event_types.CHAT_CHANGED, refreshUi);
    }
    if (event_types?.SETTINGS_UPDATED) {
        eventSource.on(event_types.SETTINGS_UPDATED, refreshUi);
    }
}

function init() {
    if (initialized) {
        return;
    }

    initialized = true;
    getSettings();
    renderSettingsPanel();
    syncEntryButton();
    syncPanelVisibility();
    initAspectHook();
    bindSillyTavernEvents();

    bindDomRefreshObservers();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
