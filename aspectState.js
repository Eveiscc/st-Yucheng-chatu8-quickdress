import { saveSettingsDebounced } from '../../../../script.js';
import { defaultAspectPresetId, getAspectPreset, isAspectPresetId } from './aspectPresets.js';
import { getSettings } from './settings.js';

export const aspectStateChangedEvent = 'chatu8-qd-aspect-state-changed';

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
        confidence: Number.isFinite(Number(result.confidence)) ? Number(result.confidence) : null,
        reason: String(result.reason || '').slice(0, 240),
        backend: String(result.backend || ''),
        at: Number.isFinite(Number(result.at)) ? Number(result.at) : Date.now(),
    };
}

export function setAspectAutoEnabled(enabled) {
    const settings = getSettings();
    settings.aspectAutoEnabled = Boolean(enabled);
    persistAspectState();
}

export function setAspectManualPreset(presetId) {
    const settings = getSettings();
    const preset = getAspectPreset(presetId);
    settings.aspectManualPreset = preset.id;
    persistAspectState();
    return preset;
}

export function recordAspectResult(result) {
    const settings = getSettings();
    settings.aspectLastResult = normalizeResult(result);
    persistAspectState();
}
