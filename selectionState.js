import { saveSettingsDebounced } from '../../../../script.js';
import {
    getActiveCharacterIds,
    getCandidateOutfitIds,
    getCurrentCharacterOutfitIds,
} from './chatu8Bridge.js';
import { getSettings } from './settings.js';

const selectionSeparator = '\u0000';

function uniqueStrings(values) {
    return [...new Set((Array.isArray(values) ? values : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean))];
}

function getMapArray(map, key) {
    return Array.isArray(map?.[key]) ? map[key] : [];
}

function makeSelectionKey(characterId, outfitId) {
    return `${characterId}${selectionSeparator}${outfitId}`;
}

function parseSelectionKey(key) {
    const [characterId, outfitId] = String(key || '').split(selectionSeparator);
    return { characterId, outfitId };
}

function updateSelectionOrder(characterId, outfitId, checked) {
    const settings = getSettings();
    const key = makeSelectionKey(characterId, outfitId);
    settings.selectionOrder = settings.selectionOrder.filter((item) => item !== key);

    if (checked) {
        settings.selectionOrder.push(key);
    }
}

function revealEnabledOutfits(characterId, enabledIds) {
    const settings = getSettings();
    const hiddenIds = getMapArray(settings.hiddenOutfitsByCharacter, characterId);
    if (hiddenIds.length === 0 || enabledIds.size === 0) {
        return new Set(hiddenIds);
    }

    const nextHiddenIds = hiddenIds.filter((outfitId) => !enabledIds.has(outfitId));
    if (nextHiddenIds.length !== hiddenIds.length) {
        if (nextHiddenIds.length > 0) {
            settings.hiddenOutfitsByCharacter[characterId] = nextHiddenIds;
        } else {
            delete settings.hiddenOutfitsByCharacter[characterId];
        }
        saveSettingsDebounced();
    }

    return new Set(nextHiddenIds);
}

function createSelection(chatu8, characterId, outfitId) {
    const characterPreset = chatu8?.characterPresets?.[characterId];
    const outfitPreset = chatu8?.outfitPresets?.[outfitId];
    if (!characterPreset || !outfitPreset) {
        return null;
    }

    return { characterId, outfitId, characterPreset, outfitPreset };
}

function getCurrentEnabledOutfitIds(chatu8, characterId, characterPreset) {
    const outfitPresets = chatu8?.outfitPresets || {};
    return uniqueStrings(getCurrentCharacterOutfitIds(chatu8, characterId, characterPreset))
        .filter((outfitId) => outfitPresets[outfitId]);
}

export function getVisibleCandidateOutfitIds(chatu8, characterId, characterPreset) {
    const enabledIds = new Set(getCurrentEnabledOutfitIds(chatu8, characterId, characterPreset));
    const hiddenIds = revealEnabledOutfits(characterId, enabledIds);
    return getCandidateOutfitIds(chatu8, characterId, characterPreset)
        .filter((outfitId) => enabledIds.has(outfitId) || !hiddenIds.has(outfitId));
}

export function getRemovableCandidateOutfitIds(chatu8, characterId, characterPreset) {
    const enabledIds = new Set(getCurrentEnabledOutfitIds(chatu8, characterId, characterPreset));
    return getVisibleCandidateOutfitIds(chatu8, characterId, characterPreset)
        .filter((outfitId) => !enabledIds.has(outfitId));
}

export function getDraftOutfitIds(chatu8, characterId, characterPreset) {
    const settings = getSettings();
    const enabledIds = new Set(getCurrentEnabledOutfitIds(chatu8, characterId, characterPreset));
    const hiddenIds = revealEnabledOutfits(characterId, enabledIds);
    const hasDraft = Array.isArray(settings.draftOutfitsByCharacter[characterId]);
    const sourceIds = hasDraft
        ? settings.draftOutfitsByCharacter[characterId]
        : [...enabledIds];
    const nextIds = uniqueStrings(sourceIds)
        .filter((outfitId) => enabledIds.has(outfitId) || !hiddenIds.has(outfitId));

    if (!hasDraft || nextIds.join(selectionSeparator) !== uniqueStrings(sourceIds).join(selectionSeparator)) {
        settings.draftOutfitsByCharacter[characterId] = nextIds;
        saveSettingsDebounced();
    }

    return nextIds;
}

export function resetDraftOutfitsFromChatu8(chatu8) {
    const settings = getSettings();
    let changed = false;

    for (const characterId of getActiveCharacterIds(chatu8)) {
        const characterPreset = chatu8?.characterPresets?.[characterId];
        if (!characterPreset) {
            continue;
        }

        const currentIds = getCurrentEnabledOutfitIds(chatu8, characterId, characterPreset);
        const draftIds = getMapArray(settings.draftOutfitsByCharacter, characterId);

        if (currentIds.join(selectionSeparator) !== draftIds.join(selectionSeparator)) {
            settings.draftOutfitsByCharacter[characterId] = currentIds;
            changed = true;
        }
    }

    if (changed) {
        saveSettingsDebounced();
    }

    return changed;
}

export function setDraftOutfitChecked(characterId, outfitId, checked, { persist = true } = {}) {
    const settings = getSettings();
    const currentIds = getMapArray(settings.draftOutfitsByCharacter, characterId)
        .filter((id) => id !== outfitId);
    const nextIds = checked ? [...currentIds, outfitId] : currentIds;

    settings.draftOutfitsByCharacter[characterId] = uniqueStrings(nextIds);
    updateSelectionOrder(characterId, outfitId, checked);
    if (persist) {
        saveSettingsDebounced();
    }
}

export function getLatestSelectionsByCharacter(chatu8) {
    const settings = getSettings();
    const activeCharacterIds = getActiveCharacterIds(chatu8);
    const latestByCharacter = new Map();

    for (const key of [...settings.selectionOrder].reverse()) {
        const { characterId, outfitId } = parseSelectionKey(key);
        if (!activeCharacterIds.includes(characterId) || latestByCharacter.has(characterId)) {
            continue;
        }

        const characterPreset = chatu8?.characterPresets?.[characterId];
        const visibleIds = new Set(characterPreset
            ? getVisibleCandidateOutfitIds(chatu8, characterId, characterPreset)
            : []);
        const draftIds = new Set(getDraftOutfitIds(chatu8, characterId, characterPreset));
        if (!visibleIds.has(outfitId) || !draftIds.has(outfitId)) {
            continue;
        }

        const selection = createSelection(chatu8, characterId, outfitId);
        if (selection) {
            latestByCharacter.set(characterId, selection);
        }
    }

    for (const characterId of activeCharacterIds) {
        if (latestByCharacter.has(characterId)) {
            continue;
        }

        const characterPreset = chatu8?.characterPresets?.[characterId];
        if (!characterPreset) {
            continue;
        }

        const visibleIds = new Set(getVisibleCandidateOutfitIds(chatu8, characterId, characterPreset));
        const fallbackId = [...getDraftOutfitIds(chatu8, characterId, characterPreset)]
            .reverse()
            .find((outfitId) => visibleIds.has(outfitId));
        const selection = fallbackId ? createSelection(chatu8, characterId, fallbackId) : null;
        if (selection) {
            latestByCharacter.set(characterId, selection);
        }
    }

    return activeCharacterIds
        .map((characterId) => latestByCharacter.get(characterId))
        .filter(Boolean);
}

export function getCheckedOutfitsByCharacter(chatu8) {
    const entries = [];

    for (const characterId of getActiveCharacterIds(chatu8)) {
        const characterPreset = chatu8?.characterPresets?.[characterId];
        if (!characterPreset) {
            continue;
        }

        const visibleIds = new Set(getVisibleCandidateOutfitIds(chatu8, characterId, characterPreset));
        const outfitIds = getDraftOutfitIds(chatu8, characterId, characterPreset)
            .filter((outfitId) => visibleIds.has(outfitId) && chatu8?.outfitPresets?.[outfitId]);

        if (outfitIds.length > 0) {
            entries.push({ characterId, characterPreset, outfitIds });
        }
    }

    return entries;
}

export function getReplacementOutfitsByCharacter(chatu8) {
    const entries = [];

    for (const characterId of getActiveCharacterIds(chatu8)) {
        const characterPreset = chatu8?.characterPresets?.[characterId];
        if (!characterPreset) {
            continue;
        }

        const visibleIds = new Set(getVisibleCandidateOutfitIds(chatu8, characterId, characterPreset));
        const outfitIds = getDraftOutfitIds(chatu8, characterId, characterPreset)
            .filter((outfitId) => visibleIds.has(outfitId) && chatu8?.outfitPresets?.[outfitId]);

        entries.push({ characterId, characterPreset, outfitIds });
    }

    return entries;
}

export function splitOutfitsByCurrentActivation(chatu8, outfitsByCharacter) {
    const inactiveOutfitsByCharacter = {};
    let inactiveCount = 0;
    let activeCount = 0;

    for (const [characterId, outfitIds] of Object.entries(outfitsByCharacter || {})) {
        const characterPreset = chatu8?.characterPresets?.[characterId];
        const enabledIds = new Set(characterPreset
            ? getCurrentEnabledOutfitIds(chatu8, characterId, characterPreset)
            : []);
        const inactiveIds = [];

        for (const outfitId of uniqueStrings(outfitIds)) {
            if (enabledIds.has(outfitId)) {
                activeCount += 1;
            } else {
                inactiveIds.push(outfitId);
                inactiveCount += 1;
            }
        }

        if (inactiveIds.length > 0) {
            inactiveOutfitsByCharacter[characterId] = inactiveIds;
        }
    }

    return { activeCount, inactiveCount, inactiveOutfitsByCharacter };
}

export function hideOutfitsByCharacter(outfitsByCharacter) {
    const settings = getSettings();
    const summary = {
        changed: false,
        hiddenCount: 0,
    };

    for (const [characterId, outfitIds] of Object.entries(outfitsByCharacter)) {
        const idsToHide = uniqueStrings(outfitIds);
        if (idsToHide.length === 0) {
            continue;
        }

        const hiddenIds = new Set(getMapArray(settings.hiddenOutfitsByCharacter, characterId));
        const draftIds = new Set(getMapArray(settings.draftOutfitsByCharacter, characterId));
        let characterChanged = false;

        for (const outfitId of idsToHide) {
            const wasHidden = hiddenIds.has(outfitId);
            const wasDrafted = draftIds.has(outfitId);
            hiddenIds.add(outfitId);
            draftIds.delete(outfitId);
            updateSelectionOrder(characterId, outfitId, false);

            if (!wasHidden) {
                summary.hiddenCount += 1;
            }
            if (!wasHidden || wasDrafted) {
                characterChanged = true;
            }
        }

        if (characterChanged) {
            settings.hiddenOutfitsByCharacter[characterId] = [...hiddenIds];
            settings.draftOutfitsByCharacter[characterId] = [...draftIds];
            summary.changed = true;
        }
    }

    if (summary.changed) {
        saveSettingsDebounced();
    }

    return summary;
}

export function getOutfitScrollTop(characterId) {
    const value = Number(getSettings().outfitScrollTopByCharacter?.[characterId]);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

export function setOutfitScrollTop(characterId, scrollTop, { persist = true } = {}) {
    const settings = getSettings();
    const nextValue = Math.max(0, Math.round(Number(scrollTop) || 0));
    if (settings.outfitScrollTopByCharacter[characterId] === nextValue) {
        return false;
    }

    settings.outfitScrollTopByCharacter[characterId] = nextValue;
    if (persist) {
        saveSettingsDebounced();
    }
    return true;
}
