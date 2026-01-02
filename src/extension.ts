import * as vscode from 'vscode';
import { SettingsHierarchyService } from './services/settingsHierarchy';
import { OverrideCodeLensProvider } from './providers/codeLensProvider';
import { OverrideHoverProvider } from './providers/hoverProvider';
import { OverrideDecorationProvider } from './providers/decorationProvider';
import { registerNavigationCommands } from './commands/navigation';

let settingsService: SettingsHierarchyService;

export function activate(context: vscode.ExtensionContext) {
    console.log('Claude Code Settings Helper is now active');

    // Initialize the settings hierarchy service
    settingsService = new SettingsHierarchyService();

    // Document selector for Claude Code settings files
    const documentSelector: vscode.DocumentSelector = [
        { language: 'json', pattern: '**/.claude/settings.json' },
        { language: 'json', pattern: '**/.claude/settings.local.json' },
        { language: 'jsonc', pattern: '**/.claude/settings.json' },
        { language: 'jsonc', pattern: '**/.claude/settings.local.json' }
    ];

    // Register CodeLens provider for override indicators
    const codeLensProvider = new OverrideCodeLensProvider(settingsService);
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(documentSelector, codeLensProvider)
    );

    // Register Hover provider for detailed override information
    const hoverProvider = new OverrideHoverProvider(settingsService);
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(documentSelector, hoverProvider)
    );

    // Register decoration provider for inline visual indicators
    const decorationProvider = new OverrideDecorationProvider(settingsService);
    context.subscriptions.push(decorationProvider);

    // Register navigation commands
    registerNavigationCommands(context, settingsService);

    // Refresh when settings files change
    const watcher = vscode.workspace.createFileSystemWatcher('**/.claude/settings*.json');
    context.subscriptions.push(
        watcher.onDidChange(() => {
            settingsService.refresh();
            codeLensProvider.refresh();
            decorationProvider.refresh();
        }),
        watcher.onDidCreate(() => {
            settingsService.refresh();
            codeLensProvider.refresh();
            decorationProvider.refresh();
        }),
        watcher.onDidDelete(() => {
            settingsService.refresh();
            codeLensProvider.refresh();
            decorationProvider.refresh();
        }),
        watcher
    );

    // Also watch user-level settings
    const userSettingsPath = settingsService.getUserSettingsPath();
    if (userSettingsPath) {
        const userWatcher = vscode.workspace.createFileSystemWatcher(userSettingsPath);
        context.subscriptions.push(
            userWatcher.onDidChange(() => {
                settingsService.refresh();
                codeLensProvider.refresh();
                decorationProvider.refresh();
            }),
            userWatcher
        );
    }

    // Initial refresh
    settingsService.refresh();
}

export function deactivate() {
    if (settingsService) {
        settingsService.dispose();
    }
}
