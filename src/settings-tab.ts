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

/**
 * Classic Obsidian settings tab for Metadata Labels.
 *
 * The plugin intentionally uses PluginSettingTab.display() rather than
 * getSettingDefinitions() because it must support Obsidian 1.12.7. The UI is a
 * compact table grouped by metadata field so writers can manage many label
 * rules without large repeated cards.
 */
export class MetadataLabelsSettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: MetadataLabelsPlugin,
	) {
		super(app, plugin);
	}

	/**
	 * Rebuilds the entire settings page from current settings.
	 *
	 * The settings UI is small enough that a full redraw after structural
	 * changes is simpler and safer than incremental DOM updates. Input controls
	 * save directly into plugin.settings and then call plugin.saveSettings().
	 */
	display(): void {
		const { containerEl } = this;
		const fields = this.getFrontmatterFields();

		this.normalizeRuleValues();
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

						this.plugin.settings.rules.push(
							this.createRuleForField(
								selectedNewField,
								this.getFrontmatterValues(selectedNewField)[0] ?? '',
							),
						);
						await this.plugin.saveSettings();
						this.display();
					});
			});

		for (const [field, rules] of this.groupRulesByField()) {
			this.renderRuleGroup(containerEl, field, rules);
		}
	}

	/**
	 * Renders one metadata field group, such as "Editing Status".
	 *
	 * Each group owns a field selector, the "Apply to enabled folders" smart
	 * folder toggle, an Add row button for another value under the same field,
	 * and a Delete rule button that removes the entire group.
	 */
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
				toggle.toggleEl.insertAdjacentElement(
					'afterend',
					createSpan({
						cls: 'metadata-labels-smart-folder-toggle-label',
						text: 'Apply to enabled folders',
					}),
				);
			})
			.addButton((button) => {
				button
					.setButtonText('Add row')
					.onClick(async () => {
						this.plugin.settings.rules.push(
							this.createRuleForField(field, this.getFrontmatterValues(field)[0] ?? ''),
						);
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

	/**
	 * Renders one compact table row for one field/value rule.
	 *
	 * The row exposes only the raw metadata value, visual shape, colour, icon and
	 * filename toggles, target, preview, and row delete action. The preview uses
	 * the same icon and filename-colour toggles so the user can see the File
	 * Explorer effect before matching any note.
	 */
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
		this.configureValueSelector(valueInput, rule, this.getFrontmatterValues(rule.field), async (value) => {
			rule.value = value;
			this.updatePreview(previewIconEl, previewTextEl, rule);
			await this.plugin.saveSettings();
		});
		this.updatePreview(previewIconEl, previewTextEl, rule);

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

	/**
	 * Configures a text input as a constrained frontmatter-field selector.
	 *
	 * Obsidian 1.12.7 compatibility rules out newer declarative settings
	 * controls, so this uses a datalist-backed TextComponent. The selector only
	 * accepts fields already found in vault frontmatter; invalid typed values are
	 * reverted on change/blur so rules cannot be created for non-existent fields.
	 */
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

	/**
	 * Configures a text input as a constrained value selector for one metadata
	 * field.
	 *
	 * The selector uses normalised values collected from notes that already have
	 * the row's metadata field. This keeps stored rule values clean and prevents
	 * typos from creating rules that cannot match the vault. Invalid typed values
	 * are rejected and the input returns to the last valid selected value.
	 */
	private configureValueSelector(
		text: TextComponent,
		rule: MetadataLabelRule,
		values: string[],
		onSelect: (value: string) => void | Promise<void>,
	): void {
		const inputEl = text.inputEl;
		const normalizedRuleValue = this.normalizeStatusValue(rule.value);
		const initialValue = values.length === 0
			? normalizedRuleValue
			: values.includes(normalizedRuleValue)
			? normalizedRuleValue
			: values[0] ?? '';
		const listId = `metadata-labels-values-${crypto.randomUUID()}`;
		const dataListEl = inputEl.parentElement?.createEl('datalist');

		if (rule.value !== initialValue) {
			rule.value = initialValue;
			void this.plugin.saveSettings();
		}

		if (dataListEl) {
			dataListEl.id = listId;
			inputEl.setAttribute('list', listId);

			for (const value of values) {
				dataListEl.createEl('option', { attr: { value } });
			}
		}

		inputEl.setAttribute('autocomplete', 'off');
		inputEl.setAttribute('aria-label', 'Metadata value');

		let selectedValue = initialValue;

		text
			.setValue(selectedValue)
			.setPlaceholder(values.length > 0 ? 'Search values' : 'No values found')
			.onChange((nextValue) => {
				const normalizedValue = this.normalizeStatusValue(nextValue);

				if (!values.includes(normalizedValue)) {
					return;
				}

				selectedValue = normalizedValue;
				inputEl.value = selectedValue;
				void onSelect(selectedValue);
			});
		inputEl.disabled = values.length === 0;

		inputEl.addEventListener('change', () => {
			const normalizedValue = this.normalizeStatusValue(inputEl.value);

			if (!values.includes(normalizedValue)) {
				inputEl.value = selectedValue;
				return;
			}

			selectedValue = normalizedValue;
			inputEl.value = selectedValue;
			void onSelect(selectedValue);
		});

		inputEl.addEventListener('blur', () => {
			const normalizedValue = this.normalizeStatusValue(inputEl.value);

			if (!values.includes(normalizedValue)) {
				inputEl.value = selectedValue;
			}
		});
	}

	/**
	 * Seeds first-run/default rules when no useful rules exist.
	 *
	 * Empty placeholder rows are not useful because they cannot match metadata.
	 * If every saved row is empty or placeholder-like, the settings page replaces
	 * them with the three writer-friendly Editing Status defaults.
	 */
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

	/**
	 * Returns whether a rule has enough data to match a note or folder status.
	 */
	private isUsefulRule(rule: MetadataLabelRule): boolean {
		return rule.field.trim() !== ''
			&& rule.value.trim() !== ''
			&& rule.icon.trim() !== '';
	}

	/**
	 * Creates one of the seeded Editing Status rules.
	 *
	 * The raw value is stored without emoji. Icon shape and colour live in their
	 * own columns, and both note names and icons are enabled by default.
	 */
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

	/**
	 * Creates a blank new row under an existing metadata field group.
	 */
	private createRuleForField(field: string, value = ''): MetadataLabelRule {
		return {
			...createDefaultRule(),
			field,
			value,
			icon: 'circle',
			showIcon: true,
			target: 'both',
		};
	}

	/**
	 * Updates which metadata fields drive enabled smart folders.
	 *
	 * Folder paths are still controlled from the File Explorer context menu.
	 * This per-field setting answers whether this rule group should be used when
	 * calculating inherited visuals for those enabled folders.
	 */
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

	/**
	 * Safely parses a rule target selected in the row dropdown.
	 */
	private parseRuleTarget(value: string): MetadataLabelRuleTarget {
		if (value === 'notes' || value === 'folders' || value === 'both') {
			return value;
		}

		return 'both';
	}

	/**
	 * Scans the vault metadata cache for existing frontmatter field names.
	 *
	 * The settings UI uses this list to keep field selection writer-friendly and
	 * prevent typos from creating rules that can never match any existing notes.
	 */
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

	/**
	 * Scans existing notes for the selectable values of one metadata field.
	 *
	 * Values are normalised before entering the selector, so notes containing
	 * "🔴 To Do" contribute the clean selectable value "To Do". Arrays are
	 * flattened because YAML frontmatter fields can store multiple values.
	 */
	private getFrontmatterValues(field: string): string[] {
		const values = new Set<string>();

		for (const file of this.app.vault.getMarkdownFiles()) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;

			if (!frontmatter || !(field in frontmatter)) {
				continue;
			}

			for (const value of this.getNormalizedMetadataValues(frontmatter[field])) {
				values.add(value);
			}
		}

		return Array.from(values).sort((a, b) => a.localeCompare(b));
	}

	/**
	 * Extracts normalised string values from a frontmatter scalar or array.
	 */
	private getNormalizedMetadataValues(value: unknown): string[] {
		if (Array.isArray(value)) {
			return value.flatMap((item) => this.getNormalizedMetadataValues(item));
		}

		if (
			value === null
			|| value === undefined
			|| (
				typeof value !== 'string'
				&& typeof value !== 'number'
				&& typeof value !== 'boolean'
			)
		) {
			return [];
		}

		const normalizedValue = this.normalizeStatusValue(String(value));

		return normalizedValue ? [normalizedValue] : [];
	}

	/**
	 * Groups rules by metadata field for the settings table.
	 *
	 * Legacy or partially migrated rules without a field are displayed under
	 * Editing Status so they remain visible and editable instead of disappearing.
	 */
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

	/**
	 * Cleans saved rule values before rendering the settings table.
	 *
	 * This migrates legacy emoji-prefixed values out of the stored Value field.
	 * The icon, shape, and colour columns remain responsible for the visual
	 * status marker shown in settings previews and the File Explorer.
	 */
	private normalizeRuleValues(): void {
		let changed = false;

		for (const rule of this.plugin.settings.rules) {
			const normalizedValue = this.normalizeStatusValue(rule.value);

			if (rule.value !== normalizedValue) {
				rule.value = normalizedValue;
				changed = true;
			}
		}

		if (changed) {
			void this.plugin.saveSettings();
		}
	}

	/**
	 * Removes leading status emoji from metadata values shown or stored by the
	 * settings UI.
	 */
	private normalizeStatusValue(value: string): string {
		return value
			.replace(/^[\s🔴🟠🟢🟡🔵🟣⚫⚪🟤]+/u, '')
			.trim();
	}

	/**
	 * Updates a row preview to mirror the current rule toggles.
	 *
	 * The preview intentionally shows the raw metadata value as the text and
	 * uses icon/colour settings for the visual effect, matching how note and
	 * folder rows will appear in the File Explorer.
	 */
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
