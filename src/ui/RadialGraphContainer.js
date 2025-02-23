/**
 * @author pschroen / https://ufo.ai/
 */

import { Vector2 } from '../math/Vector2.js';
import { Interface } from '../utils/Interface.js';

import { TwoPI, degToRad } from '../utils/Utils.js';

export class RadialGraphContainer extends Interface {
    constructor({
        start = 0,
        graphHeight = 60
    } = {}) {
        super('.radial-graph-container');

        this.start = start;
        this.graphHeight = graphHeight;

        this.position = new Vector2();
        this.objectWidth = 0;
        this.objectHeight = 0;
        this.width = 0;
        this.height = 0;
        this.halfWidth = 0;
        this.halfHeight = 0;
        this.middle = 0;
        this.startAngle = degToRad(this.start);

        if (this.startAngle < 0) {
            this.startAngle += TwoPI;
        }

        this.index = 0;
        this.graph = null;

        this.init();
    }

    init() {
        this.css({
            position: 'static'
        });
    }

    removeListeners() {
        this.children.forEach(child => {
            child.events.off('cursor', this.onCursor);
        });
    }

    // Event handlers

    onCursor = e => {
        this.events.emit('cursor', e);
    };

    onPointerUp = () => {
        this.children.forEach(child => child.onPointerUp());
    };

    // Public methods

    add(graph) {
        graph.events.on('cursor', this.onCursor);

        graph.invisible();
        graph.enabled = false;

        return super.add(graph);
    }

    setArray(value, index = 0) {
        this.children[index].setArray(value);
    }

    setGhostArray(value, index = 0) {
        this.children[index].setGhostArray(value);
    }

    setContext(context) {
        this.children.forEach(child => child.setContext(context));
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
        }

        this.children.forEach(child => {
            child.position.copy(this.position);
            child.setSize(width, height);
        });
    }

    setIndex(index) {
        this.index = index;
        this.graph = this.children[this.index];

        this.children.forEach(child => {
            child.invisible();
            child.enabled = false;
        });

        this.graph.enabled = true;
        this.graph.visible();

        this.update();
    }

    update() {
        this.children.forEach(child => child.update());
    }

    animateLabelsIn() {
        this.children.forEach(child => child.animateLabelsIn());
    }

    animateLabelsOut() {
        this.children.forEach(child => child.animateLabelsOut());
    }

    animateIn(fast) {
        this.children.forEach(child => child.animateIn(fast));
    }

    animateOut() {
        this.children.forEach(child => child.animateOut());
    }

    destroy() {
        this.removeListeners();

        return super.destroy();
    }
}
