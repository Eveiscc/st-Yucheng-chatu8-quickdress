import { saveSettings, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { getAspectPreset, isAspectPresetId } from './aspectPresets.js';

const chatu8ExtensionKey = 'st-chatu8';

const backendFields = Object.freeze({
    novelai: Object.freeze({
        label: 'NovelAI',
        sizeField: 'novelai_size',
        widthField: 'novelai_width',
        heightField: 'novelai_height',
        sizeId: 'novelai_size',
        widthId: 'novelai_width',
        heightId: 'novelai_height',
    }),
});

function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function getAspectChatu8Settings() {
    const settings = extension_settings[chatu8ExtensionKey];
    return isObject(settings) ? settings : null;
}

export function normalizeAspectBackend(value) {
    const backend = String(value || '').trim().toLowerCase();
    return backendFields[backend] ? backend : backend;
}

export function isAspectBackendSupported(backend) {
    return Object.prototype.hasOwnProperty.call(backendFields, normalizeAspectBackend(backend));
}

function getDomValue(id) {
    const element = document.getElementById(id);
    return element ? String(element.value || '').trim() : '';
}

export function getCurrentAspectBackend(chatu8 = getAspectChatu8Settings()) {
    return normalizeAspectBackend(chatu8?.mode || getDomValue('mode'));
}

function persistChatu8SettingsNow() {
    saveSettingsDebounced();
    void saveSettings().catch((error) => {
        console.error('[st-Yucheng-chatu8-quickdress] Failed to save Chatu8 aspect settings:', error);
    });
}

function dispatchInputEvents(element) {
    if (window.$) {
        window.$(element).trigger('input').trigger('change');
        return;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
}

function setFormValue(element, value) {
    element.value = value;

    if (window.$) {
        window.$(element).val(value);
    }
}

function syncDomValue(id, value) {
    const element = document.getElementById(id);
    if (!element) {
        return false;
    }

    const normalizedValue = String(value);
    if (!canDomElementAcceptValue(element, normalizedValue)) {
        return false;
    }

    if (String(element.value) !== normalizedValue) {
        setFormValue(element, normalizedValue);
    }
    dispatchInputEvents(element);
    return true;
}

function canDomElementAcceptValue(element, value) {
    if (element.tagName !== 'SELECT') {
        return true;
    }

    return Array.from(element.options).some((option) => String(option.value) === value);
}

function valuesEqual(left, right) {
    return String(left ?? '') === String(right ?? '');
}

function verifyAspectWrite(chatu8, fields, preset, { shouldCheckSizeDom }) {
    const failures = [];
    const expectedWidth = String(preset.width);
    const expectedHeight = String(preset.height);

    if (!valuesEqual(chatu8[fields.widthField], expectedWidth)) {
        failures.push('智绘姬设置宽度未读回');
    }
    if (!valuesEqual(chatu8[fields.heightField], expectedHeight)) {
        failures.push('智绘姬设置高度未读回');
    }
    if (!valuesEqual(chatu8[fields.sizeField], preset.id)) {
        failures.push('智绘姬预设尺寸未读回');
    }

    const domChecks = [
        [fields.widthId, expectedWidth, '可见宽度未同步'],
        [fields.heightId, expectedHeight, '可见高度未同步'],
    ];
    if (shouldCheckSizeDom) {
        domChecks.unshift([fields.sizeId, preset.id, '可见预设尺寸未同步']);
    }

    for (const [id, expected, failure] of domChecks) {
        const element = document.getElementById(id);
        if (element && !valuesEqual(element.value, expected)) {
            failures.push(failure);
        }
    }

    return failures;
}

export function applyAspectPreset(presetId, { backend } = {}) {
    if (!isAspectPresetId(presetId)) {
        return {
            ok: false,
            reason: `未知画幅预设：${String(presetId || '')}`,
        };
    }

    const preset = getAspectPreset(presetId);
    const chatu8 = getAspectChatu8Settings();
    if (!chatu8) {
        return {
            ok: false,
            preset: preset.id,
            reason: '未读取到智绘姬设置',
        };
    }

    const currentBackend = normalizeAspectBackend(backend || chatu8.mode || getDomValue('mode'));
    const fields = backendFields[currentBackend];
    if (!fields) {
        return {
            ok: false,
            preset: preset.id,
            backend: currentBackend,
            reason: `当前后端 ${currentBackend || '未知'} 暂不支持画幅写入`,
        };
    }

    chatu8[fields.widthField] = String(preset.width);
    chatu8[fields.heightField] = String(preset.height);
    chatu8[fields.sizeField] = preset.id;

    const syncedSizeDom = syncDomValue(fields.sizeId, preset.id);
    syncDomValue(fields.widthId, preset.width);
    syncDomValue(fields.heightId, preset.height);

    const failures = verifyAspectWrite(chatu8, fields, preset, { shouldCheckSizeDom: syncedSizeDom });
    if (failures.length > 0) {
        return {
            ok: false,
            preset: preset.id,
            aspect: preset.aspect,
            width: preset.width,
            height: preset.height,
            backend: currentBackend,
            reason: failures.join('；'),
        };
    }

    persistChatu8SettingsNow();
    return {
        ok: true,
        preset: preset.id,
        aspect: preset.aspect,
        width: preset.width,
        height: preset.height,
        backend: currentBackend,
        reason: `已写入 ${fields.label} ${preset.id}`,
    };
}
