import { ids, mobileViewportWidth } from './constants.js';
import { applyThemeColors } from './themeColors.js';

const imageCache = new Map();
let configImageLoaderPromise = null;
let hoverPreviewToken = 0;
let activePreviewRow = null;

export function bindOutfitPreview(row, previewButton) {
    row.addEventListener('mouseenter', onOutfitHover);
    row.addEventListener('mouseleave', onOutfitLeave);
    row.addEventListener('focus', onOutfitHover);
    row.addEventListener('blur', onOutfitLeave);

    previewButton?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        togglePreview(row);
    });
}

function ensurePreviewShell() {
    let preview = document.getElementById(ids.preview);
    if (preview) {
        applyThemeColors(preview);
        return preview;
    }

    preview = document.createElement('aside');
    preview.id = ids.preview;
    preview.className = 'chatu8-qd-preview';
    preview.hidden = true;
    preview.innerHTML = `
        <img alt="" data-qd-preview-image>
        <div class="chatu8-qd-preview-caption" data-qd-preview-caption></div>
    `;
    document.body.append(preview);
    applyThemeColors(preview);
    return preview;
}

async function onOutfitHover(event) {
    if (isMobileViewport()) {
        return;
    }

    await showPreview(event.currentTarget);
}

function onOutfitLeave() {
    if (isMobileViewport()) {
        return;
    }

    hidePreview();
}

async function togglePreview(row) {
    const preview = document.getElementById(ids.preview);
    if (preview && !preview.hidden && activePreviewRow === row) {
        hidePreview();
        return;
    }

    await showPreview(row);
}

async function showPreview(row) {
    const imageId = row.dataset.imageId;
    if (!imageId) {
        hidePreview();
        return;
    }

    const preview = ensurePreviewShell();
    const image = preview.querySelector('[data-qd-preview-image]');
    const caption = preview.querySelector('[data-qd-preview-caption]');
    const token = ++hoverPreviewToken;

    activePreviewRow = row;
    caption.textContent = row.dataset.previewCaption || '';
    image.removeAttribute('src');
    preview.classList.add('is-loading');
    preview.hidden = false;
    positionPreview(row);

    const imageData = await loadPreviewImage(imageId);
    if (token !== hoverPreviewToken) {
        return;
    }

    if (!imageData) {
        hidePreview();
        return;
    }

    image.src = imageData;
    preview.classList.remove('is-loading');
    preview.hidden = false;
    positionPreview(row);
}

async function loadPreviewImage(imageId) {
    if (imageCache.has(imageId)) {
        return imageCache.get(imageId);
    }

    try {
        const getConfigImage = await getConfigImageLoader();
        const imageData = await getConfigImage(imageId);
        imageCache.set(imageId, imageData || null);
        return imageData || null;
    } catch (error) {
        console.warn('[st-Yucheng-chatu8-quickdress] 读取服装参考图失败:', error);
        imageCache.set(imageId, null);
        return null;
    }
}

async function getConfigImageLoader() {
    if (!configImageLoaderPromise) {
        configImageLoaderPromise = import('../st-chatu8/utils/configDatabase.js').then((module) => {
            if (typeof module.getConfigImage !== 'function') {
                throw new Error('智绘姬参考图读取接口不可用');
            }

            return module.getConfigImage;
        });
    }

    return configImageLoaderPromise;
}

function isMobileViewport() {
    const width = window.visualViewport?.width || window.innerWidth;
    return width < mobileViewportWidth;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function positionPreview(row) {
    const preview = document.getElementById(ids.preview);
    if (!preview || preview.hidden) {
        return;
    }

    const isMobile = isMobileViewport();
    const rowRect = row.getBoundingClientRect();
    const panelRect = document.getElementById(ids.panel)?.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    const width = previewRect.width || 240;
    const height = previewRect.height || 300;
    const margin = 12;
    let x;
    let y;

    preview.classList.toggle('is-mobile', isMobile);

    if (!isMobile && panelRect) {
        const rightX = panelRect.right + margin;
        const leftX = panelRect.left - width - margin;
        const rightFits = rightX + width <= window.innerWidth - margin;
        const leftFits = leftX >= margin;

        if (rightFits || !leftFits) {
            x = rightX;
        } else {
            x = leftX;
        }

        y = rowRect.top + (rowRect.height - height) / 2;
    } else {
        x = (window.innerWidth - width) / 2;
        y = rowRect.bottom + margin;
        if (y + height > window.innerHeight - margin) {
            y = rowRect.top - height - margin;
        }
    }

    preview.style.left = `${clamp(x, margin, window.innerWidth - width - margin)}px`;
    preview.style.top = `${clamp(y, margin, window.innerHeight - height - margin)}px`;
}

export function hidePreview() {
    hoverPreviewToken += 1;
    activePreviewRow = null;
    const preview = document.getElementById(ids.preview);
    if (preview) {
        preview.hidden = true;
        preview.classList.remove('is-loading');
    }
}
