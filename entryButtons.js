import { saveSettingsDebounced } from '../../../../script.js';
import { ids } from './constants.js';
import { bindDragHandle } from './drag.js';
import { getSettings } from './settings.js';
import { setPanelOpen, togglePanel } from './panel.js';
import { applyThemeColors } from './themeColors.js';

function removeElementById(id) {
    document.getElementById(id)?.remove();
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

export function syncEntryButton() {
    const settings = getSettings();
    if (!settings.enabled) {
        removeElementById(ids.floatingButton);
        removeElementById(ids.composerContainer);
        if (settings.panelOpen) {
            setPanelOpen(false);
        }
        return;
    }

    if (settings.buttonPlacement === 'floating') {
        removeElementById(ids.composerContainer);
        ensureFloatingButton();
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
    button.addEventListener('click', togglePanel);
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

function ensureComposerButton() {
    const anchor = document.querySelector('#qr--bar > .qr--buttons') || document.querySelector('#qr--bar');
    if (!anchor) {
        return null;
    }

    let button = document.getElementById(ids.composerContainer);
    if (!button) {
        button = document.createElement('button');
        button.id = ids.composerContainer;
        button.className = 'menu_button qr--button chatu8-qd-composer-button';
        button.type = 'button';
        button.title = '玉成-智绘姬快速换装';
        button.append(createButtonLabel('fa-solid fa-shirt', '玉成'));
        button.addEventListener('click', togglePanel);
    }

    if (button.parentElement !== anchor) {
        anchor.append(button);
    }

    applyThemeColors(button);
    return button;
}
