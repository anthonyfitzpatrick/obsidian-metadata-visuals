export type MetadataLabelRuleTarget = 'notes' | 'folders' | 'both';

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

export interface MetadataLabelsSettings {
	rules: MetadataLabelRule[];
	smartFolders: string[];
	smartFolderFields: string[];
}

export const DEFAULT_SETTINGS: MetadataLabelsSettings = {
	rules: [],
	smartFolders: [],
	smartFolderFields: [],
};

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
