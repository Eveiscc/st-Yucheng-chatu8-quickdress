import { defaultInstructionTemplate } from './constants.js';
import { getPrimaryName } from './chatu8Bridge.js';
import { getSettings } from './settings.js';

const characterPlaceholder = '{{角色名}}';
const outfitPlaceholder = '{{服装名}}';

function getTemplate() {
    const template = String(getSettings().instructionTemplate || '').trim();
    return template || defaultInstructionTemplate;
}

function getSelectionNames(selection) {
    return {
        characterName: getPrimaryName(selection?.characterPreset, selection?.characterId),
        outfitName: getPrimaryName(selection?.outfitPreset, selection?.outfitId),
    };
}

export function buildWearInstructionPreview(selection) {
    if (!selection) {
        return '';
    }

    const { characterName, outfitName } = getSelectionNames(selection);
    return `${characterName} -> ${outfitName}`;
}

export function buildWearInstruction(selection) {
    if (!selection) {
        return '';
    }

    const { characterName, outfitName } = getSelectionNames(selection);
    return getTemplate()
        .replaceAll(characterPlaceholder, characterName)
        .replaceAll(outfitPlaceholder, outfitName);
}

export function buildWearInstructions(selections) {
    return selections
        .map((selection) => buildWearInstruction(selection))
        .filter(Boolean)
        .join('\n');
}
