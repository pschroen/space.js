/**
 * @author pschroen / https://ufo.ai/
 */

import { Color } from '../math/Color.js';
import { Easing } from '../tween/Easing.js';
import { Interface } from '../utils/Interface.js';
import { Stage } from '../utils/Stage.js';

import { ticker } from '../tween/Ticker.js';
import { defer } from '../tween/Tween.js';

export class PanelMeter extends Interface {
    constructor({
        name,
        precision = 0,
        range = 1,
        suffix = '',
        format = value => `${value}${suffix}`,
        value,
        ghost,
        noText = false,
        noGradient = false,
        callback
    }) {
        super('.panel-meter');

        this.name = name;
        this.precision = precision;
        this.range = range;
        this.format = format;
        this.value = value;
        this.ghost = ghost;
        this.noText = noText;
        this.noGradient = noGradient;
        this.callback = callback;

        this.height = this.noText ? 20 : 40;
        this.width = parseFloat(Stage.rootStyle.getPropertyValue('--ui-panel-width').trim());
        this.rangeWidth = 0;
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

        if (this.value === undefined) {
            this.last = performance.now();
            this.time = 0;
            this.delta = 0;
            this.count = 0;
            this.prev = 0;
            this.fps = 0;

            // Midpoint step
            this.refreshRate120 = 1000 / 90;
            this.refreshRate240 = 1000 / 180;
        }

        this.init();
        this.initCanvas();
        this.setRange(this.range);
        this.setValue(this.value);

        if (this.ghost !== undefined) {
            this.setGhostValue(this.ghost);
        }

        this.resize();
    }

    async init() {
        this.css({
            position: 'relative',
            width: this.width,
            height: this.height
        });

        this.container = new Interface('.container');
        this.container.css({
            position: 'relative',
            zIndex: 1,
            pointerEvents: 'none'
        });
        this.add(this.container);

        this.content = new Interface('.content');
        this.content.css({
            cssFloat: 'left',
            marginRight: 10,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap'
        });
        this.content.text(this.name);
        this.container.add(this.content);

        if (!this.noText) {
            this.number = new Interface('.number');
            this.number.css({
                cssFloat: 'right',
                fontSize: 'var(--ui-secondary-font-size)',
                letterSpacing: 'var(--ui-secondary-letter-spacing)'
            });
            this.container.add(this.number);

            this.info = new Interface('.info');
            this.info.css({
                position: 'absolute',
                right: 0,
                bottom: 3,
                fontSize: 'var(--ui-secondary-font-size)',
                letterSpacing: 'var(--ui-secondary-letter-spacing)',
                zIndex: 1,
                pointerEvents: 'none'
            });
            this.info.text(this.format(Number(0).toFixed(this.precision))); // Min value
            this.info.width = 0;
            this.add(this.info);

            await defer();

            this.info.width = this.info.element.getBoundingClientRect().width;
            this.update(this.value);
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

        this.strokeStyle = this.createGradient(0, 0, this.width, 0);
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

    addListeners() {
        ticker.add(this.onUpdate);
    }

    removeListeners() {
        ticker.remove(this.onUpdate);
    }

    getRangeWidth(range) {
        return this.width / range;
    }

    // Event handlers

    onUpdate = () => {
        if (!this.callback) {
            this.time = performance.now();
            this.delta = this.time - this.last;
            this.last = this.time;

            if (this.time - 1000 > this.prev) {
                this.fps = Math.round(this.count * 1000 / (this.time - this.prev));
                this.prev = this.time;
                this.count = 0;

                if (this.delta < this.refreshRate240) {
                    this.setRange(240);
                } else if (this.delta < this.refreshRate120) {
                    this.setRange(120);
                } else {
                    this.setRange(60);
                }
            }

            this.count++;

            this.update(this.fps);
        } else {
            this.value = this.callback(this.value, this);
        }
    };

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
            let x = this.width - this.value * this.rangeWidth;

            if (x + this.info.width > this.width) {
                x = this.width - this.info.width;
            }

            this.info.css({ right: x });
            this.info.text(this.format(this.value.toFixed(this.precision)));
        }

        this.needsUpdate = true;

        this.update();
    }

    resize() {
        const dpr = 2; // Always 2

        this.canvas.element.width = Math.round(this.width * dpr);
        this.canvas.element.height = Math.round(this.height * dpr);
        this.canvas.element.style.width = `${this.width}px`;
        this.canvas.element.style.height = `${this.height}px`;
        this.context.scale(dpr, dpr);

        this.update();
    }

    update(value) {
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
        const y = 19;

        this.context.globalAlpha = 1;
        this.context.clearRect(0, 0, this.canvas.element.width, this.canvas.element.height);

        // Draw bottom line
        this.context.lineWidth = 1;
        this.context.strokeStyle = this.lineColors.bottom;

        this.context.beginPath();
        this.context.moveTo(0, y);
        this.context.lineTo(this.width, y);
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
        this.context.lineTo(value * this.rangeWidth, y);
        this.context.stroke();
    }

    enable() {
        if (this.callback || (this.value === undefined && !this.callback)) {
            this.addListeners();
        }
    }

    disable() {
        if (this.callback || (this.value === undefined && !this.callback)) {
            this.removeListeners();
        }
    }

    destroy() {
        this.disable();

        return super.destroy();
    }
}
