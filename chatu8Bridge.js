import { saveSettings, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { getSettings } from './settings.js';

const chatu8ExtensionKey = 'st-chatu8';
const listSeparator = '\u0000';
const characterPresetSelectId = 'character_preset_id';
const characterOutfitListId = 'char_outfit_list';
let outfitOwnerIndexCache = null;

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

export function clearChatu8DerivedCache() {
    outfitOwnerIndexCache = null;
}

function getOutfitOwnerIndex(outfitPresets) {
    if (outfitOwnerIndexCache?.source === outfitPresets) {
        return outfitOwnerIndexCache;
    }

    const byOwner = new Map();
    const names = new Map();
    for (const [outfitId, outfitPreset] of Object.entries(outfitPresets || {})) {
        names.set(outfitId, getPrimaryName(outfitPreset, outfitId));
        for (const ownerName of splitAliases(outfitPreset?.owner)) {
            const owner = normalizeName(ownerName);
            if (!owner) {
                continue;
            }

            const ownerOutfits = byOwner.get(owner) || [];
            ownerOutfits.push(outfitId);
            byOwner.set(owner, ownerOutfits);
        }
    }

    outfitOwnerIndexCache = { source: outfitPresets, byOwner, names };
    return outfitOwnerIndexCache;
}

export function getCandidateOutfitIds(chatu8, characterId, characterPreset) {
    const outfitPresets = chatu8?.outfitPresets || {};
    const enabledIds = getCurrentCharacterOutfitIds(chatu8, characterId, characterPreset);
    const aliasSet = getCharacterAliasSet(characterId, characterPreset);
    const knownIds = rememberKnownOutfits(characterId, enabledIds, outfitPresets);
    const candidateIds = new Set([...knownIds, ...enabledIds]);
    const ownerIndex = getOutfitOwnerIndex(outfitPresets);

    for (const alias of aliasSet) {
        for (const outfitId of ownerIndex.byOwner.get(alias) || []) {
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

        const leftName = ownerIndex.names.get(leftId) || getPrimaryName(outfitPresets[leftId], leftId);
        const rightName = ownerIndex.names.get(rightId) || getPrimaryName(outfitPresets[rightId], rightId);
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

function normalizeOutfitIds(chatu8, outfitIds) {
    return resolveOutfitIds(chatu8, outfitIds);
}

function sameStringList(left, right) {
    return left.join(listSeparator) === right.join(listSeparator);
}

function getResolvedCharacterOutfitIds(chatu8, characterId) {
    const characterPreset = chatu8?.characterPresets?.[characterId];
    if (!characterPreset) {
        return null;
    }

    return normalizeOutfitIds(chatu8, getCharacterOutfitReferences(characterPreset));
}

function verifyCharacterOutfitTarget(chatu8, target) {
    const actualOutfitIds = getResolvedCharacterOutfitIds(chatu8, target.characterId);
    const expectedOutfitIds = [...target.outfitIds];
    if (!actualOutfitIds) {
        return {
            characterId: target.characterId,
            expectedOutfitIds,
            actualOutfitIds: [],
            ok: false,
            missing: true,
        };
    }

    return {
        characterId: target.characterId,
        expectedOutfitIds,
        actualOutfitIds,
        ok: sameStringList(actualOutfitIds, expectedOutfitIds),
        missing: false,
    };
}

function verifyCharacterOutfitTargets(chatu8, targets) {
    return targets.map((target) => verifyCharacterOutfitTarget(chatu8, target));
}

function reapplyFailedOutfitTargets(chatu8, verifications) {
    let changed = false;

    for (const verification of verifications) {
        if (verification.ok || verification.missing) {
            continue;
        }

        const characterPreset = chatu8?.characterPresets?.[verification.characterId];
        if (!characterPreset) {
            continue;
        }

        characterPreset.outfits = [...verification.expectedOutfitIds];
        syncVisibleCharacterOutfitForm(chatu8, verification.characterId, verification.expectedOutfitIds);
        changed = true;
    }

    return changed;
}

function persistChatu8SettingsNow() {
    saveSettingsDebounced();
    void saveSettings().catch((error) => {
        console.error('[st-Yucheng-chatu8-quickdress] Failed to save Chatu8 settings:', error);
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

function setFormValue(element, value) {
    element.value = value;

    if (window.$) {
        window.$(element).val(value);
    }
}

function syncVisibleCharacterOutfitForm(chatu8, characterId, outfitIds) {
    if (!isVisibleCharacterPreset(chatu8, characterId)) {
        return { visible: false, synced: false };
    }

    const textarea = document.getElementById(characterOutfitListId);
    if (!textarea) {
        return { visible: true, synced: false };
    }

    const nextValue = outfitIds.join('\n');
    if (textarea.value !== nextValue) {
        setFormValue(textarea, nextValue);
    }

    return { visible: true, synced: true };
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
    const changed = !sameStringList(previousReferences, validIds);

    if (changed) {
        characterPreset.outfits = validIds;
    }
    rememberKnownOutfits(characterId, validIds);
    return {
        characterId,
        outfitIds: validIds,
        changed,
    };
}

export function replaceCharacterOutfits(characterId, outfitIds) {
    const chatu8 = getChatu8Settings();
    const result = replaceCharacterOutfitsInSettings(chatu8, characterId, outfitIds);
    if (!result) {
        return {
            ok: false,
            targetCount: 1,
            replacedCount: 0,
            changedCount: 0,
            syncedVisibleCharacterIds: [],
            visibleSyncFailed: false,
            missingCharacterIds: [characterId],
            failedCharacterIds: [characterId],
            verifiedCharacterIds: [],
            verificationFailures: [],
        };
    }

    const visibleSave = syncVisibleCharacterOutfitForm(chatu8, result.characterId, result.outfitIds);
    let verifications = verifyCharacterOutfitTargets(chatu8, [{
        characterId: result.characterId,
        outfitIds: result.outfitIds,
    }]);
    if (verifications.some((verification) => !verification.ok)) {
        reapplyFailedOutfitTargets(chatu8, verifications);
        verifications = verifyCharacterOutfitTargets(chatu8, [{
            characterId: result.characterId,
            outfitIds: result.outfitIds,
        }]);
    }

    const failures = verifications.filter((verification) => !verification.ok);
    if (result.changed || visibleSave.synced || failures.length === 0) {
        persistChatu8SettingsNow();
    }

    return {
        ok: failures.length === 0,
        targetCount: 1,
        replacedCount: failures.length === 0 ? 1 : 0,
        changedCount: result.changed ? 1 : 0,
        syncedVisibleCharacterIds: visibleSave.synced ? [result.characterId] : [],
        visibleSyncFailed: visibleSave.visible && !visibleSave.synced,
        missingCharacterIds: [],
        failedCharacterIds: failures.map((failure) => failure.characterId),
        verifiedCharacterIds: failures.length === 0 ? [result.characterId] : [],
        verificationFailures: failures,
    };
}

export function replaceCharacterOutfitsByCharacter(entries) {
    const chatu8 = getChatu8Settings();
    const summary = {
        ok: false,
        targetCount: Array.isArray(entries) ? entries.length : 0,
        replacedCount: 0,
        changedCount: 0,
        syncedVisibleCharacterIds: [],
        visibleSyncFailed: false,
        missingCharacterIds: [],
        failedCharacterIds: [],
        verifiedCharacterIds: [],
        verificationFailures: [],
    };
    const targets = [];

    for (const entry of entries) {
        const result = replaceCharacterOutfitsInSettings(chatu8, entry.characterId, entry.outfitIds);
        if (!result) {
            summary.missingCharacterIds.push(entry.characterId);
            continue;
        }

        const visibleSave = syncVisibleCharacterOutfitForm(chatu8, result.characterId, result.outfitIds);
        summary.changedCount += result.changed ? 1 : 0;
        targets.push({
            characterId: result.characterId,
            outfitIds: [...result.outfitIds],
        });

        if (visibleSave.synced) {
            summary.syncedVisibleCharacterIds.push(result.characterId);
        } else if (visibleSave.visible) {
            summary.visibleSyncFailed = true;
        }
    }

    let verifications = verifyCharacterOutfitTargets(chatu8, targets);
    if (verifications.some((verification) => !verification.ok)) {
        reapplyFailedOutfitTargets(chatu8, verifications);
        verifications = verifyCharacterOutfitTargets(chatu8, targets);
    }

    summary.verificationFailures = verifications.filter((verification) => !verification.ok);
    summary.verifiedCharacterIds = verifications
        .filter((verification) => verification.ok)
        .map((verification) => verification.characterId);
    summary.failedCharacterIds = [...new Set([
        ...summary.missingCharacterIds,
        ...summary.verificationFailures.map((failure) => failure.characterId),
    ])];
    summary.replacedCount = summary.verifiedCharacterIds.length;
    summary.ok = targets.length > 0 && summary.failedCharacterIds.length === 0;

    if (targets.length > 0 || summary.syncedVisibleCharacterIds.length > 0) {
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
