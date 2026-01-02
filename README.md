# Claude Code Settings Helper

VS Code extension providing IntelliSense, JSON schema validation, and settings override visualization for Claude Code configuration files.

## Features

### IntelliSense & Autocomplete

Get intelligent suggestions for all Claude Code settings as you type, including:

- Model configuration
- Permission rules (`allow`, `deny`, `ask`)
- Sandbox settings
- Hooks configuration
- MCP server settings
- Environment variables
- And more

### JSON Schema Validation

Instant validation against the Claude Code settings schema with helpful error messages for:

- Invalid property names
- Incorrect value types
- Missing required fields
- Deprecated settings

### Override Visualization

Claude Code settings follow a precedence hierarchy. This extension shows you:

- Which settings are being overridden by higher-precedence files
- Which settings are overriding lower-precedence files
- The effective value that Claude Code will actually use

### CodeLens Indicators

Inline indicators appear above settings to show:

- `Overrides: User` - This setting overrides a value from your user settings
- `Overridden by: Local` - This setting is overridden by a local settings file

### Quick Navigation

Jump between settings files at different levels:

- Open user settings (`~/.claude/settings.json`)
- Open project settings (`.claude/settings.json`)
- Open local settings (`.claude/settings.local.json`)
- Navigate directly to where a setting is defined at another level

### Hover Information

Hover over any setting to see:

- Current value and level
- Effective value (what Claude Code will use)
- All levels where this setting is defined
- Override chain visualization

## Settings Hierarchy

Claude Code settings are loaded from multiple locations with the following precedence (highest to lowest):

| Level | Location | Description |
|-------|----------|-------------|
| Enterprise | System-wide managed settings | IT-managed configuration (read-only) |
| Local | `.claude/settings.local.json` | Machine-specific project settings (gitignored) |
| Project | `.claude/settings.json` | Shared project settings (committed to repo) |
| User | `~/.claude/settings.json` | Personal user defaults |
| Legacy | `~/.claude.json` | Legacy user settings format |

Higher-precedence settings override lower-precedence ones. For example, a setting in `settings.local.json` will override the same setting in `settings.json`.

## Installation

### From VSIX

1. Download the `.vsix` file from releases
2. In VS Code, open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Run `Extensions: Install from VSIX...`
4. Select the downloaded file

### From Source

```bash
git clone https://github.com/your-username/vscode-claude-settings-schema-helper.git
cd vscode-claude-settings-schema-helper
npm install
npm run compile
```

Then press `F5` to launch the Extension Development Host.

## Usage

The extension activates automatically when you open any Claude Code settings file:

- `.claude/settings.json`
- `.claude/settings.local.json`
- `~/.claude/settings.json`
- `~/.claude.json`

### Commands

Access these commands via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| `Claude Settings: Open User Settings` | Open `~/.claude/settings.json` |
| `Claude Settings: Open Project Settings` | Open `.claude/settings.json` in workspace |
| `Claude Settings: Open Local Settings` | Open `.claude/settings.local.json` in workspace |
| `Claude Settings: Open Legacy User Settings` | Open `~/.claude.json` |
| `Claude Settings: Go to User Setting` | Navigate to setting definition in user file |
| `Claude Settings: Go to Project Setting` | Navigate to setting definition in project file |
| `Claude Settings: Go to Local Setting` | Navigate to setting definition in local file |
| `Claude Settings: Show Setting at All Levels` | Show where a setting is defined across all levels |

## Extension Settings

Configure the extension behavior in VS Code settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `claudeSettings.showOverrideCodeLens` | `true` | Show CodeLens indicators for settings that override or are overridden |
| `claudeSettings.showOverrideDecorations` | `true` | Show inline decorations for override status |

## Supported Settings

The extension provides IntelliSense for all Claude Code settings including:

- `model` - Override the default Claude model
- `permissions` - Configure tool permissions (`allow`, `deny`, `ask`, `defaultMode`)
- `sandbox` - Bash command sandboxing configuration
- `hooks` - Pre/post tool execution hooks
- `env` - Environment variables
- `attribution` - Commit and PR attribution settings
- `mcpServers` - MCP server configuration
- `enabledPlugins` - Plugin management
- And many more...

See the [Claude Code documentation](https://docs.anthropic.com/en/docs/claude-code) for complete settings reference.

## Requirements

- VS Code 1.85.0 or higher
- Claude Code CLI (for the settings to have effect)

## Development

### Building

```bash
npm install
npm run compile
```

### Watching for Changes

```bash
npm run watch
```

### Linting

```bash
npm run lint
```

### Testing

```bash
npm test
```

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT

## Related

- [Claude Code](https://claude.ai/claude-code) - The AI coding assistant these settings configure
- [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code) - Official documentation