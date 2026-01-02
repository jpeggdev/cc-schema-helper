import * as vscode from 'vscode';
import { SettingsHierarchyService, SettingsLevel } from '../services/settingsHierarchy';

export class OverrideCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

    constructor(private settingsService: SettingsHierarchyService) {
        settingsService.onDidChange(() => this._onDidChangeCodeLenses.fire());
    }

    public refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }

    public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const config = vscode.workspace.getConfiguration('claudeSettings');
        if (!config.get<boolean>('showOverrideCodeLens', true)) {
            return [];
        }

        const currentLevel = this.settingsService.getLevelFromPath(document.uri.fsPath);
        if (!currentLevel) {
            return [];
        }

        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();

        // Parse the JSON to find all top-level keys
        const keyRegex = /^\s*"([^"]+)"\s*:/gm;
        let match;

        while ((match = keyRegex.exec(text)) !== null) {
            const key = match[1];
            if (key === '$schema') continue;

            const pos = document.positionAt(match.index);
            const line = pos.line;
            const range = new vscode.Range(line, 0, line, 0);

            const overrideInfo = this.settingsService.getOverrideInfo(key, currentLevel);
            if (!overrideInfo) continue;

            // Create CodeLens for override status
            if (overrideInfo.overriddenBy && overrideInfo.overriddenBy.length > 0) {
                // This setting is overridden by a higher-precedence level
                const higherLevel = overrideInfo.overriddenBy[0].level;
                const levelName = this.settingsService.getLevelDisplayName(higherLevel);

                codeLenses.push(new vscode.CodeLens(range, {
                    title: `⚠️ Overridden by: ${levelName}`,
                    command: 'claudeSettings.goToSetting',
                    arguments: [key, higherLevel],
                    tooltip: `This setting is overridden by the ${levelName} settings`
                }));
            }

            if (overrideInfo.overrides && overrideInfo.overrides.length > 0) {
                // This setting overrides lower-precedence levels
                const lowerLevels = overrideInfo.overrides
                    .map(v => this.settingsService.getLevelDisplayName(v.level))
                    .join(', ');

                codeLenses.push(new vscode.CodeLens(range, {
                    title: `✓ Overrides: ${lowerLevels}`,
                    command: 'claudeSettings.showAllLevels',
                    arguments: [key],
                    tooltip: `This setting overrides the same setting in: ${lowerLevels}`
                }));
            }

            // Show if this is the effective value
            if (overrideInfo.effectiveLevel === currentLevel &&
                !overrideInfo.overriddenBy?.length) {
                const allValues = this.settingsService.getAllLevelsForKey(key);
                if (allValues.length > 1) {
                    codeLenses.push(new vscode.CodeLens(range, {
                        title: '★ Effective Value',
                        command: 'claudeSettings.showAllLevels',
                        arguments: [key],
                        tooltip: 'This is the value that will be used (highest precedence)'
                    }));
                }
            }
        }

        return codeLenses;
    }
}
