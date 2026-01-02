import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SettingsHierarchyService, SettingsLevel } from '../services/settingsHierarchy';

export function registerNavigationCommands(
    context: vscode.ExtensionContext,
    settingsService: SettingsHierarchyService
): void {
    // Command to go to a specific setting at a specific level
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'claudeSettings.goToSetting',
            async (key: string, level: SettingsLevel) => {
                const filePath = settingsService.getSettingsPath(level);
                if (!filePath) {
                    vscode.window.showWarningMessage(`Cannot find ${level} settings file`);
                    return;
                }

                if (!fs.existsSync(filePath)) {
                    const create = await vscode.window.showWarningMessage(
                        `${settingsService.getLevelDisplayName(level)} settings file does not exist. Create it?`,
                        'Create',
                        'Cancel'
                    );
                    if (create === 'Create') {
                        await createSettingsFile(filePath);
                    } else {
                        return;
                    }
                }

                const document = await vscode.workspace.openTextDocument(filePath);
                const editor = await vscode.window.showTextDocument(document);

                // Find the key in the document
                const parsed = settingsService.getSettings(level);
                if (parsed && parsed.keyLines.has(key)) {
                    const line = parsed.keyLines.get(key)!;
                    const position = new vscode.Position(line, 0);
                    editor.selection = new vscode.Selection(position, position);
                    editor.revealRange(
                        new vscode.Range(position, position),
                        vscode.TextEditorRevealType.InCenter
                    );
                }
            }
        )
    );

    // Command to go to user settings
    context.subscriptions.push(
        vscode.commands.registerCommand('claudeSettings.goToUserSetting', async () => {
            const key = await getKeyFromCurrentPosition(settingsService);
            if (key) {
                vscode.commands.executeCommand('claudeSettings.goToSetting', key, SettingsLevel.User);
            } else {
                openSettingsFile(settingsService, SettingsLevel.User);
            }
        })
    );

    // Command to go to project settings
    context.subscriptions.push(
        vscode.commands.registerCommand('claudeSettings.goToProjectSetting', async () => {
            const key = await getKeyFromCurrentPosition(settingsService);
            if (key) {
                vscode.commands.executeCommand('claudeSettings.goToSetting', key, SettingsLevel.Project);
            } else {
                openSettingsFile(settingsService, SettingsLevel.Project);
            }
        })
    );

    // Command to go to local settings
    context.subscriptions.push(
        vscode.commands.registerCommand('claudeSettings.goToLocalSetting', async () => {
            const key = await getKeyFromCurrentPosition(settingsService);
            if (key) {
                vscode.commands.executeCommand('claudeSettings.goToSetting', key, SettingsLevel.Local);
            } else {
                openSettingsFile(settingsService, SettingsLevel.Local);
            }
        })
    );

    // Command to open user settings file
    context.subscriptions.push(
        vscode.commands.registerCommand('claudeSettings.openUserSettings', () => {
            openSettingsFile(settingsService, SettingsLevel.User);
        })
    );

    // Command to open project settings file
    context.subscriptions.push(
        vscode.commands.registerCommand('claudeSettings.openProjectSettings', () => {
            openSettingsFile(settingsService, SettingsLevel.Project);
        })
    );

    // Command to open local settings file
    context.subscriptions.push(
        vscode.commands.registerCommand('claudeSettings.openLocalSettings', () => {
            openSettingsFile(settingsService, SettingsLevel.Local);
        })
    );

    // Command to open legacy user settings file (~/.claude.json)
    context.subscriptions.push(
        vscode.commands.registerCommand('claudeSettings.openLegacyUserSettings', () => {
            openSettingsFile(settingsService, SettingsLevel.UserLegacy);
        })
    );

    // Command to show all levels for a setting
    context.subscriptions.push(
        vscode.commands.registerCommand('claudeSettings.showAllLevels', async (key?: string) => {
            if (!key) {
                key = await getKeyFromCurrentPosition(settingsService);
            }

            if (!key) {
                vscode.window.showWarningMessage('No setting selected');
                return;
            }

            const allValues = settingsService.getAllLevelsForKey(key);
            if (allValues.length === 0) {
                vscode.window.showInformationMessage(`Setting "${key}" is not defined at any level`);
                return;
            }

            // Show quick pick with all levels
            const items = allValues.map(v => ({
                label: `${v.level === allValues[0].level ? '★ ' : ''}${settingsService.getLevelDisplayName(v.level)}`,
                description: formatValue(v.value),
                detail: v.filePath,
                level: v.level,
                line: v.line
            }));

            const selected = await vscode.window.showQuickPick(items, {
                title: `Setting: ${key}`,
                placeHolder: 'Select a level to open'
            });

            if (selected) {
                const document = await vscode.workspace.openTextDocument(selected.detail);
                const editor = await vscode.window.showTextDocument(document);

                if (selected.line !== undefined) {
                    const position = new vscode.Position(selected.line, 0);
                    editor.selection = new vscode.Selection(position, position);
                    editor.revealRange(
                        new vscode.Range(position, position),
                        vscode.TextEditorRevealType.InCenter
                    );
                }
            }
        })
    );
}

async function getKeyFromCurrentPosition(settingsService: SettingsHierarchyService): Promise<string | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return undefined;

    const document = editor.document;
    const level = settingsService.getLevelFromPath(document.uri.fsPath);
    if (!level) return undefined;

    const position = editor.selection.active;
    return settingsService.getKeyAtLine(document, position.line) ?? undefined;
}

async function openSettingsFile(
    settingsService: SettingsHierarchyService,
    level: SettingsLevel
): Promise<void> {
    const filePath = settingsService.getSettingsPath(level);
    if (!filePath) {
        vscode.window.showWarningMessage(`Cannot determine ${level} settings path`);
        return;
    }

    if (!fs.existsSync(filePath)) {
        const create = await vscode.window.showWarningMessage(
            `${settingsService.getLevelDisplayName(level)} settings file does not exist. Create it?`,
            'Create',
            'Cancel'
        );
        if (create === 'Create') {
            await createSettingsFile(filePath);
        } else {
            return;
        }
    }

    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document);
}

async function createSettingsFile(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const initialContent = '{\n  \n}\n';
    fs.writeFileSync(filePath, initialContent, 'utf-8');
}

function formatValue(value: unknown): string {
    if (typeof value === 'string') {
        if (value.length > 40) {
            return `"${value.substring(0, 37)}..."`;
        }
        return `"${value}"`;
    }
    if (typeof value === 'object') {
        const str = JSON.stringify(value);
        if (str.length > 40) {
            return str.substring(0, 37) + '...';
        }
        return str;
    }
    return String(value);
}
