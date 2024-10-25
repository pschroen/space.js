/**
 * @author pschroen / https://ufo.ai/
 */

import { MathUtils } from 'three';

import { Panel } from '../../../panels/Panel.js';
import { PanelItem } from '../../../panels/PanelItem.js';

export class ScenePanel extends Panel {
    constructor(scene) {
        super();

        this.scene = scene;

        this.initPanel();
    }

    initPanel() {
        const scene = this.scene;

        const items = [
            // TODO: Texture thumbnails
        ];

        if (scene.background && scene.background.isColor) {
            items.push(
                {
                    type: 'divider'
                },
                {
                    type: 'color',
                    value: scene.background,
                    callback: value => {
                        scene.background.copy(value);
                    }
                }
            );
        }

        if (scene.environment) {
            items.push(
                {
                    type: 'divider'
                },
                {
                    type: 'slider',
                    name: 'Rotate X',
                    min: 0,
                    max: 360,
                    step: 0.3,
                    value: MathUtils.radToDeg(scene.environmentRotation.x),
                    callback: value => {
                        value = MathUtils.degToRad(value);
                        scene.environmentRotation.x = value;
                    }
                },
                {
                    type: 'slider',
                    name: 'Rotate Y',
                    min: 0,
                    max: 360,
                    step: 0.3,
                    value: MathUtils.radToDeg(scene.environmentRotation.y),
                    callback: value => {
                        value = MathUtils.degToRad(value);
                        scene.environmentRotation.y = value;
                    }
                },
                {
                    type: 'slider',
                    name: 'Rotate Z',
                    min: 0,
                    max: 360,
                    step: 0.3,
                    value: MathUtils.radToDeg(scene.environmentRotation.z),
                    callback: value => {
                        value = MathUtils.degToRad(value);
                        scene.environmentRotation.z = value;
                    }
                },
                {
                    type: 'slider',
                    name: 'Int',
                    min: 0,
                    max: 10,
                    step: 0.1,
                    value: scene.environmentIntensity,
                    callback: value => {
                        scene.environmentIntensity = value;
                    }
                }
            );
        }

        items.forEach(data => {
            this.add(new PanelItem(data));
        });
    }
}
