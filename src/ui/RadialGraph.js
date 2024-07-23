/**
 * @author pschroen / https://ufo.ai/
 *
 * Based on https://github.com/lo-th/uil
 */

import { Color } from '../math/Color.js';
import { Vector2 } from '../math/Vector2.js';
import { Easing } from '../tween/Easing.js';
import { Interface } from '../utils/Interface.js';
import { Stage } from '../utils/Stage.js';

import { ticker } from '../tween/Ticker.js';
import { clearTween, delayedCall, tween } from '../tween/Tween.js';
import { TwoPI, degToRad, mapLinear } from '../utils/Utils.js';

export class RadialGraph extends Interface {
    constructor({
        width = 300,
        height = 300,
        start = 0,
        graphHeight = 50,
        resolution = 80,
        tension = 6,
        precision = 0,
        lookupPrecision = 0,
        range = 1,
        value,
        ghost,
        noHover = false,
        noGradient = false
    } = {}) {
        super('.radial-graph');

        this.width = width;
        this.height = height;
        this.start = start;
        this.graphHeight = graphHeight;
        this.resolution = resolution;
        this.tension = tension;
        this.precision = precision;
        this.lookupPrecision = lookupPrecision;
        this.range = range;
        this.value = value;
        this.ghost = ghost;
        this.noHover = noHover;
        this.noGradient = noGradient;

        if (!Stage.root) {
            Stage.root = document.querySelector(':root');
            Stage.rootStyle = getComputedStyle(Stage.root);
        }

        this.startTime = performance.now();
        this.middle = this.width / 2;
        this.radius = this.middle - this.graphHeight;
        this.distance = this.radius - this.graphHeight;
        this.startAngle = degToRad(this.start);
        this.rangeHeight = this.getRangeHeight(this.range);
        this.array = [];
        this.ghostArray = [];
        this.points = [];
        this.pathData = '';
        this.length = 0;
        this.lookup = [];
        this.bounds = null;
        this.offset = new Vector2();
        this.point = null;
        this.mouseAngle = 0;
        this.lastHover = 'out';
        this.lastCursor = '';
        this.animatedIn = false;
        this.hoveredIn = false;
        this.needsUpdate = false;
        this.graphNeedsUpdate = false;

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
            handleAlpha: 0,
            yMultiplier: 0,
            progress: 0
        };

        this.init();
        this.initCanvas();

        if (!this.noHover && this.lookupPrecision) {
            this.initGraph();
        }

        this.setSize(this.width, this.height);
        this.setArray(this.value);

        if (this.ghost) {
            this.setGhostArray(this.ghost);
        }

        this.addListeners();
    }

    init() {
        this.css({
            position: 'relative',
            width: this.width,
            height: this.height,
            pointerEvents: 'auto',
            webkitUserSelect: 'none',
            userSelect: 'none'
        });

        if (!this.noHover) {
            this.info = new Interface('.info');
            this.info.invisible();
            this.info.css({
                position: 'absolute',
                left: 0,
                top: 0,
                transform: 'translate(-50%, -50%)',
                fontSize: 'const(--ui-secondary-font-size)',
                letterSpacing: 'const(--ui-secondary-letter-spacing)',
                opacity: 0,
                zIndex: 1,
                pointerEvents: 'none'
            });
            this.add(this.info);
        }
    }

    initGraph() {
        // Not added to DOM
        this.graph = new Interface(null, 'svg');
        this.graph.path = new Interface(null, 'svg', 'path');
        this.graph.add(this.graph.path);
    }

    calculateLookup() {
        this.length = this.graph.path.element.getTotalLength();
        this.lookup = [];

        let i = 0;

        while (i <= 1) {
            const point = this.graph.path.element.getPointAtLength(i * this.length);
            const x = point.x - this.middle;
            const y = point.y - this.middle;
            const angle = Math.atan2(-y, -x) + Math.PI;

            this.lookup.push({
                x: point.x,
                y: point.y,
                angle
            });

            i += 1 / this.lookupPrecision;
        }
    }

    getCurvePoint(mouseAngle) {
        const angle = mouseAngle * TwoPI;
        const approxIndex = Math.floor(mouseAngle * this.lookupPrecision);

        let i = Math.max(0, approxIndex - Math.floor(this.lookupPrecision / 3));

        for (; i < this.lookupPrecision; i++) {
            if (this.lookup[i].angle > angle) {
                break;
            }
        }

        if (i === this.lookupPrecision) {
            const x = this.lookup[this.lookupPrecision - 1].x;
            const y = this.lookup[this.lookupPrecision - 1].y;

            return { x, y };
        }

        const lower = this.lookup[i - 1];
        const upper = this.lookup[i];
        const percent = (angle - lower.angle) / (upper.angle - lower.angle);
        const diffX = upper.x - lower.x;
        const diffY = upper.y - lower.y;
        const x = lower.x + diffX * percent;
        const y = lower.y + diffY * percent;

        return { x, y };
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

    createGradient(x0, y0, r0, x1, y1, r1, alpha = 1) {
        this.alpha = alpha;

        const gradient = this.context.createRadialGradient(x0, y0, r0, x1, y1, r1);

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
            window.addEventListener('pointerdown', this.onPointerDown);
            window.addEventListener('pointermove', this.onPointerMove);
            window.addEventListener('pointerup', this.onPointerUp);
        }
    }

    removeListeners() {
        if (!this.noHover) {
            window.removeEventListener('pointerdown', this.onPointerDown);
            window.removeEventListener('pointermove', this.onPointerMove);
            window.removeEventListener('pointerup', this.onPointerUp);
        }
    }

    getRangeHeight(range) {
        return (this.graphHeight - 4) / range;
    }

    // Event handlers

    onPointerDown = e => {
        this.onPointerMove(e);
    };

    onPointerMove = ({ clientX, clientY }) => {
        this.bounds = this.element.getBoundingClientRect();
        this.offset.x = clientX - (this.bounds.left + this.middle);
        this.offset.y = clientY - (this.bounds.top + this.middle);

        const distance = this.offset.length();

        if (distance > this.distance && distance < this.middle) {
            const angle = this.offset.angle();

            this.mouseAngle = angle / TwoPI;

            this.setHover('over');
            this.setCursor('crosshair');
        } else if (this.hoveredIn) {
            this.setHover();
            this.setCursor();
        }
    };

    onPointerUp = e => {
        this.onPointerMove(e);

        this.setHover();
    };

    // Public methods

    setHover(type = 'out') {
        if (type !== this.lastHover) {
            this.lastHover = type;

            if (!this.animatedIn) {
                if (type === 'over') {
                    this.hoveredIn = true;
                } else {
                    this.hoveredIn = false;
                }

                return;
            }

            clearTween(this.timeout);

            if (type === 'over') {
                this.hoverIn();
            } else {
                this.timeout = delayedCall(200, () => {
                    this.hoverOut();
                });
            }
        }
    }

    setCursor(cursor = '') {
        if (cursor !== this.lastCursor) {
            this.lastCursor = cursor;

            this.css({ cursor });
        }
    }

    setGhostArray(value) {
        if (Array.isArray(value)) {
            this.ghostArray = value;
        } else {
            this.ghostArray = new Array(this.resolution).fill(0);
        }

        this.needsUpdate = true;

        this.update();
    }

    setArray(value) {
        if (Array.isArray(value)) {
            this.array = value;
        } else {
            this.array = new Array(this.resolution).fill(0);
        }

        this.needsUpdate = true;

        if (!this.noHover && this.lookupPrecision) {
            this.pathData = '';
            this.graphNeedsUpdate = true;
        }

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

        this.strokeStyle = this.createGradient(this.middle, this.middle, this.radius, this.middle, this.middle, this.middle);
        this.fillStyle = this.createGradient(this.middle, this.middle, this.radius, this.middle, this.middle, this.middle, 0.07);

        this.needsUpdate = true;

        if (!this.noHover && this.lookupPrecision) {
            this.pathData = '';
            this.graphNeedsUpdate = true;
        }

        this.update();
    }

    update(value) {
        if (!ticker.isAnimating) {
            ticker.onTick(performance.now() - this.startTime);
        }

        if (!this.array.length) {
            return;
        }

        if (value !== undefined) {
            if (Array.isArray(value)) {
                this.setArray(value);
            } else {
                if (this.ghost) {
                    const ghost = this.array.pop();
                    this.array.unshift(value);
                    this.ghostArray.pop();
                    this.ghostArray.unshift(ghost);
                } else {
                    this.array.shift();
                    this.array.push(value);
                }

                this.needsUpdate = true;
            }
        }

        if (this.needsUpdate || this.hoveredIn) {
            this.drawGraph();
            this.needsUpdate = false;
        }
    }

    drawGraph() {
        const h = this.graphHeight - 1;

        if (this.props.alpha < 0.001) {
            this.props.alpha = 0;
        }

        this.context.globalAlpha = this.props.alpha;
        this.context.clearRect(0, 0, this.canvas.element.width, this.canvas.element.height);

        // Draw inner circle
        this.context.lineWidth = 1;
        this.context.strokeStyle = Stage.rootStyle.getPropertyValue('--ui-color-graph-bottom-line').trim();
        this.context.beginPath();
        this.context.arc(this.middle, this.middle, this.middle - h, this.startAngle, this.startAngle + degToRad(360 * this.props.progress));
        this.context.stroke();

        // Draw start line
        const c = Math.cos(this.startAngle);
        const s = Math.sin(this.startAngle);
        const r0 = this.middle - h + 0.5;
        const r1 = this.middle - (h - h * this.props.yMultiplier);
        const x0 = this.middle + r0 * c;
        const y0 = this.middle + r0 * s;
        const x1 = this.middle + r1 * c;
        const y1 = this.middle + r1 * s;

        this.context.beginPath();
        this.context.moveTo(x0, y0);
        this.context.lineTo(x1, y1);
        this.context.stroke();

        // Draw graph line and radial gradient fill
        if (this.ghostArray.length) {
            this.drawPath(h, this.ghostArray, true);
        }

        this.drawPath(h, this.array);

        // Draw handle line and circle
        if (!this.noHover) {
            if (this.graphNeedsUpdate) {
                this.graph.path.attr({ d: this.pathData });
                this.calculateLookup();
                this.graphNeedsUpdate = false;
            }

            const value = this.array[Math.floor(this.mouseAngle * this.array.length)];
            const angle = this.mouseAngle * TwoPI;

            let radius;

            if (this.lookupPrecision) {
                const point = this.getCurvePoint(this.mouseAngle);
                const x = point.x - this.middle;
                const y = point.y - this.middle;
                const distance = Math.sqrt(x * x + y * y);

                radius = this.middle - (h - (distance - this.radius));
            } else {
                radius = this.middle - (h - value * this.rangeHeight);
            }

            let infoOffset;

            if (this.mouseAngle >= 0 && this.mouseAngle < 0.25) {
                infoOffset = mapLinear(this.mouseAngle, 0, 0.25, 18, 10);
            } else if (this.mouseAngle >= 0.25 && this.mouseAngle < 0.5) {
                infoOffset = mapLinear(this.mouseAngle, 0.25, 0.5, 10, 18);
            } else if (this.mouseAngle >= 0.5 && this.mouseAngle < 0.75) {
                infoOffset = mapLinear(this.mouseAngle, 0.5, 0.75, 18, 10);
            } else if (this.mouseAngle >= 0.75 && this.mouseAngle < 1) {
                infoOffset = mapLinear(this.mouseAngle, 0.75, 1, 10, 18);
            }

            const c = Math.cos(angle);
            const s = Math.sin(angle);
            const r0 = this.radius - infoOffset;
            const r1 = this.radius + 0.5;
            const r2 = radius - 2;
            const r3 = radius;
            const x0 = this.middle + r0 * c;
            const y0 = this.middle + r0 * s;
            const x1 = this.middle + r1 * c;
            const y1 = this.middle + r1 * s;
            const x2 = this.middle + r2 * c;
            const y2 = this.middle + r2 * s;
            const x3 = this.middle + r3 * c;
            const y3 = this.middle + r3 * s;

            if (this.props.handleAlpha < 0.001) {
                this.props.handleAlpha = 0;
            }

            this.context.globalAlpha = this.props.handleAlpha;
            this.context.lineWidth = 1;
            this.context.strokeStyle = Stage.rootStyle.getPropertyValue('--ui-color').trim();

            this.context.beginPath();
            this.context.moveTo(x1, y1);
            this.context.lineTo(x2, y2);
            this.context.stroke();

            this.context.beginPath();
            this.context.arc(x3, y3, 2.5, 0, Math.PI * 2);
            this.context.stroke();

            this.info.css({ left: x0, top: y0 });
            this.info.text(value.toFixed(this.precision));
        }
    }

    drawPath(h, array, ghost) {
        if (ghost) {
            this.context.globalAlpha = 0.35;
        } else {
            this.context.globalAlpha = this.props.alpha;
        }

        // Draw graph line
        this.context.lineWidth = 1.5;

        if (this.noGradient) {
            this.context.strokeStyle = Stage.rootStyle.getPropertyValue('--ui-color-line').trim();
        } else {
            this.context.strokeStyle = this.strokeStyle;
            this.context.fillStyle = this.fillStyle;
            this.context.shadowColor = 'rgb(255 255 255 / 0.2)';
            this.context.shadowBlur = 15;
        }

        if (!this.noHover && this.graphNeedsUpdate && !ghost) {
            this.points.length = 0;

            for (let i = 0, l = array.length; i < l; i++) {
                const radius = this.middle - (this.graphHeight - array[i] * this.rangeHeight);

                if (i === 0) {
                    const rad0 = this.startAngle + degToRad(360 * ((i - 1) / (l - 1)));
                    const rad1 = this.startAngle;

                    this.points[i] = {
                        x: this.middle + radius * Math.cos(rad0),
                        y: this.middle + radius * Math.sin(rad0)
                    };

                    this.points[i + 1] = {
                        x: this.middle + radius * Math.cos(rad1),
                        y: this.middle + radius * Math.sin(rad1)
                    };
                } else if (i !== l - 1) {
                    const rad = this.startAngle + degToRad(360 * (i / (l - 1)));

                    this.points[i + 1] = {
                        x: this.middle + radius * Math.cos(rad),
                        y: this.middle + radius * Math.sin(rad)
                    };
                } else if (i === l - 1) {
                    const rad0 = this.startAngle + degToRad(360);
                    const rad1 = this.startAngle + degToRad(360 * ((i + 1) / (l - 1)));

                    this.points[i + 1] = {
                        x: this.middle + radius * Math.cos(rad0),
                        y: this.middle + radius * Math.sin(rad0)
                    };

                    this.points[i + 2] = {
                        x: this.middle + radius * Math.cos(rad1),
                        y: this.middle + radius * Math.sin(rad1)
                    };
                }
            }

            this.pathData += `M ${this.points[1].x} ${this.points[1].y}`;

            for (let i = 1, l = this.points.length; i < l - 2; i++) {
                const p0 = this.points[i - 1];
                const p1 = this.points[i];
                const p2 = this.points[i + 1];
                const p3 = this.points[i + 2];

                const cp1x = p1.x + (p2.x - p0.x) / this.tension;
                const cp1y = p1.y + (p2.y - p0.y) / this.tension;

                const cp2x = p2.x - (p3.x - p1.x) / this.tension;
                const cp2y = p2.y - (p3.y - p1.y) / this.tension;

                this.pathData += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
            }
        }

        this.points.length = 0;

        // Close loop smoothly by repeating the first and last values
        for (let i = 0, l = array.length; i < l; i++) {
            const radius = this.middle - (h - array[i] * this.rangeHeight * this.props.yMultiplier);

            if (i === 0) {
                const rad0 = this.startAngle + degToRad(360 * ((i - 1) / (l - 1)));
                const rad1 = this.startAngle;

                this.points[i] = {
                    x: this.middle + radius * Math.cos(rad0),
                    y: this.middle + radius * Math.sin(rad0)
                };

                this.points[i + 1] = {
                    x: this.middle + radius * Math.cos(rad1),
                    y: this.middle + radius * Math.sin(rad1)
                };
            } else if (i !== l - 1) {
                const rad = this.startAngle + degToRad(360 * (i / (l - 1)));

                this.points[i + 1] = {
                    x: this.middle + radius * Math.cos(rad),
                    y: this.middle + radius * Math.sin(rad)
                };
            } else if (i === l - 1) {
                const rad0 = this.startAngle + degToRad(360);
                const rad1 = this.startAngle + degToRad(360 * ((i + 1) / (l - 1)));

                this.points[i + 1] = {
                    x: this.middle + radius * Math.cos(rad0),
                    y: this.middle + radius * Math.sin(rad0)
                };

                this.points[i + 2] = {
                    x: this.middle + radius * Math.cos(rad1),
                    y: this.middle + radius * Math.sin(rad1)
                };
            }
        }

        this.context.beginPath();

        // Close loop smoothly with the first and last control points
        if (this.props.progress === 1) {
            this.context.moveTo(this.points[1].x, this.points[1].y);

            for (let i = 1, l = this.points.length; i < l - 2; i++) {
                const p0 = this.points[i - 1];
                const p1 = this.points[i];
                const p2 = this.points[i + 1];
                const p3 = this.points[i + 2];

                const cp1x = p1.x + (p2.x - p0.x) / this.tension;
                const cp1y = p1.y + (p2.y - p0.y) / this.tension;

                const cp2x = p2.x - (p3.x - p1.x) / this.tension;
                const cp2y = p2.y - (p3.y - p1.y) / this.tension;

                this.context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
            }
        } else {
            this.context.arc(this.middle, this.middle, this.middle - h, this.startAngle, this.startAngle + degToRad(360 * this.props.progress));
        }

        this.context.stroke();

        // Draw radial gradient fill
        if (!this.noGradient && this.props.progress === 1) {
            this.context.shadowBlur = 0;
            this.context.arc(this.middle, this.middle, this.middle - h, this.startAngle, this.startAngle + degToRad(360), true); // Inner circle hole
            this.context.fill();
        }
    }

    hoverIn(force) {
        if (this.hoveredIn && !force) {
            return;
        }

        clearTween(this.props);

        this.hoveredIn = true;

        tween(this.props, { handleAlpha: 1 }, 275, 'easeInOutCubic', null, () => {
            this.needsUpdate = true;
        });

        this.info.clearTween();
        this.info.visible();
        this.info.tween({ opacity: 1 }, 275, 'easeInOutCubic');
    }

    hoverOut() {
        if (!this.hoveredIn) {
            return;
        }

        clearTween(this.props);

        this.hoveredIn = false;

        tween(this.props, { handleAlpha: 0 }, 275, 'easeInOutCubic', null, () => {
            this.needsUpdate = true;
        });

        this.info.clearTween().tween({ opacity: 0 }, 275, 'easeInOutCubic', () => {
            this.info.invisible();
        });
    }

    animateIn() {
        clearTween(this.props);

        tween(this.props, { alpha: 1 }, 500, 'easeOutSine');

        tween(this.props, { progress: 1 }, 650, 'easeInOutCubic', () => {
            tween(this.props, { yMultiplier: 1 }, 400, 'easeOutCubic', () => {
                this.animatedIn = true;

                if (this.hoveredIn) {
                    this.hoverIn(true);
                }
            }, () => {
                this.needsUpdate = true;
            });
        }, () => {
            this.needsUpdate = true;
        });
    }

    animateOut() {
        clearTween(this.props);

        this.animatedIn = false;

        tween(this.props, { alpha: 0 }, 300, 'easeOutSine');

        tween(this.props, { yMultiplier: 0 }, 300, 'easeOutCubic', null, () => {
            this.needsUpdate = true;
        });

        this.setCursor();
    }

    destroy() {
        this.removeListeners();

        return super.destroy();
    }
}
