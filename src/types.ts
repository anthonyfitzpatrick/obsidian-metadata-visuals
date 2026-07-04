/**
 * Controls where a rule may be applied.
 *
 * Notes means the rule can decorate markdown file rows. Folders means the rule
 * can be used by smart folder inheritance. Both allows the same configured
 * visual rule to be reused for notes and inherited folder status.
 */
export type MetadataLabelRuleTarget = 'notes' | 'folders' | 'both';

/**
 * One visual rule that maps a frontmatter field/value pair to File Explorer UI.
 *
 * field and value are the matching inputs, icon and color describe the visual
 * label, colourFilename controls whether the note/folder name text is coloured,
 * showIcon controls whether the icon is rendered, and target limits whether
 * the rule applies to notes, folders, or both.
 */
export interface MetadataLabelRule {
	id: string;
	field: string;
	value: string;
	icon: string;
	color: string;
	colourFilename: boolean;
	showIcon: boolean;
	target: MetadataLabelRuleTarget;
}

/**
 * Persisted plugin settings.
 *
 * smartFolders stores folder paths enabled from the File Explorer context menu.
 * smartFolderFields stores metadata fields whose rule groups have "Apply to
 * enabled folders" turned on in settings. Both lists are needed: one answers
 * "which folders?" and the other answers "which metadata field should drive
 * inheritance for those folders?"
 */
export interface MetadataLabelsSettings {
	rules: MetadataLabelRule[];
	smartFolders: string[];
	smartFolderFields: string[];
}

/**
 * Empty settings used for first load and as a migration base.
 */
export const DEFAULT_SETTINGS: MetadataLabelsSettings = {
	rules: [],
	smartFolders: [],
	smartFolderFields: [],
};

/**
 * Creates a new placeholder rule with safe visual defaults.
 *
 * The settings tab fills in the metadata field and often overrides the icon or
 * colour for seeded Editing Status rules. Defaults are intentionally visible so
 * a partially configured row still previews clearly in the settings table.
 */
export const createDefaultRule = (): MetadataLabelRule => ({
	id: crypto.randomUUID(),
	field: '',
	value: '',
	icon: 'tag',
	color: '#8a5cf6',
	colourFilename: true,
	showIcon: true,
	target: 'both',
});
