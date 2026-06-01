import { extension_settings } from '../../../extensions.js';
import {
    defaultInstructionTemplate,
    defaultSettings,
    extensionKey,
    previousDefaultInstructionTemplates,
    settingsSchemaVersion,
} from './constants.js';

function cloneDefaultValue(value) {
    if (Array.isArray(value)) {
        return [...value];
    }

    if (value && typeof value === 'object') {
        return { ...value };
    }

    return value;
}

function normalizePosition(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const left = Number(value.left);
    const top = Number(value.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) {
        return null;
    }

    return { left, top };
}

function normalizeStringArrayMap(value, { keepEmpty = false } = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    const normalized = {};
    for (const [key, list] of Object.entries(value)) {
        if (!Array.isArray(list)) {
            continue;
        }

        const ids = [...new Set(list
            .map((item) => String(item || '').trim())
            .filter(Boolean))];
        if (ids.length > 0 || keepEmpty) {
            normalized[key] = ids;
        }
    }

    return normalized;
}

function normalizeNumberMap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    const normalized = {};
    for (const [key, rawValue] of Object.entries(value)) {
        const number = Number(rawValue);
        if (Number.isFinite(number) && number > 0) {
            normalized[key] = Math.round(number);
        }
    }

    return normalized;
}

function migrateSettings(settings) {
    const version = Number(settings.schemaVersion) || 0;
    if (version < 2) {
        settings.hiddenOutfitsByCharacter = {};
    }
    if (version < 3 && previousDefaultInstructionTemplates.includes(settings.instructionTemplate)) {
        settings.instructionTemplate = defaultInstructionTemplate;
    }

    settings.schemaVersion = settingsSchemaVersion;
}

export function getSettings() {
    if (!extension_settings[extensionKey]) {
        extension_settings[extensionKey] = {};
    }

    const settings = extension_settings[extensionKey];
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (settings[key] === undefined) {
            settings[key] = cloneDefaultValue(value);
        }
    }

    if (!['floating', 'composer'].includes(settings.buttonPlacement)) {
        settings.buttonPlacement = defaultSettings.buttonPlacement;
    }

    if (!Array.isArray(settings.selectionOrder)) {
        settings.selectionOrder = [];
    }

    settings.selectionOrder = [...new Set(settings.selectionOrder
        .map((item) => String(item || '').trim())
        .filter(Boolean))];

    settings.draftOutfitsByCharacter = normalizeStringArrayMap(settings.draftOutfitsByCharacter, { keepEmpty: true });
    settings.hiddenOutfitsByCharacter = normalizeStringArrayMap(settings.hiddenOutfitsByCharacter);
    settings.knownOutfitsByCharacter = normalizeStringArrayMap(settings.knownOutfitsByCharacter);
    settings.outfitScrollTopByCharacter = normalizeNumberMap(settings.outfitScrollTopByCharacter);
    migrateSettings(settings);

    if (typeof settings.instructionTemplate !== 'string' || !settings.instructionTemplate.trim()) {
        settings.instructionTemplate = defaultInstructionTemplate;
    }

    settings.floatingButtonPosition = normalizePosition(settings.floatingButtonPosition);
    settings.panelPosition = normalizePosition(settings.panelPosition);

    return settings;
}
