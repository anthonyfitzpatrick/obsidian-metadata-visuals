import {
	App,
	ColorComponent,
	DropdownComponent,
	ExtraButtonComponent,
	PluginSettingTab,
	Setting,
	setIcon,
	TextComponent,
} from 'obsidian';

import type MetadataLabelsPlugin from './main';
import {
	createDefaultRule,
	MetadataLabelRule,
	MetadataLabelRuleTarget,
} from './types';

const ICON_OPTIONS = [
	'circle',
	'square',
	'diamond',
	'triangle',
	'star',
	'check-circle',
	'alert-circle',
	'minus-circle',
	'dot',
	'tag',
	'bookmark',
	'flag',
	'pencil',
	'check',
	'x',
];

const TARGET_OPTIONS: Record<MetadataLabelRuleTarget, string> = {
	notes: 'Notes',
	folders: 'Folders',
	both: 'Both',
};

interface FieldSelector {
	inputEl: HTMLInputElement;
	value: string;
}

export class MetadataLabelsSettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: MetadataLabelsPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const fields = this.getFrontmatterFields();

		this.ensureDefaultRules();

		containerEl.empty();

		const headerEl = containerEl.createDiv('metadata-labels-settings-header');

		headerEl.createDiv({
			cls: 'metadata-labels-settings-title',
			text: 'Metadata Labels',
		});
		headerEl.createDiv({
			cls: 'metadata-labels-settings-description',
			text: 'Create Scrivener-style labels from frontmatter metadata.',
		});

		const actionsEl = containerEl.createDiv('metadata-labels-actions');
		const existingGroupFields = new Set(
			Array.from(this.groupRulesByField().keys()),
		);
		const availableNewFields = fields.filter((field) => !existingGroupFields.has(field));
		let selectedNewField = availableNewFields[0] ?? '';
		let addRuleButtonEl: HTMLButtonElement | null = null;

		new Setting(actionsEl)
			.setName('Rules')
			.setDesc('Create a label group from an existing frontmatter field.')
			.addText((text) => {
				this.configureFieldSelector(
					text,
					selectedNewField,
					availableNewFields,
					(value) => {
						selectedNewField = value;
						if (addRuleButtonEl) {
							addRuleButtonEl.disabled = selectedNewField === '';
						}
					},
				);
			})
			.addButton((button) => {
				addRuleButtonEl = button.buttonEl;
				addRuleButtonEl.disabled = selectedNewField === '';
				button
					.setButtonText('Add rule')
					.onClick(async () => {
						if (selectedNewField === '') {
							return;
						}

						this.plugin.settings.rules.push(this.createRuleForField(selectedNewField));
						await this.plugin.saveSettings();
						this.display();
					});
			});

		for (const [field, rules] of this.groupRulesByField()) {
			this.renderRuleGroup(containerEl, field, rules);
		}
	}

	private renderRuleGroup(
		containerEl: HTMLElement,
		field: string,
		rules: MetadataLabelRule[],
	): void {
		const groupEl = containerEl.createDiv('metadata-labels-rule-group');
		const headerEl = groupEl.createDiv('metadata-labels-rule-group-header');
		const titleEl = headerEl.createDiv('metadata-labels-rule-group-title');

		titleEl.createDiv({
			cls: 'metadata-labels-field-label',
			text: 'Metadata field',
		});
		const fieldInput = new TextComponent(titleEl);

		this.configureFieldSelector(fieldInput, field, this.getFrontmatterFields(), async (value) => {
			for (const rule of rules) {
				rule.field = value;
			}

			await this.plugin.saveSettings();
			this.display();
		});
		titleEl.createDiv({
			cls: 'metadata-labels-field-count',
			text: `${rules.length} ${rules.length === 1 ? 'label' : 'labels'}`,
		});

		new Setting(headerEl)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.smartFolderFields.includes(field))
					.onChange(async (value) => {
						this.setSmartFolderFieldEnabled(field, value);
						await this.plugin.saveSettings();
					});
				toggle.toggleEl.setAttribute('aria-label', 'Apply to enabled folders');
			})
			.addButton((button) => {
				button
					.setButtonText('Add row')
					.onClick(async () => {
						this.plugin.settings.rules.push(this.createRuleForField(field));
						await this.plugin.saveSettings();
						this.display();
					});
			})
			.addButton((button) => {
				button
					.setButtonText('Delete rule')
					.onClick(async () => {
						for (const rule of rules) {
							const index = this.plugin.settings.rules.indexOf(rule);

							if (index >= 0) {
								this.plugin.settings.rules.splice(index, 1);
							}
						}

						await this.plugin.saveSettings();
						this.display();
					});
			});

		headerEl.createSpan({
			cls: 'metadata-labels-smart-folder-toggle-label',
			text: 'Apply to enabled folders',
		});

		const tableEl = groupEl.createDiv('metadata-labels-rule-table');
		const tableHeaderEl = tableEl.createDiv('metadata-labels-rule-table-header');

		for (const label of ['Value', 'Shape', 'Colour', 'Icon', 'Name', 'Target', 'Preview', 'Del']) {
			tableHeaderEl.createDiv({
				cls: 'metadata-labels-rule-table-heading',
				text: label,
			});
		}

		for (const rule of rules) {
			this.renderRule(tableEl, rule);
		}
	}

	private renderRule(tableEl: HTMLElement, rule: MetadataLabelRule): void {
		const rowEl = tableEl.createDiv('metadata-labels-rule-table-row');
		const valueEl = rowEl.createDiv('metadata-labels-rule-table-cell metadata-labels-value-cell');
		const iconEl = rowEl.createDiv('metadata-labels-rule-table-cell metadata-labels-icon-cell');
		const colorEl = rowEl.createDiv('metadata-labels-rule-table-cell metadata-labels-colour-cell');
		const showIconEl = rowEl.createDiv('metadata-labels-rule-table-cell metadata-labels-show-icon-cell');
		const colourNameEl = rowEl.createDiv('metadata-labels-rule-table-cell metadata-labels-colour-name-cell');
		const targetEl = rowEl.createDiv('metadata-labels-rule-table-cell metadata-labels-target-cell');
		const previewEl = rowEl.createDiv('metadata-labels-rule-table-cell metadata-labels-preview-cell');
		const deleteEl = rowEl.createDiv('metadata-labels-rule-table-cell metadata-labels-delete-cell');
		const previewIconEl = previewEl.createSpan('metadata-labels-rule-preview-icon');
		const previewTextEl = previewEl.createSpan({
			cls: 'metadata-labels-rule-preview-text',
			text: rule.value || 'New label',
		});

		valueEl.setAttribute('data-label', 'Value');
		iconEl.setAttribute('data-label', 'Shape');
		colorEl.setAttribute('data-label', 'Colour');
		showIconEl.setAttribute('data-label', 'Icon');
		colourNameEl.setAttribute('data-label', 'Name');
		targetEl.setAttribute('data-label', 'Target');
		previewEl.setAttribute('data-label', 'Preview');
		deleteEl.setAttribute('data-label', 'Del');

		this.updatePreview(previewIconEl, previewTextEl, rule);

		const valueInput = new TextComponent(valueEl);

		valueInput.inputEl.setAttribute('aria-label', 'Metadata value');
		this.configureText(valueInput, rule.value, 'Draft', async (value) => {
			rule.value = value.trim();
			this.updatePreview(previewIconEl, previewTextEl, rule);
			await this.plugin.saveSettings();
		});

		const iconDropdown = new DropdownComponent(iconEl);

		iconDropdown.selectEl.setAttribute('aria-label', 'Icon');
		for (const icon of ICON_OPTIONS) {
			iconDropdown.addOption(icon, icon);
		}
		if (rule.icon && !ICON_OPTIONS.includes(rule.icon)) {
			iconDropdown.addOption(rule.icon, rule.icon);
		}
		iconDropdown
			.setValue(rule.icon || 'circle')
			.onChange(async (value) => {
				rule.icon = value;
				this.updatePreview(previewIconEl, previewTextEl, rule);
				await this.plugin.saveSettings();
			});

		const colorPicker = new ColorComponent(colorEl);

		colorPicker
			.setValue(rule.color)
			.onChange(async (value) => {
				rule.color = value;
				this.updatePreview(previewIconEl, previewTextEl, rule);
				await this.plugin.saveSettings();
			});

		const showIconCheckbox = showIconEl.createEl('input', {
			attr: {
				'aria-label': 'Show icon',
				type: 'checkbox',
			},
		});

		showIconCheckbox.checked = rule.showIcon;
		showIconCheckbox.addEventListener('change', () => {
			rule.showIcon = showIconCheckbox.checked;
			this.updatePreview(previewIconEl, previewTextEl, rule);
			void this.plugin.saveSettings();
		});

		showIconEl.createSpan({
			cls: 'metadata-labels-toggle-label',
			text: 'Icon',
		});

		const colourNameCheckbox = colourNameEl.createEl('input', {
			attr: {
				'aria-label': 'Colour note name',
				type: 'checkbox',
			},
		});

		colourNameCheckbox.checked = rule.colourFilename;
		colourNameCheckbox.addEventListener('change', () => {
			rule.colourFilename = colourNameCheckbox.checked;
			this.updatePreview(previewIconEl, previewTextEl, rule);
			void this.plugin.saveSettings();
		});

		colourNameEl.createSpan({
			cls: 'metadata-labels-toggle-label',
			text: 'Name',
		});

		const targetDropdown = new DropdownComponent(targetEl);

		for (const [value, label] of Object.entries(TARGET_OPTIONS)) {
			targetDropdown.addOption(value, label);
		}
		targetDropdown
			.setValue(rule.target)
			.onChange(async (value) => {
				rule.target = this.parseRuleTarget(value);
				await this.plugin.saveSettings();
			});

		const deleteButton = new ExtraButtonComponent(deleteEl);

		deleteButton.extraSettingsEl.setAttribute('aria-label', 'Delete rule');
		deleteButton.extraSettingsEl.setAttribute('title', 'Delete rule');
		deleteButton
			.setIcon('trash')
			.onClick(async () => {
				const index = this.plugin.settings.rules.indexOf(rule);

				if (index >= 0) {
					this.plugin.settings.rules.splice(index, 1);
				}

				await this.plugin.saveSettings();
				this.display();
		});
	}

	private configureFieldSelector(
		text: TextComponent,
		value: string,
		fields: string[],
		onSelect: (value: string) => void | Promise<void>,
	): FieldSelector {
		const inputEl = text.inputEl;
		const listId = `metadata-labels-fields-${crypto.randomUUID()}`;
		const dataListEl = inputEl.parentElement?.createEl('datalist');

		if (!dataListEl) {
			return {
				inputEl,
				value,
			};
		}

		dataListEl.id = listId;
		inputEl.setAttribute('list', listId);
		inputEl.setAttribute('autocomplete', 'off');
		inputEl.setAttribute('aria-label', 'Metadata field');

		for (const field of fields) {
			dataListEl.createEl('option', { attr: { value: field } });
		}

		const selector: FieldSelector = {
			inputEl,
			value,
		};

		text
			.setValue(selector.value)
			.setPlaceholder(fields.length > 0 ? 'Search fields' : 'No frontmatter fields found');
		inputEl.disabled = fields.length === 0;

		inputEl.addEventListener('change', () => {
			const nextValue = inputEl.value.trim();

			if (!fields.includes(nextValue)) {
				inputEl.value = selector.value;
				return;
			}

			selector.value = nextValue;
			void onSelect(nextValue);
		});

		inputEl.addEventListener('blur', () => {
			if (!fields.includes(inputEl.value.trim())) {
				inputEl.value = selector.value;
			}
		});

		return selector;
	}

	private configureText(
		text: TextComponent,
		value: string,
		placeholder: string,
		onChange: (value: string) => Promise<void>,
	): void {
		text
			.setValue(value)
			.setPlaceholder(placeholder)
			.onChange((nextValue) => {
				void onChange(nextValue);
			});
	}

	private ensureDefaultRules(): void {
		if (this.plugin.settings.rules.some((rule) => this.isUsefulRule(rule))) {
			return;
		}

		this.plugin.settings.rules.splice(
			0,
			this.plugin.settings.rules.length,
			this.createEditingStatusRule('To Do', '#e03131'),
			this.createEditingStatusRule('In Progress', '#f08c00'),
			this.createEditingStatusRule('Done', '#2f9e44'),
		);

		void this.plugin.saveSettings();
	}

	private isUsefulRule(rule: MetadataLabelRule): boolean {
		return rule.field.trim() !== ''
			&& rule.value.trim() !== ''
			&& rule.icon.trim() !== '';
	}

	private createEditingStatusRule(
		value: string,
		color: string,
	): MetadataLabelRule {
		return {
			...createDefaultRule(),
			field: 'Editing Status',
			value,
			icon: 'circle',
			color,
			colourFilename: true,
			showIcon: true,
			target: 'both',
		};
	}

	private createRuleForField(field: string): MetadataLabelRule {
		return {
			...createDefaultRule(),
			field,
			icon: 'circle',
			showIcon: true,
			target: 'both',
		};
	}

	private setSmartFolderFieldEnabled(field: string, enabled: boolean): void {
		const smartFolderFields = this.plugin.settings.smartFolderFields;

		if (enabled) {
			if (!smartFolderFields.includes(field)) {
				smartFolderFields.push(field);
				smartFolderFields.sort((a, b) => a.localeCompare(b));
			}

			return;
		}

		this.plugin.settings.smartFolderFields = smartFolderFields
			.filter((smartFolderField) => smartFolderField !== field);
	}

	private parseRuleTarget(value: string): MetadataLabelRuleTarget {
		if (value === 'notes' || value === 'folders' || value === 'both') {
			return value;
		}

		return 'both';
	}

	private getFrontmatterFields(): string[] {
		const fields = new Set<string>();

		for (const file of this.app.vault.getMarkdownFiles()) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;

			if (!frontmatter) {
				continue;
			}

			for (const field of Object.keys(frontmatter)) {
				fields.add(field);
			}
		}

		return Array.from(fields).sort((a, b) => a.localeCompare(b));
	}

	private groupRulesByField(): Map<string, MetadataLabelRule[]> {
		const groups = new Map<string, MetadataLabelRule[]>();

		for (const rule of this.plugin.settings.rules) {
			const field = rule.field || 'Editing Status';
			const rules = groups.get(field) ?? [];

			rules.push(rule);
			groups.set(field, rules);
		}

		return groups;
	}

	private updatePreview(
		iconEl: HTMLElement,
		textEl: HTMLElement,
		rule: MetadataLabelRule,
	): void {
		iconEl.empty();
		iconEl.style.color = rule.color;
		setIcon(iconEl, rule.icon || 'circle');
		iconEl.style.display = rule.showIcon ? '' : 'none';
		textEl.style.color = rule.colourFilename ? rule.color : '';
		textEl.setText(rule.value || 'New label');
	}
}
