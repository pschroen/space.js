/**
 * @author pschroen / https://ufo.ai/
 */

import { Panel } from '../../../panels/Panel.js';
import { PanelItem } from '../../../panels/PanelItem.js';
import { ToneMappedOptions, WireframeOptions } from '../Options.js';

import { getKeyByValue } from '../../../utils/Utils.js';

export class BasicMaterialCommonPanel extends Panel {
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
                type: 'color',
                name: 'Color',
                value: mesh.material.color,
                callback: value => {
                    mesh.material.color.copy(value);
                }
            },
            {
                type: 'list',
                name: 'Wire',
                list: WireframeOptions,
                value: getKeyByValue(WireframeOptions, mesh.material.wireframe),
                callback: value => {
                    mesh.material.wireframe = WireframeOptions[value];
                }
            },
            {
                type: 'list',
                name: 'Tone',
                list: ToneMappedOptions,
                value: getKeyByValue(ToneMappedOptions, mesh.material.toneMapped),
                callback: value => {
                    mesh.material.toneMapped = ToneMappedOptions[value];
                }
            }
            // TODO: Texture thumbnails
        ];

        items.forEach(data => {
            this.add(new PanelItem(data));
        });
    }
}
