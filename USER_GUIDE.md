# Metadata Visuals User Guide

This guide explains how to use Metadata Visuals in Obsidian after the plugin is installed and enabled.

Metadata Visuals turns frontmatter metadata into visual cues. A note can keep clean metadata such as:

```yaml
---
Editing Status: To Do
Editing Stage: Published
Importance: Critical
---
```

The plugin then displays configured colours and icons in the File Explorer, in folder rows, and in the visible note Properties panel.

<div style="color: #d22; border-left: 4px solid #d22; padding-left: 0.75rem;">
<strong>Screenshot 01 placeholder:</strong> Upload a high-level screenshot named <code>screenshots/metadata-visuals-overview.png</code>. It should show Obsidian with the File Explorer visible on the left, several notes using Metadata Visuals icons/coloured names, and an open note showing coloured Properties values at the top. Use a small sample vault with non-private note names so the screenshot is safe for public documentation.
</div>

## Core Concepts

### Metadata Field

A metadata field is the frontmatter property name, such as:

- `Editing Status`
- `Editing Stage`
- `Importance`
- `Type`

### Metadata Value

A metadata value is the content stored in that field, such as:

- `To Do`
- `In Progress`
- `Done`
- `Published`
- `Critical`

### Rule Group

A rule group belongs to one metadata field. For example, an `Editing Status` group can contain rows for `To Do`, `In Progress`, and `Done`.

Each row controls how one value looks:

- icon shape
- icon colour
- whether the File Explorer icon is shown
- whether the note or folder name is coloured
- whether the row applies to notes, folders, or both

### File Explorer Rule Group

Only one rule group can control File Explorer note and folder visuals at a time. This prevents one note from receiving competing icons or filename colours from several metadata fields.

The selected group is marked with `Use for File Explorer`.

Metadata/property colouring is different: it can use all matching rule groups.

## First Setup

1. Open Obsidian Settings.
2. Open Metadata Visuals.
3. In the Rules header, choose a metadata field from the `Select` field.
4. Click `Add rule`.
5. Review the generated rows.
6. Choose the shape, colour, icon/name toggles, and target for each value.

Metadata Visuals creates rows from available values for the selected field. It can use values already found in your notes and values imported from known field-definition sources.

<div style="color: #d22; border-left: 4px solid #d22; padding-left: 0.75rem;">
<strong>Screenshot 02 placeholder:</strong> Upload a setup screenshot named <code>screenshots/settings-add-rule.png</code>. It should show Settings -&gt; Metadata Visuals with the Rules header visible, the <code>Colour note metadata</code> toggle, the <code>Select</code> field open or ready to select a metadata field, and the <code>Add rule</code> button. Capture the clean compact Add Rule area without private vault content.
</div>

## Default Editing Status Rules

If no useful rules exist, Metadata Visuals creates three default rules:

| Field | Value | Shape | Colour |
| --- | --- | --- | --- |
| Editing Status | To Do | circle | red |
| Editing Status | In Progress | circle | orange |
| Editing Status | Done | circle | green |

These defaults store clean metadata values. Emoji are not stored in the rule value.

Older notes that contain values such as `🔴 To Do`, `🟠 In Progress`, or `🟢 Done` still match because Metadata Visuals normalises leading status emoji before comparing values.

<div style="color: #d22; border-left: 4px solid #d22; padding-left: 0.75rem;">
<strong>Screenshot 03 placeholder:</strong> Upload a defaults screenshot named <code>screenshots/default-editing-status-rules.png</code>. It should show the expanded <code>Editing Status</code> rule group with the three default rows: <code>To Do</code>, <code>In Progress</code>, and <code>Done</code>. Make sure the Shape, Colour, Icon, Name, Target, Preview, and Delete columns are visible.
</div>

## The Rules Header

The top Rules area contains:

- `Colour note metadata`: turns Properties panel colouring on or off.
- `Select`: chooses a metadata field for a new rule group.
- `Add rule`: creates a rule group for the selected field.

The field selector starts blank. `Add rule` remains disabled until a real field is selected.

When you click `Add rule`, Metadata Visuals first tries to import known field definitions in the background. If no definitions are found, it uses values already found in note frontmatter.

<div style="color: #d22; border-left: 4px solid #d22; padding-left: 0.75rem;">
<strong>Screenshot 04 placeholder:</strong> Upload a field selector screenshot named <code>screenshots/add-rule-field-selector.png</code>. It should show the Add Rule <code>Select</code> input with the dropdown/list of available metadata fields visible. Include examples such as <code>Editing Status</code>, <code>Editing Stage</code>, and <code>Importance</code> if they are available in the sample vault.
</div>

## Rule Group Header

Each rule group header shows:

- collapse/expand chevron
- metadata field name
- label count
- `Use for File Explorer`
- `Apply to enabled folders`
- `Delete rule`

Click the header to collapse or expand the group. Collapsed state is saved and restored after restart.

The metadata field name is read-only. Field selection happens only when creating a new rule group.

<div style="color: #d22; border-left: 4px solid #d22; padding-left: 0.75rem;">
<strong>Screenshot 05 placeholder:</strong> Upload a collapsed-group screenshot named <code>screenshots/collapsed-rule-group.png</code>. It should show one collapsed rule group header with the chevron, bold metadata field name, label count, <code>Use for File Explorer</code>, <code>Apply to enabled folders</code>, and <code>Delete rule</code> button all visible in the same row.
</div>

## Rule Table Columns

| Column | Meaning |
| --- | --- |
| Drag | Drag handle for reordering rows inside the group. |
| Value | Read-only metadata value. |
| Shape | Icon shape shown in the File Explorer when icons are enabled. |
| Colour | Rule colour. |
| Icon | Whether to show the File Explorer icon. |
| Name | Whether to colour the note or folder name. |
| Target | Whether the rule applies to notes, folders, or both. |
| Preview | Preview of the icon/name effect. |
| Del | Delete this row. |

Rows are generated from known values for the field. You do not manually type values into the table.

<div style="color: #d22; border-left: 4px solid #d22; padding-left: 0.75rem;">
<strong>Screenshot 06 placeholder:</strong> Upload a table screenshot named <code>screenshots/rule-table-expanded.png</code>. It should show an expanded rule group with several rows, including the Drag handle, read-only Value text, Shape dropdown, Colour picker, Icon checkbox, Name checkbox, Target dropdown, Preview, and row Delete button. Use at least one long value so readers can see text wrapping.
</div>

## File Explorer Labels

To colour notes in the File Explorer:

1. Create a rule group.
2. Turn on `Use for File Explorer` for that group.
3. Configure each row.

Only the selected File Explorer group controls icons and filename colour.

For each matching note:

- if `Icon` is enabled, the configured icon is inserted before the note name;
- if `Name` is enabled, the note name uses the configured colour;
- if both are disabled, the note receives no visible File Explorer effect.

Rule order matters within the selected group. The first matching rule wins.

<div style="color: #d22; border-left: 4px solid #d22; padding-left: 0.75rem;">
<strong>Screenshot 07 placeholder:</strong> Upload a File Explorer screenshot named <code>screenshots/file-explorer-labels.png</code>. It should show note rows with Metadata Visuals icons and/or coloured note names. Include at least three notes representing different values, such as <code>To Do</code>, <code>In Progress</code>, and <code>Done</code>, so the colour differences are clear.
</div>

## Note Properties Colouring

The `Colour note metadata` toggle controls colouring in the visible note Properties panel.

When enabled, all matching rule groups can colour their own matching field/value pairs.

Example:

| Property | Value | Result |
| --- | --- | --- |
| Editing Status | To Do | Uses the To Do rule colour. |
| Editing Stage | Published | Uses the Published rule colour. |
| Importance | Critical | Uses the Critical rule colour. |

This feature does not depend on `Use for File Explorer`. A group can colour Properties values even if another group controls the File Explorer.

If you turn `Colour note metadata` off, Metadata Visuals removes its injected property colours.

<div style="color: #d22; border-left: 4px solid #d22; padding-left: 0.75rem;">
<strong>Screenshot 08 placeholder:</strong> Upload a Properties screenshot named <code>screenshots/coloured-note-properties.png</code>. It should show an open note with the Properties panel visible and multiple coloured values, for example <code>Editing Status: To Do</code>, <code>Editing Stage: Published</code>, and <code>Importance: Critical</code>. The File Explorer can be visible too, but the coloured Properties values should be the focus.
</div>

## Smart Folders

Smart folders allow folders to inherit a visual rule from descendant notes.

There are two steps:

1. Right-click a folder in the File Explorer and choose `Metadata Visuals > Enable smart folder rule`.
2. In settings, enable `Apply to enabled folders` for the rule group that should drive folder inheritance.

Smart folder inheritance uses the active File Explorer rule group. This keeps folder visuals aligned with the same metadata workflow used for note rows.

### Editing Status Aggregation

For an Editing Status workflow, Metadata Visuals checks descendant markdown notes that have the relevant metadata field.

Folder-note/dashboard files that represent the folder itself are ignored.

Aggregation:

- If no descendant notes have a counted status, no folder rule applies.
- If any descendant note is `In Progress`, the folder is `In Progress`.
- If at least one descendant note is `Done` and at least one is `To Do`, the folder is `In Progress`.
- If all counted descendant notes are `Done`, the folder is `Done`.
- If all counted descendant notes are `To Do`, the folder is `To Do`.

The folder then uses the matching rule's shape, colour, icon toggle, name toggle, and target setting.

<div style="color: #d22; border-left: 4px solid #d22; padding-left: 0.75rem;">
<strong>Screenshot 09 placeholder:</strong> Upload a smart folder screenshot named <code>screenshots/smart-folder-inheritance.png</code>. It should show a folder row in the File Explorer inheriting an icon or coloured name from descendant notes. Ideally include the expanded folder contents below it so readers can see child notes with statuses that explain the inherited folder state.
</div>

## Folder Context Menu

Right-click a folder in the File Explorer.

You will see:

```text
Metadata Visuals >
  Enable smart folder rule
```

If the folder is already enabled:

```text
Metadata Visuals >
  Disable smart folder rule
```

Disabling a smart folder immediately removes its injected styling.

<div style="color: #d22; border-left: 4px solid #d22; padding-left: 0.75rem;">
<strong>Screenshot 10 placeholder:</strong> Upload a folder context-menu screenshot named <code>screenshots/folder-context-menu.png</code>. It should show a File Explorer folder right-click menu with the <code>Metadata Visuals</code> submenu open and either <code>Enable smart folder rule</code> or <code>Disable smart folder rule</code> visible.
</div>

## Bulk Metadata Updates

Metadata Visuals adds bulk update actions to File Explorer context menus.

Example:

```text
Metadata Visuals >
  Apply Editing Status >
    To Do
    In Progress
    Done
```

Selecting a value writes that raw value into frontmatter.

Bulk updates support:

- one selected note;
- multiple selected notes;
- selected folders;
- mixed note and folder selections.

When a folder is selected, Metadata Visuals updates all descendant markdown notes. If selected folders overlap, each note is updated only once.

Existing frontmatter is preserved. Notes without frontmatter receive a new frontmatter block.

<div style="color: #d22; border-left: 4px solid #d22; padding-left: 0.75rem;">
<strong>Screenshot 11 placeholder:</strong> Upload a bulk update screenshot named <code>screenshots/bulk-metadata-update-menu.png</code>. It should show a File Explorer context menu for selected notes and/or folders with <code>Metadata Visuals &gt; Apply Editing Status &gt; To Do / In Progress / Done</code> visible. Use sample notes/folders with non-private names.
</div>

## Field Definition Import

Metadata Visuals can import configured possible values from known local sources. Currently, it can read Metadata Menu's local `data.json` if it exists.

This is a one-time copy:

- Metadata Visuals imports field names and possible values.
- Imported values are saved into Metadata Visuals' own settings.
- Metadata Visuals does not require Metadata Menu at runtime.
- If Metadata Menu is removed later, imported values remain available.

This is useful when a field has possible values that have not been used in any note yet.

<div style="color: #d22; border-left: 4px solid #d22; padding-left: 0.75rem;">
<strong>Screenshot 12 placeholder:</strong> Upload a field-import result screenshot named <code>screenshots/imported-field-values.png</code>. It should show a newly added rule group populated with values that came from imported field definitions, such as an <code>Editing Stage</code> group with many stage rows including values that are not currently used in notes.
</div>

## Value Normalisation

Metadata Visuals compares values after normalising leading status emoji.

These values are treated as equivalent:

```yaml
Editing Status: To Do
Editing Status: 🔴 To Do
```

This exists for backwards compatibility with older notes and older default rules.

## Recommended Workflows

### Editing Status

Use this for manuscript progress:

- To Do
- In Progress
- Done

Enable `Use for File Explorer` if you want note and folder rows to show progress.

### Editing Stage

Use this for detailed production stages:

- First Draft
- Developmental Edit
- Beta Readers
- Final Edit
- Published

Leave `Use for File Explorer` off if Editing Status already controls File Explorer visuals. The Editing Stage group can still colour Properties values.

### Importance

Use this for priority:

- Critical
- Major
- Minor

This works well for Properties colouring, and can also control File Explorer visuals if priority is more important than status in your vault.

## Troubleshooting

### I do not see a field in the Add Rule selector

The field must be known to Metadata Visuals. It becomes known when:

- the field exists in frontmatter in at least one note; or
- the field was imported from a supported field-definition source.

Create one note using the field, then reopen settings or click Add rule again.

### Add Rule created fewer rows than expected

Rows are created from:

- imported possible values;
- values already found in frontmatter.

If a possible value has never been imported and is not used in any note, Metadata Visuals cannot discover it from Obsidian core alone.

### File Explorer colours do not match the Properties colours

This is usually expected.

File Explorer visuals use only the group marked `Use for File Explorer`. Properties colouring can use all matching groups.

### A folder is not inheriting a status

Check that:

- the folder is enabled from the folder context menu;
- `Apply to enabled folders` is on for the active File Explorer rule group;
- descendant notes have the relevant metadata field;
- the rule group contains matching values.

### Property values are not coloured

Check that:

- `Colour note metadata` is enabled;
- the note has a matching field/value pair;
- the Properties panel is visible;
- the rule value matches the stored frontmatter value after normalisation.

### I disabled a rule but stale colours remain

Metadata Visuals clears old injected styles before reapplying. If Obsidian has not rerendered the current pane yet, switch notes or trigger a layout refresh.

## Compatibility

Metadata Visuals is designed to support Obsidian 1.12.7.

The settings UI uses classic `PluginSettingTab.display()` intentionally. It does not use the newer declarative settings API.

## Data Stored By The Plugin

Metadata Visuals stores:

- visual rules;
- enabled smart folder paths;
- fields enabled for smart folder inheritance;
- imported possible values;
- the selected File Explorer rule group;
- whether Properties colouring is enabled;
- collapsed/expanded state for settings rule groups.

It does not alter your notes except when you explicitly use bulk metadata update actions.

## Uninstalling

1. Disable Metadata Visuals in Obsidian.
2. Remove the plugin folder if desired.

The plugin removes its injected File Explorer and Properties styles when unloaded. Your frontmatter values remain unchanged, except for metadata you intentionally changed through bulk update actions.
