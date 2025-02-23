/**
 * @author pschroen / https://ufo.ai/
 */

import { Interface } from '../utils/Interface.js';

export class PanelLink extends Interface {
    constructor({
        name,
        value,
        callback
    }) {
        super('.panel-link');

        this.name = name;
        this.value = value;
        this.callback = callback;

        this.init();
        this.setValue(this.value);

        this.addListeners();
    }

    init() {
        this.css({
            position: 'relative',
            width: 'fit-content',
            height: 18,
            lineHeight: 16,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            cursor: 'pointer'
        });
        this.text(this.value);

        this.line = new Interface('.line');
        this.line.css({
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 1,
            height: 1,
            backgroundColor: 'var(--ui-color)',
            transformOrigin: 'left center',
            scaleX: 0
        });
        this.add(this.line);
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
        this.line.clearTween();

        if (type === 'mouseenter') {
            this.line.css({ transformOrigin: 'left center', scaleX: 0 }).tween({ scaleX: 1 }, 800, 'easeOutQuint');
        } else {
            this.line.css({ transformOrigin: 'right center' }).tween({ scaleX: 0 }, 500, 'easeOutQuint');
        }
    };

    onClick = () => {
        this.update();
    };

    // Public methods

    setValue(value) {
        this.value = value;

        this.element.childNodes[0].nodeValue = this.value;
    }

    update() {
        this.events.emit('update', { path: [], value: this.value, target: this });

        if (this.callback) {
            this.callback(this.value, this);
        }
    }

    destroy() {
        this.removeListeners();

        return super.destroy();
    }
}
