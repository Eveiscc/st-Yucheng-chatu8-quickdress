const dragThreshold = 4;
const viewportMargin = 8;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function clampPosition(position, elementRect, boundsRect) {
    const maxLeft = Math.max(viewportMargin, boundsRect.width - elementRect.width - viewportMargin);
    const maxTop = Math.max(viewportMargin, boundsRect.height - elementRect.height - viewportMargin);

    return {
        left: clamp(position.left, viewportMargin, maxLeft),
        top: clamp(position.top, viewportMargin, maxTop),
    };
}

export function bindDragHandle(handle, options) {
    if (!handle || handle.dataset.qdDragBound === 'true') {
        return;
    }

    const target = options.target || handle;
    handle.dataset.qdDragBound = 'true';

    target.addEventListener('click', (event) => {
        if (target.dataset.qdSuppressClick !== 'true') {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        delete target.dataset.qdSuppressClick;
    }, true);

    handle.addEventListener('pointerdown', (event) => {
        const ignoredTarget = options.ignoreSelector && event.target.closest(options.ignoreSelector);
        if (event.button !== 0 || ignoredTarget) {
            return;
        }

        const startRect = target.getBoundingClientRect();
        const startPosition = options.getPosition(startRect);
        let didMove = false;

        const onPointerMove = (moveEvent) => {
            const nextPosition = {
                left: startPosition.left + moveEvent.clientX - event.clientX,
                top: startPosition.top + moveEvent.clientY - event.clientY,
            };

            if (!didMove) {
                const distance = Math.hypot(moveEvent.clientX - event.clientX, moveEvent.clientY - event.clientY);
                didMove = distance >= dragThreshold;
                if (didMove) {
                    options.onDragStart?.();
                }
            }

            if (!didMove) {
                return;
            }

            moveEvent.preventDefault();
            const clamped = clampPosition(nextPosition, target.getBoundingClientRect(), options.getBounds());
            options.setPosition(clamped);
        };

        const onPointerUp = () => {
            if (handle.hasPointerCapture?.(event.pointerId)) {
                handle.releasePointerCapture(event.pointerId);
            }
            handle.removeEventListener('pointermove', onPointerMove);
            handle.removeEventListener('pointerup', onPointerUp);
            handle.removeEventListener('pointercancel', onPointerUp);

            if (didMove) {
                target.dataset.qdSuppressClick = 'true';
                setTimeout(() => delete target.dataset.qdSuppressClick, 0);
                options.onDragEnd?.();
            }
        };

        handle.setPointerCapture?.(event.pointerId);
        handle.addEventListener('pointermove', onPointerMove);
        handle.addEventListener('pointerup', onPointerUp);
        handle.addEventListener('pointercancel', onPointerUp);
    });
}
