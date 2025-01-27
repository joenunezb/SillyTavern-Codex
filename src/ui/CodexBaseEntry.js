import { setCharacterId, substituteParams, this_chid } from '../../../../../../script.js';
import { selected_group } from '../../../../../group-chats.js';
import { delay } from '../../../../../utils.js';

// eslint-disable-next-line no-unused-vars
import { Linker } from '../Linker.js';
// eslint-disable-next-line no-unused-vars
import { Matcher } from '../Matcher.js';
// eslint-disable-next-line no-unused-vars
import { Settings } from '../Settings.js';
import { messageFormattingWithLanding } from '../lib/messageFormattingWithLanding.js';
import { waitForFrame } from '../lib/wait.js';
// eslint-disable-next-line no-unused-vars
import { Entry } from '../st/wi/Entry.js';




export class CodexBaseEntry {
    /**@type {Entry}*/ entry;
    /**@type {Settings}*/ settings;
    /**@type {Matcher}*/ matcher;
    /**@type {Linker}*/ linker;

    /**@type {Boolean}*/ isTogglingEditor = false;
    /**@type {Boolean}*/ isEditing = false;

    /**@type {HTMLElement}*/ dom;

    /**@type {Function}*/ onSave;

    get titleField() {
        return this.entry.keyList.find(it=>it.startsWith('codex-title:'))?.substring(12) ?? '';
    }

    get templateName() {
        return this.entry.keyList.find(it=>it.startsWith('codex-tpl:'))?.substring(10) ?? '';
    }

    get title() {
        return this.entry.title;
    }




    constructor(entry, settings, matcher, linker) {
        this.entry = entry;
        this.settings = settings;
        this.matcher = matcher;
        this.linker = linker;
    }




    /**
     *
     * @param {String} text
     * @returns {String}
     */
    subParams(text) {
        return substituteParams(text).replace(
            /\{\{wi::(?:((?:(?!(?:::)).)+)::)?((?:(?!(?:::)).)+)\}\}/g,
            (all, book, key)=>{
                const matches = this.matcher.findMatches(key).filter(it=>book === undefined || it.book.toLowerCase() == book.toLowerCase());
                if (matches.length > 0) {
                    return this.subParams(matches[0].entry.content);
                }
                return all;
            },
        );
    }


    /**
     *
     * @param {Entry} entry
     */
    renderTemplate(entry) {
        let template = this.settings.templateList.find(tpl=>tpl.name == entry.keyList.find(it=>it.startsWith('codex-tpl:'))?.substring(10))?.content ?? this.settings.template;
        let messageText = template
            .replace(/{{comment}}/g, entry.comment)
            .replace(/{{comment::url}}/g, encodeURIComponent(entry.comment))
            .replace(/{{content}}/g, entry.content)
            .replace(/{{content::url}}/g, encodeURIComponent(entry.content))
            .replace(/{{key\[(\d+)\]}}/g, (_,idx)=>entry.keyList[idx])
            .replace(/{{key\[(\d+)\]::url}}/g, (_,idx)=>encodeURIComponent(entry.keyList[idx]))
            .replace(/{{title}}/g, this.title)
            .replace(/{{title::url}}/g, encodeURIComponent(this.title))
        ;
        const currentChatId = this_chid;
        let landingHack = false;
        if ((this_chid ?? selected_group) == null) {
            landingHack = true;
            setCharacterId(1);
        }
        messageText = messageFormattingWithLanding(messageText);
        if (landingHack) {
            setCharacterId(currentChatId);
        }
        const dom = document.createElement('div');
        dom.innerHTML = messageText;
        this.linker.addCodexLinks(dom, [this.entry]);
        return Array.from(dom.children);
    }




    /**
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        throw new Error(`${this.constructor.name}.render is not implemented!`);
    }

    unrender() {
        this.dom?.remove();
        this.dom = null;
    }

    scroll(deltaY) {
        this.dom.scrollTop += deltaY;
    }


    async show() {
        await this.render();
        this.dom.classList.add('stcdx--preactive');
        await waitForFrame();
        this.dom.classList.add('stcdx--active');
        await delay(this.settings.transitionTime + 10);
    }

    async hide() {
        if (!this.dom) return;
        this.dom.classList.remove('stcdx--active');
        await delay(this.settings.transitionTime + 10);
        if (!this.dom) return;
        this.dom.classList.remove('stcdx--preactive');
        await waitForFrame();
    }


    async toggleEditor() {
        throw new Error(`${this.constructor.name}.showEditor is not implemented!`);
    }
}
