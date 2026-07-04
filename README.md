# Metadata Labels

Metadata Labels is an Obsidian plugin that turns frontmatter metadata into visual labels in the File Explorer. It is designed for writing projects where notes need Scrivener-style status markers such as `To Do`, `In Progress`, and `Done`.

The plugin keeps the actual metadata value clean. A note can store:

```yaml
---
Editing Status: In Progress
---
```

The icon shape, icon colour, filename colour, and note/folder target behaviour are controlled by plugin rules rather than being embedded in the metadata value.

## Features

- Adds configurable File Explorer icons based on frontmatter field/value rules.
- Optionally colours note names with the same rule colour.
- Supports note-only, folder-only, or note-and-folder rule targets.
- Provides default Editing Status rules for `To Do`, `In Progress`, and `Done`.
- Groups settings by metadata field in a compact table UI.
- Uses a field selector based on existing vault frontmatter fields.
- Supports smart folder inheritance for enabled folders.
- Adds context-menu actions for bulk metadata updates across selected notes and folders.
- Normalises legacy emoji-prefixed values such as `🔴 To Do`, `🟠 In Progress`, and `🟢 Done`.
- Uses the classic `PluginSettingTab.display()` API for Obsidian 1.12.7 compatibility.

## Installation For Manual Testing

1. Build the plugin:

```bash
npm install
npm run build
```

2. Copy or keep the plugin folder at:

```text
<vault>/.obsidian/plugins/obsidian-metadata-labels
```

3. Make sure the folder contains at least:

```text
manifest.json
main.js
styles.css
```

4. In Obsidian, open Settings -> Community plugins.
5. Turn off Restricted mode if needed.
6. Enable `Metadata Labels`.

During local development inside an Obsidian vault, running `npm run build` writes the compiled `main.js` directly into the plugin folder.

## How Rules Work

Rules map one frontmatter field/value pair to one visual effect.

Each rule stores:

- `field`: the frontmatter field to inspect, for example `Editing Status`.
- `value`: the raw metadata value, for example `Done`.
- `icon`: an Obsidian/Lucide icon name, for example `circle`.
- `color`: the colour used for the icon and optionally the filename.
- `showIcon`: whether the File Explorer row should show the icon.
- `colourFilename`: whether the note or folder name should be coloured.
- `target`: whether the rule applies to notes, folders, or both.

The first matching note rule is applied to a note. Rules targeted only at folders are skipped for note matching.

Values are compared after normalisation. This preserves compatibility with older notes that may have stored status emoji in the metadata value. For example, all of these can match a rule value of `To Do`:

```yaml
Editing Status: To Do
Editing Status: 🔴 To Do
```

## Default Editing Status Rules

If there are no useful rules, the settings tab seeds three default rules:

- `Editing Status = To Do`, icon `circle`, colour `#e03131`
- `Editing Status = In Progress`, icon `circle`, colour `#f08c00`
- `Editing Status = Done`, icon `circle`, colour `#2f9e44`

These defaults store clean raw values. The colour and icon are display settings, not part of the metadata value.

## Smart Folder Rules

Smart folders let a folder inherit a visual status from the notes inside it.

There are two controls:

- Right-click a folder in the File Explorer and choose `Metadata Labels > Enable smart folder rule`.
- In the settings page, turn on `Apply to enabled folders` for the metadata field group that should drive folder inheritance.

The folder path is stored internally. The settings page does not list enabled folders, keeping the settings UI compact.

For Editing Status, the plugin inspects descendant markdown notes that have the relevant metadata field. Folder-note/dashboard files that directly represent the folder are ignored. Values are normalised, so emoji-prefixed values still count.

Folder status aggregation is:

- no counted child statuses -> no folder rule
- any child is `In Progress` -> folder is `In Progress`
- at least one child is `Done` and at least one child is `To Do` -> folder is `In Progress`
- one or more children are `Done` and none are `To Do` -> folder is `Done`
- one or more children are `To Do` and none are `Done` -> folder is `To Do`
- otherwise -> no folder rule

The calculated folder status is mapped back to the existing rule list, so folders inherit the configured shape, colour, icon visibility, filename colour, and target behaviour.

## Bulk Metadata Updates

Metadata Labels adds bulk update actions to the File Explorer context menu.

For example:

```text
Metadata Labels >
  Apply Editing Status >
    To Do
    In Progress
    Done
```

The submenu groups are generated from the existing rule list. Selecting a value writes the raw rule value into frontmatter.

Bulk updates support:

- a single selected note
- multiple selected notes
- selected folders
- mixed note and folder selections

When a folder is selected, all descendant markdown notes are updated. If selected folders overlap, each markdown note is updated only once. Existing frontmatter is preserved, and notes without frontmatter receive a new frontmatter block.

After a bulk update, File Explorer visuals are refreshed and smart folder inheritance recalculates from the changed metadata.

## Compatibility

Metadata Labels is maintained for Obsidian 1.12.7 compatibility.

Important compatibility choices:

- `manifest.json` keeps `minAppVersion` at `1.0.0`.
- The settings tab uses the classic `PluginSettingTab.display()` API.
- The plugin does not use `getSettingDefinitions()`.
- Frontmatter writes use older official Vault read/modify APIs instead of newer helpers that would raise the minimum supported Obsidian version.

Lint may warn that `display()` is deprecated in newer Obsidian versions. That warning is expected for this compatibility target.

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

The production build runs TypeScript with:

```bash
tsc -noEmit -skipLibCheck
```

and then bundles the plugin with esbuild.

## Repository Notes

The repository intentionally excludes local runtime files:

- `node_modules`
- `main.js`
- `data.json`
- source maps

For manual plugin testing, `main.js` must still exist in the Obsidian plugin folder after running `npm run build`.
