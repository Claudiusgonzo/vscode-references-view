/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { History, HistoryItem } from './history';
import { CallItem as CallHierarchyItem, CallsModel, FileItem, getPreviewChunks, ReferenceItem, ReferencesModel } from './models';

export class ReferencesProvider implements vscode.TreeDataProvider<FileItem | ReferenceItem> {

    private readonly _onDidChangeTreeData = new vscode.EventEmitter<FileItem | ReferenceItem>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private readonly _modelListener: vscode.Disposable;

    constructor(
        private _model: ReferencesModel
    ) {
        this._modelListener = _model.onDidChange(e => this._onDidChangeTreeData.fire(e instanceof FileItem ? e : undefined));
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
        this._modelListener.dispose();
    }

    async getTreeItem(element: FileItem | ReferenceItem): Promise<vscode.TreeItem> {

        if (element instanceof FileItem) {
            // files
            const result = new vscode.TreeItem(element.uri);
            result.contextValue = 'file-item';
            result.description = true;
            result.iconPath = vscode.ThemeIcon.File;
            result.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            return result;

        } else {
            // references
            const { range } = element.location;
            const doc = await element.parent.getDocument(true);
            const { before, inside, after } = getPreviewChunks(doc, range);

            const label: vscode.TreeItemLabel = {
                label: before + inside + after,
                highlights: [[before.length, before.length + inside.length]]
            };

            const result = new vscode.TreeItem2(label);
            result.collapsibleState = vscode.TreeItemCollapsibleState.None;
            result.contextValue = 'reference-item';
            result.command = { command: 'references-view.show', title: 'Open Reference', arguments: [element] };
            return result;
        }
    }

    async getChildren(element?: FileItem | ReferenceItem | undefined) {
        if (!element) {
            // group results by FileItem
            return this._model.items;
        } else if (element instanceof FileItem) {
            // matches inside a file
            return element.results;
        }
    }

    getParent(element: FileItem | ReferenceItem) {
        return element instanceof ReferenceItem ? element.parent : undefined;
    }
}

export class CallItemDataProvider implements vscode.TreeDataProvider<CallHierarchyItem> {

    private readonly _emitter = new vscode.EventEmitter<CallHierarchyItem | undefined>();
    readonly onDidChangeTreeData = this._emitter.event;

    constructor(
        private _model: CallsModel
    ) { }

    getTreeItem(element: CallHierarchyItem): vscode.TreeItem {

        const item = new vscode.TreeItem(element.item.name);
        item.description = element.item.detail;
        item.contextValue = 'call-item';
        item.iconPath = CallItemDataProvider._getThemeIcon(element.item.kind);
        item.command = { command: 'references-view.show', title: 'Open Call', arguments: [element] };
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        return item;
    }

    getChildren(element?: CallHierarchyItem | undefined) {
        if (!element) {
            return this._model.roots;
        } else {
            return this._model.resolveCalls(element);
        }
    }

    getParent(element: CallHierarchyItem) {
        return element.parent;
    }

    private static _themeIconIds = {
        [vscode.SymbolKind.File]: 'symbol-file',
        [vscode.SymbolKind.Module]: 'symbol-module',
        [vscode.SymbolKind.Namespace]: 'symbol-namespace',
        [vscode.SymbolKind.Package]: 'symbol-package',
        [vscode.SymbolKind.Class]: 'symbol-class',
        [vscode.SymbolKind.Method]: 'symbol-method',
        [vscode.SymbolKind.Property]: 'symbol-property',
        [vscode.SymbolKind.Field]: 'symbol-field',
        [vscode.SymbolKind.Constructor]: 'symbol-constructor',
        [vscode.SymbolKind.Enum]: 'symbol-enum',
        [vscode.SymbolKind.Interface]: 'symbol-interface',
        [vscode.SymbolKind.Function]: 'symbol-function',
        [vscode.SymbolKind.Variable]: 'symbol-variable',
        [vscode.SymbolKind.Constant]: 'symbol-constant',
        [vscode.SymbolKind.String]: 'symbol-string',
        [vscode.SymbolKind.Number]: 'symbol-number',
        [vscode.SymbolKind.Boolean]: 'symbol-boolean',
        [vscode.SymbolKind.Array]: 'symbol-array',
        [vscode.SymbolKind.Object]: 'symbol-object',
        [vscode.SymbolKind.Key]: 'symbol-key',
        [vscode.SymbolKind.Null]: 'symbol-null',
        [vscode.SymbolKind.EnumMember]: 'symbol-enum-member',
        [vscode.SymbolKind.Struct]: 'symbol-struct',
        [vscode.SymbolKind.Event]: 'symbol-event',
        [vscode.SymbolKind.Operator]: 'symbol-operator',
        [vscode.SymbolKind.TypeParameter]: 'symbol-type-parameter',
    };

    private static _getThemeIcon(kind: vscode.SymbolKind): vscode.ThemeIcon | undefined {
        let id = CallItemDataProvider._themeIconIds[kind];
        // @ts-ignore
        return id && new vscode.ThemeIcon(id);
    }
}

export class HistoryDataProvider implements vscode.TreeDataProvider<HistoryItem> {

    private readonly _emitter = new vscode.EventEmitter<HistoryItem | undefined>();
    readonly onDidChangeTreeData = this._emitter.event;

    constructor(private readonly _history: History) { }

    getTreeItem(element: HistoryItem): vscode.TreeItem {
        // history items
        // let source: string | undefined;
        // if (element.source === ItemSource.References) {
        //     source = 'references';
        // } else if (element.source === ItemSource.Implementations) {
        //     source = 'implementations';
        // } else if (element.source === ItemSource.CallHierarchy) {
        //     source = 'call hierarchy';
        // }
        const result = new vscode.TreeItem(element.label);
        // result.description = `${vscode.workspace.asRelativePath(element.uri)} • ${element.line} ${source && ` • ${source}`}`;
        result.description = element.description;
        result.command = { command: 'references-view.show', arguments: [element], title: 'Show' };
        result.collapsibleState = vscode.TreeItemCollapsibleState.None;
        result.contextValue = 'history-item';
        return result;
    }

    getChildren() {
        return [...this._history];
    }

    getParent() {
        return undefined;
    }
}


export type TreeItem = FileItem | ReferenceItem | HistoryItem | CallHierarchyItem;

export class TreeDataProviderWrapper<T> implements vscode.TreeDataProvider<T> {

    private _provider?: Required<vscode.TreeDataProvider<any>>;
    private _providerListener?: vscode.Disposable;
    private _onDidChange = new vscode.EventEmitter<any>();

    readonly onDidChangeTreeData = this._onDidChange.event;

    update(model: ReferencesModel | CallsModel | History) {
        if (this._providerListener) {
            this._providerListener.dispose();
            this._providerListener = undefined;
        }

        if (this._provider && typeof (<vscode.Disposable><any>this._provider).dispose === 'function') {
            (<vscode.Disposable><any>this._provider).dispose();
            this._provider = undefined;
        }

        if (model instanceof ReferencesModel) {
            this._provider = new ReferencesProvider(model);
        } else if (model instanceof CallsModel) {
            this._provider = new CallItemDataProvider(model);
        } else {
            this._provider = new HistoryDataProvider(model);
        }

        this._onDidChange.fire();
        this._providerListener = this._provider.onDidChangeTreeData(e => this._onDidChange.fire(e));
    }

    getTreeItem(element: T): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return this._provider!.getTreeItem(element);
    }

    getChildren(element?: T | undefined) {
        return this._provider?.getChildren(element);
    }

    getParent(element: T) {
        return this._provider?.getParent(element);
    }
}
