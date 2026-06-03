import { saveSettingsDebounced } from '../../../../script.js';
import { ids, mobileViewportWidth } from './constants.js';
import { bindDragHandle } from './drag.js';
import { getSettings } from './settings.js';
import { setPanelOpen, togglePanel } from './panel.js';
import { applyThemeColors } from './themeColors.js';

const qrAssistantButtonConfig = Object.freeze({
    dom_id: ids.composerContainer,
    group_name: '玉成-智绘姬快速换装',
    button_name: '玉成',
});
const floatingButtonFallbackWidth = 84;
const floatingButtonFallbackHeight = 38;
const floatingButtonViewportPadding = 8;

function removeElementById(id) {
    const element = document.getElementById(id);
    if (!element) {
        return false;
    }

    element.remove();
    return true;
}

function setImportantStyle(element, property, value) {
    element.style.setProperty(property, value, 'important');
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
        const existing = window.qrAssistantExtensionApi[existingIndex];
        window.qrAssistantExtensionApi[existingIndex] = qrAssistantButtonConfig;
        return existing !== qrAssistantButtonConfig;
    } else {
        window.qrAssistantExtensionApi.push(qrAssistantButtonConfig);
        return true;
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
        const removedEntry = removeElementById(ids.floatingButton) || removeElementById(ids.composerContainer);
        if (settings.panelOpen) {
            setPanelOpen(false);
        }
        if (removedEntry) {
            refreshExternalButtonManagers();
        }
        return;
    }

    if (settings.buttonPlacement === 'floating') {
        const removedComposerButton = removeElementById(ids.composerContainer);
        ensureFloatingButton();
        if (removedComposerButton) {
            refreshExternalButtonManagers();
        }
    } else {
        const removedFloatingButton = removeElementById(ids.floatingButton);
        const composerResult = ensureComposerButton();
        if (removedFloatingButton || composerResult?.changed) {
            refreshExternalButtonManagers();
        }
    }
}

function ensureFloatingButton() {
    const settings = getSettings();
    let button = document.getElementById(ids.floatingButton);
    if (button) {
        bindFloatingButtonDrag(button);
        applyFloatingButtonBaseStyles(button);
        applyThemeColors(button);
        applyFloatingButtonPosition(button, settings.floatingButtonPosition);
        return { button, changed: false };
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
    applyFloatingButtonBaseStyles(button);
    applyThemeColors(button);
    applyFloatingButtonPosition(button, settings.floatingButtonPosition);
    return { button, changed: true };
}

function applyFloatingButtonBaseStyles(button) {
    setImportantStyle(button, 'position', 'fixed');
    setImportantStyle(button, 'z-index', '10020');
    setImportantStyle(button, 'display', 'inline-flex');
    setImportantStyle(button, 'align-items', 'center');
    setImportantStyle(button, 'gap', '7px');
    setImportantStyle(button, 'min-width', `${floatingButtonFallbackWidth}px`);
    setImportantStyle(button, 'height', `${floatingButtonFallbackHeight}px`);
    setImportantStyle(button, 'padding', '0 13px');
    setImportantStyle(button, 'border-radius', '8px');
    setImportantStyle(button, 'visibility', 'visible');
    setImportantStyle(button, 'opacity', '1');
    setImportantStyle(button, 'pointer-events', 'auto');
    setImportantStyle(button, 'touch-action', 'none');
    setImportantStyle(button, 'user-select', 'none');
}

function isMobileViewport() {
    return getViewportRect().width < mobileViewportWidth;
}

function getViewportRect() {
    const viewport = window.visualViewport;
    return {
        left: viewport?.offsetLeft || 0,
        top: viewport?.offsetTop || 0,
        width: viewport?.width || window.innerWidth,
        height: viewport?.height || window.innerHeight,
    };
}

function isPositionInsideViewport(position, buttonSize) {
    const viewport = getViewportRect();
    return position.left >= viewport.left + floatingButtonViewportPadding
        && position.top >= viewport.top + floatingButtonViewportPadding
        && position.left <= viewport.left + viewport.width - buttonSize.width - floatingButtonViewportPadding
        && position.top <= viewport.top + viewport.height - buttonSize.height - floatingButtonViewportPadding;
}

function getCenteredFloatingButtonPosition(buttonSize) {
    const viewport = getViewportRect();
    return clampFloatingButtonPosition({
        left: viewport.left + ((viewport.width - buttonSize.width) / 2),
        top: viewport.top + ((viewport.height - buttonSize.height) / 2),
    }, buttonSize);
}

function getFloatingButtonSize(button) {
    const rect = button?.getBoundingClientRect?.();
    return {
        width: rect?.width || floatingButtonFallbackWidth,
        height: rect?.height || floatingButtonFallbackHeight,
    };
}

function clampFloatingButtonPosition(position, buttonSize) {
    const viewport = getViewportRect();
    const minLeft = viewport.left + floatingButtonViewportPadding;
    const minTop = viewport.top + floatingButtonViewportPadding;
    const maxLeft = viewport.left + viewport.width - buttonSize.width - floatingButtonViewportPadding;
    const maxTop = viewport.top + viewport.height - buttonSize.height - floatingButtonViewportPadding;

    return {
        left: Math.max(minLeft, Math.min(maxLeft, position.left)),
        top: Math.max(minTop, Math.min(maxTop, position.top)),
    };
}

function setFloatingButtonFixedPosition(button, position) {
    button.classList.add('is-positioned');
    setImportantStyle(button, 'left', `${position.left}px`);
    setImportantStyle(button, 'top', `${position.top}px`);
    setImportantStyle(button, 'right', 'auto');
    setImportantStyle(button, 'bottom', 'auto');
    setImportantStyle(button, 'transform', 'none');
}

export function resetFloatingButtonPositionToCenter() {
    const settings = getSettings();
    const button = document.getElementById(ids.floatingButton);
    const buttonSize = getFloatingButtonSize(button);

    settings.floatingButtonPosition = getCenteredFloatingButtonPosition(buttonSize);
    if (button) {
        applyFloatingButtonPosition(button, settings.floatingButtonPosition);
    }
}

function applyFloatingButtonPosition(button, position) {
    if (!position) {
        button.classList.remove('is-positioned');
        button.style.removeProperty('transform');
        if (isMobileViewport()) {
            setFloatingButtonFixedPosition(button, getCenteredFloatingButtonPosition(getFloatingButtonSize(button)));
        } else {
            button.style.removeProperty('left');
            button.style.removeProperty('top');
            setImportantStyle(button, 'right', '22px');
            setImportantStyle(button, 'bottom', 'calc(env(safe-area-inset-bottom, 0px) + 96px)');
        }
        return;
    }

    const buttonSize = getFloatingButtonSize(button);
    const nextPosition = isMobileViewport() && !isPositionInsideViewport(position, buttonSize)
        ? getCenteredFloatingButtonPosition(buttonSize)
        : clampFloatingButtonPosition(position, buttonSize);

    setFloatingButtonFixedPosition(button, nextPosition);
}

function bindFloatingButtonDrag(button) {
    bindDragHandle(button, {
        target: button,
        getPosition: (rect) => ({ left: rect.left, top: rect.top }),
        getBounds: () => ({ width: window.innerWidth, height: window.innerHeight }),
        setPosition: (position) => {
            const settings = getSettings();
            settings.floatingButtonPosition = position;
            setFloatingButtonFixedPosition(button, position);
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
    const registrationChanged = registerQrAssistantButton();

    const mount = getComposerMount();
    if (!mount) {
        return { button: null, changed: registrationChanged };
    }

    let button = document.getElementById(ids.composerContainer);
    let changed = registrationChanged;
    if (button && button.tagName !== 'DIV') {
        button.remove();
        button = null;
        changed = true;
    }

    if (!button) {
        button = document.createElement('div');
        button.id = ids.composerContainer;
        button.className = 'menu_button qr--button chatu8-qd-composer-button';
        button.setAttribute('role', 'button');
        button.tabIndex = 0;
        button.title = '玉成-智绘姬快速换装';
        button.dataset.qdExternalButton = 'true';
        button.dataset.extensionId = 'st-Yucheng-chatu8-quickdress';
        button.dataset.extensionName = '玉成-智绘姬快速换装';
        button.setAttribute('aria-label', '打开玉成-换装面板');
        button.append(createQrButtonContent('fa-solid fa-shirt', '玉成'));
        bindButtonActivation(button);
        changed = true;
    }

    if (button.classList.contains('is-send-form-fallback') !== mount.fallback) {
        changed = true;
    }
    button.classList.toggle('is-send-form-fallback', mount.fallback);

    if (button.parentElement !== mount.anchor) {
        if (mount.before) {
            mount.anchor.insertBefore(button, mount.before);
        } else {
            mount.anchor.append(button);
        }
        changed = true;
    }

    applyThemeColors(button);
    return { button, changed };
}
