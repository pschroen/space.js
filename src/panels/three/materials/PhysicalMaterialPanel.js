/**
 * @author pschroen / https://ufo.ai/
 */

import { Point3D } from '../../../ui/three/Point3D.js';
import { Panel } from '../../Panel.js';
import { PanelItem } from '../../PanelItem.js';

import { PhysicalMaterialCommonPanel } from './PhysicalMaterialCommonPanel.js';
import { PhysicalMaterialClearcoatPanel } from './PhysicalMaterialClearcoatPanel.js';
import { PhysicalMaterialIridescencePanel } from './PhysicalMaterialIridescencePanel.js';
import { PhysicalMaterialSheenPanel } from './PhysicalMaterialSheenPanel.js';
import { PhysicalMaterialSubsurfacePanel } from './PhysicalMaterialSubsurfacePanel.js';
import { PhysicalMaterialTransmissionPanel } from './PhysicalMaterialTransmissionPanel.js';
import { PhysicalMaterialEnvPanel } from './PhysicalMaterialEnvPanel.js';
import { MeshHelperPanel } from '../objects/MeshHelperPanel.js';
import { MapPanel } from '../textures/MapPanel.js';

export const PhysicalMaterialOptions = {
    Common: PhysicalMaterialCommonPanel,
    Map: MapPanel,
    Clearcoat: PhysicalMaterialClearcoatPanel,
    Iridescence: PhysicalMaterialIridescencePanel,
    Sheen: PhysicalMaterialSheenPanel,
    Subsurface: PhysicalMaterialSubsurfacePanel,
    Transmission: PhysicalMaterialTransmissionPanel,
    Env: PhysicalMaterialEnvPanel,
    Helper: MeshHelperPanel
};

export class PhysicalMaterialPanel extends Panel {
    static type = [
        'common',
        'standard',
        'physical'
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
        ],
        physical: [
            'specularColor',
            'specularIntensity',
            'ior',
            'reflectivity',
            'transmission',
            'thickness',
            'attenuationColor',
            'attenuationDistance',
            'clearcoat',
            'clearcoatRoughness',
            'iridescence',
            'iridescenceIOR',
            'iridescenceThicknessRange',
            'sheen',
            'sheenRoughness',
            'sheenColor'
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
            delete PhysicalMaterialOptions.Helper;
        }

        const items = [
            {
                type: 'divider'
            },
            {
                type: 'list',
                label: 'Panel',
                list: PhysicalMaterialOptions,
                value: 'Common',
                callback: (value, panel) => {
                    const MaterialPanel = PhysicalMaterialOptions[value];

                    const materialPanel = new MaterialPanel(mesh);
                    materialPanel.animateIn(true);

                    panel.setContent(materialPanel);
                }
            }
        ];

        items.forEach(data => {
            this.add(new PanelItem(data));
        });
    }
}
