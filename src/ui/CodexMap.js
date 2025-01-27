import { executeSlashCommands } from '../../../../../slash-commands.js';
import { delay } from '../../../../../utils.js';
import { Match } from '../Match.js';
import { ResultNode } from '../ResultNode.js';
import { tryDecodeBase64 } from '../lib/base64.js';
import { log } from '../lib/log.js';
import { waitForFrame } from '../lib/wait.js';
import { CodexBaseEntry } from './CodexBaseEntry.js';
import { CodexCharList } from './CodexCharList.js';
import { Map } from './map/Map.js';
import { MapEditor } from './map/MapEditor.js';
import { PaintLayer } from './map/PaintLayer.js';
import { Zone } from './map/Zone.js';




export class CodexMap extends CodexBaseEntry {
    /**@type {RegExp}*/ static dataRegex = /\n?{{\/\/codex-map:(.+?)}}/s;
    static test(entry) {
        return this.dataRegex.test(entry.content)
            || entry.keyList.includes('codex-map:')
        ;
    }



    /**@type {String}*/ url;
    /**@type {PaintLayer[]}*/ paintList = [];
    /**@type {String}*/ description;
    /**@type {String}*/ command;
    /**@type {String}*/ qrSet;
    /**@type {Zone[]}*/ zoneList;
    /**@type {string}*/ _titleField;
    get titleField() { return this._titleField; }

    /**@type {HTMLImageElement}*/ image;
    /**@type {CanvasRenderingContext2D}*/ mapContext;
    /**@type {CanvasRenderingContext2D}*/ hoverContext;

    /**@type {Map}*/ map;
    /**@type {Map}*/ zoomedMap;

    /**@type {MapEditor}*/ editor;

    /**@type {HTMLElement}*/ zoneListDom;
    /**@type {HTMLElement}*/ zoomedMapContainer;




    constructor(entry, settings, matcher, linker) {
        super(entry, settings, matcher, linker);
        this.load();
    }

    load() {
        const re = CodexMap.dataRegex;
        if (re.test(this.entry.content)) {
            this.loadNewFormat(re.exec(this.entry.content)[1]);
        } else {
            this.loadOldFormat(this.entry.content || '{}');
        }
        // remove "codex-map:" key
        const mapKeyIdx = this.entry.keyList.findIndex(it=>it.startsWith('codex-map:'));
        if (mapKeyIdx > -1) {
            this.entry.keyList.splice(mapKeyIdx, 1);
        }
        const titleKeyIdx = this.entry.keyList.findIndex(it=>it.startsWith('codex-title:'));
        if (titleKeyIdx > -1) {
            this.entry.keyList.splice(titleKeyIdx, 1);
        }
    }
    loadNewFormat(content) {
        const data = JSON.parse(decodeURIComponent(atob(content)));
        this.url = data.url ?? '';
        this.paintList = (data.paintList ?? []).map(it=>{
            if (typeof it == 'string') return PaintLayer.from({ paint:it });
            return PaintLayer.from(it);
        });
        this.description = data.description;
        this.command = data.command;
        this.qrSet = data.qrSet;
        this.zoneList = (data.zoneList ?? []).map(it=>Zone.from(it));
        this._titleField = data.titleField;
    }

    loadOldFormat(content) {
        const data = JSON.parse(content);
        this.url = tryDecodeBase64(data.url);
        this.paintList = (data.paintList ?? []).map(it=>{
            if (typeof it == 'string') return PaintLayer.from({ paint:it });
            return PaintLayer.from(it);
        });
        this.description = tryDecodeBase64(data.description);
        this.command = tryDecodeBase64(data.command);
        this.qrSet = tryDecodeBase64(data.qrSet);
        this.zoneList = (data.zoneList ?? []).map(it=>Zone.from(it));
        this.save();
    }


    async save() {
        this.entry.content = `{{//codex-map:${btoa(encodeURIComponent(JSON.stringify(this)))}}}`;
        await this.entry.saveDebounced();
    }
    toJSON() {
        return {
            url: this.url ?? '',
            paintList: this.paintList,
            description: this.description ?? '',
            command: this.command ?? '',
            qrSet: this.qrSet ?? '',
            zoneList: this.zoneList,
            titleField: this.titleField,
        };
    }




    async fetchImage() {
        return new Promise(resolve=>{
            if (!this.image) {
                this.image = new Image();
            }
            if (this.image.src != this.url) {
                this.image.src = this.url;
            }
            if (!this.image.complete) {
                this.image.addEventListener('load', ()=>resolve(this.image));
                this.image.addEventListener('error', ()=>resolve(this.image));
            } else {
                resolve(this.image);
            }
        });
    }

    async render() {
        if (!this.dom) {
            const dom = document.createElement('div'); {
                this.dom = dom;
                dom.classList.add('stcdx--content');
                dom.classList.add('stcdx--map');
                await this.renderContent();
            }
        }
        return this.dom;
    }

    scroll(deltaY) {
        if (!this.zoneListDom) return;
        this.zoneListDom.scrollTop += deltaY;
    }

    async renderContent() {
        this.dom.innerHTML = '';
        const title = document.createElement('h2'); {
            title.classList.add('stcdx--title');
            title.textContent = this.title;
            title.addEventListener('click', async()=>{
                await this.renderZoom();
            });
            this.dom.append(title);
        }

        const map = new Map(this.settings, await this.fetchImage(), this.zoneList, this.paintList); {
            //TODO map listeners (click, context, hover)
            map.onZoneClick = (zone, evt) => this.handleZoneClicked(zone, evt, false);
            map.onZoneHover = (zone, evt) => this.handleZoneHovered(zone, evt);
            this.map = map;
            const mapEl = await map.render();
            mapEl.addEventListener('click', async()=>{
                await this.renderZoom();
            });
            this.dom.append(mapEl);
        }

        const zoneCont = document.createElement('div'); {
            this.zoneListDom = zoneCont;
            zoneCont.classList.add('stcdx--zoneContainer');
            for (const zone of this.map.combinedZoneList?.toSorted((a,b)=>(a.label ?? '').localeCompare(b.label ?? '')) ?? []) {
                let entry;
                if (zone.key) {
                    entry = this.matcher.findMatches(zone.key)[0]?.entry;
                }
                const z = document.createElement('div'); {
                    zone.dom = z;
                    z.classList.add('stcdx--zone');
                    const label = document.createElement('div'); {
                        label.classList.add('stcdx--title');
                        label.textContent = zone.label ?? entry?.title ?? '???';
                        if (entry) {
                            label.classList.add('stcdx--link');
                            this.linker.updateNodes([new ResultNode(label.firstChild, [new Match(entry.book, entry, 0, label.textContent.length)])]);
                        }
                        z.append(label);
                    }
                    const content = document.createElement('div'); {
                        content.classList.add('stcdx--content');
                        content.classList.add('mes_text');
                        if (zone.description) {
                            const p = document.createElement('p');
                            p.textContent = zone.description;
                            content.append(p);
                        } else if (entry && !CodexMap.test(entry) && !CodexCharList.test(entry)) {
                            content.append(...this.renderTemplate(entry));
                            Array.from(content.querySelectorAll('img, h1, h2, h3, h4')).forEach(it=>it.remove());
                        }
                        z.append(content);
                    }
                    zoneCont.append(z);
                }
            }
            this.dom.append(zoneCont);
        }
    }

    async renderZoom() {
        let mapEl;
        const container = document.createElement('div'); {
            this.zoomedMapContainer = container;
            container.classList.add('stcdx--map-zoomed');
            const map = new Map(this.settings, await this.fetchImage(), this.zoneList, this.paintList);
            //TODO map listeners (click, context, hover)
            map.onZoneClick = async(zone, evt) => {
                if (!zone.keepZoomed) {
                    await this.unrenderZoom();
                }
                this.handleZoneClicked(zone, evt, true);
            };
            this.zoomedMap = map;
            mapEl = await map.render();
            mapEl.addEventListener('click', async()=>{
                await this.unrenderZoom();
                container.remove();
            });
            container.append(mapEl);
        }

        const rect = this.map.mapCanvas.getBoundingClientRect();
        if (rect.width == 0 || rect.height == 0) {
            mapEl.style.transition = 'none';
            document.body.append(container);
            await waitForFrame();
            this.zoomedMap.dom.style.left = '100vw';
            await waitForFrame();
            mapEl.style.transition = '';
        } else {
            this.zoomedMap.dom.style.top = `${rect.top}px`;
            this.zoomedMap.dom.style.left = `${rect.left}px`;
            this.zoomedMap.dom.style.width = `${rect.width}px`;
            this.zoomedMap.dom.style.height = `${rect.height}px`;
            document.body.append(container);
            await waitForFrame();
        }
        container.classList.add('stcdx--active');
        this.zoomedMap.dom.style.top = '';
        this.zoomedMap.dom.style.left = '';
        this.zoomedMap.dom.style.width = '';
        this.zoomedMap.dom.style.height = '';
        await delay(this.settings.zoomTime + 10);
    }

    async unrenderZoom() {
        const rect = this.map.mapCanvas.getBoundingClientRect();
        if (rect.width == 0 || rect.height == 0) {
            const zr = this.zoomedMap.dom.getBoundingClientRect();
            this.zoomedMap.dom.style.top = `${-zr.height}px`;
        } else {
            this.zoomedMap.dom.style.top = `${rect.top}px`;
            this.zoomedMap.dom.style.left = `${rect.left}px`;
            this.zoomedMap.dom.style.width = `${rect.width}px`;
            this.zoomedMap.dom.style.height = `${rect.height}px`;
        }
        this.zoomedMapContainer.classList.remove('stcdx--active');
        await delay(this.settings.zoomTime + 10);
        this.zoomedMapContainer.remove();
        this.zoomedMap = null;
        this.zoomedMapContainer = null;
    }


    async toggleEditor() {
        log('CodexMap.toggleEditor');
        if (this.editor) {
            this.editor.dom.remove();
            this.editor = null;
        } else {
            const editor = new MapEditor(this);
            this.editor = editor;
            await editor.show(this.map.mapCanvas.getBoundingClientRect());
            await this.save();
            this.editor = null;
            await this.renderContent();
        }
        log('/CodexMap.toggleEditor');
    }




    async handleZoneClicked(zone, evt, isZoomed) {
        let cmd = zone.command || this.command;
        if (cmd) {
            cmd = cmd
                .replace(/{{map}}/gi, this.title)
                .replace(/{{zone}}/gi, zone.label)
                .replace(/{{zoom}}/g, JSON.stringify(isZoomed))
            ;
            await executeSlashCommands(cmd);
        }
    }

    async handleZoneHovered(zone, evt) {
        Array.from(this.dom.querySelectorAll('.stcdx--active')).forEach(it=>it.classList.remove('stcdx--active'));
        if (!zone || !zone.dom) return;
        zone.dom.classList.add('stcdx--active');
        if (zone.dom.scrollIntoViewIfNeeded) {
            zone.dom.scrollIntoViewIfNeeded();
        } else {
            zone.dom.scrollIntoView();
        }
    }
}
