import { applyAspectPreset, getCurrentAspectBackend, isAspectBackendSupported } from './aspectBridge.js';
import { aspectPresetList, getAspectPreset } from './aspectPresets.js';
import {
    aspectStateChangedEvent,
    recordAspectResult,
    setAspectAutoEnabled,
    setAspectManualPreset,
} from './aspectState.js';
import { getSettings } from './settings.js';

function formatConfidence(value) {
    return Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 100)}%` : '';
}

function getStatusText(settings) {
    const manualPreset = getAspectPreset(settings.aspectManualPreset);
    const lastResult = settings.aspectLastResult;
    if (!settings.aspectAutoEnabled) {
        return `手动：${manualPreset.id}`;
    }

    if (lastResult?.mode === 'auto' && lastResult.ok && lastResult.preset) {
        return `智能：${lastResult.preset}`;
    }

    return '智能：待判定';
}

function getLastResultTitle(settings, backend) {
    const lastResult = settings.aspectLastResult;
    const backendText = backend ? `后端：${backend}` : '后端：未知';
    if (!lastResult) {
        return `${backendText}\n暂无画幅判定`;
    }

    const confidence = formatConfidence(lastResult.confidence);
    return [
        backendText,
        lastResult.ok ? '状态：已生效' : '状态：未生效',
        lastResult.preset ? `画幅：${lastResult.preset}` : '',
        confidence ? `信心：${confidence}` : '',
        lastResult.reason ? `原因：${lastResult.reason}` : '',
    ].filter(Boolean).join('\n');
}

function createButton(className, title, html) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.title = title;
    button.innerHTML = html;
    return button;
}

function renderAspectToolbar(toolbar) {
    const settings = getSettings();
    const backend = getCurrentAspectBackend();
    const supported = isAspectBackendSupported(backend);
    const lastResult = settings.aspectLastResult;
    const activePresetId = settings.aspectAutoEnabled && lastResult?.mode === 'auto' && lastResult.ok
        ? lastResult.preset
        : settings.aspectManualPreset;

    toolbar.replaceChildren();
    toolbar.dataset.qdAspectBackend = backend || '';
    toolbar.dataset.qdAspectSupported = String(supported);

    const title = document.createElement('div');
    title.className = 'chatu8-qd-aspect-title';
    title.textContent = '画幅';

    const status = document.createElement('div');
    status.className = 'chatu8-qd-aspect-status';
    status.textContent = getStatusText(settings);
    status.title = getLastResultTitle(settings, backend);

    const presets = document.createElement('div');
    presets.className = 'chatu8-qd-aspect-presets';
    presets.setAttribute('role', 'group');
    presets.setAttribute('aria-label', '手动画幅');

    for (const preset of aspectPresetList) {
        const button = createButton('menu_button chatu8-qd-aspect-preset', `手动固定为 ${preset.label} ${preset.id}`, preset.shortLabel);
        button.dataset.qdAspectPreset = preset.id;
        button.classList.toggle('is-active', activePresetId === preset.id);
        button.setAttribute('aria-pressed', String(activePresetId === preset.id));
        presets.append(button);
    }

    const autoLabel = document.createElement('label');
    autoLabel.className = 'chatu8-qd-aspect-auto';
    autoLabel.title = supported ? '生成前按最终 prompt 智能判定画幅' : '当前后端暂不支持智能画幅写入';

    const autoInput = document.createElement('input');
    autoInput.type = 'checkbox';
    autoInput.checked = settings.aspectAutoEnabled;
    autoInput.dataset.qdAspectAuto = 'true';

    const autoText = document.createElement('span');
    autoText.textContent = '智能画幅';
    autoLabel.append(autoInput, autoText);

    const infoButton = createButton(
        'menu_button chatu8-qd-aspect-icon',
        getLastResultTitle(settings, backend),
        '<i class="fa-solid fa-circle-info" aria-hidden="true"></i>',
    );
    infoButton.dataset.qdAspectInfo = 'true';

    toolbar.append(title, status, presets, autoLabel, infoButton);
}

function handleManualPreset(toolbar, presetId) {
    const writeResult = applyAspectPreset(presetId);
    if (writeResult.ok) {
        setAspectAutoEnabled(false);
        setAspectManualPreset(presetId);
    }

    recordAspectResult({
        mode: 'manual',
        ok: writeResult.ok,
        preset: presetId,
        aspect: writeResult.aspect,
        backend: writeResult.backend,
        reason: writeResult.reason,
    });
    renderAspectToolbar(toolbar);
}

function handleAutoToggle(toolbar, checked) {
    const settings = getSettings();
    setAspectAutoEnabled(checked);
    recordAspectResult({
        mode: 'auto-toggle',
        ok: true,
        preset: settings.aspectManualPreset,
        reason: checked ? '智能画幅已开启，生成前判定' : '智能画幅已关闭',
    });
    renderAspectToolbar(toolbar);
}

function bindStateRefresh(toolbar) {
    if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') {
        return;
    }

    const refresh = () => {
        if (!toolbar.isConnected) {
            cleanup();
            return;
        }

        renderAspectToolbar(toolbar);
    };
    window.addEventListener(aspectStateChangedEvent, refresh);

    let observer = null;
    const cleanup = () => {
        window.removeEventListener(aspectStateChangedEvent, refresh);
        observer?.disconnect();
    };

    requestAnimationFrame(() => {
        if (!toolbar.isConnected || !toolbar.parentElement) {
            cleanup();
            return;
        }

        observer = new MutationObserver(() => {
            if (!toolbar.isConnected) {
                cleanup();
            }
        });
        observer.observe(toolbar.parentElement, { childList: true });
    });
}

export function createAspectToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'chatu8-qd-aspect-toolbar';
    toolbar.dataset.qdNoDrag = 'true';

    toolbar.addEventListener('click', (event) => {
        const presetButton = event.target.closest('[data-qd-aspect-preset]');
        if (presetButton) {
            event.preventDefault();
            handleManualPreset(toolbar, presetButton.dataset.qdAspectPreset);
            return;
        }

    });

    toolbar.addEventListener('change', (event) => {
        const autoInput = event.target.closest('[data-qd-aspect-auto]');
        if (!autoInput) {
            return;
        }

        handleAutoToggle(toolbar, autoInput.checked);
    });

    renderAspectToolbar(toolbar);
    bindStateRefresh(toolbar);
    return toolbar;
}
