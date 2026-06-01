import { eventSource, event_types } from '../../../../script.js';
import { getSettings } from './settings.js';
import { syncEntryButton } from './entryButtons.js';
import { renderSettingsPanel } from './settingsPanel.js';
import { renderPanelContent, syncPanelVisibility } from './panel.js';

let initialized = false;
let mutationRefreshTimer = null;

function refreshUi() {
    renderSettingsPanel();
    syncEntryButton();
    if (getSettings().panelOpen) {
        renderPanelContent();
    }
}

function scheduleDomRefresh() {
    clearTimeout(mutationRefreshTimer);
    mutationRefreshTimer = setTimeout(() => {
        renderSettingsPanel();
        syncEntryButton();
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
    bindSillyTavernEvents();

    const observer = new MutationObserver(scheduleDomRefresh);
    observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
