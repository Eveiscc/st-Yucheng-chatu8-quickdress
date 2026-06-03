export const defaultAspectPresetId = '832x832';

export const aspectPresets = Object.freeze({
    '832x832': Object.freeze({
        id: '832x832',
        aspect: 'square',
        label: '方图',
        shortLabel: '1:1',
        width: 832,
        height: 832,
    }),
    '1216x832': Object.freeze({
        id: '1216x832',
        aspect: 'landscape',
        label: '19:13',
        shortLabel: '19:13',
        width: 1216,
        height: 832,
    }),
    '832x1216': Object.freeze({
        id: '832x1216',
        aspect: 'portrait',
        label: '13:19',
        shortLabel: '13:19',
        width: 832,
        height: 1216,
    }),
    '768x512': Object.freeze({
        id: '768x512',
        aspect: 'landscape',
        label: '3:2',
        shortLabel: '3:2',
        width: 768,
        height: 512,
    }),
    '512x768': Object.freeze({
        id: '512x768',
        aspect: 'portrait',
        label: '2:3',
        shortLabel: '2:3',
        width: 512,
        height: 768,
    }),
});

export const aspectPresetList = Object.freeze([
    aspectPresets['832x832'],
    aspectPresets['1216x832'],
    aspectPresets['832x1216'],
    aspectPresets['768x512'],
    aspectPresets['512x768'],
]);

export const autoAspectPresetIds = Object.freeze([
    '1216x832',
    '832x1216',
]);

const autoAspectPresetsByAspect = Object.freeze(Object.fromEntries(
    autoAspectPresetIds.map((id) => [aspectPresets[id].aspect, aspectPresets[id]]),
));

export function isAspectPresetId(value) {
    return Object.prototype.hasOwnProperty.call(aspectPresets, String(value || ''));
}

export function isAutoAspectPresetId(value) {
    return autoAspectPresetIds.includes(String(value || ''));
}

export function getAspectPreset(value) {
    return aspectPresets[String(value || '')] || aspectPresets[defaultAspectPresetId];
}

export function getAutoAspectPresetByAspect(aspect) {
    return autoAspectPresetsByAspect[String(aspect || '')] || null;
}
