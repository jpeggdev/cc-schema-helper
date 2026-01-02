import * as vscode from 'vscode';
import { SettingsHierarchyService, SettingsLevel, SettingValue } from '../services/settingsHierarchy';

export class OverrideHoverProvider implements vscode.HoverProvider {
    constructor(private settingsService: SettingsHierarchyService) {}

    public provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.Hover | null {
        const currentLevel = this.settingsService.getLevelFromPath(document.uri.fsPath);
        if (!currentLevel) {
            return null;
        }

        // Check if we're on a key line
        const key = this.settingsService.getKeyAtLine(document, position.line);
        if (!key || key === '$schema') {
            return null;
        }

        const allValues = this.settingsService.getAllLevelsForKey(key);
        if (allValues.length <= 1) {
            // No override info to show if only defined at one level
            return null;
        }

        const overrideInfo = this.settingsService.getOverrideInfo(key, currentLevel);
        if (!overrideInfo) {
            return null;
        }

        const markdown = this.buildHoverMarkdown(key, overrideInfo, allValues, currentLevel);
        return new vscode.Hover(markdown);
    }

    private buildHoverMarkdown(
        key: string,
        overrideInfo: ReturnType<SettingsHierarchyService['getOverrideInfo']>,
        allValues: SettingValue[],
        currentLevel: SettingsLevel
    ): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportHtml = true;

        md.appendMarkdown(`### Claude Code Setting: \`${key}\`\n\n`);

        // Show override status
        if (overrideInfo?.overriddenBy && overrideInfo.overriddenBy.length > 0) {
            md.appendMarkdown('⚠️ **This setting is overridden**\n\n');
            md.appendMarkdown(`The effective value comes from **${this.settingsService.getLevelDisplayName(overrideInfo.effectiveLevel)}**\n\n`);
        } else if (overrideInfo?.overrides && overrideInfo.overrides.length > 0) {
            md.appendMarkdown('✓ **This setting is active** (overrides lower levels)\n\n');
        }

        // Show all values at each level
        md.appendMarkdown('---\n\n');
        md.appendMarkdown('#### Values at each level:\n\n');

        // Order from highest to lowest precedence
        const precedenceOrder: SettingsLevel[] = [
            SettingsLevel.Enterprise,
            SettingsLevel.Local,
            SettingsLevel.Project,
            SettingsLevel.User,
            SettingsLevel.UserLegacy
        ];

        for (const level of precedenceOrder) {
            const value = allValues.find(v => v.level === level);
            const levelName = this.settingsService.getLevelDisplayName(level);
            const isCurrentLevel = level === currentLevel;
            const isEffective = level === overrideInfo?.effectiveLevel;

            if (value) {
                let prefix = '';
                if (isEffective) prefix = '★ ';
                if (isCurrentLevel) prefix += '→ ';

                const valueStr = this.formatValue(value.value);
                md.appendMarkdown(`${prefix}**${levelName}**: \`${valueStr}\``);

                if (isEffective) {
                    md.appendMarkdown(' *(effective)*');
                }
                if (isCurrentLevel && !isEffective) {
                    md.appendMarkdown(' *(this file)*');
                }

                // Add link to open the file
                const filePath = value.filePath.replace(/\\/g, '/');
                const line = value.line ?? 0;
                md.appendMarkdown(` — [Open](command:vscode.open?${encodeURIComponent(JSON.stringify([vscode.Uri.file(value.filePath), { selection: new vscode.Range(line, 0, line, 0) }]))})`);

                md.appendMarkdown('\n\n');
            } else {
                md.appendMarkdown(`- **${levelName}**: *not set*\n\n`);
            }
        }

        // Add navigation commands
        md.appendMarkdown('---\n\n');
        md.appendMarkdown(`[Show all levels](command:claudeSettings.showAllLevels?${encodeURIComponent(JSON.stringify([key]))})`);

        return md;
    }

    private formatValue(value: unknown): string {
        if (typeof value === 'string') {
            return `"${value}"`;
        }
        if (typeof value === 'object') {
            const str = JSON.stringify(value);
            if (str.length > 50) {
                return str.substring(0, 47) + '...';
            }
            return str;
        }
        return String(value);
    }
}
