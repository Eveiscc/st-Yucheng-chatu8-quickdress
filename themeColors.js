const darkSurface = Object.freeze({ r: 26, g: 26, b: 28, a: 1 });
const lightSurface = Object.freeze({ r: 246, g: 246, b: 242, a: 1 });

function clampChannel(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function toCssRgb(color) {
    return `rgb(${clampChannel(color.r)}, ${clampChannel(color.g)}, ${clampChannel(color.b)})`;
}

function parseComputedColor(value) {
    const match = String(value || '').match(/rgba?\(([^)]+)\)/i);
    if (!match) {
        return null;
    }

    const parts = match[1]
        .replaceAll(',', ' ')
        .replace('/', ' ')
        .split(/\s+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map(Number);

    if (parts.length < 3 || parts.slice(0, 3).some((part) => !Number.isFinite(part))) {
        return null;
    }

    const alpha = Number.isFinite(parts[3]) ? parts[3] : 1;
    return {
        r: parts[0],
        g: parts[1],
        b: parts[2],
        a: Math.max(0, Math.min(1, alpha)),
    };
}

function parseCssColor(value) {
    if (!value || !document?.documentElement) {
        return null;
    }

    const probe = document.createElement('span');
    probe.style.color = value;
    if (!probe.style.color) {
        return null;
    }

    probe.hidden = true;
    (document.body || document.documentElement).append(probe);
    const parsed = parseComputedColor(getComputedStyle(probe).color);
    probe.remove();
    return parsed;
}

function readThemeColor(variableName, fallback) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
    return parseCssColor(raw) || parseCssColor(fallback);
}

function luminance(color) {
    const channels = [color.r, color.g, color.b].map((channel) => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });

    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(left, right) {
    const bright = Math.max(luminance(left), luminance(right));
    const dark = Math.min(luminance(left), luminance(right));
    return (bright + 0.05) / (dark + 0.05);
}

function composite(foreground, background) {
    const alpha = foreground.a;
    return {
        r: foreground.r * alpha + background.r * (1 - alpha),
        g: foreground.g * alpha + background.g * (1 - alpha),
        b: foreground.b * alpha + background.b * (1 - alpha),
        a: 1,
    };
}

function mix(left, right, rightAmount) {
    return {
        r: left.r * (1 - rightAmount) + right.r * rightAmount,
        g: left.g * (1 - rightAmount) + right.g * rightAmount,
        b: left.b * (1 - rightAmount) + right.b * rightAmount,
        a: 1,
    };
}

function solidifySurface(surface, text) {
    const base = luminance(text) > 0.45 ? darkSurface : lightSurface;
    const solid = surface.a >= 0.92 ? { ...surface, a: 1 } : composite(surface, base);
    return contrast(solid, text) >= 4.5 ? solid : base;
}

function getThemePalette() {
    const text = readThemeColor('--SmartThemeBodyColor', 'rgb(220, 220, 210)') || darkSurface;
    const chat = readThemeColor('--SmartThemeChatTintColor', 'rgb(23, 23, 23)') || darkSurface;
    const border = readThemeColor('--SmartThemeBorderColor', 'rgba(125, 125, 125, 0.7)') || text;
    const accent = readThemeColor('--SmartThemeQuoteColor', 'rgb(120, 160, 210)') || text;
    const surface = solidifySurface(chat, text);

    return {
        text,
        surface,
        border: border.a >= 0.75 ? { ...border, a: 1 } : composite(border, surface),
        accent: accent.a >= 0.75 ? { ...accent, a: 1 } : composite(accent, surface),
        muted: mix(surface, text, 0.72),
        elevated: mix(surface, text, 0.09),
        hover: mix(surface, text, 0.16),
        button: mix(surface, text, 0.1),
    };
}

export function applyThemeColors(...elements) {
    const palette = getThemePalette();
    const variables = {
        '--chatu8-qd-ui-color': toCssRgb(palette.text),
        '--chatu8-qd-ui-muted-color': toCssRgb(palette.muted),
        '--chatu8-qd-ui-accent': toCssRgb(palette.accent),
        '--chatu8-qd-surface-color': toCssRgb(palette.surface),
        '--chatu8-qd-elevated-color': toCssRgb(palette.elevated),
        '--chatu8-qd-hover-color': toCssRgb(palette.hover),
        '--chatu8-qd-button-color': toCssRgb(palette.button),
        '--chatu8-qd-border-color': toCssRgb(palette.border),
    };

    for (const element of elements) {
        if (!element?.style) {
            continue;
        }

        for (const [name, value] of Object.entries(variables)) {
            element.style.setProperty(name, value);
        }
    }
}
