import { saveSettings, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { getSettings } from './settings.js';

const chatu8ExtensionKey = 'st-chatu8';
const listSeparator = '\u0000';
const characterPresetSelectId = 'character_preset_id';
const characterOutfitListId = 'char_outfit_list';
const characterUpdateButtonId = 'character_update';

function isChatu8Settings(value) {
    return Boolean(value)
        && typeof value === 'object'
        && !Array.isArray(value)
        && Boolean(value.characterPresets)
        && typeof value.characterPresets === 'object'
        && Boolean(value.outfitPresets)
        && typeof value.outfitPresets === 'object';
}

export function getChatu8Settings() {
    const settings = extension_settings[chatu8ExtensionKey];
    return isChatu8Settings(settings) ? settings : null;
}

export function splitAliases(value) {
    return String(value || '')
        .split('|')
        .map((item) => item.trim())
        .filter(Boolean);
}

export function getPrimaryName(preset, fallback = '') {
    return splitAliases(preset?.nameCN)[0]
        || splitAliases(preset?.nameEN)[0]
        || String(fallback || '').trim();
}

export function getSecondaryName(preset, primaryName) {
    const secondary = splitAliases(preset?.nameEN)[0] || '';
    return secondary && secondary !== primaryName ? secondary : '';
}

function normalizeName(value) {
    return String(value || '').trim().toLowerCase();
}

function stripBrackets(value) {
    const match = String(value || '').trim().match(/^\[(.+)]$/);
    return match ? match[1].trim() : String(value || '').trim();
}

function sameCharacterReference(left, right) {
    const leftValue = String(left || '').trim();
    const rightValue = String(right || '').trim();
    if (!leftValue || !rightValue) {
        return false;
    }

    return leftValue === rightValue || stripBrackets(leftValue) === stripBrackets(rightValue);
}

function getCharacterAliasSet(characterId, characterPreset) {
    const aliases = new Set();
    const add = (value) => {
        const name = normalizeName(value);
        if (name) {
            aliases.add(name);
        }
    };

    add(characterId);
    add(stripBrackets(characterId));
    splitAliases(characterPreset?.nameCN).forEach(add);
    splitAliases(characterPreset?.nameEN).forEach(add);

    return aliases;
}

function splitOutfitReferences(value) {
    return String(value || '')
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);
}

export function getCharacterOutfitReferences(characterPreset) {
    return Array.isArray(characterPreset?.outfits)
        ? characterPreset.outfits
            .map((item) => String(item || '').trim())
            .filter(Boolean)
        : [];
}

function isVisibleCharacterPreset(chatu8, characterId) {
    const selectedCharacter = getSelectedCharacterPresetFromDom();
    const currentCharacterId = getCurrentCharacterPresetId(chatu8);

    if (selectedCharacter.id || selectedCharacter.label) {
        return sameCharacterReference(selectedCharacter.id, characterId)
            || sameCharacterReference(selectedCharacter.label, characterId);
    }

    return sameCharacterReference(currentCharacterId, characterId);
}

function getVisibleCharacterOutfitReferences(chatu8, characterId) {
    if (!isVisibleCharacterPreset(chatu8, characterId)) {
        return null;
    }

    const textarea = document.getElementById(characterOutfitListId);
    return textarea ? splitOutfitReferences(textarea.value) : null;
}

function addUniqueAlias(aliasMap, alias, outfitId) {
    const key = normalizeName(alias);
    if (!key) {
        return;
    }

    if (aliasMap.has(key) && aliasMap.get(key) !== outfitId) {
        aliasMap.set(key, null);
        return;
    }

    aliasMap.set(key, outfitId);
}

function buildOutfitReferenceMaps(chatu8) {
    const idMap = new Map();
    const aliasMap = new Map();

    for (const [outfitId, outfitPreset] of Object.entries(chatu8?.outfitPresets || {})) {
        idMap.set(normalizeName(outfitId), outfitId);
        splitAliases(outfitPreset?.nameCN).forEach((alias) => addUniqueAlias(aliasMap, alias, outfitId));
        splitAliases(outfitPreset?.nameEN).forEach((alias) => addUniqueAlias(aliasMap, alias, outfitId));
    }

    return { idMap, aliasMap };
}

function resolveOutfitIdWithMaps(chatu8, outfitReference, maps) {
    const reference = String(outfitReference || '').trim();
    if (!reference) {
        return '';
    }

    if (chatu8?.outfitPresets?.[reference]) {
        return reference;
    }

    const normalized = normalizeName(reference);
    return maps.idMap.get(normalized) || maps.aliasMap.get(normalized) || '';
}

export function resolveOutfitId(chatu8, outfitReference) {
    return resolveOutfitIdWithMaps(chatu8, outfitReference, buildOutfitReferenceMaps(chatu8));
}

export function resolveOutfitIds(chatu8, outfitReferences) {
    const ids = [];
    const seen = new Set();
    const maps = buildOutfitReferenceMaps(chatu8);

    for (const reference of Array.isArray(outfitReferences) ? outfitReferences : []) {
        const outfitId = resolveOutfitIdWithMaps(chatu8, reference, maps);
        if (outfitId && !seen.has(outfitId)) {
            seen.add(outfitId);
            ids.push(outfitId);
        }
    }

    return ids;
}

export function getCurrentCharacterOutfitIds(chatu8, characterId, characterPreset) {
    const visibleReferences = getVisibleCharacterOutfitReferences(chatu8, characterId);
    const references = visibleReferences || getCharacterOutfitReferences(characterPreset);
    return chatu8 ? resolveOutfitIds(chatu8, references) : references;
}

export function getEnabledOutfitIds(characterPreset, chatu8 = null, characterId = '') {
    return chatu8
        ? getCurrentCharacterOutfitIds(chatu8, characterId, characterPreset)
        : getCharacterOutfitReferences(characterPreset);
}

function outfitBelongsToCharacter(outfitPreset, aliasSet) {
    return splitAliases(outfitPreset?.owner).some((ownerName) => aliasSet.has(normalizeName(ownerName)));
}

export function getCandidateOutfitIds(chatu8, characterId, characterPreset) {
    const outfitPresets = chatu8?.outfitPresets || {};
    const enabledIds = getCurrentCharacterOutfitIds(chatu8, characterId, characterPreset);
    const aliasSet = getCharacterAliasSet(characterId, characterPreset);
    const knownIds = rememberKnownOutfits(characterId, enabledIds, outfitPresets);
    const candidateIds = new Set([...knownIds, ...enabledIds]);

    for (const [outfitId, outfitPreset] of Object.entries(outfitPresets)) {
        if (outfitBelongsToCharacter(outfitPreset, aliasSet)) {
            candidateIds.add(outfitId);
        }
    }

    const enabledSet = new Set(enabledIds);
    return [...candidateIds].sort((leftId, rightId) => {
        const leftEnabled = enabledSet.has(leftId);
        const rightEnabled = enabledSet.has(rightId);
        if (leftEnabled !== rightEnabled) {
            return leftEnabled ? -1 : 1;
        }

        const leftName = getPrimaryName(outfitPresets[leftId], leftId);
        const rightName = getPrimaryName(outfitPresets[rightId], rightId);
        return leftName.localeCompare(rightName, 'zh-Hans-CN');
    });
}

function getKnownOutfitIds(characterId, outfitPresets) {
    const settings = getSettings();
    return Array.isArray(settings.knownOutfitsByCharacter[characterId])
        ? settings.knownOutfitsByCharacter[characterId].filter((id) => outfitPresets[id])
        : [];
}

function rememberKnownOutfits(characterId, outfitIds, outfitPresets = getChatu8Settings()?.outfitPresets || {}) {
    const settings = getSettings();
    const knownIds = getKnownOutfitIds(characterId, outfitPresets);
    const nextKnownIds = [...new Set([...knownIds, ...outfitIds])];
    if (nextKnownIds.join(listSeparator) !== knownIds.join(listSeparator)) {
        settings.knownOutfitsByCharacter[characterId] = nextKnownIds;
        saveSettingsDebounced();
    }

    return nextKnownIds;
}

function rememberKnownOutfit(characterId, outfitId) {
    rememberKnownOutfits(characterId, [outfitId]);
}

function normalizeOutfitIds(chatu8, outfitIds) {
    return resolveOutfitIds(chatu8, outfitIds);
}

function sameStringList(left, right) {
    return left.join(listSeparator) === right.join(listSeparator);
}

function persistChatu8SettingsNow() {
    saveSettingsDebounced();
    void saveSettings().catch((error) => {
        console.error('[st-chatu8-quick-dress] Failed to save Chatu8 settings:', error);
    });
}

function getSelectedCharacterPresetIdFromDom() {
    return getSelectedCharacterPresetFromDom().id;
}

function getSelectedCharacterPresetFromDom() {
    const select = document.getElementById(characterPresetSelectId);
    if (!select) {
        return { id: '', label: '' };
    }

    return {
        id: String(select.value || '').trim(),
        label: String(select.selectedOptions?.[0]?.textContent || '').trim(),
    };
}

function getCurrentCharacterPresetId(chatu8 = getChatu8Settings()) {
    return String(chatu8?.characterPresetId || getSelectedCharacterPresetIdFromDom() || '').trim();
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

function syncVisibleCharacterOutfitForm(chatu8, characterId, outfitIds) {
    if (!isVisibleCharacterPreset(chatu8, characterId)) {
        return { visible: false, saved: false };
    }

    const textarea = document.getElementById(characterOutfitListId);
    if (!textarea) {
        return { visible: true, saved: false };
    }

    const nextValue = outfitIds.join('\n');
    if (textarea.value !== nextValue) {
        setFormValue(textarea, nextValue);
        dispatchInputEvents(textarea);
    }

    if (chatu8) {
        chatu8.characterPresetId = characterId;
    }

    const saveButton = document.getElementById(characterUpdateButtonId);
    if (!saveButton || saveButton.disabled) {
        return { visible: true, saved: false };
    }

    saveButton.click();
    if (textarea.value !== nextValue) {
        setFormValue(textarea, nextValue);
        dispatchInputEvents(textarea);
    }

    return { visible: true, saved: true };
}

export function getPhotoImageId(preset) {
    const ids = Array.isArray(preset?.photoImageIds) ? preset.photoImageIds.filter(Boolean) : [];
    if (ids.length === 0) {
        return '';
    }

    const selectedIndex = Number(preset?.photoIndex);
    const index = Number.isInteger(selectedIndex) ? selectedIndex : 0;
    return ids[index] || ids[0] || '';
}

export function getActiveCharacterIds(chatu8) {
    const activePresetId = chatu8?.characterEnablePresetId;
    const activePreset = activePresetId ? chatu8?.characterEnablePresets?.[activePresetId] : null;
    return Array.isArray(activePreset?.characters) ? activePreset.characters.filter(Boolean) : [];
}

function replaceCharacterOutfitsInSettings(chatu8, characterId, outfitIds) {
    const characterPreset = chatu8?.characterPresets?.[characterId];
    if (!characterPreset) {
        return null;
    }

    const validIds = normalizeOutfitIds(chatu8, outfitIds);
    const previousReferences = getCharacterOutfitReferences(characterPreset);

    characterPreset.outfits = validIds;
    validIds.forEach((outfitId) => rememberKnownOutfit(characterId, outfitId));
    return {
        characterId,
        outfitIds: validIds,
        changed: !sameStringList(previousReferences, validIds),
    };
}

export function replaceCharacterOutfits(characterId, outfitIds) {
    const chatu8 = getChatu8Settings();
    const result = replaceCharacterOutfitsInSettings(chatu8, characterId, outfitIds);
    if (!result) {
        return {
            ok: false,
            replacedCount: 0,
            changedCount: 0,
            savedVisibleCharacterIds: [],
            visibleSaveFailed: false,
            missingCharacterIds: [characterId],
        };
    }

    const visibleSave = syncVisibleCharacterOutfitForm(chatu8, result.characterId, result.outfitIds);
    if (result.changed || visibleSave.saved) {
        persistChatu8SettingsNow();
    }

    return {
        ok: true,
        replacedCount: 1,
        changedCount: result.changed ? 1 : 0,
        savedVisibleCharacterIds: visibleSave.saved ? [result.characterId] : [],
        visibleSaveFailed: visibleSave.visible && !visibleSave.saved,
        missingCharacterIds: [],
    };
}

export function replaceCharacterOutfitsByCharacter(entries) {
    const chatu8 = getChatu8Settings();
    const summary = {
        ok: false,
        replacedCount: 0,
        changedCount: 0,
        savedVisibleCharacterIds: [],
        visibleSaveFailed: false,
        missingCharacterIds: [],
    };

    for (const entry of entries) {
        const result = replaceCharacterOutfitsInSettings(chatu8, entry.characterId, entry.outfitIds);
        if (!result) {
            summary.missingCharacterIds.push(entry.characterId);
            continue;
        }

        const visibleSave = syncVisibleCharacterOutfitForm(chatu8, result.characterId, result.outfitIds);
        summary.ok = true;
        summary.replacedCount += 1;
        summary.changedCount += result.changed ? 1 : 0;

        if (visibleSave.saved) {
            summary.savedVisibleCharacterIds.push(result.characterId);
        } else if (visibleSave.visible) {
            summary.visibleSaveFailed = true;
        }
    }

    if (summary.ok || summary.savedVisibleCharacterIds.length > 0) {
        persistChatu8SettingsNow();
    }

    return summary;
}

export function appendTextToInput(text) {
    const line = String(text || '').trim();
    const textarea = document.querySelector('#send_textarea');
    if (!line || !textarea) {
        return false;
    }

    const separator = textarea.value && !textarea.value.endsWith('\n') ? '\n' : '';
    const nextValue = `${textarea.value}${separator}${line}`;

    if (window.$) {
        window.$(textarea).val(nextValue).trigger('input').trigger('change').trigger('focus');
        return true;
    }

    textarea.value = nextValue;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    textarea.focus();
    return true;
}
