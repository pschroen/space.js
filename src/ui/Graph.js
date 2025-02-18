/**
 * @author pschroen / https://ufo.ai/
 */

import { Color } from '../math/Color.js';
import { Vector2 } from '../math/Vector2.js';
import { SVGPathProperties } from '../path/SVGPathProperties.js';
import { Easing } from '../tween/Easing.js';
import { Interface } from '../utils/Interface.js';
import { Stage } from '../utils/Stage.js';
import { GraphMarker } from './GraphMarker.js';

import { ticker } from '../tween/Ticker.js';
import { clearTween, delayedCall, tween } from '../tween/Tween.js';
import { clamp } from '../utils/Utils.js';

/**
 * Graph.
 * @example
 * const graph = new Graph({
 *     value: Array.from({ length: 10 }, () => Math.random()),
 *     precision: 2,
 *     lookupPrecision: 100
 * });
 * graph.animateIn();
 * document.body.appendChild(graph.element);
 *
 * function animate() {
 *     requestAnimationFrame(animate);
 *
 *     graph.update();
 * }
 *
 * requestAnimationFrame(animate);
 */
export class Graph extends Interface {
    constructor({
        value,
        ghost,
        width = 300,
        height = 60,
        resolution = 80,
        precision = 0,
        lookupPrecision = 0,
        markers = [],
        range = 1,
        suffix = '',
        format = value => `${value}${suffix}`,
        noHover = false,
        noMarker = false,
        noMarkerDrag = false,
        noGradient = false
    } = {}) {
        super('.graph');

        this.value = value;
        this.ghost = ghost;
        this.width = width;
        this.height = height;
        this.resolution = resolution;
        this.precision = precision;
        this.lookupPrecision = lookupPrecision;
        this.markers = markers;
        this.range = range;
        this.format = format;
        this.noHover = noHover;
        this.noMarker = noMarker;
        this.noMarkerDrag = noMarkerDrag;
        this.noGradient = noGradient;

        if (!Stage.root) {
            Stage.root = document.querySelector(':root');
            Stage.rootStyle = getComputedStyle(Stage.root);
        }

        this.startTime = performance.now();
        this.frame = 0;

        this.rangeHeight = 0;
        this.array = [];
        this.ghostArray = [];
        this.pathData = '';
        this.length = 0;
        this.lookup = [];
        this.bounds = null;
        this.origin = new Vector2();
        this.mouse = new Vector2();
        this.delta = new Vector2();
        this.lastTime = 0;
        this.lastMouse = new Vector2();
        this.mouseX = 0;
        this.items = [];
        this.mobileOffset = navigator.maxTouchPoints ? -50 : 0; // Position above finger
        this.isDragging = false;
        this.isDraggingAway = false;
        this.animatedIn = false;
        this.hoveredIn = false;
        this.needsUpdate = false;
        this.graphNeedsUpdate = false;
        this.initialized = false;

        this.lineColors = {
            graph: Stage.rootStyle.getPropertyValue('--ui-color-line').trim(),
            bottom: Stage.rootStyle.getPropertyValue('--ui-color-graph-bottom-line').trim(),
            handle: Stage.rootStyle.getPropertyValue('--ui-color').trim()
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
            alpha: 0,
            yMultiplier: 0,
            progress: 0
        };

        this.handleProps = {
            alpha: 0
        };

        this.init();
        this.initCanvas();

        if (!this.noMarker && this.markers.length) {
            this.setMarkers(this.markers);
        }

        this.setArray(this.value);

        if (this.ghost !== undefined) {
            this.setGhostArray(this.ghost);
        }

        this.setSize(this.width, this.height);
    }

    init() {
        this.css({
            position: 'relative',
            width: this.width,
            height: this.height,
            cursor: 'crosshair',
            pointerEvents: 'auto',
            webkitUserSelect: 'none',
            userSelect: 'none',
            touchAction: 'none'
        });

        if (!this.noHover) {
            this.info = new Interface('.info');
            this.info.invisible();
            this.info.css({
                position: 'absolute',
                left: 0,
                bottom: 'calc((var(--ui-line-height) + 3px) * -1)',
                transform: 'translateX(-50%)',
                fontSize: 'var(--ui-secondary-font-size)',
                letterSpacing: 'var(--ui-secondary-letter-spacing)',
                zIndex: 1,
                pointerEvents: 'none',
                opacity: 0
            });
            this.add(this.info);
        }
    }

    calculateLookup() {
        const properties = new SVGPathProperties(this.pathData);

        this.length = properties.getTotalLength();
        this.lookup = [];

        let i = 0;

        while (i <= 1) {
            this.lookup.push(properties.getPointAtLength(i * this.length));

            i += 1 / this.lookupPrecision;
        }
    }

    getCurveY(mouseX) {
        const x = mouseX * this.width;
        const approxIndex = Math.floor(mouseX * this.lookupPrecision);

        let i = Math.max(1, approxIndex - Math.floor(this.lookupPrecision / 4));

        for (; i < this.lookupPrecision; i++) {
            if (this.lookup[i].x > x) {
                break;
            }
        }

        if (i === this.lookupPrecision) {
            return this.lookup[this.lookupPrecision - 1].y;
        }

        const lower = this.lookup[i - 1];
        const upper = this.lookup[i];
        const percent = (x - lower.x) / (upper.x - lower.x);
        const diff = upper.y - lower.y;
        const y = lower.y + diff * percent;

        return y;
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

    addListeners() {
        if (!this.noHover) {
            this.element.addEventListener('mouseenter', this.onHover);
            this.element.addEventListener('mouseleave', this.onHover);
            window.addEventListener('pointerdown', this.onPointerDown);
            window.addEventListener('pointermove', this.onPointerMove);
        }

        this.items.forEach(item => {
            item.events.on('update', this.onMarkerUpdate);
            item.events.on('click', this.onMarkerClick);
        });
    }

    removeListeners() {
        if (!this.noHover) {
            this.element.removeEventListener('mouseenter', this.onHover);
            this.element.removeEventListener('mouseleave', this.onHover);
            window.removeEventListener('pointerdown', this.onPointerDown);
            window.removeEventListener('pointermove', this.onPointerMove);
        }

        this.items.forEach(item => {
            item.events.off('update', this.onMarkerUpdate);
            item.events.off('click', this.onMarkerClick);
        });
    }

    getRangeHeight(range) {
        return (this.height - 5) / range;
    }

    // Event handlers

    onHover = ({ type }) => {
        if (this.isDraggingAway) {
            return;
        }

        if (!this.animatedIn) {
            if (type === 'mouseenter') {
                this.hoveredIn = true;
            } else {
                this.hoveredIn = false;
            }

            return;
        }

        clearTween(this.timeout);

        if (type === 'mouseenter') {
            this.hoverIn();
        } else {
            this.timeout = delayedCall(200, () => {
                this.hoverOut();
            });
        }
    };

    onPointerDown = e => {
        if (this.element.contains(e.target)) {
            this.lastTime = performance.now();
            this.lastMouse.set(e.clientX, e.clientY);

            this.onPointerMove(e);

            window.addEventListener('pointerup', this.onPointerUp);

            this.hoverIn();
        } else {
            this.hoverOut();
        }
    };

    onPointerMove = e => {
        const event = {
            x: e.clientX,
            y: e.clientY
        };

        this.mouse.copy(event);
        this.delta.subVectors(this.mouse, this.lastMouse);

        this.bounds = this.element.getBoundingClientRect();
        this.mouseX = clamp((this.mouse.x - this.bounds.left) / this.width, 0, 1);
    };

    onPointerUp = e => {
        window.removeEventListener('pointerup', this.onPointerUp);

        if (e.target !== this.element) {
            return;
        }

        if (performance.now() - this.lastTime > 250 || this.delta.length() > 50) {
            return;
        }

        if (this.items.find(item => item.x === this.mouseX)) {
            return;
        }

        if (!this.noMarker && !this.noMarkerDrag) {
            this.addMarker([this.mouseX, this.getMarkerName()]);
        }
    };

    onMarkerUpdate = ({ dragging, target }) => {
        this.isDragging = dragging;
        this.isDraggingAway = Math.abs(this.delta.y) > 50;

        if (this.isDragging && this.isDraggingAway) {
            this.origin.subVectors(this.mouse, this.bounds);

            target.css({ left: this.origin.x, top: this.origin.y + this.mobileOffset });

            if (this.hoveredIn) {
                this.hoverOut();
            }
        } else if (this.isDragging) {
            target.x = this.mouseX;

            target.css({ top: -12 });
        } else if (this.isDraggingAway) {
            this.isDraggingAway = false;

            this.removeMarker(target);
        }

        this.needsUpdate = true;
    };

    onMarkerClick = e => {
        console.log('onMarkerClick', e);
    };

    // Public methods

    getMarkerName() {
        const names = this.items.map(item => item.name);

        let count = 1;
        let name = `Marker ${count++}`;

        while (names.includes(name)) {
            name = `Marker ${count++}`;
        }

        return name;
    }

    setMarkers(markers) {
        this.items.forEach(item => item.destroy());
        this.items.length = 0;

        markers.forEach(data => this.addMarker(data));
    }

    setArray(value) {
        if (Array.isArray(value)) {
            this.array = value;
        } else {
            this.array = new Array(this.resolution).fill(0);
        }

        this.needsUpdate = true;

        if (!this.noHover && this.lookupPrecision) {
            this.graphNeedsUpdate = true;
        }

        this.update();
    }

    setGhostArray(value) {
        if (Array.isArray(value)) {
            this.ghostArray = value;
        } else {
            this.ghostArray = new Array(this.array.length).fill(0);
        }

        this.needsUpdate = true;

        this.update();
    }

    setSize(width, height) {
        this.width = width;
        this.height = height;
        this.rangeHeight = this.getRangeHeight(this.range);

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

        this.strokeStyle = this.createGradient(0, this.height, 0, 0);
        this.fillStyle = this.createGradient(0, this.height, 0, 0, 0.07);

        this.needsUpdate = true;

        if (!this.noHover && this.lookupPrecision) {
            this.graphNeedsUpdate = true;
        }

        this.update();
    }

    addMarker([x, name]) {
        const item = new GraphMarker({ name, noDrag: this.noMarkerDrag });
        item.css({ top: -12 });
        item.x = x;
        item.multiplier = 0;
        this.add(item);

        this.items.push(item);

        if (this.initialized) {
            item.events.on('update', this.onMarkerUpdate);
            item.events.on('click', this.onMarkerClick);

            tween(item, { multiplier: 1 }, 400, 'easeOutCubic', null, () => {
                this.needsUpdate = true;

                item.css({ opacity: item.multiplier });
            });

            Stage.events.emit('marker', { type: 'add', item, target: this });
        }
    }

    removeMarker(marker) {
        const index = this.items.indexOf(marker);

        if (~index) {
            const item = this.items.splice(index, 1)[0];

            Stage.events.emit('marker', { type: 'remove', item, target: this });

            item.destroy();
        }
    }

    update(value) {
        if (!ticker.isAnimating && ++this.frame > ticker.frame) {
            ticker.onTick(performance.now() - this.startTime);
        }

        if (value !== undefined) {
            if (Array.isArray(value)) {
                this.setArray(value);
            } else {
                if (this.ghost !== undefined) {
                    const ghost = this.array.shift();
                    this.array.push(value);
                    this.ghostArray.shift();
                    this.ghostArray.push(ghost);
                } else {
                    this.array.shift();
                    this.array.push(value);
                }

                this.needsUpdate = true;

                if (!this.noHover && this.lookupPrecision) {
                    this.graphNeedsUpdate = true;
                }
            }
        }

        if (this.needsUpdate || this.hoveredIn || this.isDragging) {
            this.drawGraph();
            this.needsUpdate = false;
        }
    }

    drawGraph() {
        if (this.props.alpha <= 0) {
            return;
        }

        const w = this.width * this.props.progress;
        const h = this.height - 1;

        if (this.props.alpha < 0.001) {
            this.context.globalAlpha = 0;
        } else {
            this.context.globalAlpha = this.props.alpha;
        }

        this.context.clearRect(0, 0, this.canvas.element.width, this.canvas.element.height);

        // Draw bottom line
        this.context.lineWidth = 1;
        this.context.strokeStyle = this.lineColors.bottom;

        this.context.beginPath();
        this.context.moveTo(0, h);
        this.context.lineTo(w, h);
        this.context.stroke();

        // Draw graph line and linear gradient fill
        if (this.ghostArray.length) {
            this.drawPath(w, h, this.ghostArray, true);
        }

        if (this.array.length) {
            this.drawPath(w, h, this.array);
        }

        // Draw marker lines
        if (!this.noMarker) {
            this.context.lineWidth = 1.5;
            this.context.strokeStyle = this.lineColors.graph;

            for (let i = 0, l = this.items.length; i < l; i++) {
                const x = clamp(this.items[i].x * this.width, 0.5, this.width - 0.5);

                this.context.beginPath();
                this.context.moveTo(x, h - 0.5);
                this.context.lineTo(x, h - 0.5 - (h - 0.5) * this.items[i].multiplier * this.props.yMultiplier);
                this.context.stroke();
            }

            if (!this.isDraggingAway) {
                this.items.forEach(item => {
                    item.css({ left: clamp(item.x * this.width, 0.5, this.width - 0.5) });
                });
            }
        }

        // Draw handle line and circle
        if (!this.noHover && !this.isDraggingAway) {
            if (this.graphNeedsUpdate) {
                this.calculateLookup();
                this.graphNeedsUpdate = false;
            }

            let index = Math.floor(this.mouseX * this.array.length);

            if (index === this.array.length) {
                index = this.array.length - 1;
            }

            const value = this.array[index];
            const x = clamp(this.mouseX * this.width, 0.5, this.width - 0.5);

            let y;

            if (this.lookupPrecision) {
                y = this.getCurveY(this.mouseX) - 1;
            } else {
                y = h - value * this.rangeHeight - 1;
            }

            if (this.handleProps.alpha < 0.001) {
                this.context.globalAlpha = 0;
            } else {
                this.context.globalAlpha = this.handleProps.alpha;
            }

            this.context.lineWidth = 1;
            this.context.strokeStyle = this.lineColors.handle;

            this.context.beginPath();
            this.context.moveTo(x, this.height);
            this.context.lineTo(x, y + 2);
            this.context.stroke();

            this.context.beginPath();
            this.context.arc(x, y, 2.5, 0, Math.PI * 2);
            this.context.stroke();

            this.info.css({ left: x });
            this.info.text(this.format(value.toFixed(this.precision)));
        }
    }

    drawPath(w, h, array, ghost) {
        if (ghost) {
            this.context.globalAlpha = 0.35;
        } else {
            this.context.globalAlpha = this.props.alpha;
        }

        // Draw graph line
        this.context.lineWidth = 1.5;

        if (this.noGradient) {
            this.context.strokeStyle = this.lineColors.graph;
        } else {
            this.context.strokeStyle = this.strokeStyle;
            this.context.fillStyle = this.fillStyle;
            this.context.shadowColor = 'rgb(255 255 255 / 0.2)';
            this.context.shadowBlur = 15;
        }

        this.context.beginPath();

        for (let i = 0, l = array.length; i < l - 1; i++) {
            const x0 = (i / (l - 1)) * this.width;
            const x1 = ((i + 1) / (l - 1)) * this.width;
            const y0 = array[i] * this.rangeHeight;
            const y1 = array[i + 1] * this.rangeHeight;
            const mx = (x0 + x1) / 2;
            const my = (y0 + y1) / 2;
            const cpx0 = (mx + x0) / 2;
            const cpx1 = (mx + x1) / 2;

            if (i === 0) {
                if (this.graphNeedsUpdate && !ghost) {
                    this.pathData = `M ${x0} ${h - y0}`;
                }

                if (this.props.progress === 1) {
                    this.context.moveTo(x0, h - y0 * this.props.yMultiplier - 1);
                }
            }

            if (this.graphNeedsUpdate && !ghost) {
                this.pathData += ` Q ${cpx0} ${h - y0} ${mx} ${h - my} Q ${cpx1} ${h - y1} ${x1} ${h - y1}`;
            }

            if (this.props.progress === 1) {
                this.context.quadraticCurveTo(cpx0, h - y0 * this.props.yMultiplier - 1, mx, h - my * this.props.yMultiplier - 1);
                this.context.quadraticCurveTo(cpx1, h - y1 * this.props.yMultiplier - 1, x1, h - y1 * this.props.yMultiplier - 1);
            }
        }

        if (this.props.progress < 1) {
            this.context.moveTo(0, h);
            this.context.lineTo(w, h);
        }

        this.context.stroke();

        // Draw linear gradient fill
        if (!this.noGradient && this.props.progress === 1) {
            this.context.shadowBlur = 0;
            this.context.lineTo(this.width, this.height);
            this.context.lineTo(0, this.height);
            this.context.fill();
        }
    }

    hoverIn() {
        clearTween(this.handleProps);

        tween(this.handleProps, { alpha: 1 }, 275, 'easeInOutCubic', null, () => {
            this.needsUpdate = true;
        });

        this.info.clearTween();
        this.info.visible();
        this.info.tween({ opacity: 1 }, 275, 'easeInOutCubic');

        this.hoveredIn = true;
    }

    hoverOut(fast) {
        clearTween(this.handleProps);

        this.info.clearTween();

        if (fast) {
            this.handleProps.alpha = 0;
            this.needsUpdate = true;

            this.info.css({ opacity: 0 });
            this.info.invisible();
        } else {
            tween(this.handleProps, { alpha: 0 }, 275, 'easeInOutCubic', null, () => {
                this.needsUpdate = true;
            });

            this.info.tween({ opacity: 0 }, 275, 'easeInOutCubic', () => {
                this.info.invisible();
            });
        }

        this.hoveredIn = false;
    }

    animateIn(fast) {
        this.addListeners();

        clearTween(this.props);

        if (!this.noMarker) {
            this.items.forEach(item => {
                item.clearTween();
            });
        }

        if (!this.initialized) {
            this.initialized = true;

            this.update();
        }

        if (fast) {
            this.props.alpha = 1;
            this.props.yMultiplier = 1;
            this.props.progress = 1;

            this.animatedIn = true;
            this.needsUpdate = true;

            this.update();

            if (this.hoveredIn) {
                this.hoverIn();
            }

            if (!this.noMarker) {
                this.items.forEach(item => {
                    item.css({ opacity: 1 });
                });
            }
        } else {
            this.props.alpha = 0;
            this.props.yMultiplier = 0;
            this.props.progress = 0;

            tween(this.props, { alpha: 1 }, 500, 'easeOutSine');

            tween(this.props, { progress: 1 }, 500, 'easeInOutCubic', () => {
                tween(this.props, { yMultiplier: 1 }, 400, 'easeOutCubic', () => {
                    this.animatedIn = true;

                    if (this.hoveredIn) {
                        this.hoverIn();
                    }

                    if (!this.noMarker) {
                        this.items.forEach(item => {
                            tween(item, { multiplier: 1 }, 400, 'easeOutCubic', null, () => {
                                this.needsUpdate = true;

                                item.css({ opacity: item.multiplier });
                            });
                        });
                    }
                }, () => {
                    this.needsUpdate = true;
                });
            }, () => {
                this.needsUpdate = true;
            });
        }
    }

    animateOut() {
        this.removeListeners();

        clearTween(this.props);

        if (!this.noMarker) {
            this.items.forEach(item => {
                item.clearTween();
            });
        }

        this.animatedIn = false;

        this.hoverOut(true);

        tween(this.props, { alpha: 0 }, 300, 'easeOutSine');

        tween(this.props, { yMultiplier: 0 }, 300, 'easeOutCubic', null, () => {
            this.needsUpdate = true;

            if (!this.noMarker) {
                this.items.forEach(item => {
                    item.multiplier = this.props.yMultiplier;

                    item.css({ opacity: item.multiplier });
                });
            }
        });
    }

    destroy() {
        this.removeListeners();

        clearTween(this.props);

        return super.destroy();
    }
}
