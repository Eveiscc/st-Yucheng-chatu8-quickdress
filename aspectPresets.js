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
        label: '横图',
        shortLabel: '横',
        width: 1216,
        height: 832,
    }),
    '832x1216': Object.freeze({
        id: '832x1216',
        aspect: 'portrait',
        label: '竖图',
        shortLabel: '竖',
        width: 832,
        height: 1216,
    }),
});

export const aspectPresetList = Object.freeze([
    aspectPresets['832x832'],
    aspectPresets['1216x832'],
    aspectPresets['832x1216'],
]);

export function isAspectPresetId(value) {
    return Object.prototype.hasOwnProperty.call(aspectPresets, String(value || ''));
}

export function getAspectPreset(value) {
    return aspectPresets[String(value || '')] || aspectPresets[defaultAspectPresetId];
}

export function getAspectPresetByAspect(aspect) {
    return aspectPresetList.find((preset) => preset.aspect === aspect) || aspectPresets[defaultAspectPresetId];
}

export function parseAspectPreset(value) {
    const match = String(value || '').trim().match(/^(\d+)x(\d+)$/i);
    if (!match) {
        return null;
    }

    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
        return null;
    }

    const id = `${width}x${height}`;
    return {
        id,
        width,
        height,
        aspect: width === height ? 'square' : width > height ? 'landscape' : 'portrait',
    };
}
