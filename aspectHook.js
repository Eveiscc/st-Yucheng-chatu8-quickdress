import { eventSource } from '../../../../script.js';
import { applyAspectPreset } from './aspectBridge.js';
import { analyzeAspectPrompt } from './aspectRules.js';
import { recordAspectResult } from './aspectState.js';
import { getSettings } from './settings.js';

const generateImageRequestEvent = 'generate-image-request';
const patchedFlag = '__chatu8QuickDressAspectEmitPatched';
const aspectToastTitle = '画幅智控';

let initialized = false;

const htmlEscapes = Object.freeze({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
});

function escapeToastHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}

function notifyAspectToast(type, message) {
    try {
        const toastrApi = globalThis.toastr;
        const notify = toastrApi?.[type];
        if (typeof notify === 'function') {
            notify.call(toastrApi, message, aspectToastTitle);
        }
    } catch (error) {
        console.warn('[st-Yucheng-chatu8-quickdress] Aspect toast notification failed:', error);
    }
}

function notifyAspectMatched(width, height, reason) {
    notifyAspectToast(
        'success',
        `已匹配画幅：${escapeToastHtml(width)}*${escapeToastHtml(height)}<br>原因：${escapeToastHtml(reason || '未返回原因')}`,
    );
}

function notifyAspectFailed(reason) {
    notifyAspectToast(
        'error',
        `匹配画幅失败：${escapeToastHtml(reason || '未返回原因')}`,
    );
}

function recordAspectResultSafely(result) {
    try {
        recordAspectResult(result);
    } catch (error) {
        console.warn('[st-Yucheng-chatu8-quickdress] Aspect result recording failed:', error);
    }
}

function maybeApplyAspectToRequest(payload) {
    const settings = getSettings();
    if (!settings.enabled || !settings.aspectFeatureEnabled || !settings.aspectAutoEnabled) {
        return;
    }

    if (!payload || typeof payload !== 'object' || typeof payload.prompt !== 'string') {
        const reason = '未读取到最终生图 prompt';
        notifyAspectFailed(reason);
        recordAspectResultSafely({
            mode: 'auto',
            ok: false,
            reason,
        });
        return;
    }

    const decision = analyzeAspectPrompt(payload.prompt);
    const writeResult = applyAspectPreset(decision.preset);
    if (writeResult.ok) {
        payload.width = writeResult.width;
        payload.height = writeResult.height;
        notifyAspectMatched(writeResult.width, writeResult.height, decision.reason);
    } else {
        notifyAspectFailed(writeResult.reason);
    }

    recordAspectResultSafely({
        mode: 'auto',
        ok: writeResult.ok,
        preset: decision.preset,
        aspect: decision.aspect,
        confidence: decision.confidence,
        backend: writeResult.backend,
        reason: writeResult.ok ? decision.reason : writeResult.reason,
    });
}

export function initAspectHook() {
    if (initialized || eventSource?.[patchedFlag]) {
        return;
    }

    if (!eventSource || typeof eventSource.emit !== 'function') {
        console.warn('[st-Yucheng-chatu8-quickdress] Cannot patch eventSource.emit for aspect control.');
        return;
    }

    initialized = true;
    const originalEmit = eventSource.emit;
    eventSource[patchedFlag] = true;
    eventSource.emit = function patchedAspectEmit(eventName, payload, ...rest) {
        if (eventName === generateImageRequestEvent) {
            try {
                maybeApplyAspectToRequest(payload);
            } catch (error) {
                console.warn('[st-Yucheng-chatu8-quickdress] Aspect auto control failed:', error);
                recordAspectResultSafely({
                    mode: 'auto',
                    ok: false,
                    reason: error?.message || '智能画幅处理失败',
                });
                notifyAspectFailed(error?.message || '智能画幅处理失败');
            }
        }

        return originalEmit.call(this, eventName, payload, ...rest);
    };
}
