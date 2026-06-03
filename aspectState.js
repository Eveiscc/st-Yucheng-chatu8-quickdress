import { saveSettingsDebounced } from '../../../../script.js';
import { defaultAspectPresetId, getAspectPreset, isAspectPresetId } from './aspectPresets.js';
import { getSettings } from './settings.js';

export const aspectStateChangedEvent = 'chatu8-qd-aspect-state-changed';
const maxMatchedTermsPerGroup = 8;
const maxMatchedTermLength = 48;

function notifyAspectStateChanged() {
    if (typeof window === 'undefined') {
        return;
    }

    window.dispatchEvent(new CustomEvent(aspectStateChangedEvent));
}

function persistAspectState() {
    saveSettingsDebounced();
    notifyAspectStateChanged();
}

function normalizeMatchedTerms(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    const normalized = {};
    for (const [key, list] of Object.entries(value)) {
        if (!Array.isArray(list)) {
            continue;
        }

        const terms = list
            .map((item) => String(item || '').trim().slice(0, maxMatchedTermLength))
            .filter(Boolean)
            .slice(0, maxMatchedTermsPerGroup);
        if (terms.length > 0) {
            normalized[key] = terms;
        }
    }

    return normalized;
}

function normalizeResult(result) {
    if (!result || typeof result !== 'object') {
        return null;
    }

    const preset = isAspectPresetId(result.preset)
        ? getAspectPreset(result.preset)
        : getAspectPreset(defaultAspectPresetId);

    return {
        mode: String(result.mode || ''),
        ok: Boolean(result.ok),
        preset: preset.id,
        aspect: String(result.aspect || preset.aspect),
        reason: String(result.reason || '').slice(0, 240),
        matched: normalizeMatchedTerms(result.matched),
        backend: String(result.backend || ''),
        at: Number.isFinite(Number(result.at)) ? Number(result.at) : Date.now(),
    };
}

export function setAspectAutoEnabled(enabled) {
    const settings = getSettings();
    const nextValue = Boolean(enabled);
    if (settings.aspectAutoEnabled === nextValue) {
        return;
    }

    settings.aspectAutoEnabled = nextValue;
    persistAspectState();
}

export function setAspectManualPreset(presetId) {
    const settings = getSettings();
    const preset = getAspectPreset(presetId);
    if (settings.aspectManualPreset === preset.id) {
        return preset;
    }

    settings.aspectManualPreset = preset.id;
    persistAspectState();
    return preset;
}

export function recordAspectResult(result) {
    const settings = getSettings();
    settings.aspectLastResult = normalizeResult(result);
    persistAspectState();
}
