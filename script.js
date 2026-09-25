const header = document.querySelector('.site-header');
const canvas = document.querySelector('.site-header-halftone-canvas');

const prepareHalftoneCanvas = (canvas, context, width, height) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
};

const halftoneCellSize = 6.2;
const halftoneRowStep = halftoneCellSize * 0.86;
const halftoneInfluenceRadius = 72;

const paintPointerDots = (
    context, width, height, pointerX, pointerY, dotColor,
    region = { left: 0, top: 0, right: width, bottom: height },
    mode = 'all',
) => {
    const cellSize = halftoneCellSize;
    const rowStep = halftoneRowStep;
    const firstRow = Math.max(0, Math.ceil((region.top - rowStep / 2) / rowStep));

    context.fillStyle = dotColor;

    for (let rowIndex = firstRow; ; rowIndex += 1) {
        const y = rowStep / 2 + rowIndex * rowStep;
        if (y >= Math.min(height, region.bottom)) break;
        const xOffset = rowIndex % 2 === 0 ? cellSize / 2 : cellSize;
        const firstColumn = Math.max(0, Math.ceil((region.left - xOffset) / cellSize));

        for (let column = firstColumn; ; column += 1) {
            const x = xOffset + column * cellSize;
            if (x >= Math.min(width, region.right)) break;
            const proximity = Math.max(0, 1 - Math.hypot(x - pointerX, y - pointerY) / halftoneInfluenceRadius);
            if (mode === 'focus' && proximity === 0) continue;
            const radius = 0.35 + Math.pow(proximity, 1.7) * 2.4;

            context.beginPath();
            context.arc(x, y, radius, 0, Math.PI * 2);
            context.fill();
        }
    }
};

const drawPointerHalftone = (canvas, context, width, height, pointerX, pointerY, dotColor) => {
    prepareHalftoneCanvas(canvas, context, width, height);
    paintPointerDots(context, width, height, pointerX, pointerY, dotColor);
};

const createHalftoneCanvas = (className, parent) => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
        return null;
    }

    canvas.className = className;
    canvas.setAttribute('aria-hidden', 'true');
    parent.append(canvas);
    return { canvas, context };
};

const bindPointerHalftone = (target, effect, {
    color,
    getRegion,
    shouldDraw = () => true,
    beforeDraw = () => {},
    onDraw = () => {},
    onLeave = () => {},
}) => {
    if (!effect) {
        return;
    }

    const update = (event) => {
        if (!shouldDraw(event)) {
            return;
        }

        const region = getRegion();
        beforeDraw(region);
        drawPointerHalftone(
            effect.canvas,
            effect.context,
            region.width,
            region.height,
            event.clientX - region.left,
            event.clientY - region.top,
            color,
        );
        onDraw();
    };

    target.addEventListener('pointerenter', update);
    target.addEventListener('pointermove', update);
    target.addEventListener('pointerleave', onLeave);
};

if (window.matchMedia('(pointer: fine)').matches) {
    const root = document.documentElement;
    const scrollbar = document.createElement('div');
    const scrollbarThumb = document.createElement('div');
    let scrollbarHideTimer;

    scrollbar.className = 'custom-scrollbar';
    scrollbarThumb.className = 'custom-scrollbar-thumb';
    scrollbar.append(scrollbarThumb);
    document.body.append(scrollbar);
    const scrollbarHalftone = createHalftoneCanvas('custom-scrollbar-halftone', scrollbarThumb);

    const updateScrollbar = () => {
        const viewportHeight = window.innerHeight;
        const documentHeight = root.scrollHeight;
        const trackHeight = scrollbar.clientHeight;
        const maxScroll = documentHeight - viewportHeight;

        if ((scrollbar.hidden = maxScroll <= 0)) {
            return;
        }

        const thumbHeight = Math.max(32, (viewportHeight / documentHeight) * trackHeight);
        const thumbTop = (window.scrollY / maxScroll) * (trackHeight - thumbHeight);

        scrollbarThumb.style.height = `${thumbHeight}px`;
        scrollbarThumb.style.transform = `translateY(${thumbTop}px)`;
    };

    const revealScrollbar = () => {
        updateScrollbar();
        scrollbar.classList.add('is-visible');
        window.clearTimeout(scrollbarHideTimer);
        scrollbarHideTimer = window.setTimeout(() => scrollbar.classList.remove('is-visible'), 1500);
    };

    window.addEventListener('scroll', revealScrollbar, { passive: true });
    window.addEventListener('resize', updateScrollbar);
    scrollbar.addEventListener('pointerenter', () => {
        scrollbar.classList.add('is-expanded');
        revealScrollbar();
    });
    scrollbar.addEventListener('pointerleave', () => scrollbar.classList.remove('is-expanded'));
    bindPointerHalftone(scrollbarThumb, scrollbarHalftone, {
        color: getComputedStyle(document.documentElement)
            .getPropertyValue('--hover-dot').trim() || 'rgba(23, 63, 72, 0.45)',
        getRegion: () => {
            const bounds = scrollbarThumb.getBoundingClientRect();
            const borderWidth = parseFloat(getComputedStyle(scrollbarThumb).borderLeftWidth) || 0;
            return {
                left: bounds.left + borderWidth,
                top: bounds.top + borderWidth,
                width: Math.max(1, bounds.width - borderWidth * 2),
                height: Math.max(1, bounds.height - borderWidth * 2),
            };
        },
        onLeave: () => {
            scrollbarHalftone.canvas.width = 0;
            scrollbarHalftone.canvas.height = 0;
        },
    });
    scrollbarThumb.addEventListener('pointerdown', (event) => {
        const trackBounds = scrollbar.getBoundingClientRect();
        const thumbBounds = scrollbarThumb.getBoundingClientRect();
        const pointerOffset = event.clientY - thumbBounds.top;
        const maxScroll = root.scrollHeight - window.innerHeight;
        const maxThumbTop = trackBounds.height - thumbBounds.height;

        if (maxScroll <= 0 || maxThumbTop <= 0) {
            return;
        }

        event.preventDefault();
        scrollbarThumb.setPointerCapture(event.pointerId);
        const moveThumb = (moveEvent) => {
            const thumbTop = Math.min(
                maxThumbTop,
                Math.max(0, moveEvent.clientY - trackBounds.top - pointerOffset),
            );

            window.scrollTo({
                top: (thumbTop / maxThumbTop) * maxScroll,
                behavior: 'instant',
            });
        };
        const releaseThumb = () => {
            scrollbarThumb.removeEventListener('pointermove', moveThumb);
            scrollbarThumb.removeEventListener('pointerup', releaseThumb);
        };

        scrollbarThumb.addEventListener('pointermove', moveThumb);
        scrollbarThumb.addEventListener('pointerup', releaseThumb);
    });
    revealScrollbar();
}

if (header && canvas) {
    const renderContext = canvas.getContext('2d', {
        alpha: true,
        willReadFrequently: true,
    });
    const sourceCanvas = document.createElement('canvas');
    const sourceContext = sourceCanvas.getContext('2d', {
        willReadFrequently: true,
    });
    const isMobile = window.matchMedia('(max-width: 760px)').matches;
    const socialBar = isMobile ? document.querySelector('.site-header-actions') : null;
    const socialCanvas = socialBar ? document.createElement('canvas') : null;
    const socialContext = socialCanvas?.getContext('2d');

    if (socialBar && socialCanvas && socialContext) {
        socialCanvas.className = 'mobile-social-halftone-canvas';
        socialCanvas.setAttribute('aria-hidden', 'true');
        socialBar.append(socialCanvas);
    }

    if (renderContext && sourceContext) {
        let stylesheetText = '';
        let isFrameQueued = false;
        let isRendering = false;
        let pendingRender = false;

        const loadStylesheet = async () => {
            try {
                const response = await fetch('style.css', { cache: 'force-cache' });
                stylesheetText = await response.text();
            } catch {
                stylesheetText = '';
            }
        };

        const getVariable = (name, fallback) => {
            const value = getComputedStyle(document.documentElement)
                .getPropertyValue(name)
                .trim();
            return value || fallback;
        };

        const buildSnapshotMarkup = () => {
            const clone = document.body.cloneNode(true);

            const cloneHeader = clone.querySelector('.site-header');
            if (cloneHeader) {
                const spacer = document.createElement('div');
                const headerStyles = getComputedStyle(header);
                const headerMarginBottom = parseFloat(headerStyles.marginBottom) || 0;
                spacer.style.height = `${header.offsetHeight + headerMarginBottom}px`;
                cloneHeader.replaceWith(spacer);
            }

            const halftoneClone = clone.querySelector('.site-header-halftone');
            if (halftoneClone) {
                halftoneClone.remove();
            }

            const scriptClones = clone.querySelectorAll('script');
            scriptClones.forEach((scriptElement) => scriptElement.remove());

            return clone.outerHTML;
        };

        const loadSvgImage = (markup, width, height, offsetX, offsetY) => new Promise((resolve, reject) => {
            const svg = `
                <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
                    <foreignObject width="100%" height="100%">
                        <div xmlns="http://www.w3.org/1999/xhtml" style="position: relative; width: ${width}px; height: ${height}px; overflow: hidden; background: ${getVariable('--background', '#153f47')};">
                            <style>${stylesheetText}</style>
                            <div style="position: absolute; left: ${offsetX}px; top: ${offsetY}px; width: ${document.documentElement.clientWidth}px;">
                                ${markup}
                            </div>
                        </div>
                    </foreignObject>
                </svg>
            `;
            const image = new Image();

            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        });

        const drawHalftone = (targetCanvas, targetContext, width, height, minimumRadius = 0) => {
            const imageData = sourceContext.getImageData(0, 0, width, height).data;
            const dotColor = getVariable('--halftone-dot', '#ffffff');
            const cellSize = window.innerWidth <= 760 ? 5.4 : 6.2;
            const rowStep = cellSize * 0.86;
            const radiusLimit = cellSize * 0.68;

            prepareHalftoneCanvas(targetCanvas, targetContext, width, height);
            targetContext.fillStyle = dotColor;

            let rowIndex = 0;

            for (let y = cellSize / 2; y < height; y += rowStep) {
                const xOffset = rowIndex % 2 === 0 ? cellSize / 2 : cellSize;

                for (let x = xOffset; x < width; x += cellSize) {
                    let luminanceTotal = 0;
                    let brightestLuminance = 0;
                    let lightSamples = 0;
                    let samples = 0;
                    const sampleRadius = cellSize * 1.05;
                    const startY = Math.max(0, Math.floor(y - sampleRadius));
                    const endY = Math.min(height, Math.ceil(y + sampleRadius));
                    const startX = Math.max(0, Math.floor(x - sampleRadius));
                    const endX = Math.min(width, Math.ceil(x + sampleRadius));

                    for (let sampleY = startY; sampleY < endY; sampleY += 2) {
                        for (let sampleX = startX; sampleX < endX; sampleX += 2) {
                            const pixelIndex = (sampleY * width + sampleX) * 4;
                            const red = imageData[pixelIndex];
                            const green = imageData[pixelIndex + 1];
                            const blue = imageData[pixelIndex + 2];
                            const luminanceValue = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
                            luminanceTotal += luminanceValue;
                            brightestLuminance = Math.max(brightestLuminance, luminanceValue);
                            if (luminanceValue > 210) {
                                lightSamples += 1;
                            }
                            samples += 1;
                        }
                    }

                    if (!samples) {
                        continue;
                    }

                    const luminance = luminanceTotal / (samples * 255);
                    const strokeBrightness = brightestLuminance / 255;
                    const coverage = lightSamples / samples;
                    const strokeSignal = strokeBrightness > 0.82 ? 0.18 + (strokeBrightness * 0.22) : 0;
                    const coverageSignal = Math.sqrt(Math.min(0.42, coverage) / 0.42) * 0.7;
                    const fillSignal = Math.min(0.54, Math.max(0, luminance - 0.65) * 0.95);
                    const clampedSignal = Math.min(0.82, Math.max(strokeSignal, coverageSignal, fillSignal) - 0.015);
                    const radius = Math.max(
                        minimumRadius,
                        radiusLimit * Math.pow(Math.max(0, clampedSignal), 1.05),
                    );

                    if (radius <= 0.1) {
                        continue;
                    }

                    targetContext.beginPath();
                    targetContext.arc(x, y, radius, 0, Math.PI * 2);
                    targetContext.fill();
                }

                rowIndex += 1;
            }
        };

        const renderSnapshotHalftone = async (targetRect, targetCanvas, targetContext, minimumRadius = 0) => {
            const width = Math.max(1, Math.round(targetRect.width));
            const height = Math.max(1, Math.round(targetRect.height));

            sourceCanvas.width = width;
            sourceCanvas.height = height;

            const image = await loadSvgImage(
                buildSnapshotMarkup(),
                width,
                height,
                -targetRect.left,
                -window.scrollY - targetRect.top,
            );

            sourceContext.clearRect(0, 0, width, height);
            sourceContext.filter = 'blur(3.4px) contrast(1.16)';
            sourceContext.drawImage(image, 0, 0, width, height);
            sourceContext.filter = 'none';
            drawHalftone(targetCanvas, targetContext, width, height, minimumRadius);
        };

        const renderSocialHalftone = async () => {
            if (socialBar && socialCanvas && socialContext) {
                const socialRect = socialCanvas.getBoundingClientRect();
                const width = Math.max(1, Math.round(socialRect.width));
                const height = Math.max(1, Math.round(socialRect.height));
                const minimumRadius = 1.05;

                try {
                    await renderSnapshotHalftone(
                        socialRect,
                        socialCanvas,
                        socialContext,
                        minimumRadius,
                    );
                } catch {
                    sourceCanvas.width = width;
                    sourceCanvas.height = height;
                    drawHalftone(socialCanvas, socialContext, width, height, minimumRadius);
                }
            }
        };

        const render = async () => {
            const canvasRect = canvas.getBoundingClientRect();
            const width = Math.max(1, Math.round(canvasRect.width));
            const height = Math.max(1, Math.round(canvasRect.height));

            try {
                await renderSnapshotHalftone(canvasRect, canvas, renderContext);
                await renderSocialHalftone();
            } catch {
                prepareHalftoneCanvas(canvas, renderContext, width, height);
                await renderSocialHalftone();
            }
        };

        const queueRender = () => {
            if (isRendering) {
                pendingRender = true;
                return;
            }

            if (isFrameQueued) {
                pendingRender = true;
                return;
            }

            isFrameQueued = true;
            requestAnimationFrame(async () => {
                isFrameQueued = false;
                isRendering = true;
                await render();
                isRendering = false;

                if (pendingRender) {
                    pendingRender = false;
                    queueRender();
                }
            });
        };

        const queueRenderBurst = () => {
            let frameCount = 0;
            const renderBurstFrame = () => {
                queueRender();
                frameCount += 1;

                if (frameCount < 36) {
                    requestAnimationFrame(renderBurstFrame);
                }
            };

            renderBurstFrame();
        };

        loadStylesheet().then(() => {
            queueRender();
            if (document.fonts && document.fonts.ready) {
                document.fonts.ready.then(queueRender);
            }
        });

        window.addEventListener('scroll', queueRender, { passive: true });
        window.addEventListener('resize', queueRender);
        window.addEventListener('hashchange', queueRenderBurst);
        window.addEventListener('load', queueRender);

        const animateScroll = (from, to) => {
            const distance = Math.abs(to - from);
            const duration = Math.min(900, Math.max(360, distance * 0.42));
            const startedAt = performance.now();

            const step = (now) => {
                const progress = Math.min(1, (now - startedAt) / duration);
                const eased = 1 - Math.pow(1 - progress, 3);

                window.scrollTo({
                    top: from + ((to - from) * eased),
                    behavior: 'instant',
                });
                queueRender();

                if (progress < 1) {
                    requestAnimationFrame(step);
                } else {
                    window.scrollTo({ top: to, behavior: 'instant' });
                    queueRenderBurst();
                }
            };

            requestAnimationFrame(step);
        };

        header.querySelectorAll('a[href^="#"]').forEach((link) => {
            link.addEventListener('click', (event) => {
                const targetId = link.getAttribute('href');
                const target = targetId === '#top'
                    ? document.querySelector('main')
                    : document.querySelector(targetId);

                if (!target) {
                    return;
                }

                event.preventDefault();
                const from = window.scrollY;
                const targetTop = target.getBoundingClientRect().top + window.scrollY;
                const scrollTarget = targetId === '#top'
                    ? 0
                    : Math.max(0, targetTop - header.offsetHeight - 2);

                history.pushState(null, '', targetId);
                if (targetId === '#top') {
                    link.classList.add('is-resting');
                    link.querySelector('.bubble-halftone-canvas')?.classList.remove('is-visible');
                }
                link.blur();
                animateScroll(from, scrollTarget);
            });
            link.addEventListener('pointerenter', () => link.classList.remove('is-resting'));
        });

        const sectionLinks = [...header.querySelectorAll('.site-nav a')];
        const sectionTargets = sectionLinks.map((link) => ({
            link,
            target: document.querySelector(link.getAttribute('href')),
        }));
        let isSectionUpdateQueued = false;

        const updateCurrentSection = () => {
            const headerBottom = header.getBoundingClientRect().bottom;
            let currentLink = null;

            sectionTargets.forEach(({ link, target }) => {
                if (target && target.getBoundingClientRect().top <= headerBottom + 4) {
                    currentLink = link;
                }
            });

            sectionLinks.forEach((link) => {
                link.classList.toggle('is-current', link === currentLink);
            });
            isSectionUpdateQueued = false;
        };

        const queueSectionUpdate = () => {
            if (!isSectionUpdateQueued) {
                isSectionUpdateQueued = true;
                requestAnimationFrame(updateCurrentSection);
            }
        };

        window.addEventListener('scroll', queueSectionUpdate, { passive: true });
        window.addEventListener('resize', queueSectionUpdate);
        queueSectionUpdate();
    }
}

const mobileSocialBar = document.querySelector('.site-header-actions');

if (mobileSocialBar && window.matchMedia('(max-width: 760px)').matches) {
    let previousScrollY = window.scrollY;
    let isScrollUpdateQueued = false;
    let idleTimer;
    let downwardTimer;

    const clearSocialBarTimers = () => {
        window.clearTimeout(idleTimer);
        window.clearTimeout(downwardTimer);
        downwardTimer = undefined;
    };

    const hideSocialBar = () => {
        clearSocialBarTimers();
        mobileSocialBar.classList.add('is-hidden');
    };

    const showSocialBar = () => {
        clearSocialBarTimers();
        mobileSocialBar.classList.remove('is-hidden');
        idleTimer = window.setTimeout(hideSocialBar, 2500);
    };

    window.addEventListener('scroll', () => {
        if (isScrollUpdateQueued) {
            return;
        }

        isScrollUpdateQueued = true;
        requestAnimationFrame(() => {
            const currentScrollY = window.scrollY;
            const isScrollingDown = currentScrollY > previousScrollY + 4;
            const isScrollingUp = currentScrollY < previousScrollY - 4;

            if (isScrollingDown) {
                if (!mobileSocialBar.classList.contains('is-hidden') && !downwardTimer) {
                    window.clearTimeout(idleTimer);
                    downwardTimer = window.setTimeout(hideSocialBar, 500);
                }
            } else if (isScrollingUp || currentScrollY < 12) {
                showSocialBar();
            }

            previousScrollY = currentScrollY;
            isScrollUpdateQueued = false;
        });
    }, { passive: true });

    mobileSocialBar.addEventListener('pointerenter', () => {
        clearSocialBarTimers();
        mobileSocialBar.classList.remove('is-hidden');
    });
    mobileSocialBar.addEventListener('pointerleave', showSocialBar);
    mobileSocialBar.addEventListener('focusin', clearSocialBarTimers);
    mobileSocialBar.addEventListener('focusout', showSocialBar);
    showSocialBar();
}

if (window.matchMedia('(pointer: fine)').matches) {
    const linkDotColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--hover-dot').trim() || 'rgba(23, 63, 72, 0.45)';

    const attachLinkHalftone = (link, effect, isFixed) => {
        bindPointerHalftone(link, effect, {
            color: linkDotColor,
            shouldDraw: (event) => event.pointerType === 'mouse' && !link.classList.contains('is-resting'),
            getRegion: () => {
                const bounds = link.getBoundingClientRect();
                return {
                    left: bounds.left,
                    top: bounds.top,
                    width: Math.max(1, Math.round(bounds.width)),
                    height: Math.max(1, Math.round(bounds.height)),
                };
            },
            beforeDraw: ({ left, top }) => {
                if (isFixed) {
                    effect.canvas.style.left = `${left}px`;
                    effect.canvas.style.top = `${top}px`;
                }
            },
            onDraw: () => effect.canvas.classList.add('is-visible'),
            onLeave: () => effect.canvas.classList.remove('is-visible'),
        });
    };

    const bodyLinkHalftone = createHalftoneCanvas('link-halftone-canvas', document.body);

    if (bodyLinkHalftone) {
        document.querySelectorAll('main a').forEach((link) => {
            attachLinkHalftone(link, bodyLinkHalftone, true);
        });
    }

    document.querySelectorAll('.bubble-link').forEach((link) => {
        const effect = createHalftoneCanvas('bubble-halftone-canvas', link);
        attachLinkHalftone(link, effect, false);
    });
}

const page = document.querySelector('.page');

if (page && header && window.getSelection) {
    const createSelectionLayer = (parent) => {
        const layer = document.createElement('div');
        layer.className = 'selection-halftone-layer';
        layer.setAttribute('aria-hidden', 'true');
        parent.append(layer);
        return layer;
    };

    const pageSelectionLayer = createSelectionLayer(page);
    const headerSelectionLayer = createSelectionLayer(header);
    const rootStyle = getComputedStyle(document.documentElement);
    const selectionDotColor = rootStyle.getPropertyValue('--hover-dot').trim()
        || 'rgba(23, 63, 72, 0.45)';
    const selectionSurface = rootStyle.getPropertyValue('--hover-surface').trim()
        || 'rgba(255, 255, 255, 0.92)';
    let selectionRenderQueued = false;
    let selectionPaintQueued = false;
    let pointerPosition = null;
    let pieces = [];

    const roundedSelectionPath = (lines, originX, originY) => {
        const points = [];
        const push = (x, y) => points.push({ x: x - originX, y: y - originY });

        push(lines[0].left, lines[0].top);
        push(lines[0].right, lines[0].top);
        lines.forEach((line, index) => {
            push(line.right, line.bottom);
            if (lines[index + 1]) push(lines[index + 1].right, line.bottom);
        });
        push(lines.at(-1).left, lines.at(-1).bottom);
        for (let index = lines.length - 1; index >= 0; index -= 1) {
            push(lines[index].left, lines[index].top);
            if (index > 0) push(lines[index - 1].left, lines[index].top);
        }

        // Remove straight-through corners so only the true outer and inner turns curve.
        let changed = true;
        while (changed && points.length > 3) {
            changed = false;
            for (let index = points.length - 1; index >= 0; index -= 1) {
                const prev = points[(index - 1 + points.length) % points.length];
                const point = points[index];
                const next = points[(index + 1) % points.length];
                const cross = (point.x - prev.x) * (next.y - point.y)
                    - (point.y - prev.y) * (next.x - point.x);
                if ((point.x === prev.x && point.y === prev.y)
                    || (Math.abs(cross) < 0.01 && (point.x === next.x || point.y === next.y))) {
                    points.splice(index, 1);
                    changed = true;
                }
            }
        }

        const path = new Path2D();
        points.forEach((point, index) => {
            const prev = points[(index - 1 + points.length) % points.length];
            const next = points[(index + 1) % points.length];
            const prevLength = Math.hypot(point.x - prev.x, point.y - prev.y);
            const nextLength = Math.hypot(next.x - point.x, next.y - point.y);
            const radius = Math.min(8, prevLength / 2, nextLength / 2);
            const inX = point.x + ((prev.x - point.x) / prevLength) * radius;
            const inY = point.y + ((prev.y - point.y) / prevLength) * radius;
            const outX = point.x + ((next.x - point.x) / nextLength) * radius;
            const outY = point.y + ((next.y - point.y) / nextLength) * radius;
            if (index === 0) path.moveTo(inX, inY);
            else path.lineTo(inX, inY);
            path.quadraticCurveTo(point.x, point.y, outX, outY);
        });
        path.closePath();
        return path;
    };

    const selectionLines = (rects) => {
        const lines = [];
        rects.sort((a, b) => a.top - b.top || a.left - b.left).forEach((rect) => {
            const line = lines.find((item) => Math.min(item.bottom, rect.bottom)
                - Math.max(item.top, rect.top) > Math.min(item.bottom - item.top, rect.bottom - rect.top) * 0.6
                && rect.left <= item.right + 12 && rect.right >= item.left - 12);
            if (line) {
                line.left = Math.min(line.left, rect.left);
                line.right = Math.max(line.right, rect.right);
                line.top = Math.min(line.top, rect.top);
                line.bottom = Math.max(line.bottom, rect.bottom);
            } else {
                lines.push({ ...rect });
            }
        });
        return lines.sort((a, b) => a.top - b.top || a.left - b.left);
    };

    // A tiny repeating tile paints the quiet dots in one fill, even for long selections.
    const restTile = document.createElement('canvas');
    restTile.width = 124;
    restTile.height = 107;
    const restTileContext = restTile.getContext('2d');
    if (restTileContext) {
        const scaleX = restTile.width / (halftoneCellSize * 2);
        const scaleY = restTile.height / (halftoneRowStep * 2);
        restTileContext.fillStyle = selectionDotColor;
        for (let row = 0; row < 2; row += 1) {
            const y = (halftoneRowStep / 2 + row * halftoneRowStep) * scaleY;
            const columns = row === 0 ? [halftoneCellSize / 2, halftoneCellSize * 1.5]
                : [0, halftoneCellSize, halftoneCellSize * 2];
            columns.forEach((x) => {
                restTileContext.beginPath();
                restTileContext.ellipse(x * scaleX, y, .35 * scaleX, .35 * scaleY, 0, 0, Math.PI * 2);
                restTileContext.fill();
            });
        }
    }

    const focusSize = 152;

    const paintSelectionFocus = () => {
        let pointerInSelection = false;
        pieces.forEach(({ canvas, focusCanvas, focusContext, path, width, height, hitLines }) => {
            if (!pointerPosition) {
                focusCanvas.hidden = true;
                return;
            }
            const canvasBounds = canvas.getBoundingClientRect();
            const pointerX = pointerPosition.x - canvasBounds.left;
            const pointerY = pointerPosition.y - canvasBounds.top;
            if (hitLines.some((line) => pointerX >= line.left && pointerX <= line.right
                && pointerY >= line.top && pointerY <= line.bottom)) {
                pointerInSelection = true;
            }
            const left = pointerX - focusSize / 2;
            const top = pointerY - focusSize / 2;
            if (left >= width || top >= height || left + focusSize <= 0 || top + focusSize <= 0) {
                focusCanvas.hidden = true;
                return;
            }

            focusCanvas.hidden = false;
            focusCanvas.style.transform = `translate3d(${left}px, ${top}px, 0)`;
            focusContext.clearRect(0, 0, focusSize, focusSize);
            focusContext.save();
            focusContext.translate(-left, -top);
            focusContext.clip(path);
            paintPointerDots(
                focusContext, width, height, pointerX, pointerY, selectionDotColor,
                { left, top, right: left + focusSize, bottom: top + focusSize }, 'focus',
            );
            focusContext.restore();
        });
        document.documentElement.classList.toggle('is-selection-pointer',
            pointerInSelection && pointerPosition?.type === 'mouse');
    };

    const queueSelectionPaint = () => {
        if (selectionPaintQueued || !pieces.length) return;
        selectionPaintQueued = true;
        requestAnimationFrame(() => {
            selectionPaintQueued = false;
            paintSelectionFocus();
        });
    };

    const renderSelectionHalftone = () => {
        pieces = [];
        document.documentElement.classList.remove('is-selection-pointer');
        pageSelectionLayer.replaceChildren();
        headerSelectionLayer.replaceChildren();

        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.rangeCount) return;

        const isInHeader = header.contains(selection.anchorNode)
            && header.contains(selection.focusNode);
        const host = isInHeader ? header : page;
        const layer = isInHeader ? headerSelectionLayer : pageSelectionLayer;
        const hostBounds = host.getBoundingClientRect();
        const rects = [];
        const seen = new Set();

        for (let index = 0; index < selection.rangeCount; index += 1) {
            for (const bounds of selection.getRangeAt(index).getClientRects()) {
                if (bounds.width < 1 || bounds.height < 1 || bounds.height > 120) continue;
                const key = `${Math.round(bounds.left)}:${Math.round(bounds.top)}:${Math.round(bounds.width)}:${Math.round(bounds.height)}`;
                if (seen.has(key)) continue;
                seen.add(key);
                rects.push({
                    left: bounds.left - 5,
                    right: bounds.right + 5,
                    top: bounds.top - 2,
                    bottom: bounds.bottom + 2,
                });
            }
        }

        const groups = [];
        selectionLines(rects).forEach((line) => {
            const group = groups.at(-1);
            const previous = group?.at(-1);
            if (previous && line.top - previous.bottom <= 12
                && line.left < previous.right && line.right > previous.left) {
                const seam = (previous.bottom + line.top) / 2;
                previous.bottom = seam;
                line.top = seam;
                group.push(line);
            } else {
                groups.push([line]);
            }
        });

        groups.forEach((lines) => {
            const bounds = {
                left: Math.min(...lines.map((line) => line.left)),
                right: Math.max(...lines.map((line) => line.right)),
                top: lines[0].top,
                bottom: lines.at(-1).bottom,
            };
            const width = bounds.right - bounds.left;
            const height = bounds.bottom - bounds.top;
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            const focusCanvas = document.createElement('canvas');
            const focusContext = focusCanvas.getContext('2d');
            if (!context || !focusContext) return;
            const path = roundedSelectionPath(lines, bounds.left, bounds.top);
            canvas.className = 'selection-halftone-piece';
            focusCanvas.className = 'selection-halftone-piece';
            canvas.setAttribute('aria-hidden', 'true');
            focusCanvas.setAttribute('aria-hidden', 'true');
            canvas.style.left = `${bounds.left - hostBounds.left}px`;
            canvas.style.top = `${bounds.top - hostBounds.top}px`;
            focusCanvas.style.left = canvas.style.left;
            focusCanvas.style.top = canvas.style.top;
            prepareHalftoneCanvas(canvas, context, width, height);
            context.fillStyle = selectionSurface;
            context.fill(path);
            if (restTileContext) {
                const pattern = context.createPattern(restTile, 'repeat');
                pattern.setTransform(new DOMMatrix().scale(halftoneCellSize * 2 / restTile.width, halftoneRowStep * 2 / restTile.height));
                context.fillStyle = pattern;
                context.fill(path);
            }
            prepareHalftoneCanvas(focusCanvas, focusContext, focusSize, focusSize);
            layer.append(canvas, focusCanvas);
            const hitLines = lines.map((line) => ({
                left: line.left - bounds.left,
                right: line.right - bounds.left,
                top: line.top - bounds.top,
                bottom: line.bottom - bounds.top,
            }));
            pieces.push({ canvas, focusCanvas, focusContext, path, width, height, hitLines });
        });
        paintSelectionFocus();
    };

    const queueSelectionHalftone = () => {
        if (selectionRenderQueued) return;
        selectionRenderQueued = true;
        requestAnimationFrame(() => {
            selectionRenderQueued = false;
            renderSelectionHalftone();
        });
    };

    document.addEventListener('selectionchange', queueSelectionHalftone);
    document.addEventListener('pointermove', (event) => {
        pointerPosition = { x: event.clientX, y: event.clientY, type: event.pointerType };
        queueSelectionPaint();
    }, { passive: true });
    document.addEventListener('pointerleave', () => {
        pointerPosition = null;
        document.documentElement.classList.remove('is-selection-pointer');
        queueSelectionPaint();
    });
    window.addEventListener('resize', queueSelectionHalftone);
    window.addEventListener('scroll', queueSelectionPaint, { passive: true });
    document.documentElement.classList.add('has-selection-halftone');
    queueSelectionHalftone();
}
