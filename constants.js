export const extensionKey = 'chatu8_quick_dress';
export const mobileViewportWidth = 740;
export const settingsSchemaVersion = 5;
export const defaultInstructionTemplate = '【{{角色名}}换上了那套「{{服装名}}」。系统，你应当在正文中完整重复换装的这句话，尤其注意必须完整复述该服装名字，不得更改任何一个字，不得替换为其他服装，但对应角色的人称可根据设定切换。同时严禁再对服装外形及换装过程展开描述。】';
export const previousDefaultInstructionTemplates = Object.freeze([
    '【{{角色名}}换上了那套「{{服装名}}」。系统，你必须在正文中完整重复换装的这句话，尤其注意完整复述该服装名字，不得更改任何一个字，不得替换为其他服装。同时禁止再对服装外形及换装过程展开描述。】',
]);

export const ids = Object.freeze({
    overlay: 'chatu8-qd-overlay',
    panel: 'chatu8-qd-panel',
    settings: 'chatu8-qd-settings',
    floatingButton: 'chatu8-qd-floating-button',
    composerContainer: 'chatu8-qd-composer-entry',
    preview: 'chatu8-qd-preview',
});

export const defaultSettings = Object.freeze({
    enabled: true,
    buttonPlacement: 'floating',
    panelOpen: false,
    settingsCollapsed: false,
    floatingButtonPosition: null,
    panelPosition: null,
    instructionTemplate: defaultInstructionTemplate,
    templateEditorOpen: false,
    selectionOrder: [],
    draftOutfitsByCharacter: {},
    hiddenOutfitsByCharacter: {},
    outfitScrollTopByCharacter: {},
    knownOutfitsByCharacter: {},
    aspectFeatureEnabled: false,
    aspectAutoEnabled: false,
    aspectManualPreset: '832x832',
    aspectLastResult: null,
    schemaVersion: settingsSchemaVersion,
});
