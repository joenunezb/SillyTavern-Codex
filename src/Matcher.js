import { escapeRegex } from '../../../../utils.js';
import { Match } from './Match.js';
import { ResultNode } from './ResultNode.js';
// eslint-disable-next-line no-unused-vars
import { Settings } from './Settings.js';
import { log, warn } from './lib/log.js';
// eslint-disable-next-line no-unused-vars
import { Book } from './st/wi/Book.js';
import { Entry } from './st/wi/Entry.js';
import { worldInfoLogic } from './st/wi/Logic.js';
// eslint-disable-next-line no-unused-vars
import { WorldInfoSettings } from './st/wi/Settings.js';

export class Matcher {
    /**@type {Settings}*/ settings;
    /**@type {WorldInfoSettings}*/ wiSettings;
    /**@type {Book[]}*/ bookList = [];




    /**
     *
     * @param {Settings} settings
     * @param {WorldInfoSettings} wiSettings
     * @param {Book[]} bookList
     */
    constructor(settings, wiSettings, bookList) {
        this.settings = settings;
        this.wiSettings = wiSettings;
        this.bookList = bookList;
    }

    /**
     * @param {XPathResult} nodes
     */
    checkNodes(nodes, alreadyFound = [], skip = []) {
        log('MATCHER.checkNodes');
        const resultNodes = [];
        const found = [...alreadyFound];
        for (let i = 0; i < nodes.snapshotLength; i++) {
            const node = nodes.snapshotItem(i);
            if (this.settings.skipCodeBlocks) {
                const codeEl = node.parentElement.tagName == 'CODE' ? node.parentElement : node.parentElement.closest('code');
                if (codeEl && codeEl.closest('pre')) {
                    continue;
                }
            }
            const matches = this.findMatches(node.textContent, found, skip);
            if (matches.length > 0) {
                found.push(...matches.map(it=>it.entry));
                resultNodes.push(new ResultNode(node, matches));
            }
        }
        log('/MATCHER.checkNodes', resultNodes);
        return resultNodes;
    }

    /**
     *
     * @param {String} text The text to search
     * @param {Entry[]} alreadyFound List of already found entries
     * @returns The list of found matches
     */
    findMatches(text, alreadyFound = [], skip = []) {
        log('MATCHER.findMatches', { text, alreadyFound });
        /**@type {Entry[]}*/
        const found = [...alreadyFound];
        /**@type {Match[]}*/
        const matches = [];
        for (const book of this.bookList) {
            for (const entry of book.entryList) {
                if (entry.keyList.includes('codex-skip:')) continue;
                if (skip.includes(entry)) continue;
                if (this.settings.onlyFirst && found.includes(entry)) continue;
                const keys = entry.keyList.filter(it=>!this.settings.requirePrefix || it.startsWith('codex:'));
                for (const key of keys) {
                    if (this.settings.onlyFirst && found.includes(entry)) continue;
                    let searchKey = key.replace(/^codex:/, '');
                    if (searchKey.length == 0) continue;
                    /**@type {RegExp}*/
                    let re;
                    /**@type {String}*/
                    let plain;
                    /**@type {String}*/
                    let searchText = text;
                    if (searchKey.match(/^\/.+\/[a-z]*$/)) {
                        try {
                            re = new RegExp(searchKey.replace(/^\/(.+)\/([a-z]*)$/, '$1'), searchKey.replace(/^\/(.+)\/([a-z]*)$/, '$2'));
                        } catch (ex) {
                            warn(ex.message, ex);
                        }
                    } else {
                        plain = searchKey;
                        if (!(entry.isCaseSensitive ?? this.wiSettings.isCaseSensitive)) {
                            plain = plain.toLowerCase();
                            searchText = searchText.toLowerCase();
                        }
                        if (entry.isMatchingWholeWords ?? this.wiSettings.isMatchingWholeWords) {
                            re = new RegExp(`\\b${escapeRegex(plain)}\\b`);
                        }
                    }
                    // secondary keys
                    if (entry.secondaryKeyList.length > 0) {
                        let any = false;
                        let all = true;
                        for (const key of entry.secondaryKeyList) {
                            const searchKey = key.replace(/^codex:/, '');
                            if (searchKey.length == 0) continue;
                            /**@type {RegExp}*/
                            let re;
                            /**@type {String}*/
                            let plain;
                            if (searchKey.match(/^\/.+\/[a-z]*$/)) {
                                try {
                                    re = new RegExp(searchKey.replace(/^\/(.+)\/([a-z]*)$/, '$1'), searchKey.replace(/^\/(.+)\/([a-z]*)$/, '$2'));
                                } catch (ex) {
                                    warn(ex.message, ex);
                                }
                            } else {
                                plain = searchKey;
                                if (!this.wiSettings.isCaseSensitive) {
                                    plain = plain.toLowerCase();
                                }
                            }
                            if (searchText.search(re ?? plain) != -1) {
                                any = true;
                            } else {
                                all = false;
                            }
                        }
                        switch (entry.secondaryKeyLogic) {
                            case worldInfoLogic.AND_ANY: {
                                if (!any) continue;
                                break;
                            }
                            case worldInfoLogic.NOT_ALL: {
                                if (all) continue;
                                break;
                            }
                            case worldInfoLogic.NOT_ANY: {
                                if (any) continue;
                                break;
                            }
                            case worldInfoLogic.AND_ALL: {
                                if (!all) continue;
                                break;
                            }
                        }
                    }
                    // /secondary keys
                    let offset = 0;
                    while (searchText.substring(offset).search(re ?? plain) != -1) {
                        if (this.settings.onlyFirst && found.find(it=>it == entry)) break;
                        let start;
                        let end;
                        if (re) {
                            const match = searchText.substring(offset).match(re);
                            let idx = offset + match.index;
                            if (match[1]) {
                                idx += match[0].search(match[1]);
                            }
                            start = idx;
                            end = start + (match[1] ?? match[0]).length;
                        } else {
                            start = offset + searchText.substring(offset).search(plain);
                            end = start + plain.length;
                        }
                        const match = new Match(
                            book.name,
                            entry,
                            start,
                            end,
                        );
                        matches.push(match);
                        found.push(match.entry);
                        offset += end;
                    }
                }
            }
        }
        log('/MATCHER.findMatches', matches);
        return matches.toSorted((a,b)=>a.start - b.start);
    }
}
