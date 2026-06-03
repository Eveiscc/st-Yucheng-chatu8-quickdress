import { applyAspectPreset, getCurrentAspectBackend, isAspectBackendSupported } from './aspectBridge.js';
import { aspectPresetList, getAspectPreset } from './aspectPresets.js';
import {
    aspectStateChangedEvent,
    recordAspectResult,
    setAspectAutoEnabled,
    setAspectManualPreset,
} from './aspectState.js';
import { getSettings } from './settings.js';

const matchedGroupLabels = Object.freeze({
    portraitStrong: '竖向强信号',
    portraitMedium: '竖向辅助信号',
    multi: '多人信号',
    relation: '横向关系信号',
    wide: '远景信号',
    environment: '环境信号',
    lying: '横向动作信号',
    square: '近景/头像信号',
});

const resultModeLabels = Object.freeze({
    auto: '自动判断',
    manual: '手动固定',
    'auto-toggle': '自动开关',
});

const htmlEscapes = Object.freeze({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
});

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}

function formatPresetPixels(preset) {
    return `${preset.width}x${preset.height}`;
}

function renderStatus(status, settings) {
    const manualPreset = getAspectPreset(settings.aspectManualPreset);
    const lastResult = settings.aspectLastResult;
    const mode = document.createElement('span');
    mode.className = 'chatu8-qd-aspect-status-mode';

    const value = document.createElement('span');
    value.className = 'chatu8-qd-aspect-status-value';

    if (!settings.aspectAutoEnabled) {
        mode.textContent = '手动：';
        value.textContent = formatPresetPixels(manualPreset);
    } else if (lastResult?.mode === 'auto' && lastResult.ok && lastResult.preset) {
        const autoPreset = getAspectPreset(lastResult.preset);
        mode.textContent = '自动：';
        value.textContent = formatPresetPixels(autoPreset);
    } else {
        mode.textContent = '自动：';
        value.textContent = '待判定';
    }

    status.replaceChildren(mode, value);
}

function formatLastResultLines(settings, backend) {
    const lastResult = settings.aspectLastResult;
    const backendText = backend ? `后端：${backend}` : '后端：未知';
    if (!lastResult) {
        return [
            backendText,
            '暂无上一次画幅判定。',
            '自动画幅会在生成前读取最终 prompt，再只从 1216x832 / 832x1216 中二选一。',
        ];
    }

    const preset = getAspectPreset(lastResult.preset);
    const matchedLines = Object.entries(lastResult.matched || {})
        .filter(([, terms]) => Array.isArray(terms) && terms.length > 0)
        .map(([key, terms]) => `${matchedGroupLabels[key] || key}：${terms.join('、')}`);

    const lines = [
        backendText,
        `模式：${resultModeLabels[lastResult.mode] || lastResult.mode || '未知'}`,
        lastResult.ok ? '状态：已写入' : '状态：未写入',
        `画幅：${formatPresetPixels(preset)}`,
        lastResult.reason ? `判定依据：${lastResult.reason}` : '',
        matchedLines.length > 0 ? `命中内容：${matchedLines.join('；')}` : '命中内容：无关键词命中或非自动判断。',
    ].filter(Boolean);

    if (Number.isFinite(Number(lastResult.at))) {
        lines.push(`时间：${new Date(lastResult.at).toLocaleString()}`);
    }

    return lines;
}

function showLastResultDetails(settings, backend) {
    const lines = formatLastResultLines(settings, backend);
    const html = lines.map(escapeHtml).join('<br>');
    const toastrApi = globalThis.toastr;
    const notify = toastrApi?.info;
    if (typeof notify === 'function') {
        notify.call(toastrApi, html, '画幅详情', {
            escapeHtml: false,
            closeButton: true,
            timeOut: 0,
            extendedTimeOut: 0,
        });
        return;
    }

    window.alert(lines.join('\n'));
}

function createButton(className, title, html) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    if (title) {
        button.title = title;
    }
    button.innerHTML = html;
    return button;
}

function renderAspectToolbar(toolbar) {
    const settings = getSettings();
    const backend = getCurrentAspectBackend();
    const supported = isAspectBackendSupported(backend);
    const activePresetId = settings.aspectAutoEnabled ? '' : settings.aspectManualPreset;

    toolbar.replaceChildren();
    toolbar.dataset.qdAspectBackend = backend || '';
    toolbar.dataset.qdAspectSupported = String(supported);

    const title = document.createElement('div');
    title.className = 'chatu8-qd-aspect-title';
    title.textContent = '画幅';

    const status = document.createElement('div');
    status.className = 'chatu8-qd-aspect-status';
    renderStatus(status, settings);

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
    autoLabel.title = supported ? '生成前按最终 prompt 自动判定画幅' : '当前后端暂不支持自动画幅写入';

    const autoInput = document.createElement('input');
    autoInput.type = 'checkbox';
    autoInput.checked = settings.aspectAutoEnabled;
    autoInput.dataset.qdAspectAuto = 'true';

    const autoText = document.createElement('span');
    autoText.textContent = '自动画幅';
    autoLabel.append(autoInput, autoText);

    const infoButton = createButton(
        'menu_button chatu8-qd-aspect-icon',
        '',
        '<i class="fa-solid fa-circle-info" aria-hidden="true"></i>',
    );
    infoButton.dataset.qdAspectInfo = 'true';
    infoButton.setAttribute('aria-label', '查看上一次画幅判定详情');

    toolbar.append(title, status, presets, autoLabel, infoButton);
}

function handleManualPreset(toolbar, presetId) {
    if (getSettings().aspectAutoEnabled) {
        setAspectAutoEnabled(false);
    }

    const writeResult = applyAspectPreset(presetId);
    if (writeResult.ok) {
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
    setAspectAutoEnabled(checked);
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
        const infoButton = event.target.closest('[data-qd-aspect-info]');
        if (infoButton) {
            event.preventDefault();
            showLastResultDetails(getSettings(), getCurrentAspectBackend());
            return;
        }

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
