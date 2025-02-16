/**
 * @author pschroen / https://ufo.ai/
 */

import { Group, Matrix4, Mesh, MeshBasicMaterial, Raycaster, SphereGeometry, TextureLoader, Vector2 } from 'three';
import { VertexNormalsHelper } from 'three/addons/helpers/VertexNormalsHelper.js';
import { VertexTangentsHelper } from 'three/addons/helpers/VertexTangentsHelper.js';

import { EventEmitter } from '../../utils/EventEmitter.js';
import { Interface } from '../../utils/Interface.js';
import { Stage } from '../../utils/Stage.js';
import { RadialGraphTracker } from '../../ui/RadialGraphTracker.js';
import { ReticleCanvas } from '../../ui/ReticleCanvas.js';
import { LineCanvas } from '../../ui/LineCanvas.js';
import { Tracker } from '../../ui/Tracker.js';
import { Point } from '../../ui/Point.js';

import { clearTween, delayedCall } from '../../tween/Tween.js';
import { getBoundingSphereWorld, getScreenSpaceBox } from '../utils/Utils3D.js';

/**
 * A UI and panel container for various components in 3D space,
 * with object tracking.
 * @example
 * // ...
 * Point3D.init(renderer, scene, camera);
 *
 * const point = new Point3D(mesh);
 * scene.add(point);
 *
 * MaterialPanelController.init(mesh, point);
 * @example
 * // ...
 * const point = new Point3D(mesh, {
 *     type: '',
 *     noTracker: true
 * });
 * scene.add(point);
 * @example
 * // ...
 * const point = new Point3D(mesh, { graph });
 * point.setData({
 *     name: '127.0.0.1',
 *     type: 'localhost'
 * });
 * scene.add(point);
 * @example
 * // ...
 * const item = new PanelItem({
 *     // ...
 * });
 * point.addPanel(item);
 */
export class Point3D extends Group {
    static init(renderer, scene, camera, {
        root = document.body,
        container = document.body,
        breakpoint = 1000,
        headerSnap = false,
        dividerSnap = false,
        physics = null,
        loader = new TextureLoader(),
        uvTexturePath = 'assets/textures/uv.jpg',
        uvHelper = false,
        debug = false
    } = {}) {
        this.events = new EventEmitter();
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.root = root instanceof Interface ? root : new Interface(root);
        this.container = container instanceof Interface ? container : new Interface(container);
        this.breakpoint = breakpoint;
        this.headerSnap = headerSnap;
        this.dividerSnap = dividerSnap;
        this.physics = physics;
        this.loader = loader;
        this.uvTexturePath = uvTexturePath;
        this.uvHelper = uvHelper;
        this.debug = debug;

        this.objects = [];
        this.points = [];
        this.multiple = [];
        this.instanceId = null;
        this.lastInstanceId = null;
        this.raycaster = new Raycaster();
        this.raycaster.layers.enable(31); // Last layer
        this.mouse = new Vector2(-1, -1);
        this.delta = new Vector2();
        this.coords = new Vector2(-2, 2);
        this.hover = null;
        this.click = null;
        this.lastTime = 0;
        this.lastMouse = new Vector2();
        this.lastCursor = '';
        this.raycastInterval = 1 / 10; // 10 frames per second
        this.lastRaycast = 0;
        this.halfScreen = new Vector2();
        this.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        this.uvTexture = null;
        this.windowSnapMarginTop = 30;
        this.windowSnapMarginLeft = 30;
        this.windowSnapTop = this.headerSnap ? 29 : 0;
        this.openColor = null;
        this.isDragging = false;
        this.enabled = true;

        this.initCanvas();
        this.initTextures();

        this.addListeners();
        this.onResize();
    }

    static initCanvas() {
        this.canvas = new Interface(null, 'canvas');
        this.canvas.css({
            position: 'absolute',
            left: 0,
            top: 0,
            pointerEvents: 'none'
        });
        this.context = this.canvas.element.getContext('2d');
        this.container.add(this.canvas);
    }

    static initTextures() {
        if (this.uvHelper) {
            this.uvTexture = this.loader.load(this.uvTexturePath);
            this.uvTexture.anisotropy = this.anisotropy;
            this.uvTexture.userData.uv = true;
        }
    }

    static addListeners() {
        Stage.events.on('color_picker', this.onColorPicker);
        Stage.events.on('thumbnail_dragging', this.onThumbnailDragging);
        Stage.events.on('invert', this.onInvert);
        window.addEventListener('resize', this.onResize);
        window.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        window.addEventListener('keyup', this.onKeyUp);
    }

    static removeListeners() {
        Stage.events.off('color_picker', this.onColorPicker);
        Stage.events.off('thumbnail_dragging', this.onThumbnailDragging);
        Stage.events.off('invert', this.onInvert);
        window.removeEventListener('resize', this.onResize);
        window.removeEventListener('pointerdown', this.onPointerDown);
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        window.removeEventListener('keyup', this.onKeyUp);
    }

    // Event handlers

    static onColorPicker = ({ open, target }) => {
        if (open) {
            this.openColor = target;
        } else {
            this.openColor = null;
        }
    };

    static onThumbnailDragging = ({ dragging }) => {
        this.isDragging = dragging;
    };

    static onInvert = () => {
        this.points.forEach(ui => ui.theme());
    };

    static onResize = () => {
        this.width = document.documentElement.clientWidth;
        this.height = document.documentElement.clientHeight;
        this.dpr = window.devicePixelRatio;

        this.halfScreen.set(this.width / 2, this.height / 2);

        this.canvas.element.width = Math.round(this.width * this.dpr);
        this.canvas.element.height = Math.round(this.height * this.dpr);
        this.canvas.element.style.width = `${this.width}px`;
        this.canvas.element.style.height = `${this.height}px`;
        this.context.scale(this.dpr, this.dpr);

        if (this.width < this.breakpoint) {
            this.windowSnapMarginTop = 20;
            this.windowSnapMarginLeft = 20;
        } else {
            this.windowSnapMarginTop = 30;
            this.windowSnapMarginLeft = 30;

            if (this.dividerSnap) {
                const style = getComputedStyle(this.dividerSnap.top.element);
                const left = parseFloat(style.left);

                this.windowSnapMarginLeft += left;
            }
        }

        const snapped = this.getSnappedSorted();

        snapped.forEach((ui, i) => {
            if (i !== 0) {
                let gap = 20;

                if (ui.point.tracker.locked) {
                    gap += 28;
                }

                const prev = snapped[i - 1];
                const positionX = prev.point.originPosition.x + prev.point.bounds.width + gap;

                ui.point.origin.x = positionX;
                ui.point.originPosition.x = positionX;
            }

            ui.snap();
        });

        const moved = this.getMoved();

        moved.forEach(ui => {
            ui.snap();
        });
    };

    static onPointerDown = e => {
        if (!this.enabled) {
            return;
        }

        this.lastTime = performance.now();
        this.lastMouse.set(e.clientX, e.clientY);

        this.onPointerMove(e);

        if (this.hover) {
            this.click = this.hover;
        }
    };

    static onPointerMove = e => {
        if (!this.enabled) {
            return;
        }

        if (e) {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
            this.coords.x = (this.mouse.x / this.width) * 2 - 1;
            this.coords.y = 1 - (this.mouse.y / this.height) * 2;
        }

        if (document.elementFromPoint(this.mouse.x, this.mouse.y) instanceof HTMLCanvasElement) {
            this.raycaster.setFromCamera(this.coords, this.camera);

            const intersection = this.raycaster.intersectObjects(this.objects);

            if (intersection.length) {
                this.instanceId = intersection[0].instanceId;

                const object = this.points[this.objects.indexOf(intersection[0].object)];

                if (!this.hover || this.instanceId !== this.lastInstanceId) {
                    this.lastInstanceId = this.instanceId;
                    this.hover = object;
                    this.hover.onHover({ type: 'over' });
                    this.setCursor('pointer');
                } else if (this.hover !== object) {
                    this.hover.onHover({ type: 'out' });
                    this.hover = object;
                    this.hover.onHover({ type: 'over' });
                    this.setCursor('pointer');
                }
            } else if (this.hover) {
                this.hover.onHover({ type: 'out' });
                this.hover = null;
                this.setCursor();
            }
        } else if (this.hover) {
            this.hover.onHover({ type: 'out' });
            this.hover = null;
            this.setCursor();
        }

        this.delta.subVectors(this.mouse, this.lastMouse);
    };

    static onPointerUp = e => {
        if (!this.enabled) {
            return;
        }

        if (performance.now() - this.lastTime > 250 || this.delta.length() > 50) {
            this.click = null;
            return;
        }

        const ui = this.getCursor();

        if (this.click && this.click === this.hover) {
            if (!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
                this.points.forEach(ui => {
                    if (ui !== this.click && ui.animatedIn) {
                        ui.animateOut(true);
                        ui.deactivate();
                    }
                });
            }

            this.click.onClick(e.shiftKey);
        } else if (this.openColor && !this.openColor.element.contains(e.target)) {
            Stage.events.emit('color_picker', { open: false, target: this });
        } else if (ui && ui.graph) {
            ui.graph.onPointerUp();
        } else if (document.elementFromPoint(this.mouse.x, this.mouse.y) instanceof HTMLCanvasElement) {
            this.animateOut();
        }

        this.click = null;
    };

    static onKeyUp = e => {
        if (e.ctrlKey) { // Ctrl key reserved for view toggling
            return;
        }

        if (e.keyCode >= 49 && e.keyCode <= 57) { // 1-9
            const select = this.points[e.keyCode - 49];

            if (select) {
                if (!e.shiftKey && !e.altKey && !e.metaKey) {
                    this.points.forEach(ui => {
                        if (ui !== select && ui.animatedIn) {
                            ui.animateOut(true);
                            ui.deactivate();
                        }
                    });
                }

                select.onHover({ type: 'over' });
                select.onClick(e.shiftKey);
            } else {
                this.animateOut();
            }
        } else if (e.keyCode === 27 && !this.isDragging) { // Esc
            this.animateOut();
        }
    };

    // Public methods

    static setCamera(camera) {
        this.camera = camera;

        this.points.forEach(ui => ui.setCamera(camera));
    }

    static getPoint(mesh) {
        return this.points.find(ui => ui.object === mesh);
    }

    static getSelected() {
        return this.points.filter(ui => ui.selected);
    }

    static getCursor() {
        return this.points.find(ui => ui.lastCursor);
    }

    static getMoved() {
        return this.points.filter(ui => ui.point.isMove);
    }

    static getSnapped() {
        return this.points.filter(ui => ui.snapped);
    }

    static getSnappedSorted() {
        return this.getSnapped().sort((a, b) => a.point.originPosition.x - b.point.originPosition.x);
    }

    static getMultipleName() {
        return `${this.multiple.length}&nbsp;Objects`;
    }

    static getMultipleTypes() {
        const types = this.multiple.map(ui => ui.type);
        const counts = {};

        types.forEach(type => {
            counts[type] = counts[type] ? counts[type] + 1 : 1;
        });

        const unique = [...new Set(types)];

        return unique.map(type => `${counts[type]}&nbsp;${type}`).join('<br>');
    }

    static getMultipleTargetNumbers() {
        return this.multiple.map(ui => ui.index + 1);
    }

    static setIndexes() {
        this.points.forEach((ui, i) => ui.setIndex(i));
    }

    static setCursor(cursor = '') {
        const ui = this.getCursor();

        if (ui && !cursor) {
            cursor = ui.lastCursor;
        }

        if (cursor !== this.lastCursor) {
            this.lastCursor = cursor;

            this.root.css({ cursor });
        }
    }

    static update(time) {
        this.context.clearRect(0, 0, this.canvas.element.width, this.canvas.element.height);

        this.points.forEach(ui => ui.update());

        if (!navigator.maxTouchPoints && time - this.lastRaycast > this.raycastInterval) {
            this.onPointerMove();
            this.lastRaycast = time;
        }
    }

    static add(...points) {
        points.forEach(ui => {
            this.objects.push(ui.object);
            this.points.push(ui);
        });

        this.setIndexes();
    }

    static remove(...points) {
        points.forEach(ui => {
            const index = this.points.indexOf(ui);

            if (~index) {
                this.objects.splice(index, 1);
                this.points.splice(index, 1);
            }

            if (ui === this.hover) {
                this.hover.onHover({ type: 'out' });
                this.hover = null;
                this.setCursor();
            }
        });

        this.setIndexes();
    }

    static animateOut() {
        this.points.forEach(ui => {
            if (ui.isMultiple) {
                ui.onClick();
            } else if (ui === this.hover && ui.point.isOpen) {
                ui.onClick();
            } else if (ui.animatedIn) {
                ui.animateOut(true);
                ui.deactivate();
            }
        });

        const selected = this.getSelected();

        if (!selected.length && this.hover) {
            this.hover.onHover({ type: 'out' });
            this.hover = null;
            this.setCursor();
        }
    }

    static destroy() {
        this.removeListeners();

        if (this.uvTexture) {
            this.uvTexture.dispose();
        }

        for (let i = this.points.length - 1; i >= 0; i--) {
            if (this.points[i] && this.points[i].destroy) {
                this.points[i].destroy();
            }
        }

        for (const prop in this) {
            this[prop] = null;
        }

        return null;
    }

    constructor(mesh, {
        name = mesh.material.name || mesh.geometry.type,
        type = mesh.material.type,
        graph = null,
        noTracker = false
    } = {}) {
        super();

        this.object = mesh;
        this.name = name;
        this.type = type;
        this.graph = graph;
        this.noTracker = noTracker;
        this.isInstanced = mesh.isInstancedMesh;
        this.isDefault = name === mesh.geometry.type && type === mesh.material.type;
        this.isMultiple = false;
        this.camera = Point3D.camera;
        this.halfScreen = Point3D.halfScreen;

        this.instances = [];
        this.center = new Vector2();
        this.size = new Vector2();
        this.selected = false;
        this.lastCursor = '';
        this.animatedIn = false;
        this.currentMaterialMap = null;
        this.uvTexture = null;
        this.snapPosition = new Vector2();
        this.snapTarget = new Vector2();
        this.snappedLeft = false;
        this.snappedRight = false;
        this.snapped = false;

        this.v = new Vector2();
        this.matrix = new Matrix4();

        this.initMesh();
        this.initElement();
        this.initViews();

        Point3D.add(this);
    }

    initMesh() {
        // Get world dimensions
        this.boundingSphere = getBoundingSphereWorld(this.object);

        // Tracker geometry
        this.geometry = new SphereGeometry(this.boundingSphere.radius);

        if (Point3D.debug) {
            this.material = new MeshBasicMaterial({
                color: 0xff0000,
                wireframe: true
            });
            this.camera.layers.enable(31); // Last layer
        } else {
            this.material = new MeshBasicMaterial({ visible: false });
        }

        this.mesh = this.createMesh();
    }

    initElement() {
        this.element = new Interface('.target');
        this.element.css({
            position: 'absolute',
            left: 0,
            top: 0,
            pointerEvents: 'none'
        });
        Point3D.container.add(this.element);
    }

    initViews() {
        const { context } = Point3D;

        if (this.graph) {
            this.graph.events.on('cursor', this.onCursor);
            this.graph.setContext(context);
            this.element.add(this.graph);

            if (!this.noTracker) {
                this.tracker = new RadialGraphTracker();
                this.element.add(this.tracker);
            }

            this.point = new Point(this, this.tracker);
            this.point.info.css({ top: -43 });
            this.point.setData({
                name: this.name,
                type: this.type
            });
            this.element.add(this.point);

            this.point.windowSnapTop = 42;
        } else {
            this.reticle = new ReticleCanvas();
            this.reticle.setContext(context);
            this.element.add(this.reticle);

            this.line = new LineCanvas();
            this.line.setContext(context);
            this.element.add(this.line);

            if (!this.noTracker) {
                this.tracker = new Tracker();
                this.element.add(this.tracker);
            }

            this.point = new Point(this, this.tracker);
            this.point.info.css({ top: -15 });
            this.point.setData({
                name: this.name,
                type: this.type
            });
            this.element.add(this.point);

            this.point.windowSnapTop = 14;
        }
    }

    createMesh() {
        const mesh = new Mesh(this.geometry, this.material);
        this.object.localToWorld(mesh.position);
        mesh.worldToLocal(mesh.position);
        mesh.layers.set(31); // Last layer
        this.add(mesh);

        return mesh;
    }

    removeMesh(mesh) {
        this.remove(mesh);
        mesh.material.dispose();
        mesh.geometry.dispose();

        if (mesh.tracker) {
            mesh.tracker.animateOut(() => {
                mesh.tracker = mesh.tracker.destroy();
            });
        }
    }

    setInitialPosition() {
        this.point.position.copy(this.point.target);

        this.updateMatrixWorld();
    }

    removeListeners() {
        if (this.graph) {
            this.graph.events.off('cursor', this.onCursor);
        }

        if (this.panel) {
            this.panel.events.off('update', this.onUpdate);
        }
    }

    // Event handlers

    onHover = ({ type, isPoint }) => {
        clearTween(this.timeout);

        if (this.tracker && this.selected) {
            if (type === 'over') {
                this.tracker.show();
            } else {
                this.tracker.hide();
            }

            if (isPoint && this.isMultiple) {
                Point3D.multiple.forEach(ui => {
                    if (ui !== this) {
                        ui.onHover({ type });
                    }
                });
            }

            return;
        }

        if (type === 'over') {
            if (this.isInstanced) {
                const { instanceId } = Point3D;

                const { position, quaternion, scale } = this.mesh;

                this.object.getMatrixAt(instanceId, this.matrix);
                this.matrix.decompose(position, quaternion, scale);
            }

            if (!this.animatedIn) {
                this.setInitialPosition();
            }

            this.animateIn();
        } else {
            this.timeout = delayedCall(2000, () => {
                this.animateOut();
            });
        }

        Point3D.events.emit('hover', { type, target: this });
    };

    onClick = multiple => {
        clearTween(this.timeout);

        if (this.tracker) {
            if (this.isInstanced) {
                const { instanceId } = Point3D;

                if (!this.instances.some(instance => instance.index === instanceId)) {
                    this.toggle(true, multiple);
                } else {
                    this.toggle(false, multiple);
                }

                this.selected = !!this.instances.length;
            } else {
                this.selected = !this.selected;

                if (this.selected) {
                    this.toggle(true, multiple);
                } else {
                    this.toggle(false, multiple);
                }
            }

            const selected = Point3D.getSelected();

            Point3D.events.emit('change', { selected, target: this });
        }

        Point3D.events.emit('click', { target: this });
    };

    onCursor = ({ cursor }) => {
        if (cursor !== this.lastCursor) {
            this.lastCursor = cursor;

            if (!Point3D.hover) {
                Point3D.setCursor(cursor);
            }
        }
    };

    onUpdate = ({ path, value, index, target }) => {
        if (this.point.isOpen && !this.point.isMove) {
            this.point.isMove = true;
        }

        if (this.isMultiple) {
            Point3D.multiple.forEach(ui => {
                if (ui !== this) {
                    if (index !== undefined) {
                        ui.setPanelIndex(target.name, index, Array.from(path));
                    } else if (value !== undefined) {
                        ui.setPanelValue(target.name, value, Array.from(path));
                    }
                }
            });
        }
    };

    // Public methods

    setCamera(camera) {
        this.camera = camera;
    }

    setData(data) {
        this.point.setData(data);
    }

    setIndex(index) {
        this.index = index;

        if (this.tracker) {
            const targetNumber = index + 1;

            this.tracker.setData({ targetNumber });
            this.point.setTargetNumbers([targetNumber]);
        }
    }

    addPanel(item) {
        this.point.info.addPanel(item);

        if (!this.panel) {
            this.panel = this.point.info.panel;
            this.panel.events.on('update', this.onUpdate);
        }
    }

    setPanelIndex(name, index, path) {
        this.panel.setPanelIndex(name, index, path);
    }

    setPanelValue(name, value, path) {
        this.panel.setPanelValue(name, value, path);
    }

    toggleNormalsHelper(show) {
        if (show) {
            if (!this.normalsHelper) {
                this.normalsHelper = new VertexNormalsHelper(this.object, this.boundingSphere.radius / 5);
                Point3D.scene.add(this.normalsHelper);
            }

            this.normalsHelper.visible = true;
        } else if (this.normalsHelper) {
            this.normalsHelper.visible = false;
        }
    }

    toggleTangentsHelper(show) {
        if (show) {
            if (!this.tangentsHelper) {
                this.object.geometry.computeTangents();

                this.tangentsHelper = new VertexTangentsHelper(this.object, this.boundingSphere.radius / 5);
                Point3D.scene.add(this.tangentsHelper);
            }

            this.tangentsHelper.visible = true;
        } else if (this.tangentsHelper) {
            this.tangentsHelper.visible = false;
        }
    }

    toggleUVHelper(show) {
        const material = this.object.material;

        if (show) {
            if (Point3D.uvTexture) {
                if (!this.uvTexture) {
                    this.uvTexture = Point3D.uvTexture.clone();
                }

                if (material.map !== this.uvTexture) {
                    this.currentMaterialMap = material.map;

                    material.map = this.uvTexture;
                    material.needsUpdate = true;
                }
            }
        } else if (this.uvTexture) {
            material.map = this.currentMaterialMap;
            material.needsUpdate = true;

            this.currentMaterialMap = null;

            this.uvTexture.dispose();
            this.uvTexture = null;
        }
    }

    theme() {
        if (!this.graph) {
            this.reticle.theme();
            this.line.theme();
        }
    }

    update() {
        if (this.graph) {
            this.graph.update();
        } else {
            // Set line start and end points
            const p0 = this.reticle.position;
            const p1 = this.point.position;

            const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
            const radius = 3;

            const x = p0.x + radius * Math.cos(angle);
            const y = p0.y + radius * Math.sin(angle);

            this.v.set(x, y);

            this.line.setStartPoint(this.v);
            this.line.setEndPoint(p1);

            // Update canvas elements
            this.reticle.update();
            this.line.update();
        }
    }

    updateMatrixWorld(force) {
        super.updateMatrixWorld(force);

        this.camera.updateMatrixWorld();

        // Get screen space coordinates
        const box = getScreenSpaceBox(this.mesh, this.camera);
        const center = box.getCenter(this.center).multiply(this.halfScreen);
        const size = box.getSize(this.size).multiply(this.halfScreen);
        const centerX = this.halfScreen.x + center.x;
        const centerY = this.halfScreen.y - center.y;
        const width = Math.round(size.x);
        const height = Math.round(size.y);
        const halfWidth = Math.round(width / 2);
        const halfHeight = Math.round(height / 2);

        // Set positions
        if (this.graph) {
            const size = Math.min(width, height);

            this.graph.position.set(centerX, centerY);
            this.graph.setSize(size, size);

            if (this.tracker) {
                this.tracker.graphHeight = -this.graph.graphHeight * 2;
            }

            // Set point position to the right of the start line
            const radius = this.graph.middle;
            const x = centerX + this.graph.halfWidth;
            const y = centerY + radius * Math.sin(this.graph.startAngle);

            this.point.target.set(x - 38, y);
            this.point.update();
        } else {
            this.reticle.position.set(centerX, centerY);

            this.point.target.set(centerX + halfWidth, centerY - halfHeight);
            this.point.update();
        }

        if (this.tracker) {
            this.tracker.position.set(centerX, centerY);
            this.tracker.update();
            this.tracker.css({
                width,
                height,
                marginLeft: -halfWidth,
                marginTop: -halfHeight
            });
        }

        // Update instances and helpers
        if (this.isInstanced) {
            this.instances.forEach(instance => {
                const { position, quaternion, scale } = instance;

                this.object.getMatrixAt(instance.index, this.matrix);
                this.matrix.decompose(position, quaternion, scale);

                if (instance.tracker) {
                    const box = getScreenSpaceBox(instance, this.camera);
                    const center = box.getCenter(this.center).multiply(this.halfScreen);
                    const size = box.getSize(this.size).multiply(this.halfScreen);
                    const centerX = this.halfScreen.x + center.x;
                    const centerY = this.halfScreen.y - center.y;
                    const width = Math.round(size.x);
                    const height = Math.round(size.y);
                    const halfWidth = Math.round(width / 2);
                    const halfHeight = Math.round(height / 2);

                    instance.tracker.position.set(centerX, centerY);
                    instance.tracker.update();
                    instance.tracker.css({
                        width,
                        height,
                        marginLeft: -halfWidth,
                        marginTop: -halfHeight
                    });
                }
            });
        } else {
            if (this.normalsHelper) {
                this.normalsHelper.update();
            }

            if (this.tangentsHelper) {
                this.tangentsHelper.update();
            }
        }
    }

    toggle(show, multiple) {
        if (this.isInstanced) {
            const { instanceId } = Point3D;

            if (show) {
                if (!this.instances.length) {
                    this.togglePanel(true, multiple);
                }

                if (!multiple) {
                    this.instances.forEach(instance => this.removeMesh(instance));
                    this.instances.length = 0;
                }

                const mesh = this.createMesh();
                mesh.index = instanceId;
                this.instances.push(mesh);

                mesh.tracker = new Tracker();
                this.element.add(mesh.tracker);

                this.updateMatrixWorld();

                mesh.tracker.animateIn();
            } else {
                if (!multiple) {
                    this.instances.forEach(instance => this.removeMesh(instance));
                    this.instances.length = 0;
                } else {
                    const index = this.instances.findIndex(instance => instance.index === instanceId);

                    if (~index) {
                        this.removeMesh(this.instances[index]);
                        this.instances.splice(index, 1);
                    }
                }

                if (!this.instances.length) {
                    this.togglePanel(false, false);
                }
            }

            if (this.instances.length > 1) {
                this.point.setData({
                    name: `${this.instances.length}&nbsp;Instances`
                });
            } else {
                this.point.setData({
                    name: this.name
                });
            }
        } else {
            this.togglePanel(show, multiple);
        }

        if (Point3D.multiple.length > 1) {
            const ui = Point3D.multiple[0];

            ui.point.setData({
                name: Point3D.getMultipleName(),
                type: Point3D.getMultipleTypes()
            });

            if (ui.tracker) {
                ui.point.setTargetNumbers(Point3D.getMultipleTargetNumbers());
            }

            ui.isMultiple = true;
        } else if (Point3D.multiple.length) {
            const ui = Point3D.multiple[0];

            Point3D.multiple.length = 0;

            ui.point.setData({
                name: ui.name,
                type: ui.type
            });

            if (ui.tracker) {
                ui.point.setTargetNumbers([ui.index + 1]);
            }

            ui.isMultiple = false;
        }
    }

    togglePanel(show, multiple) {
        if (show) {
            if (!this.graph) {
                this.reticle.animateOut();
                this.line.animateOut(true);
            }

            this.tracker.animateIn(this.isInstanced);

            const selected = Point3D.getSelected();

            if (multiple && selected.length > 1) {
                if (!Point3D.multiple.length) {
                    const ui = selected.filter(ui => ui !== this)[0];

                    Point3D.multiple.push(ui);
                }

                Point3D.multiple.push(this);

                if (!this.graph) {
                    this.line.deactivate();
                }

                this.point.deactivate();
            } else {
                this.point.open();

                if (this.panel) {
                    Stage.events.emit('color_picker', { open: false, target: this.panel });
                }
            }
        } else {
            if (!this.graph) {
                this.reticle.animateIn();
                this.line.animateIn(true);
            }

            this.tracker.animateOut();

            if (this.isMultiple) {
                Point3D.multiple.forEach(ui => {
                    if (ui !== this) {
                        ui.animateOut(true);
                        ui.deactivate();
                    }
                });

                Point3D.multiple.length = 0;

                this.point.setData({
                    name: this.name,
                    type: this.type
                });

                this.point.setTargetNumbers([this.index + 1]);

                this.isMultiple = false;
            } else if (Point3D.multiple.length) {
                const index = Point3D.multiple.indexOf(this);

                if (~index) {
                    Point3D.multiple.splice(index, 1);
                }
            }

            if (this.point.isMove) {
                this.point.deactivate(true);
            } else {
                this.point.enable();
                this.point.close();
                this.point.activate();
            }
        }
    }

    lock() {
        if (this.point.isOpen) {
            this.point.lock();
        }

        if (this.tracker) {
            this.tracker.lock();

            if (this.isMultiple) {
                Point3D.multiple.forEach(ui => {
                    if (ui !== this) {
                        ui.lock();
                    }
                });
            }
        }

        if (this.snappedLeft) {
            const snapped = Point3D.getSnapped();

            snapped.forEach(ui => {
                if (ui === this || ui.point.originPosition.x > this.point.originPosition.x) {
                    ui.point.origin.x += 28;
                    ui.point.originPosition.x += 28;

                    ui.point.clearTween().tween({ left: ui.point.originPosition.x }, 400, 'easeOutCubic');
                }
            });
        }
    }

    unlock() {
        if (this.point.isOpen) {
            this.point.unlock();
        }

        if (this.tracker) {
            this.tracker.unlock();

            if (this.isMultiple) {
                Point3D.multiple.forEach(ui => {
                    if (ui !== this) {
                        ui.unlock();
                    }
                });
            }
        }

        if (this.snappedLeft) {
            const snapped = Point3D.getSnapped();

            snapped.forEach(ui => {
                if (ui === this || ui.point.originPosition.x > this.point.originPosition.x) {
                    ui.point.origin.x -= 28;
                    ui.point.originPosition.x -= 28;

                    ui.point.clearTween().tween({ left: ui.point.originPosition.x }, 400, 'easeInCubic', 100);
                }
            });
        }
    }

    show() {
        if (this.tracker) {
            this.tracker.show();

            if (this.isMultiple) {
                Point3D.multiple.forEach(ui => {
                    if (ui !== this) {
                        ui.show();
                    }
                });
            }
        }
    }

    hide() {
        if (this.tracker) {
            this.tracker.hide(true);

            if (this.isMultiple) {
                Point3D.multiple.forEach(ui => {
                    if (ui !== this) {
                        ui.hide();
                    }
                });
            }
        }
    }

    animateIn(reverse) {
        if (!this.animatedIn) {
            if (this.graph) {
                this.graph.animateIn();

                if (this.tracker) {
                    this.tracker.open();
                }
            } else {
                this.reticle.animateIn();
                this.line.animateIn(reverse);
            }

            this.animatedIn = true;
        }

        if (!this.point.animatedIn) {
            this.point.animateIn();
        }
    }

    animateOut(fast, callback) {
        if (this.graph) {
            if (fast) {
                this.graph.animateOut();

                if (this.tracker) {
                    this.tracker.close();
                    this.tracker.animateOut();
                }

                this.animatedIn = false;
            }

            this.point.animateOut(true);
        } else {
            this.reticle.animateOut();
            this.line.animateOut(fast, callback);

            if (this.tracker) {
                this.tracker.animateOut();
            }

            this.point.animateOut();

            this.animatedIn = false;
        }
    }

    deactivate() {
        if (this.isInstanced) {
            this.instances.forEach(instance => this.removeMesh(instance));
            this.instances.length = 0;

            this.point.setData({
                name: this.name
            });
        }

        if (this.isMultiple) {
            Point3D.multiple.length = 0;

            this.point.setData({
                name: this.name,
                type: this.type
            });

            if (this.tracker) {
                this.point.setTargetNumbers([this.index + 1]);
            }

            this.isMultiple = false;
        }

        this.selected = false;
        this.snappedLeft = false;
        this.snappedRight = false;
        this.snapped = false;

        if (!this.graph) {
            this.line.deactivate();
        }

        if (this.point.isOpen) {
            this.point.deactivate();
        }

        const selected = Point3D.getSelected();

        Point3D.events.emit('change', { selected, target: this });
    }

    snap() {
        const currentSnapped = this.snapped;

        let snappedLeft = false;
        let snappedRight = false;

        this.snapPosition.copy(this.point.originPosition);
        this.snapTarget.copy(this.snapPosition);

        const windowSnapTop = Point3D.windowSnapMarginTop + Point3D.windowSnapTop + this.point.windowSnapTop;
        let windowSnapLeft = Point3D.windowSnapMarginLeft - 48;

        if (this.point.tracker.locked) {
            windowSnapLeft += 28;
        }

        if (this.snapTarget.y <= windowSnapTop + 10) {
            this.snapTarget.y = windowSnapTop;
        }

        if (this.snapTarget.x <= windowSnapLeft + 10) {
            this.snapTarget.x = windowSnapLeft;
            snappedLeft = true;
        }

        const moved = Point3D.getMoved();

        moved.forEach(ui => {
            if (ui !== this) {
                let gap = 20;

                if (this.point.tracker.locked) {
                    gap += 28;
                }

                const min = gap - 10;
                const max = gap + 10;

                if (
                    this.snapTarget.x > windowSnapLeft + 10 && // Clamp inside window
                    this.snapTarget.distanceTo(ui.point.originPosition) < Math.max(this.point.bounds.width, ui.point.bounds.width) + max
                ) {
                    // Top
                    if (
                        this.snapTarget.y > ui.point.originPosition.y - 10 &&
                        this.snapTarget.y < ui.point.originPosition.y + 10
                    ) {
                        this.snapTarget.y = ui.point.originPosition.y;
                    }

                    // Left
                    if (
                        this.snapTarget.x > ui.point.originPosition.x + ui.point.bounds.width + min &&
                        this.snapTarget.x < ui.point.originPosition.x + ui.point.bounds.width + max
                    ) {
                        this.snapTarget.x = ui.point.originPosition.x + ui.point.bounds.width + gap;
                        snappedLeft = true;
                    }

                    // Right
                    if (
                        this.snapTarget.x > ui.point.originPosition.x - this.point.bounds.width - max &&
                        this.snapTarget.x < ui.point.originPosition.x - this.point.bounds.width - min
                    ) {
                        this.snapTarget.x = ui.point.originPosition.x - this.point.bounds.width - gap;
                        snappedRight = true;
                    }
                }
            }
        });

        this.snapPosition.sub(this.snapTarget);
        this.point.origin.sub(this.snapPosition); // Subtract delta
        this.point.originPosition.copy(this.snapTarget);

        this.point.css({ left: this.point.originPosition.x, top: this.point.originPosition.y });

        this.snappedLeft = snappedLeft;
        this.snappedRight = snappedRight;
        this.snapped = this.snappedLeft || this.snappedRight;

        if (this.snapped !== currentSnapped) {
            const moved = Point3D.getMoved();

            moved.forEach(ui => {
                if (ui !== this) {
                    ui.snap();
                }
            });
        }
    }

    destroy() {
        this.removeListeners();

        if (this.normalsHelper) {
            this.toggleNormalsHelper(false);
            Point3D.scene.remove(this.normalsHelper);
            this.normalsHelper.dispose();
        }

        if (this.tangentsHelper) {
            this.toggleTangentsHelper(false);
            Point3D.scene.remove(this.tangentsHelper);
            this.tangentsHelper.dispose();
        }

        if (this.currentMaterialMap) {
            this.toggleUVHelper(false);
        }

        if (this.isInstanced) {
            this.instances.forEach(instance => this.removeMesh(instance));
            this.instances.length = 0;
        }

        this.material.dispose();
        this.geometry.dispose();

        this.animateOut(false, () => {
            this.element = this.element.destroy();
        });
    }
}
