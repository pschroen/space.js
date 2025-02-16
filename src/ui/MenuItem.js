/**
 * @author pschroen / https://ufo.ai/
 */

import { Interface } from '../utils/Interface.js';

export class MenuItem extends Interface {
    constructor({
        width,
        name,
        index
    }) {
        super('.item');

        this.width = width;
        this.name = name;
        this.index = index;

        this.active = false;
        this.animatedIn = false;

        this.init();

        this.addListeners();
    }

    init() {
        this.css({
            position: 'relative',
            width: this.width || 'fit-content',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: 'pointer',
            pointerEvents: 'none',
            webkitUserSelect: 'none',
            userSelect: 'none',
            y: 10
        });

        this.container = new Interface('.container');
        this.container.css({
            position: 'relative',
            width: 'fit-content',
            padding: 10,
            textAlign: 'center',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            opacity: 0
        });
        this.container.text(this.name);
        this.add(this.container);

        this.line = new Interface('.line');
        this.line.css({
            position: 'absolute',
            left: 10,
            right: 10,
            bottom: 10,
            height: window.devicePixelRatio > 1 ? 1.5 : 1,
            backgroundColor: 'var(--ui-color)',
            transformOrigin: 'left center',
            scaleX: 0
        });
        this.container.add(this.line);
    }

    addListeners() {
        this.element.addEventListener('mouseenter', this.onHover);
        this.element.addEventListener('mouseleave', this.onHover);
        this.element.addEventListener('click', this.onClick);
    }

    removeListeners() {
        this.element.removeEventListener('mouseenter', this.onHover);
        this.element.removeEventListener('mouseleave', this.onHover);
        this.element.removeEventListener('click', this.onClick);
    }

    // Event handlers

    onHover = ({ type }) => {
        if (this.active) {
            return;
        }

        this.clearTween();

        if (type === 'mouseenter') {
            this.container.tween({ opacity: 1 }, 200, 'easeOutSine');
        } else {
            this.container.tween({ opacity: 0.5 }, 400, 'easeOutSine');
        }
    };

    onClick = () => {
        if (this.active) {
            return;
        }

        this.events.emit('click', { target: this });
    };

    // Public methods

    setTitle(title) {
        this.title = title;

        this.element.childNodes[0].nodeValue = this.title;
    }

    activate(direction) {
        this.active = true;

        if (this.animatedIn) {
            this.container.clearTween().tween({ opacity: 1 }, 300, 'easeOutSine');
        }

        this.line.clearTween().css({ transformOrigin: direction < 0 ? 'left center' : 'right center', scaleX: 0 }).tween({ scaleX: 1 }, 500, 'easeOutQuint');
    }

    deactivate(direction) {
        this.active = false;

        if (this.animatedIn) {
            this.container.clearTween().tween({ opacity: 0.5 }, 500, 'easeOutSine');
        }

        this.line.clearTween().css({ transformOrigin: direction > 0 ? 'left center' : 'right center' }).tween({ scaleX: 0 }, 500, 'easeOutQuint');
    }

    animateIn(delay) {
        this.clearTween();

        this.container.clearTween().css({ opacity: 0 }).tween({ opacity: this.active ? 1 : 0.5 }, 700, 'easeOutCubic', delay);

        this.css({ y: 10 }).tween({ y: 0 }, 700, 'easeOutCubic', delay, () => {
            this.css({ pointerEvents: 'auto' });
        });

        this.animatedIn = true;
    }

    animateOut() {
        this.clearTween();
        this.css({ pointerEvents: 'none' });

        this.container.clearTween().tween({ opacity: 0 }, 400, 'easeOutCubic');

        this.tween({ y: 0 }, 400, 'easeOutCubic');

        this.animatedIn = false;
    }

    destroy() {
        this.removeListeners();

        return super.destroy();
    }
}
