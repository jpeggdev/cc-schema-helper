import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export enum SettingsLevel {
    Enterprise = 'enterprise',
    Local = 'local',        // .claude/settings.local.json (highest user-editable precedence)
    Project = 'project',    // .claude/settings.json
    User = 'user',          // ~/.claude/settings.json
    UserLegacy = 'userLegacy' // ~/.claude.json (lowest precedence, legacy format)
}

export interface SettingValue {
    value: unknown;
    level: SettingsLevel;
    filePath: string;
    line?: number;
}

export interface SettingOverrideInfo {
    key: string;
    currentLevel: SettingsLevel;
    currentValue: unknown;
    overrides?: SettingValue[];      // Settings this one overrides (lower precedence)
    overriddenBy?: SettingValue[];   // Settings that override this one (higher precedence)
    effectiveValue: unknown;
    effectiveLevel: SettingsLevel;
}

interface ParsedSettings {
    level: SettingsLevel;
    filePath: string;
    settings: Record<string, unknown>;
    keyLines: Map<string, number>;   // Maps setting keys to line numbers
}

export class SettingsHierarchyService implements vscode.Disposable {
    private cache: Map<SettingsLevel, ParsedSettings | null> = new Map();
    private projectRoot: string | null = null;
    private _onDidChange = new vscode.EventEmitter<void>();
    public readonly onDidChange = this._onDidChange.event;

    constructor() {
        this.detectProjectRoot();
    }

    private detectProjectRoot(): void {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            this.projectRoot = workspaceFolders[0].uri.fsPath;
        }
    }

    public getUserSettingsPath(): string {
        const homeDir = os.homedir();
        return path.join(homeDir, '.claude', 'settings.json');
    }

    public getUserLegacySettingsPath(): string {
        const homeDir = os.homedir();
        return path.join(homeDir, '.claude.json');
    }

    public getProjectSettingsPath(): string | null {
        if (!this.projectRoot) return null;
        return path.join(this.projectRoot, '.claude', 'settings.json');
    }

    public getLocalSettingsPath(): string | null {
        if (!this.projectRoot) return null;
        return path.join(this.projectRoot, '.claude', 'settings.local.json');
    }

    public getEnterpriseSettingsPath(): string {
        if (process.platform === 'win32') {
            return 'C:\\Program Files\\ClaudeCode\\managed-settings.json';
        } else if (process.platform === 'darwin') {
            return '/Library/Application Support/ClaudeCode/managed-settings.json';
        } else {
            return '/etc/claude-code/managed-settings.json';
        }
    }

    public getSettingsPath(level: SettingsLevel): string | null {
        switch (level) {
            case SettingsLevel.Enterprise:
                return this.getEnterpriseSettingsPath();
            case SettingsLevel.User:
                return this.getUserSettingsPath();
            case SettingsLevel.UserLegacy:
                return this.getUserLegacySettingsPath();
            case SettingsLevel.Project:
                return this.getProjectSettingsPath();
            case SettingsLevel.Local:
                return this.getLocalSettingsPath();
        }
    }

    public refresh(): void {
        this.detectProjectRoot();
        this.cache.clear();
        this.loadAllSettings();
        this._onDidChange.fire();
    }

    private loadAllSettings(): void {
        // Load settings at each level
        const levels = [
            SettingsLevel.Enterprise,
            SettingsLevel.Local,
            SettingsLevel.Project,
            SettingsLevel.User,
            SettingsLevel.UserLegacy
        ];

        const loadedPaths = new Set<string>();
        const userPath = path.normalize(this.getUserSettingsPath()).toLowerCase();

        for (const level of levels) {
            const filePath = this.getSettingsPath(level);
            if (filePath) {
                const normalizedPath = path.normalize(filePath).toLowerCase();

                // Special case: if Project path equals User path, skip Project
                // The file will be treated as User level only
                if (level === SettingsLevel.Project && normalizedPath === userPath) {
                    this.cache.set(level, null);
                    continue;
                }

                // Skip if this file was already loaded at a higher-precedence level
                if (loadedPaths.has(normalizedPath)) {
                    this.cache.set(level, null);
                    continue;
                }

                loadedPaths.add(normalizedPath);
                this.cache.set(level, this.loadSettingsFile(filePath, level));
            }
        }
    }

    private loadSettingsFile(filePath: string, level: SettingsLevel): ParsedSettings | null {
        try {
            if (!fs.existsSync(filePath)) {
                return null;
            }

            const content = fs.readFileSync(filePath, 'utf-8');
            const settings = JSON.parse(content) as Record<string, unknown>;
            const keyLines = this.parseKeyLines(content);

            return {
                level,
                filePath,
                settings,
                keyLines
            };
        } catch {
            return null;
        }
    }

    private parseKeyLines(content: string): Map<string, number> {
        const keyLines = new Map<string, number>();
        const lines = content.split('\n');

        // Simple regex to match top-level keys in JSON
        const keyRegex = /^\s*"([^"]+)"\s*:/;

        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(keyRegex);
            if (match) {
                keyLines.set(match[1], i);
            }
        }

        return keyLines;
    }

    public getSettings(level: SettingsLevel): ParsedSettings | null {
        if (!this.cache.has(level)) {
            this.loadAllSettings();
        }
        return this.cache.get(level) ?? null;
    }

    public getAllLevelsForKey(key: string): SettingValue[] {
        const values: SettingValue[] = [];

        // Order from highest to lowest precedence
        const levels = [
            SettingsLevel.Enterprise,
            SettingsLevel.Local,
            SettingsLevel.Project,
            SettingsLevel.User,
            SettingsLevel.UserLegacy
        ];

        for (const level of levels) {
            const parsed = this.getSettings(level);
            if (parsed && key in parsed.settings) {
                values.push({
                    value: parsed.settings[key],
                    level,
                    filePath: parsed.filePath,
                    line: parsed.keyLines.get(key)
                });
            }
        }

        return values;
    }

    public getOverrideInfo(key: string, currentLevel: SettingsLevel): SettingOverrideInfo | null {
        const allValues = this.getAllLevelsForKey(key);
        if (allValues.length === 0) return null;

        const currentSettings = this.getSettings(currentLevel);
        if (!currentSettings || !(key in currentSettings.settings)) {
            return null;
        }

        const currentValue = currentSettings.settings[key];

        // Get the precedence order (lower index = higher precedence)
        const precedenceOrder = [
            SettingsLevel.Enterprise,
            SettingsLevel.Local,
            SettingsLevel.Project,
            SettingsLevel.User,
            SettingsLevel.UserLegacy
        ];
        const currentPrecedence = precedenceOrder.indexOf(currentLevel);

        // Find values that this setting overrides (lower precedence)
        const overrides = allValues.filter(v => {
            const vPrecedence = precedenceOrder.indexOf(v.level);
            return vPrecedence > currentPrecedence;
        });

        // Find values that override this setting (higher precedence)
        const overriddenBy = allValues.filter(v => {
            const vPrecedence = precedenceOrder.indexOf(v.level);
            return vPrecedence < currentPrecedence;
        });

        // The effective value is from the highest precedence level
        const effectiveValue = allValues[0].value;
        const effectiveLevel = allValues[0].level;

        return {
            key,
            currentLevel,
            currentValue,
            overrides: overrides.length > 0 ? overrides : undefined,
            overriddenBy: overriddenBy.length > 0 ? overriddenBy : undefined,
            effectiveValue,
            effectiveLevel
        };
    }

    public getLevelFromPath(filePath: string): SettingsLevel | null {
        const normalizedPath = path.normalize(filePath).toLowerCase();

        // Check if it's an enterprise settings file
        const enterprisePath = this.getEnterpriseSettingsPath().toLowerCase();
        if (normalizedPath === enterprisePath) {
            return SettingsLevel.Enterprise;
        }

        // Check local settings first (highest user-editable precedence)
        const localPath = this.getLocalSettingsPath();
        if (localPath && normalizedPath === path.normalize(localPath).toLowerCase()) {
            return SettingsLevel.Local;
        }

        // Check project settings (check BEFORE user to handle case where workspace = home dir)
        const projectPath = this.getProjectSettingsPath();
        if (projectPath && normalizedPath === path.normalize(projectPath).toLowerCase()) {
            // But if project path equals user path, treat as User level only
            const userPath = this.getUserSettingsPath();
            if (path.normalize(projectPath).toLowerCase() === path.normalize(userPath).toLowerCase()) {
                return SettingsLevel.User;
            }
            return SettingsLevel.Project;
        }

        // Check if it's a user settings file
        const userPath = this.getUserSettingsPath().toLowerCase();
        if (normalizedPath === userPath) {
            return SettingsLevel.User;
        }

        // Check if it's a legacy user settings file (~/.claude.json)
        const userLegacyPath = this.getUserLegacySettingsPath().toLowerCase();
        if (normalizedPath === userLegacyPath) {
            return SettingsLevel.UserLegacy;
        }

        // Fallback: check patterns for files in other locations
        if (normalizedPath.endsWith('settings.local.json') && normalizedPath.includes('.claude')) {
            return SettingsLevel.Local;
        }

        if (normalizedPath.endsWith('settings.json') && normalizedPath.includes('.claude')) {
            return SettingsLevel.Project;
        }

        // Check for .claude.json anywhere (could be in a different location)
        if (normalizedPath.endsWith('.claude.json')) {
            return SettingsLevel.UserLegacy;
        }

        return null;
    }

    public getKeyAtLine(document: vscode.TextDocument, line: number): string | null {
        const lineText = document.lineAt(line).text;
        const keyRegex = /^\s*"([^"]+)"\s*:/;
        const match = lineText.match(keyRegex);
        return match ? match[1] : null;
    }

    public getLevelDisplayName(level: SettingsLevel): string {
        switch (level) {
            case SettingsLevel.Enterprise:
                return 'Enterprise (Managed)';
            case SettingsLevel.Local:
                return 'Local Project';
            case SettingsLevel.Project:
                return 'Project';
            case SettingsLevel.User:
                return 'User';
            case SettingsLevel.UserLegacy:
                return 'User (Legacy ~/.claude.json)';
        }
    }

    public dispose(): void {
        this._onDidChange.dispose();
        this.cache.clear();
    }
}
