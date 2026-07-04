<p align="center">
  <img src="assets/icon.svg" alt="Metadata Visuals logo" width="96" height="96">
</p>

# Metadata Visuals

**Transform Obsidian metadata into powerful visual workflows.**

Metadata Visuals lets you use frontmatter metadata to automatically drive:

- 🎨 File Explorer colours
- 🏷️ File Explorer icons
- 📂 Smart folders
- ✨ Metadata highlighting
- 🔄 Bulk metadata updates
- 📋 Workflow visualisation
- 📑 Metadata value pickers

No emojis in filenames.
No manually colouring notes.
Just clean metadata driving beautiful visuals.

It is built for writing, research, and project vaults where metadata such as `Editing Status`, `Editing Stage`, or `Importance` should be visible at a glance without putting emoji or formatting directly into the stored metadata value.

```yaml
---
Editing Status: In Progress
Editing Stage: Published
Importance: Critical
---
```

Rules keep the metadata value clean. Icon shape, colour, filename colouring, folder inheritance, bulk metadata updates, and property colouring are display settings managed by the plugin.

## Screenshots

Screenshots will be added before the first public release.

- Official Metadata Visuals logo: `assets/icon.svg`
- Settings page with the compact Rules header and About / Support footer
- File Explorer labels
- Rule settings table
- Smart folder inheritance
- Coloured note Properties values
- Bulk metadata update context menu

## Features

- File Explorer icons driven by frontmatter field/value rules.
- Optional File Explorer note and folder name colouring.
- Note Properties panel value colouring using all matching rule groups.
- One selected rule group controls File Explorer visuals, preventing competing note/folder colours.
- Rule targets for notes, folders, or both.
- Compact grouped settings UI with collapsible rule groups.
- Drag-and-drop ordering inside each rule group.
- Read-only value rows generated from known metadata values.
- Automatic field-definition import when adding a rule group.
- Smart folder inheritance for enabled folders.
- Folder context-menu actions under `Metadata Visuals`.
- Bulk metadata updates for selected notes and folders.
- Optional one-time import of field definitions from known local sources.
- Standalone operation after import; no runtime dependency on Metadata Menu or any other plugin.
- Legacy value normalisation for emoji-prefixed values such as `🔴 To Do`.
- Official SVG logo and compact About / Support footer in settings.
- Classic `PluginSettingTab.display()` settings UI for Obsidian 1.12.7 compatibility.

## Installation

### Manual Installation

1. Download the release files:
   - `manifest.json`
   - `main.js`
   - `styles.css`
2. Create this folder in your vault:

```text
<vault>/.obsidian/plugins/metadata-visuals
```

3. Put `manifest.json`, `main.js`, and `styles.css` into that folder.
4. In Obsidian, open Settings -> Community plugins.
5. Reload plugins if needed.
6. Enable `Metadata Visuals`.

The About logo is bundled into `main.js`, so no extra image files are required at runtime.

### Manual Testing From Source

```bash
npm install
npm run build
```

The build writes `main.js` into the plugin directory. Enable the plugin from Obsidian after building.

## Usage

For a complete walkthrough, see [USER_GUIDE.md](USER_GUIDE.md).

### Create A Rule Group

1. Open Settings -> Metadata Visuals.
2. In the Rules header, choose a metadata field from the `Select` field.
3. Click `Add rule`.
4. Metadata Visuals automatically imports known field definitions if available, merges those values with values already used in notes, and creates one row for every known value for that field.

Known values come from two places:

- values imported into Metadata Visuals' own data file;
- values already found in note frontmatter.

If no external definitions are found, Metadata Visuals silently falls back to values found in notes. The field selector starts on `Select`, and `Add rule` stays disabled until a real field is chosen.

### Configure Rule Rows

Each row maps one raw metadata value to one visual rule.

Columns:

- `Drag`: reorder rows inside the field group.
- `Value`: read-only metadata value.
- `Shape`: Obsidian icon name.
- `Colour`: icon and optional text colour.
- `Icon`: whether to show the File Explorer icon.
- `Name`: whether to colour the note/folder name.
- `Target`: notes, folders, or both.
- `Preview`: live preview of the visual effect.
- `Del`: delete that value row.

Rows are generated from the field's available values. Values are read-only in the table so the stored frontmatter vocabulary remains deliberate. To change available values, update the source metadata definitions or add values to notes, then create or recreate the rule group.

### Choose The File Explorer Rule Group

Only one metadata field group can control File Explorer note and folder visuals at a time.

Turn on `Use for File Explorer` for the group that should drive icons and name colours. Enabling it for one group automatically makes that group the active File Explorer source. If no group has been selected in existing settings, Metadata Visuals migrates safely by using the first available saved rule group.

Metadata/property colouring still uses all matching rule groups.

### Colour Note Properties

The global `Colour note metadata` toggle controls colouring inside Obsidian's visible note Properties panel.

When enabled, matching property values use the same rule colour:

- `Editing Status: To Do` can be red.
- `Editing Stage: Published` can use the configured Editing Stage colour.
- `Importance: Critical` can use the configured Importance colour.

Only matching field/value pairs are coloured. Unrelated property values are left alone.

### Smart Folder Rules

Smart folders let a folder inherit a visual status from descendant notes.

1. Right-click a folder in the File Explorer.
2. Choose `Metadata Visuals > Enable smart folder rule`.
3. In settings, enable `Apply to enabled folders` for the active File Explorer rule group.

For Editing Status-style workflows, folder aggregation is:

- no counted child statuses -> no folder rule;
- any child is `In Progress` -> folder is `In Progress`;
- at least one child is `Done` and at least one is `To Do` -> folder is `In Progress`;
- one or more children are `Done` and none are `To Do` -> folder is `Done`;
- one or more children are `To Do` and none are `Done` -> folder is `To Do`.

Folder-note/dashboard files that directly represent the folder are ignored so a folder status reflects descendant manuscript/project notes rather than the folder's own summary page.

Smart folders update when note metadata changes, files are created, deleted, or renamed, and when the File Explorer is refreshed. Folder paths enabled from the context menu are stored internally; the settings page stays compact and only shows the per-field `Apply to enabled folders` toggle.

### Bulk Metadata Updates

Metadata Visuals adds bulk update actions to File Explorer context menus:

```text
Metadata Visuals >
  Apply Editing Status >
    To Do
    In Progress
    Done
```

Bulk updates support:

- selected markdown notes;
- selected folders;
- mixed note and folder selections;
- overlapping folder selections without updating the same note twice.

Selected folders update every descendant markdown note. Existing frontmatter is preserved as YAML data, and missing frontmatter is created.

The menu values come from the current rule rows, so `Apply Editing Status > Done` writes `Editing Status: Done`, not an icon, emoji, or preview label.

## Field Definition Import

Metadata Visuals can import configured field values from known local definition files, currently including Metadata Menu's `data.json` when present.

The import is optional and one-time:

- imported values are copied into Metadata Visuals' own `data.json`;
- Metadata Visuals continues to work if the source plugin is disabled or removed;
- no runtime dependency is created.

The import helps with values that are configured but not yet used in any note. It runs automatically in the background when the settings page opens and again before a new rule group is created.

## Settings Footer

The bottom of the settings page includes the official Metadata Visuals logo, the installed plugin version, author credit, and compact support links:

- Report a bug: https://wolf359.app/metadata-visuals/report-bug/
- Feature request: https://wolf359.app/metadata-visuals/request-feature/
- Website: https://wolf359.app/
- Wolf 359 Press: https://wolf359.press/
- Buy me a coffee: https://buymeacoffee.com/wolf359pressab

## Compatibility

Metadata Visuals is maintained for Obsidian 1.12.7 compatibility.

Important compatibility choices:

- `manifest.json` keeps `minAppVersion` at `1.0.0`.
- The settings tab uses classic `PluginSettingTab.display()`.
- The plugin does not use `getSettingDefinitions()`.
- Frontmatter writes use `Vault.read` and `Vault.modify` instead of newer frontmatter helper APIs.

ESLint may warn that `display()` is deprecated for newer Obsidian versions. That warning is expected for this compatibility target.

## Development

Install dependencies:

```bash
npm install
```

Start a development build:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

Run ESLint:

```bash
npm run lint
```

The production build runs TypeScript first:

```bash
tsc -noEmit -skipLibCheck
```

and then bundles the plugin with esbuild.

## Release Checklist

Before publishing a GitHub release:

1. Run `npm run build`.
2. Run `npm run lint`.
3. Upload `manifest.json`, `main.js`, and `styles.css` as release assets.
4. Confirm `manifest.json`, `versions.json`, and `package.json` versions match.
5. Add screenshots to this README.

## Roadmap

- Icon picker instead of a text/dropdown-only icon chooser.
- More field-definition import adapters.
- Optional colour presets for common writing workflows.
- Better mobile settings layout.
- Automated tests for frontmatter mutation and smart folder aggregation.

## Support And Bug Reports

Report bugs and feature requests here:

- Report a bug: https://wolf359.app/metadata-visuals/report-bug/
- Feature request: https://wolf359.app/metadata-visuals/request-feature/
- Documentation: https://wolf359.app/metadata-visuals/

The settings page includes the same links in the About / Support footer.

## License

Metadata Visuals is released under the 0BSD license. See [LICENSE](LICENSE).

---

<p align="center">
  <a href="https://wolf359.app/metadata-visuals/report-bug/">🐞 Report a bug</a> |
  <a href="https://wolf359.app/metadata-visuals/request-feature/">💡 Feature request</a> |
  <a href="https://wolf359.app/">🌐 wolf359.app</a> |
  <a href="https://wolf359.press/">📚 Wolf 359 Press</a> |
  <a href="https://buymeacoffee.com/wolf359pressab"><img src="assets/buy-me-a-coffee.jpeg" alt="" width="16" height="16" style="vertical-align: text-bottom;"> Buy me a coffee</a>
</p>
