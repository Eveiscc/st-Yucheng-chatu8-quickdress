import assert from 'node:assert/strict';
import { analyzeAspectPrompt } from '../aspectRules.js';

function assertPreset(prompt, expectedPreset) {
    const result = analyzeAspectPrompt(prompt);
    assert.equal(result.preset, expectedPreset, `${prompt} -> ${result.preset}: ${result.reason}`);
}

assertPreset('close up, hands on knees, thighs', '832x1216');
assertPreset('solo, full body, standing, shoes', '832x1216');
assertPreset('duo, side by side, wide shot, room', '1216x832');
assertPreset('solo, portrait, face focus', '1216x832');
assertPreset('Character Prompt: solo, portrait, face focus\nCharacter UC: bad legs, bad feet', '1216x832');
assertPreset('wide shot, full body, shopping mall, solo', '832x1216');
assertPreset('soft indoor light, solo', '1216x832');

console.log('aspectRules tests passed');
