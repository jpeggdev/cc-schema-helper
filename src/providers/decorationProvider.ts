import * as vscode from 'vscode';
import { SettingsHierarchyService } from '../services/settingsHierarchy';

export class OverrideDecorationProvider implements vscode.Disposable {
    private overriddenDecorationType: vscode.TextEditorDecorationType;
    private overridesDecorationType: vscode.TextEditorDecorationType;
    private effectiveDecorationType: vscode.TextEditorDecorationType;
    private disposables: vscode.Disposable[] = [];

    constructor(private settingsService: SettingsHierarchyService) {
        // Create decoration types
        this.overriddenDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editorWarning.background'),
            isWholeLine: false,
            overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'),
            overviewRulerLane: vscode.OverviewRulerLane.Right,
            after: {
                contentText: ' ⚠️',
                color: new vscode.ThemeColor('editorWarning.foreground'),
                margin: '0 0 0 1em'
            }
        });

        this.overridesDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editorInfo.background'),
            isWholeLine: false,
            overviewRulerColor: new vscode.ThemeColor('editorInfo.foreground'),
            overviewRulerLane: vscode.OverviewRulerLane.Right
        });

        this.effectiveDecorationType = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: ' ★',
                color: new vscode.ThemeColor('editorHint.foreground'),
                margin: '0 0 0 0.5em'
            }
        });

        // Listen for active editor changes
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor) {
                    this.updateDecorations(editor);
                }
            })
        );

        // Listen for document changes
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                const editor = vscode.window.activeTextEditor;
                if (editor && event.document === editor.document) {
                    this.updateDecorations(editor);
                }
            })
        );

        // Listen for settings changes
        this.disposables.push(
            settingsService.onDidChange(() => {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    this.updateDecorations(editor);
                }
            })
        );

        // Initial decoration
        if (vscode.window.activeTextEditor) {
            this.updateDecorations(vscode.window.activeTextEditor);
        }
    }

    public refresh(): void {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            this.updateDecorations(editor);
        }
    }

    private updateDecorations(editor: vscode.TextEditor): void {
        const config = vscode.workspace.getConfiguration('claudeSettings');
        if (!config.get<boolean>('showOverrideDecorations', true)) {
            editor.setDecorations(this.overriddenDecorationType, []);
            editor.setDecorations(this.overridesDecorationType, []);
            editor.setDecorations(this.effectiveDecorationType, []);
            return;
        }

        const document = editor.document;
        const currentLevel = this.settingsService.getLevelFromPath(document.uri.fsPath);

        if (!currentLevel) {
            editor.setDecorations(this.overriddenDecorationType, []);
            editor.setDecorations(this.overridesDecorationType, []);
            editor.setDecorations(this.effectiveDecorationType, []);
            return;
        }

        const overriddenRanges: vscode.DecorationOptions[] = [];
        const overridesRanges: vscode.DecorationOptions[] = [];
        const effectiveRanges: vscode.DecorationOptions[] = [];

        const text = document.getText();
        const keyRegex = /^\s*"([^"]+)"\s*:/gm;
        let match;

        while ((match = keyRegex.exec(text)) !== null) {
            const key = match[1];
            if (key === '$schema') continue;

            const pos = document.positionAt(match.index);
            const line = pos.line;
            const lineText = document.lineAt(line).text;
            const keyStart = lineText.indexOf(`"${key}"`);
            const keyEnd = keyStart + key.length + 2; // Include quotes

            const range = new vscode.Range(line, keyStart, line, keyEnd);

            const overrideInfo = this.settingsService.getOverrideInfo(key, currentLevel);
            if (!overrideInfo) continue;

            const allValues = this.settingsService.getAllLevelsForKey(key);
            if (allValues.length <= 1) continue;

            if (overrideInfo.overriddenBy && overrideInfo.overriddenBy.length > 0) {
                const higherLevel = this.settingsService.getLevelDisplayName(overrideInfo.overriddenBy[0].level);
                overriddenRanges.push({
                    range,
                    hoverMessage: new vscode.MarkdownString(`⚠️ Overridden by **${higherLevel}**`)
                });
            } else if (overrideInfo.overrides && overrideInfo.overrides.length > 0) {
                const lowerLevels = overrideInfo.overrides
                    .map(v => this.settingsService.getLevelDisplayName(v.level))
                    .join(', ');
                overridesRanges.push({
                    range,
                    hoverMessage: new vscode.MarkdownString(`✓ Overrides: **${lowerLevels}**`)
                });

                // This is also the effective value
                effectiveRanges.push({
                    range,
                    hoverMessage: new vscode.MarkdownString(`★ This is the effective value`)
                });
            }
        }

        editor.setDecorations(this.overriddenDecorationType, overriddenRanges);
        editor.setDecorations(this.overridesDecorationType, overridesRanges);
        editor.setDecorations(this.effectiveDecorationType, effectiveRanges);
    }

    public dispose(): void {
        this.overriddenDecorationType.dispose();
        this.overridesDecorationType.dispose();
        this.effectiveDecorationType.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
