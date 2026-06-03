import assert from 'node:assert/strict';
import {
    aspectPresetList,
    autoAspectPresetIds,
    getAutoAspectPresetByAspect,
    isAspectPresetId,
    isAutoAspectPresetId,
} from '../aspectPresets.js';
import { analyzeAspectPrompt } from '../aspectRules.js';

function assertPreset(prompt, expectedPreset) {
    const result = analyzeAspectPrompt(prompt);
    assert.equal(result.preset, expectedPreset, `${prompt} -> ${result.preset}: ${result.reason}`);
    assert.equal(isAutoAspectPresetId(result.preset), true, `${prompt} returned non-auto preset ${result.preset}`);
}

function assertAutoOnly(prompt) {
    const result = analyzeAspectPrompt(prompt);
    assert.equal(isAutoAspectPresetId(result.preset), true, `${prompt} returned non-auto preset ${result.preset}`);
    assert.notEqual(result.preset, '3:2');
    assert.notEqual(result.preset, '2:3');
    assert.notEqual(result.preset, '512x768');
    assert.notEqual(result.preset, '768x512');
}

assert.deepEqual(autoAspectPresetIds, ['1216x832', '832x1216']);
assert.deepEqual(
    aspectPresetList.map((preset) => [preset.id, preset.shortLabel]),
    [
        ['832x832', '1:1'],
        ['1216x832', '19:13'],
        ['832x1216', '13:19'],
        ['768x512', '3:2'],
        ['512x768', '2:3'],
    ],
);
assert.equal(getAutoAspectPresetByAspect('landscape').id, '1216x832');
assert.equal(getAutoAspectPresetByAspect('portrait').id, '832x1216');
assert.equal(getAutoAspectPresetByAspect('square'), null);
assert.equal(isAspectPresetId('768x512'), true);
assert.equal(isAspectPresetId('512x768'), true);
assert.equal(isAutoAspectPresetId('1536x1024'), false);
assert.equal(isAutoAspectPresetId('1024x1536'), false);
assert.equal(isAutoAspectPresetId('3:2'), false);
assert.equal(isAutoAspectPresetId('2:3'), false);
assert.equal(isAutoAspectPresetId('832x832'), false);
assert.equal(isAutoAspectPresetId('768x512'), false);
assert.equal(isAutoAspectPresetId('512x768'), false);

assertPreset('close up, hands on knees, thighs', '832x1216');
assertPreset('solo, full body, standing, shoes', '832x1216');
assertPreset('duo, side by side, wide shot, room', '1216x832');
assertPreset('solo, portrait, face focus', '1216x832');
assertPreset('Character Prompt: solo, portrait, face focus\nCharacter UC: bad legs, bad feet', '1216x832');
assertPreset('wide shot, full body, shopping mall, solo', '832x1216');
assertPreset('soft indoor light, solo', '1216x832');
assertAutoOnly('3:2');
assertAutoOnly('2:3');
assertAutoOnly('512x768');
assertAutoOnly('768x512');

console.log('aspectRules tests passed');
