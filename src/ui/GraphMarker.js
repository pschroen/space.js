/**
 * @author pschroen / https://ufo.ai/
 */

import { Vector2 } from '../math/Vector2.js';
import { Interface } from '../utils/Interface.js';

import { defer } from '../tween/Tween.js';

export class GraphMarker extends Interface {
    constructor({
        name,
        noDrag = false
    }) {
        super('.marker');

        this.name = name;
        this.noDrag = noDrag;

        this.width = 0;

        this.mouse = new Vector2();
        this.delta = new Vector2();
        this.lastTime = 0;
        this.lastMouse = new Vector2();
        this.isDragging = false;

        this.init();

        this.addListeners();
    }

    async init() {
        this.css({
            position: 'absolute',
            left: 0,
            top: 0,
            transform: 'translate(-50%, -50%)',
            lineHeight: 'var(--ui-title-line-height)',
            whiteSpace: 'nowrap',
            zIndex: 1,
            pointerEvents: 'auto',
            opacity: 0
        });
        this.html(this.name);

        if (!this.noDrag) {
            this.css({ cursor: 'move' });
        }

        await defer();

        if (!this.element) {
            return;
        }

        this.width = this.element.getBoundingClientRect().width;
    }

    addListeners() {
        if (!this.noDrag) {
            this.element.addEventListener('pointerdown', this.onPointerDown);
            window.addEventListener('keyup', this.onKeyUp);
        }
    }

    removeListeners() {
        if (!this.noDrag) {
            this.element.removeEventListener('pointerdown', this.onPointerDown);
            window.removeEventListener('keyup', this.onKeyUp);
        }
    }

    // Event handlers

    onPointerDown = e => {
        this.lastTime = performance.now();
        this.lastMouse.set(e.clientX, e.clientY);

        this.onPointerMove(e);

        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
    };

    onPointerMove = e => {
        const event = {
            x: e.clientX,
            y: e.clientY
        };

        this.mouse.copy(event);
        this.delta.subVectors(this.mouse, this.lastMouse);

        if (this.delta.length()) {
            this.isDragging = true;

            this.events.emit('update', { dragging: this.isDragging, target: this });
        }
    };

    onPointerUp = () => {
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);

        this.isDragging = false;

        this.events.emit('update', { dragging: this.isDragging, target: this });

        if (performance.now() - this.lastTime > 250 || this.delta.length() > 50) {
            return;
        }

        this.events.emit('click', { target: this });
    };

    onKeyUp = e => {
        if (e.keyCode === 27) { // Esc
            if (this.isDragging) {
                window.removeEventListener('pointermove', this.onPointerMove);
                window.removeEventListener('pointerup', this.onPointerUp);

                this.isDragging = false;

                this.events.emit('update', { dragging: this.isDragging, target: this });
            }
        }
    };

    // Public methods

    destroy() {
        this.removeListeners();

        return super.destroy();
    }
}
