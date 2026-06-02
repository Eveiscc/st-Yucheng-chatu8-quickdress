import { saveSettingsDebounced } from '../../../../script.js';
import { defaultInstructionTemplate, ids } from './constants.js';
import { getSettings } from './settings.js';
import { syncEntryButton } from './entryButtons.js';
import { syncPanelVisibility } from './panel.js';
import { applyThemeColors } from './themeColors.js';

export function renderSettingsPanel() {
    const host = document.querySelector('#extensions_settings2') || document.querySelector('#extensions_settings');
    if (!host) {
        return;
    }

    let container = document.getElementById(ids.settings);
    if (!container) {
        container = document.createElement('div');
        container.id = ids.settings;
        container.className = 'chatu8-qd-settings';
        host.append(container);
    }

    const settings = getSettings();
    applyThemeColors(container);
    const renderSignature = `${settings.enabled}:${settings.buttonPlacement}:${settings.settingsCollapsed}:${settings.templateEditorOpen}`;
    if (container.dataset.renderSignature === renderSignature && container.children.length > 0) {
        return;
    }

    container.dataset.renderSignature = renderSignature;
    container.innerHTML = `
        <div class="chatu8-qd-settings-header">
            <div class="chatu8-qd-settings-title">玉成-智绘姬快速换装</div>
            <button class="menu_button chatu8-qd-settings-collapse" type="button" data-qd-toggle-settings aria-expanded="${String(!settings.settingsCollapsed)}" title="${settings.settingsCollapsed ? '展开设置' : '折叠设置'}">
                <i class="fa-solid ${settings.settingsCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}" aria-hidden="true"></i>
            </button>
        </div>
        <div class="chatu8-qd-settings-body" ${settings.settingsCollapsed ? 'hidden' : ''}>
            <div class="chatu8-qd-setting-topline">
                <label class="chatu8-qd-setting-line">
                    <input type="checkbox" data-qd-setting="enabled">
                    <span>启用玉成</span>
                </label>
                <button class="menu_button chatu8-qd-template-toggle" type="button" data-qd-template-toggle aria-expanded="${String(settings.templateEditorOpen)}">
                    <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
                    <span>输入内容</span>
                </button>
            </div>
            <div class="chatu8-qd-template-editor" data-qd-template-editor ${settings.templateEditorOpen ? '' : 'hidden'}>
                <div class="chatu8-qd-template-hint">请保留 {{角色名}} 和 {{服装名}}，否则无法自动替换为实际名字。</div>
                <textarea class="text_pole chatu8-qd-template-input" data-qd-template-input rows="4" spellcheck="false"></textarea>
                <button class="menu_button chatu8-qd-template-reset" type="button" data-qd-template-reset>
                    <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
                    <span>恢复默认</span>
                </button>
            </div>
            <div class="chatu8-qd-setting-group">
                <div class="chatu8-qd-setting-label">入口位置</div>
                <div class="chatu8-qd-segmented" role="group" aria-label="入口位置">
                    <button class="menu_button" type="button" data-qd-placement="floating">
                        <i class="fa-solid fa-check chatu8-qd-placement-check" aria-hidden="true"></i>
                        <span>悬浮按钮</span>
                    </button>
                    <button class="menu_button" type="button" data-qd-placement="composer">
                        <i class="fa-solid fa-check chatu8-qd-placement-check" aria-hidden="true"></i>
                        <span>回复栏上方</span>
                    </button>
                    <button class="menu_button chatu8-qd-floating-reset" type="button" data-qd-reset-floating-position title="将悬浮按钮恢复到默认右下位置">
                        <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
                        <span>悬浮按钮复位</span>
                    </button>
                </div>
            </div>
            <button class="menu_button chatu8-qd-open-settings-button" type="button" data-qd-open-panel>
                <i class="fa-solid fa-shirt" aria-hidden="true"></i>
                <span>打开玉成-换装面板</span>
            </button>
        </div>
    `;

    bindSettingsPanel(container, settings);
}

function bindSettingsPanel(container, settings) {
    container.querySelector('[data-qd-toggle-settings]').addEventListener('click', () => {
        settings.settingsCollapsed = !settings.settingsCollapsed;
        saveSettingsDebounced();
        syncCollapsedState(container, settings);
    });

    const enabledInput = container.querySelector('[data-qd-setting="enabled"]');
    if (!enabledInput) {
        return;
    }

    enabledInput.checked = settings.enabled;
    enabledInput.addEventListener('change', () => {
        settings.enabled = enabledInput.checked;
        saveSettingsDebounced();
        syncEntryButton();
        syncPanelVisibility();
    });

    const templateToggle = container.querySelector('[data-qd-template-toggle]');
    const templateInput = container.querySelector('[data-qd-template-input]');
    const templateReset = container.querySelector('[data-qd-template-reset]');
    if (templateToggle && templateInput) {
        templateInput.value = settings.instructionTemplate;
        templateToggle.addEventListener('click', () => {
            settings.templateEditorOpen = !settings.templateEditorOpen;
            saveSettingsDebounced();
            syncTemplateEditor(container, settings);
        });
        templateInput.addEventListener('input', () => {
            settings.instructionTemplate = templateInput.value;
            saveSettingsDebounced();
        });
    }

    templateReset?.addEventListener('click', () => {
        settings.instructionTemplate = defaultInstructionTemplate;
        const input = container.querySelector('[data-qd-template-input]');
        if (input) {
            input.value = settings.instructionTemplate;
        }
        saveSettingsDebounced();
    });

    for (const button of container.querySelectorAll('[data-qd-placement]')) {
        const isActive = button.dataset.qdPlacement === settings.buttonPlacement;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
        button.addEventListener('click', () => {
            settings.buttonPlacement = button.dataset.qdPlacement;
            saveSettingsDebounced();
            renderSettingsPanel();
            syncEntryButton();
        });
    }

    container.querySelector('[data-qd-reset-floating-position]')?.addEventListener('click', () => {
        settings.floatingButtonPosition = null;
        saveSettingsDebounced();
        syncEntryButton();
    });

    container.querySelector('[data-qd-open-panel]').addEventListener('click', () => {
        settings.enabled = true;
        settings.panelOpen = true;
        saveSettingsDebounced();
        renderSettingsPanel();
        syncEntryButton();
        syncPanelVisibility();
    });
}

function syncCollapsedState(container, settings) {
    const body = container.querySelector('.chatu8-qd-settings-body');
    const button = container.querySelector('[data-qd-toggle-settings]');
    const icon = button?.querySelector('i');

    if (body) {
        body.hidden = settings.settingsCollapsed;
    }
    if (button) {
        button.setAttribute('aria-expanded', String(!settings.settingsCollapsed));
        button.title = settings.settingsCollapsed ? '展开设置' : '折叠设置';
    }
    if (icon) {
        icon.classList.toggle('fa-chevron-down', settings.settingsCollapsed);
        icon.classList.toggle('fa-chevron-up', !settings.settingsCollapsed);
    }

    container.dataset.renderSignature = `${settings.enabled}:${settings.buttonPlacement}:${settings.settingsCollapsed}:${settings.templateEditorOpen}`;
}

function syncTemplateEditor(container, settings) {
    const editor = container.querySelector('[data-qd-template-editor]');
    const button = container.querySelector('[data-qd-template-toggle]');

    if (editor) {
        editor.hidden = !settings.templateEditorOpen;
    }
    if (button) {
        button.setAttribute('aria-expanded', String(settings.templateEditorOpen));
    }

    container.dataset.renderSignature = `${settings.enabled}:${settings.buttonPlacement}:${settings.settingsCollapsed}:${settings.templateEditorOpen}`;
}
