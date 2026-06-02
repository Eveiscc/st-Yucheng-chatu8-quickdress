import { saveSettingsDebounced } from '../../../../script.js';
import { ids } from './constants.js';
import { bindDragHandle } from './drag.js';
import { getSettings } from './settings.js';
import { setPanelOpen, togglePanel } from './panel.js';
import { applyThemeColors } from './themeColors.js';

const qrAssistantButtonConfig = Object.freeze({
    dom_id: ids.composerContainer,
    group_name: '玉成-智绘姬快速换装',
    button_name: '玉成',
});

function removeElementById(id) {
    document.getElementById(id)?.remove();
}

function refreshExternalButtonManagers() {
    window.quickReplyMenu?.applyWhitelistDOMChanges?.();
    window.quickReplyMenu?.populateWhitelistManagementUI?.();
}

function registerQrAssistantButton() {
    if (!Array.isArray(window.qrAssistantExtensionApi)) {
        window.qrAssistantExtensionApi = [];
    }

    const existingIndex = window.qrAssistantExtensionApi
        .findIndex((item) => item?.dom_id === qrAssistantButtonConfig.dom_id);
    if (existingIndex >= 0) {
        window.qrAssistantExtensionApi[existingIndex] = qrAssistantButtonConfig;
    } else {
        window.qrAssistantExtensionApi.push(qrAssistantButtonConfig);
    }
}

function createButtonLabel(iconClass, text) {
    const fragment = document.createDocumentFragment();
    const icon = document.createElement('i');
    icon.className = iconClass;
    icon.setAttribute('aria-hidden', 'true');
    fragment.append(icon);

    const label = document.createElement('span');
    label.textContent = text;
    fragment.append(label);

    return fragment;
}

function createQrButtonContent(iconClass, text) {
    const fragment = document.createDocumentFragment();

    const icon = document.createElement('div');
    icon.className = `qr--button-icon ${iconClass}`;
    icon.setAttribute('aria-hidden', 'true');
    fragment.append(icon);

    const label = document.createElement('div');
    label.className = 'qr--button-label';
    label.textContent = text;
    fragment.append(label);

    return fragment;
}

function bindButtonActivation(element) {
    element.addEventListener('click', togglePanel);
    if (element.tagName === 'BUTTON') {
        return;
    }

    element.addEventListener('keydown', (event) => {
        if (!['Enter', ' '].includes(event.key)) {
            return;
        }

        event.preventDefault();
        togglePanel();
    });
}

export function syncEntryButton() {
    const settings = getSettings();
    if (!settings.enabled) {
        removeElementById(ids.floatingButton);
        removeElementById(ids.composerContainer);
        if (settings.panelOpen) {
            setPanelOpen(false);
        }
        refreshExternalButtonManagers();
        return;
    }

    if (settings.buttonPlacement === 'floating') {
        removeElementById(ids.composerContainer);
        ensureFloatingButton();
        refreshExternalButtonManagers();
    } else {
        removeElementById(ids.floatingButton);
        ensureComposerButton();
    }
}

function ensureFloatingButton() {
    const settings = getSettings();
    let button = document.getElementById(ids.floatingButton);
    if (button) {
        bindFloatingButtonDrag(button);
        applyThemeColors(button);
        applyFloatingButtonPosition(button, settings.floatingButtonPosition);
        return button;
    }

    button = document.createElement('button');
    button.id = ids.floatingButton;
    button.className = 'menu_button chatu8-qd-floating-button';
    button.type = 'button';
    button.title = '玉成-智绘姬快速换装';
    button.append(createButtonLabel('fa-solid fa-shirt', '玉成'));
    bindButtonActivation(button);
    bindFloatingButtonDrag(button);
    document.body.append(button);
    applyThemeColors(button);
    applyFloatingButtonPosition(button, settings.floatingButtonPosition);
    return button;
}

function applyFloatingButtonPosition(button, position) {
    if (!position) {
        button.classList.remove('is-positioned');
        button.style.removeProperty('left');
        button.style.removeProperty('top');
        button.style.removeProperty('right');
        button.style.removeProperty('bottom');
        return;
    }

    const rect = button.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - rect.width - 8, position.left));
    const top = Math.max(8, Math.min(window.innerHeight - rect.height - 8, position.top));

    button.classList.add('is-positioned');
    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
    button.style.right = 'auto';
    button.style.bottom = 'auto';
}

function bindFloatingButtonDrag(button) {
    bindDragHandle(button, {
        target: button,
        getPosition: (rect) => ({ left: rect.left, top: rect.top }),
        getBounds: () => ({ width: window.innerWidth, height: window.innerHeight }),
        setPosition: (position) => {
            const settings = getSettings();
            settings.floatingButtonPosition = position;
            applyFloatingButtonPosition(button, position);
        },
        onDragEnd: () => saveSettingsDebounced(),
    });
}

function getComposerMount() {
    const qrButtons = document.querySelector('#qr--bar > .qr--buttons');
    if (qrButtons) {
        return { anchor: qrButtons, fallback: false };
    }

    const qrBar = document.querySelector('#qr--bar');
    if (qrBar) {
        return { anchor: qrBar, fallback: false };
    }

    const sendForm = document.querySelector('#send_form');
    if (!sendForm) {
        return null;
    }

    return {
        anchor: sendForm,
        before: sendForm.children[0] || null,
        fallback: true,
    };
}

function ensureComposerButton() {
    registerQrAssistantButton();

    const mount = getComposerMount();
    if (!mount) {
        refreshExternalButtonManagers();
        return null;
    }

    let button = document.getElementById(ids.composerContainer);
    if (button && button.tagName !== 'DIV') {
        button.remove();
        button = null;
    }

    if (!button) {
        button = document.createElement('div');
        button.id = ids.composerContainer;
        button.className = 'menu_button qr--button chatu8-qd-composer-button';
        button.setAttribute('role', 'button');
        button.tabIndex = 0;
        button.title = '玉成-智绘姬快速换装';
        button.dataset.qdExternalButton = 'true';
        button.dataset.extensionId = 'st-yucheng-chatu8-quick-dress';
        button.dataset.extensionName = '玉成-智绘姬快速换装';
        button.setAttribute('aria-label', '打开玉成-换装面板');
        button.append(createQrButtonContent('fa-solid fa-shirt', '玉成'));
        bindButtonActivation(button);
    }

    button.classList.toggle('is-send-form-fallback', mount.fallback);

    if (button.parentElement !== mount.anchor) {
        if (mount.before) {
            mount.anchor.insertBefore(button, mount.before);
        } else {
            mount.anchor.append(button);
        }
    }

    applyThemeColors(button);
    refreshExternalButtonManagers();
    return button;
}
