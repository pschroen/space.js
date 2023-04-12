/**
 * @author pschroen / https://ufo.ai/
 */

import { Panel } from '../Panel.js';
import { PanelItem } from '../PanelItem.js';

export class PhysicalMaterialSheenPanel extends Panel {
    constructor(mesh) {
        super();

        this.mesh = mesh;

        this.initPanel();
    }

    initPanel() {
        const mesh = this.mesh;

        const items = [
            {
                type: 'divider'
            },
            {
                type: 'slider',
                label: 'Intensity',
                min: 0,
                max: 1,
                step: 0.01,
                value: mesh.material.sheen,
                callback: value => {
                    mesh.material.sheen = value;
                }
            },
            {
                type: 'slider',
                label: 'Rough',
                min: 0,
                max: 2,
                step: 0.01,
                value: mesh.material.sheenRoughness,
                callback: value => {
                    mesh.material.sheenRoughness = value;
                }
            },
            {
                type: 'color',
                value: mesh.material.sheenColor,
                callback: value => {
                    mesh.material.sheenColor.copy(value);
                }
            }
            // TODO: Texture thumbnails
        ];

        items.forEach(data => {
            this.add(new PanelItem(data));
        });
    }
}
