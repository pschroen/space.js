/**
 * @author pschroen / https://ufo.ai/
 */

import { Point3D } from '../../../ui/three/Point3D.js';
import { Panel } from '../../Panel.js';
import { PanelItem } from '../../PanelItem.js';
import { StandardMaterialPatches } from '../Patches.js';

import { StandardMaterialCommonPanel } from './StandardMaterialCommonPanel.js';
import { StandardMaterialSubsurfacePanel } from './StandardMaterialSubsurfacePanel.js';
import { StandardMaterialEnvPanel } from './StandardMaterialEnvPanel.js';
import { InstancedMeshPanel } from '../objects/InstancedMeshPanel.js';
import { MeshHelperPanel } from '../objects/MeshHelperPanel.js';
import { OimoPhysicsPanel } from '../physics/OimoPhysicsPanel.js';
import { MapPanel } from '../textures/MapPanel.js';

export const StandardMaterialOptions = {
    Common: StandardMaterialCommonPanel,
    Map: MapPanel,
    Subsurface: StandardMaterialSubsurfacePanel,
    Env: StandardMaterialEnvPanel,
    Helper: MeshHelperPanel,
    Physics: OimoPhysicsPanel
};

export class StandardMaterialPanel extends Panel {
    static type = [
        'common',
        'standard'
    ];

    static properties = {
        common: [
            'color',
            'emissive',
            'flatShading',
            'wireframe',
            'toneMapped'
        ],
        standard: [
            'roughness',
            'metalness',
            'envMapIntensity'
        ]
    };

    constructor(mesh) {
        super();

        this.mesh = mesh;

        this.initPanel();
    }

    initPanel() {
        const mesh = this.mesh;

        if (!Point3D.points) {
            delete StandardMaterialOptions.Helper;
        }

        if (!Point3D.physics) {
            delete StandardMaterialOptions.Physics;
        }

        if (mesh.userData.subsurface) {
            mesh.material.userData.onBeforeCompile.subsurface = StandardMaterialPatches.subsurface;

            mesh.material.customProgramCacheKey = () => Object.keys(mesh.material.userData.onBeforeCompile).join('|');
            mesh.material.needsUpdate = true;
        }

        const materialItems = [
            {
                type: 'divider'
            },
            {
                type: 'list',
                label: 'Standard',
                list: StandardMaterialOptions,
                value: 'Common',
                callback: (value, panel) => {
                    const MaterialPanel = StandardMaterialOptions[value];

                    const materialPanel = new MaterialPanel(mesh);
                    materialPanel.animateIn(true);

                    panel.setContent(materialPanel);
                }
            }
        ];

        const items = [];

        if (mesh.isInstancedMesh) {
            items.push(
                {
                    type: 'content',
                    callback: (value, panel) => {
                        const materialPanel = new InstancedMeshPanel(mesh, materialItems);
                        materialPanel.animateIn(true);

                        panel.setContent(materialPanel);
                    }
                }
            );
        } else {
            items.push(...materialItems);
        }

        items.forEach(data => {
            this.add(new PanelItem(data));
        });
    }
}
