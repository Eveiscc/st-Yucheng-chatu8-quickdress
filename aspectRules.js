import { getAspectPresetByAspect } from './aspectPresets.js';

const positiveHeaders = new Set([
    'tag think',
    'tag_think',
    'scene composition',
    'character prompt',
]);

const negativeHeaders = new Set([
    'character uc',
    'scene uc',
]);

const portraitStrongTerms = Object.freeze([
    'cowboy shot',
    'seated cowboy shot',
    'feet out of frame',
    'lower body',
    'full body',
    'hands on lap',
    'hands on knees',
    'thigh focus',
    'knees',
    'thighs',
    'legs',
    'feet',
    'shoes',
    'legs apart',
    'legs close together',
]);

const portraitMediumTerms = Object.freeze([
    'long shot',
    'standing',
    'sitting on sofa',
    'sitting on chair',
    'skirt',
    'pants',
]);

const multiTerms = Object.freeze([
    'duo',
    'group',
    '2girls',
    '2 girls',
    '2boys',
    '2 boys',
    'multiple girls',
    'multiple boys',
    'multiple people',
    '多人',
]);

const relationTerms = Object.freeze([
    'side by side',
    'table side',
    'across the table',
    'bedside interaction',
    'sofa with multiple people',
    '并排',
    '桌边对坐',
    '床边互动',
    '沙发上多人',
    '多人同框',
]);

const wideTerms = Object.freeze([
    'wide shot',
    'room panorama',
    'indoor panorama',
    '室内全景',
    '房间全景',
]);

const environmentTerms = Object.freeze([
    'room',
    'street',
    'street view',
    'shop',
    'store',
    'shopping mall',
    'restaurant',
    'stage',
    'car interior',
    '室内',
    '房间',
    '街景',
    '商店',
    '餐厅',
    '舞台',
    '车内',
]);

const lyingTerms = Object.freeze([
    'lying',
    'lying on bed',
    '横躺',
]);

const squareTerms = Object.freeze([
    'close up',
    'headshot',
    'face focus',
    'upper body',
    'bust shot',
    'portrait',
]);

function normalizeHeader(value) {
    return String(value || '')
        .trim()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

function parseHeaderLine(line) {
    const match = String(line || '').match(/^\s*([A-Za-z][A-Za-z0-9_ ]*)\s*[:：]\s*(.*)$/);
    if (!match) {
        return null;
    }

    return {
        header: normalizeHeader(match[1]),
        rest: match[2] || '',
    };
}

function isPositiveHeader(header) {
    return positiveHeaders.has(header) || /^character\s+\d+\s+prompt$/.test(header);
}

function isNegativeHeader(header) {
    return negativeHeaders.has(header) || /^character\s+\d+\s+uc$/.test(header);
}

function stripInlineNegativeSections(text) {
    return String(text || '').replace(
        /\b(?:Character(?:\s+\d+)?\s+UC|Scene\s+UC)\s*[:：][\s\S]*?(?=\b(?:Tag[_\s]think|Scene\s+Composition|Character(?:\s+\d+)?\s+Prompt)\s*[:：]|$)/gi,
        ' ',
    );
}

export function extractPositivePromptText(prompt) {
    const raw = String(prompt || '');
    const lines = raw.split(/\r?\n/);
    const positiveLines = [];
    let currentSection = 'neutral';
    let foundPositiveSection = false;

    for (const line of lines) {
        const headerLine = parseHeaderLine(line);
        if (headerLine) {
            if (isPositiveHeader(headerLine.header)) {
                currentSection = 'positive';
                foundPositiveSection = true;
                if (headerLine.rest.trim()) {
                    positiveLines.push(headerLine.rest);
                }
                continue;
            }

            currentSection = isNegativeHeader(headerLine.header) ? 'negative' : 'neutral';
            continue;
        }

        if (currentSection === 'positive') {
            positiveLines.push(line);
        }
    }

    if (foundPositiveSection) {
        return stripInlineNegativeSections(positiveLines.join('\n'));
    }

    const keptLines = [];
    let skippingNegative = false;
    for (const line of lines) {
        const headerLine = parseHeaderLine(line);
        if (headerLine) {
            skippingNegative = isNegativeHeader(headerLine.header);
            if (skippingNegative) {
                continue;
            }
        }

        if (!skippingNegative) {
            keptLines.push(line);
        }
    }

    return stripInlineNegativeSections(keptLines.join('\n'));
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createTermPattern(term) {
    const normalized = String(term || '').trim();
    if (/^[A-Za-z0-9 _-]+$/.test(normalized)) {
        const parts = normalized
            .toLowerCase()
            .replace(/[_-]+/g, ' ')
            .trim()
            .split(/\s+/)
            .map(escapeRegExp);
        return new RegExp(`(^|[^a-z0-9])${parts.join('[\\s_-]+')}(?=$|[^a-z0-9])`, 'i');
    }

    return new RegExp(escapeRegExp(normalized), 'i');
}

function matchTerms(text, terms) {
    return terms.filter((term) => createTermPattern(term).test(text));
}

function clampConfidence(value) {
    return Math.max(0.5, Math.min(0.95, Number(value.toFixed(2))));
}

function buildResult(aspect, confidence, reason, matched = {}) {
    const preset = getAspectPresetByAspect(aspect);
    return {
        aspect,
        preset: preset.id,
        confidence: clampConfidence(confidence),
        reason,
        matched,
    };
}

function firstReasonTerm(groups) {
    return groups.find((group) => group.length > 0)?.[0] || '';
}

export function analyzeAspectPrompt(prompt) {
    const positiveText = extractPositivePromptText(prompt);
    const portraitStrong = matchTerms(positiveText, portraitStrongTerms);
    const portraitMedium = matchTerms(positiveText, portraitMediumTerms);
    const multi = matchTerms(positiveText, multiTerms);
    const relation = matchTerms(positiveText, relationTerms);
    const wide = matchTerms(positiveText, wideTerms);
    const environment = matchTerms(positiveText, environmentTerms);
    const lying = matchTerms(positiveText, lyingTerms);
    const square = matchTerms(positiveText, squareTerms);
    const portraitScore = portraitStrong.length * 3 + portraitMedium.length * 2;
    const landscapeScore = multi.length * 3
        + relation.length * 3
        + lying.length * 2
        + (wide.length > 0 && environment.length > 0 ? 3 : 0);
    const matched = {
        portraitStrong,
        portraitMedium,
        multi,
        relation,
        wide,
        environment,
        lying,
        square,
    };

    if (multi.length > 0 && (relation.length > 0 || wide.length > 0 || environment.length > 0 || lying.length > 0 || portraitScore === 0)) {
        const term = firstReasonTerm([relation, multi, wide, environment, lying]);
        return buildResult(
            'landscape',
            0.76 + landscapeScore * 0.03,
            term ? `多人或横向关系信号：${term}` : '多人构图更适合横图',
            matched,
        );
    }

    if (relation.length > 0) {
        return buildResult('landscape', 0.74 + landscapeScore * 0.03, `横向关系信号：${relation[0]}`, matched);
    }

    if (wide.length > 0 && environment.length > 0 && portraitStrong.length === 0) {
        return buildResult('landscape', 0.72 + landscapeScore * 0.03, `远景和环境信号：${wide[0]} + ${environment[0]}`, matched);
    }

    if (lying.length > 0 && portraitStrong.length === 0) {
        return buildResult('landscape', 0.7 + landscapeScore * 0.03, `横向展开动作：${lying[0]}`, matched);
    }

    if (portraitScore > 0) {
        const term = firstReasonTerm([portraitStrong, portraitMedium]);
        return buildResult('portrait', 0.74 + portraitScore * 0.03, `全身或下半身锚点：${term}`, matched);
    }

    if (multi.length > 0) {
        return buildResult('landscape', 0.68 + landscapeScore * 0.03, `多人构图信号：${multi[0]}`, matched);
    }

    if (square.length > 0) {
        return buildResult('landscape', 0.68 + square.length * 0.03, `近景或肖像信号：${square[0]}，智能模式使用横图`, matched);
    }

    return buildResult('landscape', 0.55, '没有明确竖图信号，智能模式使用横图', matched);
}
