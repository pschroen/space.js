/**
 * @author pschroen / https://ufo.ai/
 */

import { Color } from '../math/Color.js';
import { Easing } from '../tween/Easing.js';
import { Interface } from '../utils/Interface.js';
import { Stage } from '../utils/Stage.js';

import { ticker } from '../tween/Ticker.js';
import { clearTween, defer, tween } from '../tween/Tween.js';

/**
 * Meter.
 * @example
 * const meter = new Meter({
 *     value: Math.random(),
 *     precision: 2
 * });
 * meter.animateIn();
 * document.body.appendChild(meter.element);
 *
 * function animate() {
 *     requestAnimationFrame(animate);
 *
 *     meter.update();
 * }
 *
 * requestAnimationFrame(animate);
 */
export class Meter extends Interface {
    constructor({
        value,
        ghost,
        width = 300,
        precision = 0,
        range = 1,
        suffix = '',
        format = value => `${value}${suffix}`,
        noRange = false,
        noText = false,
        noGradient = false
    } = {}) {
        super('.meter');

        this.value = value;
        this.ghost = ghost;
        this.width = width;
        this.precision = precision;
        this.range = range;
        this.format = format;
        this.noRange = noRange;
        this.noText = noText;
        this.noGradient = noGradient;

        if (!Stage.root) {
            Stage.root = document.querySelector(':root');
            Stage.rootStyle = getComputedStyle(Stage.root);
        }

        this.startTime = performance.now();
        this.frame = 0;

        this.height = this.noRange ? 20 : this.noText ? 15 : 40;
        this.rangeWidth = 0;
        this.animatedIn = false;
        this.needsUpdate = false;

        this.lineColors = {
            graph: Stage.rootStyle.getPropertyValue('--ui-color-line').trim(),
            bottom: Stage.rootStyle.getPropertyValue('--ui-color-graph-bottom-line').trim()
        };

        this.colorRange = [
            new Color(Stage.rootStyle.getPropertyValue('--ui-color-range-1').trim()),
            new Color(Stage.rootStyle.getPropertyValue('--ui-color-range-2').trim()),
            new Color(Stage.rootStyle.getPropertyValue('--ui-color-range-3').trim()),
            new Color(Stage.rootStyle.getPropertyValue('--ui-color-range-4').trim())
        ];

        this.colorStep = 1 / 3 / 5; // 5 steps per colour interpolation
        this.color = new Color();
        this.alpha = 1;

        this.props = {
            xMultiplier: 0,
            progress: 0
        };

        this.init();
        this.initCanvas();
        this.setRange(this.range);
        this.setValue(this.value);

        if (this.ghost !== undefined) {
            this.setGhostValue(this.ghost);
        }

        this.setWidth(this.width);
    }

    async init() {
        this.css({
            position: 'relative',
            width: this.width,
            height: this.height
        });

        if (!this.noRange || !this.noText) {
            this.container = new Interface('.container');
            this.container.css({
                position: 'relative',
                zIndex: 1,
                pointerEvents: 'none'
            });
            this.add(this.container);

            if (!this.noRange && !this.noText) {
                this.number = new Interface('.number');
                this.number.css({
                    cssFloat: 'right',
                    fontSize: 'var(--ui-secondary-font-size)',
                    letterSpacing: 'var(--ui-secondary-letter-spacing)'
                });
                this.container.add(this.number);
            }

            if (!this.noText) {
                if (this.noRange) {
                    this.info = new Interface('.info');
                    this.info.css({
                        cssFloat: 'left',
                        fontSize: 'var(--ui-secondary-font-size)',
                        letterSpacing: 'var(--ui-secondary-letter-spacing)'
                    });
                    this.container.add(this.info);
                } else {
                    this.info = new Interface('.info');
                    this.info.css({
                        position: 'absolute',
                        right: 0,
                        bottom: 3,
                        fontSize: 'var(--ui-secondary-font-size)',
                        letterSpacing: 'var(--ui-secondary-letter-spacing)',
                        zIndex: 1,
                        pointerEvents: 'none',
                        opacity: 0
                    });
                    this.info.text(this.format(Number(0).toFixed(this.precision))); // Min value
                    this.info.width = 0;
                    this.add(this.info);

                    await defer();

                    this.info.width = this.info.element.getBoundingClientRect().width;
                    this.update(this.value);
                }
            }
        }
    }

    initCanvas() {
        this.canvas = new Interface(null, 'canvas');
        this.canvas.css({
            position: 'absolute',
            left: 0,
            top: 0,
            pointerEvents: 'none'
        });
        this.context = this.canvas.element.getContext('2d');
        this.add(this.canvas);
    }

    createGradient(x0, y0, x1, y1, alpha = 1) {
        this.alpha = alpha;

        const gradient = this.context.createLinearGradient(x0, y0, x1, y1);

        let offset = 0;

        for (let i = 0; i < 3; i++) {
            for (let t = 0; t < 5; t++) {
                gradient.addColorStop(offset, this.toRGBA(this.color.lerpColors(this.colorRange[i], this.colorRange[i + 1], Easing.easeInOutSine(t / 5)), 1));

                offset += this.colorStep;
            }
        }

        gradient.addColorStop(offset, this.toRGBA(this.colorRange[3], 1));

        return gradient;
    }

    toRGBA(color, alpha) {
        return `rgb(${Math.round(color.r * 255)} ${Math.round(color.g * 255)} ${Math.round(color.b * 255)} / ${alpha * this.alpha})`;
    }

    getRangeWidth(range) {
        return this.width / range;
    }

    // Public methods

    setRange(range) {
        this.range = range;
        this.rangeWidth = this.getRangeWidth(this.range);

        if (this.number) {
            this.number.text(this.format(this.range.toFixed(this.precision)));
        }

        this.needsUpdate = true;
    }

    setGhostValue(value) {
        if (!isNaN(value)) {
            this.ghost = value;
        } else {
            this.ghost = this.value;
        }

        this.needsUpdate = true;

        this.update();
    }

    setValue(value) {
        if (value === undefined) {
            return;
        }

        this.value = value;

        if (this.info) {
            if (!this.noRange) {
                let x = this.width - this.value * this.rangeWidth;

                if (x + this.info.width > this.width) {
                    x = this.width - this.info.width;
                }

                this.info.css({ right: x });
            }

            this.info.text(this.format(this.value.toFixed(this.precision)));
        }

        this.needsUpdate = true;

        this.update();
    }

    setWidth(width) {
        this.width = width;
        this.rangeWidth = this.getRangeWidth(this.range);

        this.css({
            width: this.width,
            height: this.height
        });

        const dpr = 2; // Always 2

        this.canvas.element.width = Math.round(this.width * dpr);
        this.canvas.element.height = Math.round(this.height * dpr);
        this.canvas.element.style.width = `${this.width}px`;
        this.canvas.element.style.height = `${this.height}px`;
        this.context.scale(dpr, dpr);

        this.strokeStyle = this.createGradient(0, 0, this.width, 0);

        this.needsUpdate = true;

        this.update();
    }

    update(value) {
        if (!ticker.isAnimating && ++this.frame > ticker.frame) {
            ticker.onTick(performance.now() - this.startTime);
        }

        if (value !== undefined) {
            if (this.ghost !== undefined) {
                this.ghost = this.value;
            }

            this.setValue(value);
        }

        if (this.needsUpdate) {
            this.drawGraph();
            this.needsUpdate = false;
        }
    }

    drawGraph() {
        const y = this.noText ? 7 : 19;

        this.context.globalAlpha = 1;
        this.context.clearRect(0, 0, this.canvas.element.width, this.canvas.element.height);

        // Draw bottom line
        this.context.lineWidth = 1;
        this.context.strokeStyle = this.lineColors.bottom;

        this.context.beginPath();
        this.context.moveTo(0, y);
        this.context.lineTo(this.width * this.props.progress, y);
        this.context.stroke();

        // Draw graph line
        if (this.ghost !== undefined) {
            this.drawPath(y, this.ghost, true);
        }

        if (this.value !== undefined) {
            this.drawPath(y, this.value);
        }
    }

    drawPath(y, value, ghost) {
        if (ghost) {
            this.context.globalAlpha = 0.35;
        } else {
            this.context.globalAlpha = 1;
        }

        // Draw graph line
        this.context.lineWidth = 1.5;

        if (this.noGradient) {
            this.context.strokeStyle = this.lineColors.graph;
        } else {
            this.context.strokeStyle = this.strokeStyle;
            this.context.shadowColor = 'rgb(255 255 255 / 0.2)';
            this.context.shadowBlur = 15;
        }

        this.context.beginPath();
        this.context.moveTo(0, y);
        this.context.lineTo(value * this.rangeWidth * this.props.xMultiplier, y);
        this.context.stroke();
    }

    animateIn(fast) {
        clearTween(this.props);

        if (fast) {
            this.props.xMultiplier = 1;
            this.props.progress = 1;

            this.animatedIn = true;
            this.needsUpdate = true;

            this.update();

            if (this.info) {
                this.info.clearTween().css({ opacity: 1 });
            }

            this.clearTween().css({ opacity: 1 });
        } else {
            this.props.xMultiplier = 0;
            this.props.progress = 0;

            tween(this.props, { progress: 1 }, 500, 'easeInOutCubic', () => {
                tween(this.props, { xMultiplier: 1 }, 400, 'easeOutCubic', () => {
                    this.animatedIn = true;

                    if (this.info) {
                        this.info.clearTween().tween({ opacity: 1 }, 275, 'easeInOutCubic');
                    }
                }, () => {
                    this.needsUpdate = true;
                });
            }, () => {
                this.needsUpdate = true;
            });

            this.clearTween().css({ opacity: 0 }).tween({ opacity: 1 }, 500, 'easeOutSine');
        }
    }

    animateOut() {
        clearTween(this.props);

        this.animatedIn = false;

        tween(this.props, { xMultiplier: 0 }, 300, 'easeOutCubic', null, () => {
            this.needsUpdate = true;

            if (this.info) {
                this.info.css({ opacity: this.props.xMultiplier });
            }
        });

        this.clearTween().tween({ opacity: 0 }, 300, 'easeOutSine');
    }

    destroy() {
        this.removeListeners();

        clearTween(this.props);

        return super.destroy();
    }
}
