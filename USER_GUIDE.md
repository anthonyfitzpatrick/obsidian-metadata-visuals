# Metadata Labels User Guide

This guide explains how to use Metadata Labels in Obsidian after the plugin is installed and enabled.

Metadata Labels turns frontmatter metadata into visual cues. A note can keep clean metadata such as:

```yaml
---
Editing Status: To Do
Editing Stage: Published
Importance: Critical
---
```

The plugin then displays configured colours and icons in the File Explorer, in folder rows, and in the visible note Properties panel.

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
2. Open Metadata Labels.
3. In the Rules header, choose a metadata field from the `Select` field.
4. Click `Add rule`.
5. Review the generated rows.
6. Choose the shape, colour, icon/name toggles, and target for each value.

Metadata Labels creates rows from available values for the selected field. It can use values already found in your notes and values imported from known field-definition sources.

## Default Editing Status Rules

If no useful rules exist, Metadata Labels creates three default rules:

| Field | Value | Shape | Colour |
| --- | --- | --- | --- |
| Editing Status | To Do | circle | red |
| Editing Status | In Progress | circle | orange |
| Editing Status | Done | circle | green |

These defaults store clean metadata values. Emoji are not stored in the rule value.

Older notes that contain values such as `🔴 To Do`, `🟠 In Progress`, or `🟢 Done` still match because Metadata Labels normalises leading status emoji before comparing values.

## The Rules Header

The top Rules area contains:

- `Colour note metadata`: turns Properties panel colouring on or off.
- `Select`: chooses a metadata field for a new rule group.
- `Add rule`: creates a rule group for the selected field.

The field selector starts blank. `Add rule` remains disabled until a real field is selected.

When you click `Add rule`, Metadata Labels first tries to import known field definitions in the background. If no definitions are found, it uses values already found in note frontmatter.

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

If you turn `Colour note metadata` off, Metadata Labels removes its injected property colours.

## Smart Folders

Smart folders allow folders to inherit a visual rule from descendant notes.

There are two steps:

1. Right-click a folder in the File Explorer and choose `Metadata Labels > Enable smart folder rule`.
2. In settings, enable `Apply to enabled folders` for the rule group that should drive folder inheritance.

Smart folder inheritance uses the active File Explorer rule group. This keeps folder visuals aligned with the same metadata workflow used for note rows.

### Editing Status Aggregation

For an Editing Status workflow, Metadata Labels checks descendant markdown notes that have the relevant metadata field.

Folder-note/dashboard files that represent the folder itself are ignored.

Aggregation:

- If no descendant notes have a counted status, no folder rule applies.
- If any descendant note is `In Progress`, the folder is `In Progress`.
- If at least one descendant note is `Done` and at least one is `To Do`, the folder is `In Progress`.
- If all counted descendant notes are `Done`, the folder is `Done`.
- If all counted descendant notes are `To Do`, the folder is `To Do`.

The folder then uses the matching rule's shape, colour, icon toggle, name toggle, and target setting.

## Folder Context Menu

Right-click a folder in the File Explorer.

You will see:

```text
Metadata Labels >
  Enable smart folder rule
```

If the folder is already enabled:

```text
Metadata Labels >
  Disable smart folder rule
```

Disabling a smart folder immediately removes its injected styling.

## Bulk Metadata Updates

Metadata Labels adds bulk update actions to File Explorer context menus.

Example:

```text
Metadata Labels >
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

When a folder is selected, Metadata Labels updates all descendant markdown notes. If selected folders overlap, each note is updated only once.

Existing frontmatter is preserved. Notes without frontmatter receive a new frontmatter block.

## Field Definition Import

Metadata Labels can import configured possible values from known local sources. Currently, it can read Metadata Menu's local `data.json` if it exists.

This is a one-time copy:

- Metadata Labels imports field names and possible values.
- Imported values are saved into Metadata Labels' own settings.
- Metadata Labels does not require Metadata Menu at runtime.
- If Metadata Menu is removed later, imported values remain available.

This is useful when a field has possible values that have not been used in any note yet.

## Value Normalisation

Metadata Labels compares values after normalising leading status emoji.

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

The field must be known to Metadata Labels. It becomes known when:

- the field exists in frontmatter in at least one note; or
- the field was imported from a supported field-definition source.

Create one note using the field, then reopen settings or click Add rule again.

### Add Rule created fewer rows than expected

Rows are created from:

- imported possible values;
- values already found in frontmatter.

If a possible value has never been imported and is not used in any note, Metadata Labels cannot discover it from Obsidian core alone.

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

Metadata Labels clears old injected styles before reapplying. If Obsidian has not rerendered the current pane yet, switch notes or trigger a layout refresh.

## Compatibility

Metadata Labels is designed to support Obsidian 1.12.7.

The settings UI uses classic `PluginSettingTab.display()` intentionally. It does not use the newer declarative settings API.

## Data Stored By The Plugin

Metadata Labels stores:

- visual rules;
- enabled smart folder paths;
- fields enabled for smart folder inheritance;
- imported possible values;
- the selected File Explorer rule group;
- whether Properties colouring is enabled;
- collapsed/expanded state for settings rule groups.

It does not alter your notes except when you explicitly use bulk metadata update actions.

## Uninstalling

1. Disable Metadata Labels in Obsidian.
2. Remove the plugin folder if desired.

The plugin removes its injected File Explorer and Properties styles when unloaded. Your frontmatter values remain unchanged, except for metadata you intentionally changed through bulk update actions.
