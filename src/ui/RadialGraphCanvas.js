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

import { clearTween, delayedCall, tween } from '../tween/Tween.js';
import { TwoPI, degToRad, mapLinear } from '../utils/Utils.js';

export class RadialGraphCanvas extends Interface {
    constructor({
        context,
        value,
        ghost,
        start = 0,
        graphHeight = 60,
        resolution = 80,
        tension = 6,
        precision = 0,
        lookupPrecision = 0,
        markers = [],
        range = 1,
        infoDistanceX = 20,
        infoDistanceY = 10,
        suffix = '',
        format = value => `${value}${suffix}`,
        noHover = false,
        noMarker = false,
        noMarkerDrag = false,
        noGradient = false
    } = {}) {
        super('.radial-graph');

        this.context = context;
        this.value = value;
        this.ghost = ghost;
        this.start = start;
        this.graphHeight = graphHeight;
        this.resolution = resolution;
        this.tension = tension;
        this.precision = precision;
        this.lookupPrecision = lookupPrecision;
        this.markers = markers;
        this.range = range;
        this.infoDistanceX = infoDistanceX;
        this.infoDistanceY = infoDistanceY;
        this.format = format;
        this.noHover = noHover;
        this.noMarker = noMarker;
        this.noMarkerDrag = noMarkerDrag;
        this.noGradient = noGradient;

        if (!Stage.root) {
            Stage.root = document.querySelector(':root');
            Stage.rootStyle = getComputedStyle(Stage.root);
        }

        this.position = new Vector2();
        this.objectWidth = 0;
        this.objectHeight = 0;
        this.width = 0;
        this.height = 0;
        this.halfWidth = 0;
        this.halfHeight = 0;
        this.middle = 0;
        this.radius = 0;
        this.distance = 0;
        this.rangeHeight = 0;
        this.startAngle = degToRad(this.start);
        this.array = [];
        this.ghostArray = [];
        this.points = [];
        this.pathData = '';
        this.length = 0;
        this.lookup = [];
        this.bounds = null;
        this.offset = new Vector2();
        this.origin = new Vector2();
        this.mouse = new Vector2();
        this.delta = new Vector2();
        this.lastTime = 0;
        this.lastMouse = new Vector2();
        this.mouseAngle = 0;
        this.lastHover = 'out';
        this.lastCursor = '';
        this.items = [];
        this.mobileOffset = navigator.maxTouchPoints ? -50 : 0; // Position above finger
        this.isDragging = false;
        this.isDraggingAway = false;
        this.isResizing = false;
        this.animatedIn = false;
        this.hoveredIn = false;
        this.graphNeedsUpdate = false;
        this.initialized = false;
        this.enabled = true;

        if (this.startAngle < 0) {
            this.startAngle += TwoPI;
        }

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

        if (!this.noMarker) {
            this.initMarkers();
        }

        this.setArray(this.value);

        if (this.ghost !== undefined) {
            this.setGhostArray(this.ghost);
        }
    }

    init() {
        this.css({
            position: 'absolute',
            pointerEvents: 'none',
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
                zIndex: 1,
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
            const point = properties.getPointAtLength(i * this.length);
            const x = point.x - this.middle;
            const y = point.y - this.middle;

            let angle = (-this.startAngle + Math.atan2(y, x)) % TwoPI;

            if (angle < 0) {
                angle += TwoPI;
            }

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

        let i = Math.max(1, approxIndex - Math.floor(this.lookupPrecision / 4));

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

    initMarkers() {
        this.markers.forEach(data => {
            this.addMarker(data);
        });
    }

    addListeners() {
        if (!this.noHover) {
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
            window.removeEventListener('pointerdown', this.onPointerDown);
            window.removeEventListener('pointermove', this.onPointerMove);
        }

        this.items.forEach(item => {
            item.events.off('update', this.onMarkerUpdate);
            item.events.off('click', this.onMarkerClick);
        });
    }

    getRangeHeight(range) {
        return (this.graphHeight - 5) / range;
    }

    getTextOffset(mouseAngle, infoDistanceX) {
        let textOffset;

        if (mouseAngle >= 0 && mouseAngle < 0.25) {
            textOffset = mapLinear(mouseAngle, 0, 0.25, infoDistanceX, this.infoDistanceY);
        } else if (mouseAngle >= 0.25 && mouseAngle < 0.5) {
            textOffset = mapLinear(mouseAngle, 0.25, 0.5, this.infoDistanceY, infoDistanceX);
        } else if (mouseAngle >= 0.5 && mouseAngle < 0.75) {
            textOffset = mapLinear(mouseAngle, 0.5, 0.75, infoDistanceX, this.infoDistanceY);
        } else if (mouseAngle >= 0.75 && mouseAngle <= 1) {
            textOffset = mapLinear(mouseAngle, 0.75, 1, this.infoDistanceY, infoDistanceX);
        }

        return textOffset;
    }

    // Event handlers

    onPointerDown = e => {
        this.lastTime = performance.now();
        this.lastMouse.set(e.clientX, e.clientY);

        this.onPointerMove(e);
    };

    onPointerMove = e => {
        if (this.isResizing) {
            return;
        }

        if (e) {
            const event = {
                x: e.clientX,
                y: e.clientY
            };

            this.mouse.copy(event);
            this.delta.subVectors(this.mouse, this.lastMouse);

            this.bounds = this.element.getBoundingClientRect();
            this.offset.x = this.mouse.x - (this.bounds.left + this.middle);
            this.offset.y = this.mouse.y - (this.bounds.top + this.middle);
        }

        const distance = this.offset.length();
        const angle = this.offset.angle();

        this.mouseAngle = angle / TwoPI;

        if (distance > this.distance && distance < this.middle) {
            this.setHover('over');
            this.setCursor('crosshair');
        } else {
            this.setHover();
            this.setCursor();
        }
    };

    onPointerUp = () => {
        if (performance.now() - this.lastTime > 250 || this.delta.length() > 50) {
            return;
        }

        if (this.items.find(item => item.angle === this.mouseAngle)) {
            return;
        }

        if (!this.noMarker && !this.noMarkerDrag) {
            this.addMarker([this.mouseAngle, this.getMarkerName()]);
        }
    };

    onMarkerUpdate = ({ dragging, target }) => {
        this.isDragging = dragging;
        this.isDraggingAway = this.offset.length() > this.middle + 50;

        if (this.isDragging && this.isDraggingAway) {
            this.origin.subVectors(this.mouse, this.bounds);

            target.css({ left: this.origin.x, top: this.origin.y + this.mobileOffset });

            if (this.hoveredIn) {
                this.hoverOut();
            }
        } else if (this.isDragging) {
            target.angle = this.mouseAngle;
        } else if (this.isDraggingAway) {
            this.isDraggingAway = false;

            this.removeMarker(target);
        }
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

    setHover(type = 'out') {
        if (this.isDraggingAway) {
            return;
        }

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

            this.events.emit('cursor', { cursor, target: this });
        }
    }

    setArray(value) {
        if (Array.isArray(value)) {
            this.array = value;
        } else {
            this.array = new Array(this.resolution).fill(0);
        }

        if (!this.noHover && this.lookupPrecision) {
            this.graphNeedsUpdate = true;
        }
    }

    setGhostArray(value) {
        if (Array.isArray(value)) {
            this.ghostArray = value;
        } else {
            this.ghostArray = new Array(this.array.length).fill(0);
        }
    }

    setContext(context) {
        this.context = context;
    }

    setSize(width, height) {
        // Recalculate the size only if the width changes
        if (width !== this.objectWidth) {
            this.objectWidth = width;
            this.objectHeight = height;

            // Increase the size so the graph is on the outside of the object
            this.width = this.objectWidth + this.graphHeight * 4;
            this.height = this.objectHeight + this.graphHeight * 4;
            this.halfWidth = Math.round(this.width / 2);
            this.halfHeight = Math.round(this.height / 2);

            this.middle = this.width / 2;
            this.radius = this.middle - this.graphHeight;
            this.distance = this.radius - this.graphHeight;
            this.rangeHeight = this.getRangeHeight(this.range);

            this.strokeStyle = this.createGradient(this.middle, this.middle, this.radius, this.middle, this.middle, this.middle);
            this.fillStyle = this.createGradient(this.middle, this.middle, this.radius, this.middle, this.middle, this.middle, 0.07);

            this.isResizing = true;

            if (!this.noHover && this.animatedIn) {
                this.hoverOut(true);
            }

            clearTween(this.timeout);

            this.timeout = delayedCall(200, () => {
                this.isResizing = false;

                if (!this.noHover && this.lookupPrecision) {
                    this.graphNeedsUpdate = true;
                }
            });
        }

        this.css({
            left: this.position.x - this.halfWidth,
            top: this.position.y - this.halfHeight,
            width: this.width,
            height: this.height
        });
    }

    addMarker([angle, name]) {
        const item = new GraphMarker({ name, noDrag: this.noMarkerDrag });
        item.angle = angle;
        item.multiplier = 0;
        this.add(item);

        this.items.push(item);

        if (this.initialized) {
            item.events.on('update', this.onMarkerUpdate);
            item.events.on('click', this.onMarkerClick);

            tween(item, { multiplier: 1 }, 400, 'easeOutCubic', null, () => {
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
        if (!this.enabled) {
            return;
        }

        if (value !== undefined) {
            if (Array.isArray(value)) {
                this.setArray(value);
            } else {
                if (this.ghost !== undefined) {
                    const ghost = this.array.pop();
                    this.array.unshift(value);
                    this.ghostArray.pop();
                    this.ghostArray.unshift(ghost);
                } else {
                    this.array.pop();
                    this.array.unshift(value);
                }

                if (!this.noHover && this.lookupPrecision) {
                    this.graphNeedsUpdate = true;
                }
            }
        }

        if (this.initialized) {
            this.drawGraph();
        }
    }

    drawGraph() {
        if (this.props.alpha <= 0) {
            return;
        }

        this.context.save();

        // Centred
        this.context.translate(this.position.x - this.halfWidth, this.position.y - this.halfHeight);

        const h = this.graphHeight - 1;

        if (this.props.alpha < 0.001) {
            this.context.globalAlpha = 0;
        } else {
            this.context.globalAlpha = this.props.alpha;
        }

        // Draw inner circle
        this.context.lineWidth = 1;
        this.context.strokeStyle = this.lineColors.bottom;

        this.context.beginPath();
        this.context.arc(this.middle, this.middle, this.middle - h, this.startAngle, this.startAngle + TwoPI * this.props.progress);
        this.context.stroke();

        // Draw start line
        const c = Math.cos(this.startAngle);
        const s = Math.sin(this.startAngle);
        const r0 = this.middle - (h - 0.5);
        const r1 = this.middle - (h - 0.5 - (h - 0.5) * this.props.yMultiplier);
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

        if (this.array.length) {
            this.drawPath(h, this.array);
        }

        // Draw marker lines
        if (!this.noMarker) {
            this.context.lineWidth = 1.5;
            this.context.strokeStyle = this.lineColors.graph;

            for (let i = 0, l = this.items.length; i < l; i++) {
                const mouseAngle = this.items[i].angle;
                const angle = mouseAngle * TwoPI;
                const c = Math.cos(angle);
                const s = Math.sin(angle);
                const r0 = this.middle - (h - 0.5);
                const r1 = this.middle - (h - 0.5 - (h - 0.5) * this.items[i].multiplier * this.props.yMultiplier);
                const r2 = this.middle + this.getTextOffset(mouseAngle, this.items[i].width / 2 + 10);
                const x0 = this.middle + r0 * c;
                const y0 = this.middle + r0 * s;
                const x1 = this.middle + r1 * c;
                const y1 = this.middle + r1 * s;
                const x2 = this.middle + r2 * c;
                const y2 = this.middle + r2 * s;

                this.context.beginPath();
                this.context.moveTo(x0, y0);
                this.context.lineTo(x1, y1);
                this.context.stroke();

                if (!this.isDraggingAway) {
                    this.items[i].css({ left: x2, top: y2 });
                }
            }
        }

        // Draw handle line and circle
        if (!this.noHover && !this.isDraggingAway) {
            if (this.graphNeedsUpdate) {
                this.calculateLookup();
                this.graphNeedsUpdate = false;
                this.onPointerMove();
            }

            let angle = (-this.startAngle + Math.atan2(this.offset.y, this.offset.x)) % TwoPI;

            if (angle < 0) {
                angle += TwoPI;
            }

            const mouseAngle = angle / TwoPI;
            const value = this.array[Math.floor(mouseAngle * this.array.length)];

            let radius;

            if (this.lookupPrecision) {
                const point = this.getCurvePoint(mouseAngle);
                const x = point.x - this.middle;
                const y = point.y - this.middle;
                const distance = Math.sqrt(x * x + y * y);

                radius = this.middle - (h - (distance - this.radius) - 1);
            } else {
                radius = this.middle - (h - value * this.rangeHeight - 1);
            }

            angle = this.mouseAngle * TwoPI;

            const c = Math.cos(angle);
            const s = Math.sin(angle);
            const r0 = this.radius - this.getTextOffset(this.mouseAngle, this.infoDistanceX);
            const r1 = this.radius;
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

            if (this.handleProps.alpha < 0.001) {
                this.context.globalAlpha = 0;
            } else {
                this.context.globalAlpha = this.handleProps.alpha;
            }

            this.context.lineWidth = 1;
            this.context.strokeStyle = this.lineColors.handle;

            this.context.beginPath();
            this.context.moveTo(x1, y1);
            this.context.lineTo(x2, y2);
            this.context.stroke();

            this.context.beginPath();
            this.context.arc(x3, y3, 2.5, 0, TwoPI);
            this.context.stroke();

            this.info.css({ left: x0, top: y0 });
            this.info.text(this.format(value.toFixed(this.precision)));
        }

        this.context.restore();
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
            this.context.strokeStyle = this.lineColors.graph;
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
                    const rad0 = this.startAngle + TwoPI * ((i - 1) / (l - 1));
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
                    const rad = this.startAngle + TwoPI * (i / (l - 1));

                    this.points[i + 1] = {
                        x: this.middle + radius * Math.cos(rad),
                        y: this.middle + radius * Math.sin(rad)
                    };
                } else if (i === l - 1) {
                    const rad0 = this.startAngle + TwoPI;
                    const rad1 = this.startAngle + TwoPI * ((i + 1) / (l - 1));

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

            this.pathData = `M ${this.points[1].x} ${this.points[1].y}`;

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
            const radius = this.middle - (h - array[i] * this.rangeHeight * this.props.yMultiplier - 1);

            if (i === 0) {
                const rad0 = this.startAngle + TwoPI * ((i - 1) / (l - 1));
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
                const rad = this.startAngle + TwoPI * (i / (l - 1));

                this.points[i + 1] = {
                    x: this.middle + radius * Math.cos(rad),
                    y: this.middle + radius * Math.sin(rad)
                };
            } else if (i === l - 1) {
                const rad0 = this.startAngle + TwoPI;
                const rad1 = this.startAngle + TwoPI * ((i + 1) / (l - 1));

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
            this.context.arc(this.middle, this.middle, this.middle - h, this.startAngle, this.startAngle + TwoPI * this.props.progress);
        }

        this.context.stroke();

        // Draw radial gradient fill
        if (!this.noGradient && this.props.progress === 1) {
            const radius = this.middle - h;
            const x = this.middle + radius * Math.cos(this.startAngle);
            const y = this.middle + radius * Math.sin(this.startAngle);

            this.context.shadowBlur = 0;
            this.context.moveTo(x, y);
            this.context.arc(this.middle, this.middle, radius, 0, TwoPI, true); // Inner circle hole
            this.context.fill();
        }
    }

    hoverIn() {
        clearTween(this.handleProps);

        tween(this.handleProps, { alpha: 1 }, 275, 'easeInOutCubic');

        this.info.clearTween();
        this.info.visible();
        this.info.tween({ opacity: 1 }, 275, 'easeInOutCubic');

        this.hoveredIn = true;
    }

    hoverOut(fast) {
        this.lastHover = 'out';

        clearTween(this.handleProps);

        this.info.clearTween();

        if (fast) {
            this.handleProps.alpha = 0;

            this.info.css({ opacity: 0 });
            this.info.invisible();
        } else {
            tween(this.handleProps, { alpha: 0 }, 275, 'easeInOutCubic');

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
                                item.css({ opacity: item.multiplier });
                            });
                        });
                    }
                });
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
        this.setCursor();

        tween(this.props, { alpha: 0 }, 300, 'easeOutSine');

        tween(this.props, { yMultiplier: 0 }, 300, 'easeOutCubic', null, () => {
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
