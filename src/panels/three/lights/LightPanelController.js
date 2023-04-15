/**
 * @author pschroen / https://ufo.ai/
 */

import {
    AmbientLight,
    DirectionalLight,
    DirectionalLightHelper,
    HemisphereLight,
    HemisphereLightHelper,
    PointLight,
    PointLightHelper,
    RectAreaLight,
    SpotLight,
    SpotLightHelper
} from 'three';

import { PanelItem } from '../../PanelItem.js';

import { AmbientLightPanel } from './AmbientLightPanel.js';
import { HemisphereLightPanel } from './HemisphereLightPanel.js';
import { DirectionalLightPanel } from './DirectionalLightPanel.js';
import { PointLightPanel } from './PointLightPanel.js';
import { SpotLightPanel } from './SpotLightPanel.js';
import { RectAreaLightPanel } from './RectAreaLightPanel.js';

export const LightOptions = {
    Ambient: [AmbientLight, AmbientLightPanel],
    Hemisphere: [HemisphereLight, HemisphereLightPanel],
    Directional: [DirectionalLight, DirectionalLightPanel],
    Point: [PointLight, PointLightPanel],
    Spot: [SpotLight, SpotLightPanel],
    RectArea: [RectAreaLight, RectAreaLightPanel]
};

export function getKeyByLight(lightOptions, light) {
    return Object.keys(lightOptions).reverse().find(key => light instanceof lightOptions[key][0]);
}

export class LightPanelController {
    static init(scene, ui) {
        this.scene = scene;
        this.ui = ui;

        this.lights = [];

        if (this.ui) {
            this.initPanel();
        }
    }

    static initPanel() {
        const scene = this.scene;
        const ui = this.ui;

        const lightOptions = {};

        scene.traverse(object => {
            if (object.isLight) {
                const key = getKeyByLight(LightOptions, object);

                lightOptions[key] = [object, LightOptions[key][1]];

                this.lights.push(object);
            }
        });

        const items = [
            {
                type: 'divider'
            },
            {
                type: 'list',
                list: lightOptions,
                value: Object.keys(lightOptions)[0],
                callback: (value, panel) => {
                    const [light, LightPanel] = lightOptions[value];

                    const lightPanel = new LightPanel(this, light);
                    lightPanel.animateIn(true);

                    panel.setContent(lightPanel);
                }
            }
        ];

        items.forEach(data => {
            ui.addPanel(new PanelItem(data));
        });
    }

    /**
     * Public methods
     */

    static toggleHemisphereLightHelper = (light, show) => {
        if (show) {
            if (!light.helper) {
                light.helper = new HemisphereLightHelper(light);
                this.scene.add(light.helper);
            }

            light.helper.visible = true;
        } else if (light.helper) {
            light.helper.visible = false;
        }
    };

    static toggleDirectionalLightHelper = (light, show) => {
        if (show) {
            if (!light.helper) {
                light.helper = new DirectionalLightHelper(light, 0.125);
                this.scene.add(light.helper);
            }

            light.helper.visible = true;
        } else if (light.helper) {
            light.helper.visible = false;
        }
    };

    static togglePointLightHelper = (light, show) => {
        if (show) {
            if (!light.helper) {
                light.helper = new PointLightHelper(light, 0.125);
                this.scene.add(light.helper);
            }

            light.helper.visible = true;
        } else if (light.helper) {
            light.helper.visible = false;
        }
    };

    static toggleSpotLightHelper = (light, show) => {
        if (show) {
            if (!light.helper) {
                light.helper = new SpotLightHelper(light);
                this.scene.add(light.helper);
            }

            light.helper.visible = true;
        } else if (light.helper) {
            light.helper.visible = false;
        }
    };

    static update = () => {
        this.lights.forEach(light => {
            if (light.helper) {
                light.helper.update();
            }
        });
    };

    static destroy = () => {
        this.lights.forEach(light => {
            if (light.helper) {
                if (light.isHemisphereLight) {
                    this.toggleHemisphereLightHelper(light, false);
                }

                if (light.isDirectionalLight) {
                    this.toggleDirectionalLightHelper(light, false);
                }

                if (light.isPointLight) {
                    this.togglePointLightHelper(light, false);
                }

                if (light.isSpotLight) {
                    this.toggleSpotLightHelper(light, false);
                }

                this.scene.remove(light.helper);
                light.helper.dispose();

                delete light.helper;
            }
        });

        for (const prop in this) {
            this[prop] = null;
        }

        return null;
    };
}
