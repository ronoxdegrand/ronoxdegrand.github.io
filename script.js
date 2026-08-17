const header = document.querySelector('.site-header');
const canvas = document.querySelector('.site-header-halftone-canvas');

if (header && canvas) {
    const renderContext = canvas.getContext('2d', {
        alpha: false,
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
                        <div xmlns="http://www.w3.org/1999/xhtml" style="position: relative; width: ${width}px; height: ${height}px; overflow: hidden; background: ${getVariable('--background', '#fafafa')};">
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

        const drawHalftone = (targetCanvas, targetContext, width, height) => {
            const imageData = sourceContext.getImageData(0, 0, width, height).data;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const surface = getVariable('--surface', '#ffffff');
            const dotColor = getVariable('--halftone-dot', '#5a5a5a');
            const cellSize = window.innerWidth <= 760 ? 5.4 : 6.2;
            const rowStep = cellSize * 0.86;
            const radiusLimit = cellSize * 0.68;

            targetCanvas.width = Math.max(1, Math.round(width * dpr));
            targetCanvas.height = Math.max(1, Math.round(height * dpr));
            targetCanvas.style.width = `${width}px`;
            targetCanvas.style.height = `${height}px`;

            targetContext.setTransform(dpr, 0, 0, dpr, 0, 0);
            targetContext.fillStyle = surface;
            targetContext.fillRect(0, 0, width, height);
            targetContext.fillStyle = dotColor;

            let rowIndex = 0;

            for (let y = cellSize / 2; y < height; y += rowStep) {
                const xOffset = rowIndex % 2 === 0 ? cellSize / 2 : cellSize;

                for (let x = xOffset; x < width; x += cellSize) {
                    let luminanceTotal = 0;
                    let darkestLuminance = 255;
                    let darkSamples = 0;
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
                            darkestLuminance = Math.min(darkestLuminance, luminanceValue);
                            if (luminanceValue < 214) {
                                darkSamples += 1;
                            }
                            samples += 1;
                        }
                    }

                    if (!samples) {
                        continue;
                    }

                    const luminance = luminanceTotal / (samples * 255);
                    const averageDarkness = 1 - luminance;
                    const strokeDarkness = 1 - (darkestLuminance / 255);
                    const coverage = darkSamples / samples;
                    const strokeSignal = strokeDarkness > 0.2 ? 0.18 + (strokeDarkness * 0.22) : 0;
                    const coverageSignal = Math.sqrt(Math.min(0.42, coverage) / 0.42) * 0.7;
                    const fillSignal = Math.min(0.54, averageDarkness * 0.95);
                    const clampedSignal = Math.min(0.82, Math.max(strokeSignal, coverageSignal, fillSignal) - 0.015);
                    const radius = radiusLimit * Math.pow(Math.max(0, clampedSignal), 1.05);

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

        const renderSnapshotHalftone = async (targetRect, targetCanvas, targetContext) => {
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
            drawHalftone(targetCanvas, targetContext, width, height);
        };

        const renderSocialHalftone = async () => {
            if (socialBar && socialCanvas && socialContext) {
                try {
                    await renderSnapshotHalftone(
                        socialCanvas.getBoundingClientRect(),
                        socialCanvas,
                        socialContext,
                    );
                } catch {
                    // Keep the opaque fallback background when a snapshot cannot be rendered.
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
                const dpr = Math.min(window.devicePixelRatio || 1, 2);
                canvas.width = Math.max(1, Math.round(width * dpr));
                canvas.height = Math.max(1, Math.round(height * dpr));
                canvas.style.width = `${width}px`;
                canvas.style.height = `${height}px`;
                renderContext.setTransform(dpr, 0, 0, dpr, 0, 0);
                renderContext.fillStyle = getVariable('--surface', '#ffffff');
                renderContext.fillRect(0, 0, width, height);
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
                    link.querySelector('.header-link-halftone-canvas')?.classList.remove('is-visible');
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
    const drawLinkHalftone = (canvas, context, link, event, isFixed) => {
        const linkBounds = link.getBoundingClientRect();
        const width = Math.max(1, Math.round(linkBounds.width));
        const height = Math.max(1, Math.round(linkBounds.height));
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const mouseX = event.clientX - linkBounds.left;
        const mouseY = event.clientY - linkBounds.top;
        const cellSize = 6.2;
        const rowStep = cellSize * 0.86;
        const influenceRadius = 72;

        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);

        if (isFixed) {
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            canvas.style.left = `${linkBounds.left}px`;
            canvas.style.top = `${linkBounds.top}px`;
        }

        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, width, height);
        context.fillStyle = 'rgba(255, 255, 255, 0.45)';

        let rowIndex = 0;

        for (let y = rowStep / 2; y < height; y += rowStep) {
            const xOffset = rowIndex % 2 === 0 ? cellSize / 2 : cellSize;

            for (let x = xOffset; x < width; x += cellSize) {
                const distance = Math.hypot(x - mouseX, y - mouseY);
                const proximity = Math.max(0, 1 - (distance / influenceRadius));
                const radius = 0.35 + (Math.pow(proximity, 1.7) * 2.4);

                context.beginPath();
                context.arc(x, y, radius, 0, Math.PI * 2);
                context.fill();
            }

            rowIndex += 1;
        }
    };

    const addLinkHalftone = (link, canvas, context, isFixed) => {
        const update = (event) => {
            if (event.pointerType !== 'mouse' || link.classList.contains('is-resting')) {
                return;
            }

            drawLinkHalftone(canvas, context, link, event, isFixed);
            canvas.classList.add('is-visible');
        };

        link.addEventListener('pointerenter', update);
        link.addEventListener('pointermove', update);
        link.addEventListener('pointerleave', () => canvas.classList.remove('is-visible'));
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

    const bodyLinkHalftone = createHalftoneCanvas('link-halftone-canvas', document.body);

    if (bodyLinkHalftone) {
        document.querySelectorAll('main a').forEach((link) => {
            addLinkHalftone(link, bodyLinkHalftone.canvas, bodyLinkHalftone.context, true);
        });
    }

    document.querySelectorAll('.site-header a').forEach((link) => {
        const headerLinkHalftone = createHalftoneCanvas('header-link-halftone-canvas', link);

        if (!headerLinkHalftone) {
            return;
        }

        addLinkHalftone(link, headerLinkHalftone.canvas, headerLinkHalftone.context, false);
    });
}
