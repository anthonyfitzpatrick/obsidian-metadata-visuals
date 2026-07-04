import {
	App,
	ButtonComponent,
	ColorComponent,
	DropdownComponent,
	ExtraButtonComponent,
	Notice,
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

const WORKFLOW_VALUE_ORDER = ['To Do', 'In Progress', 'Done'];
const WORKFLOW_VALUE_COLORS: Record<string, string> = {
	'To Do': '#e03131',
	'In Progress': '#f08c00',
	Done: '#2f9e44',
};

interface FieldDefinitionImportResult {
	foundDefinitions: boolean;
	changed: boolean;
}

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
	private hasAttemptedInitialFieldImport = false;

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

		this.normalizeRuleValues();
		this.normalizeAllowedValues();
		this.ensureDefaultRules();
		this.importFieldDefinitionsOnFirstDisplay();

		const fields = this.getKnownMetadataFields();

		containerEl.empty();

		const headerEl = containerEl.createDiv('metadata-labels-settings-header');

		headerEl.createDiv({
			cls: 'metadata-labels-settings-title',
			text: 'Metadata Labels',
		});
		headerEl.createDiv({
			cls: 'metadata-labels-settings-description',
			text: 'Create visual labels from frontmatter metadata.',
		});

		const actionsEl = containerEl.createDiv('metadata-labels-actions');
		const actionsTextEl = actionsEl.createDiv('metadata-labels-actions-text');
		const actionsControlsEl = actionsEl.createDiv('metadata-labels-actions-controls');
		const existingGroupFields = new Set(
			Array.from(this.groupRulesByField().keys()),
		);
		const availableNewFields = fields.filter((field) => !existingGroupFields.has(field));
		let selectedNewField = '';
		let addRuleButtonEl: HTMLButtonElement | null = null;

		actionsTextEl.createDiv({
			cls: 'metadata-labels-actions-title',
			text: 'Rules',
		});
		actionsTextEl.createDiv({
			cls: 'metadata-labels-actions-description',
			text: 'Create a label group from a known metadata field.',
		});

		const metadataToggleEl = actionsControlsEl.createEl('label', {
			cls: 'metadata-labels-action-toggle',
		});
		const metadataToggle = new Setting(metadataToggleEl)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.colourMetadata)
					.onChange(async (value) => {
						this.plugin.settings.colourMetadata = value;
						await this.plugin.saveSettings();
					});
				toggle.toggleEl.setAttribute('aria-label', 'Colour note metadata');
			});
		metadataToggle.settingEl.addClass('metadata-labels-control-setting');
		metadataToggleEl.createSpan({
			cls: 'metadata-labels-inline-toggle-label',
			text: 'Colour note metadata',
		});

		const fieldSelectorEl = actionsControlsEl.createDiv('metadata-labels-action-field');
		fieldSelectorEl.createSpan({
			cls: 'metadata-labels-action-field-label',
			text: 'Field',
		});
		const fieldSelector = new TextComponent(fieldSelectorEl);
		this.configureFieldSelector(
			fieldSelector,
			selectedNewField,
			availableNewFields,
			(value) => {
				selectedNewField = value;
				if (addRuleButtonEl) {
					addRuleButtonEl.disabled = selectedNewField === '';
				}
			},
		);
		fieldSelector.setPlaceholder('Select');

		const addRuleButton = new ButtonComponent(actionsControlsEl)
			.setButtonText('Add rule')
			.onClick(async () => {
				if (selectedNewField === '') {
					return;
				}

				const importResult = await this.importFieldDefinitions();
				const existingFields = new Set(
					Array.from(this.groupRulesByField().keys())
						.filter((field) => field !== selectedNewField),
				);
				const refreshedFields = this.getKnownMetadataFields()
					.filter((field) => !existingFields.has(field));

				if (!refreshedFields.includes(selectedNewField)) {
					selectedNewField = '';
					this.display();
					return;
				}

				if (importResult.foundDefinitions) {
					new Notice('Imported field definitions.');
				} else {
					new Notice('No field definitions found; using values found in notes.');
				}

				this.setCollapsedRuleGroup(selectedNewField, false);
				this.plugin.settings.rules.push(...this.createRulesForFieldValues(selectedNewField));
				await this.plugin.saveSettings();
				this.display();
			});

		addRuleButtonEl = addRuleButton.buttonEl;
		addRuleButtonEl.disabled = selectedNewField === '';
		addRuleButtonEl.addClass('metadata-labels-action-button');

		for (const [field, rules] of this.groupRulesByField()) {
			this.renderRuleGroup(containerEl, field, rules);
		}
	}

	/**
	 * Quietly imports known external field definitions the first time settings
	 * open.
	 *
	 * The Add rule selector is intentionally blank until the user chooses a
	 * field, but it still needs to know about fields whose possible values live
	 * in an external definition file and have not appeared in frontmatter yet.
	 * This one-time import keeps the UI standalone after the definitions are
	 * copied into Metadata Labels data, and it avoids showing a notice just for
	 * opening settings.
	 */
	private importFieldDefinitionsOnFirstDisplay(): void {
		if (this.hasAttemptedInitialFieldImport) {
			return;
		}

		this.hasAttemptedInitialFieldImport = true;
		void this.importFieldDefinitions().then((result) => {
			if (result.changed) {
				this.display();
			}
		});
	}

	/**
	 * Renders one metadata field group, such as "Editing Status".
	 *
	 * Each group shows its metadata field as read-only text, the "Apply to
	 * enabled folders" smart folder toggle, the exclusive "Use for File Explorer"
	 * toggle, and a Delete rule button that removes the entire group. Field
	 * selection happens only when creating a new group.
	 */
	private renderRuleGroup(
		containerEl: HTMLElement,
		field: string,
		rules: MetadataLabelRule[],
	): void {
		const groupEl = containerEl.createDiv('metadata-labels-rule-group');
		const headerEl = groupEl.createDiv('metadata-labels-rule-group-header');
		const titleEl = headerEl.createDiv('metadata-labels-rule-group-title');
		const controlsEl = headerEl.createDiv('metadata-labels-rule-group-controls');
		const actionsEl = headerEl.createDiv('metadata-labels-rule-group-actions');
		const isCollapsed = this.isRuleGroupCollapsed(field);

		groupEl.toggleClass('is-collapsed', isCollapsed);
		headerEl.addEventListener('click', (event) => {
			if (this.isInteractiveHeaderClick(event)) {
				return;
			}

			void this.setRuleGroupCollapsed(field, !this.isRuleGroupCollapsed(field));
		});

		const fieldTitleEl = titleEl.createDiv('metadata-labels-field-title-row');
		const disclosureEl = fieldTitleEl.createSpan({
			cls: 'metadata-labels-rule-group-disclosure',
			text: isCollapsed ? '▸' : '▾',
		});
		fieldTitleEl.createSpan({
			cls: 'metadata-labels-field-name',
			text: field,
		});

		disclosureEl.setAttribute('aria-hidden', 'true');
		titleEl.createDiv({
			cls: 'metadata-labels-field-count',
			text: `${rules.length} ${rules.length === 1 ? 'label' : 'labels'}`,
		});

		new Setting(controlsEl)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.fileExplorerField === field)
					.onChange(async (value) => {
						if (value) {
							this.plugin.settings.fileExplorerField = field;
						} else if (this.plugin.settings.fileExplorerField === field) {
							this.plugin.settings.fileExplorerField = '';
						}

						await this.plugin.saveSettings();
						this.display();
					});
				toggle.toggleEl.setAttribute('aria-label', 'Use for File Explorer');
				toggle.toggleEl.insertAdjacentElement(
					'afterend',
					createSpan({
						cls: 'metadata-labels-inline-toggle-label',
						text: 'Use for File Explorer',
					}),
				);
			})
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
						cls: 'metadata-labels-inline-toggle-label',
						text: 'Apply to enabled folders',
					}),
				);
			});

		new Setting(actionsEl)
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

						this.setCollapsedRuleGroup(field, false);
						await this.plugin.saveSettings();
						this.display();
					});
			});

		if (isCollapsed) {
			return;
		}

		const tableEl = groupEl.createDiv('metadata-labels-rule-table');
		const tableHeaderEl = tableEl.createDiv('metadata-labels-rule-table-header');

		for (const label of ['Drag', 'Value', 'Shape', 'Colour', 'Icon', 'Name', 'Target', 'Preview', 'Del']) {
			tableHeaderEl.createDiv({
				cls: 'metadata-labels-rule-table-heading',
				text: label,
			});
		}

		for (const [index, rule] of rules.entries()) {
			this.renderRule(tableEl, rule, rules, index);
		}
	}

	/**
	 * Returns whether a field group is currently collapsed in the settings UI.
	 */
	private isRuleGroupCollapsed(field: string): boolean {
		return this.plugin.settings.collapsedRuleGroups.includes(field);
	}

	/**
	 * Persists one field group's collapsed/expanded state.
	 */
	private setCollapsedRuleGroup(field: string, collapsed: boolean): void {
		const collapsedRuleGroups = this.plugin.settings.collapsedRuleGroups;

		if (collapsed) {
			if (!collapsedRuleGroups.includes(field)) {
				collapsedRuleGroups.push(field);
				collapsedRuleGroups.sort((a, b) => a.localeCompare(b));
			}

			return;
		}

		this.plugin.settings.collapsedRuleGroups = collapsedRuleGroups
			.filter((collapsedField) => collapsedField !== field);
	}

	/**
	 * Updates one group's collapsed state and redraws the settings page.
	 */
	private async setRuleGroupCollapsed(field: string, collapsed: boolean): Promise<void> {
		this.setCollapsedRuleGroup(field, collapsed);
		await this.plugin.saveSettings();
		this.display();
	}

	/**
	 * Prevents clicks on real controls from also toggling the disclosure state.
	 */
	private isInteractiveHeaderClick(event: MouseEvent): boolean {
		const targetEl = event.target;

		return targetEl instanceof HTMLElement
			&& targetEl.closest([
				'input',
				'button',
				'select',
				'textarea',
				'a',
				'.clickable-icon',
				'.metadata-labels-rule-group-controls',
				'.metadata-labels-rule-group-actions',
			].join(', ')) !== null;
	}

	/**
	 * Renders one compact table row for one field/value rule.
	 *
	 * The row exposes only the raw metadata value, visual shape, colour, icon and
	 * filename toggles, target, preview, and row delete action. The preview uses
	 * the same icon and filename-colour toggles so the user can see the File
	 * Explorer effect before matching any note.
	 */
	private renderRule(
		tableEl: HTMLElement,
		rule: MetadataLabelRule,
		rules: MetadataLabelRule[],
		index: number,
	): void {
		const rowEl = tableEl.createDiv('metadata-labels-rule-table-row');
		const dragEl = rowEl.createDiv('metadata-labels-rule-table-cell metadata-labels-drag-cell');
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

		dragEl.setAttribute('data-label', 'Drag');
		valueEl.setAttribute('data-label', 'Value');
		iconEl.setAttribute('data-label', 'Shape');
		colorEl.setAttribute('data-label', 'Colour');
		showIconEl.setAttribute('data-label', 'Icon');
		colourNameEl.setAttribute('data-label', 'Name');
		targetEl.setAttribute('data-label', 'Target');
		previewEl.setAttribute('data-label', 'Preview');
		deleteEl.setAttribute('data-label', 'Del');

		this.configureDragHandle(rowEl, dragEl, rules, index);
		this.updatePreview(previewIconEl, previewTextEl, rule);

		valueEl.createSpan({
			cls: 'metadata-labels-value-text',
			text: rule.value || 'New label',
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
	 * Configures native browser drag/drop for one table row.
	 *
	 * Dragging is limited to the current metadata field group because the
	 * handler receives that group's rules array and only moves rows between
	 * indexes inside it. The stored settings array is reordered directly so the
	 * matcher continues to use the same persisted order after restart.
	 */
	private configureDragHandle(
		rowEl: HTMLElement,
		dragEl: HTMLElement,
		rules: MetadataLabelRule[],
		index: number,
	): void {
		const handleEl = dragEl.createSpan({
			cls: 'metadata-labels-drag-handle',
			text: '☰',
		});

		handleEl.setAttribute('aria-label', 'Drag rule');
		handleEl.setAttribute('title', 'Drag rule');
		rowEl.draggable = true;

		rowEl.addEventListener('dragstart', (event) => {
			rowEl.addClass('metadata-labels-rule-row-dragging');
			event.dataTransfer?.setData('text/plain', String(index));
			event.dataTransfer?.setDragImage(rowEl, 12, 12);
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = 'move';
			}
		});

		rowEl.addEventListener('dragend', () => {
			rowEl.removeClass('metadata-labels-rule-row-dragging');
		});

		rowEl.addEventListener('dragover', (event) => {
			event.preventDefault();
			rowEl.addClass('metadata-labels-rule-row-drop-target');
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = 'move';
			}
		});

		rowEl.addEventListener('dragleave', () => {
			rowEl.removeClass('metadata-labels-rule-row-drop-target');
		});

		rowEl.addEventListener('drop', (event) => {
			event.preventDefault();
			rowEl.removeClass('metadata-labels-rule-row-drop-target');

			const fromIndex = Number(event.dataTransfer?.getData('text/plain'));

			if (!Number.isInteger(fromIndex) || fromIndex === index) {
				return;
			}

			this.moveRuleWithinGroup(rules, fromIndex, index);
			void this.plugin.saveSettings().then(() => this.display());
		});
	}

	/**
	 * Moves one rule within its metadata-field group by splicing the underlying
	 * plugin.settings.rules array.
	 *
	 * The matcher already respects settings order, so persisting the reordered
	 * array is enough for both immediate preview redraws and restart persistence.
	 */
	private moveRuleWithinGroup(
		rules: MetadataLabelRule[],
		fromIndex: number,
		toIndex: number,
	): void {
		const movedRule = rules[fromIndex];
		const targetRule = rules[toIndex];

		if (!movedRule || !targetRule) {
			return;
		}

		const currentIndex = this.plugin.settings.rules.indexOf(movedRule);
		const targetIndex = this.plugin.settings.rules.indexOf(targetRule);

		if (currentIndex < 0 || targetIndex < 0) {
			return;
		}

		const [removedRule] = this.plugin.settings.rules.splice(currentIndex, 1);

		if (!removedRule) {
			return;
		}

		const insertionIndex = this.plugin.settings.rules.indexOf(targetRule);

		if (insertionIndex < 0) {
			this.plugin.settings.rules.splice(currentIndex, 0, removedRule);
			return;
		}

		this.plugin.settings.rules.splice(insertionIndex, 0, removedRule);
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
		this.plugin.settings.allowedValues['Editing Status'] = ['To Do', 'In Progress', 'Done'];

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
			color: WORKFLOW_VALUE_COLORS[value] ?? createDefaultRule().color,
			colourFilename: true,
			showIcon: true,
			target: 'both',
		};
	}

	/**
	 * Creates a complete rule group from every known value for a field.
	 *
	 * Rule rows are no longer manually added inside a group. A group is born
	 * from the field's available value list, which is why Add rule performs an
	 * import refresh before calling this method. The optional existingRules
	 * argument is retained for migration/rebuild scenarios where visual row
	 * configuration should be copied by matching normalised values.
	 */
	private createRulesForFieldValues(
		field: string,
		existingRules: MetadataLabelRule[] = [],
	): MetadataLabelRule[] {
		const values = this.getRuleValuesForField(field);
		const existingRulesByValue = new Map(
			existingRules.map((rule) => [this.normalizeStatusValue(rule.value), rule]),
		);

		if (values.length === 0) {
			const existingBlankRule = existingRulesByValue.get('');

			return [existingBlankRule
				? this.copyRuleForField(existingBlankRule, field, '')
				: this.createRuleForField(field)];
		}

		return values.map((value) => {
			const existingRule = existingRulesByValue.get(value);

			return existingRule
				? this.copyRuleForField(existingRule, field, value)
				: this.createRuleForField(field, value);
		});
	}

	/**
	 * Copies an existing row's visual configuration onto a regenerated field
	 * value.
	 *
	 * The new id is deliberate: the regenerated row represents a fresh field/
	 * value slot even though it inherits visual choices such as icon, colour,
	 * target, and filename colouring from a previous row.
	 */
	private copyRuleForField(
		rule: MetadataLabelRule,
		field: string,
		value: string,
	): MetadataLabelRule {
		return {
			...rule,
			id: crypto.randomUUID(),
			field,
			value,
		};
	}

	/**
	 * Returns the values available for rule rows under a field.
	 *
	 * Plugin-owned registry values and discovered frontmatter values are merged.
	 * The registry is populated by first-run defaults, migrations, and optional
	 * one-time imports from external field-definition files. Once imported, the
	 * plugin no longer needs the source plugin or file to remain installed.
	 */
	private getRuleValuesForField(field: string): string[] {
		return this.sortMetadataValues(this.deduplicateValues([
			...this.getConfiguredValuesForField(field),
			...this.getFrontmatterValues(field),
		]).filter((value) => value !== ''));
	}

	/**
	 * Returns non-empty configured potential values for a field.
	 */
	private getConfiguredValuesForField(field: string): string[] {
		return this.getAllowedValues(field)
			.filter((value) => value !== '');
	}

	/**
	 * Returns the plugin-owned allowed values for a field.
	 */
	private getAllowedValues(field: string): string[] {
		return this.plugin.settings.allowedValues[field] ?? [];
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
	 * Builds the metadata-field selector source.
	 *
	 * Core Obsidian only knows fields already used in notes, while Metadata
	 * Labels can also know imported field definitions. Merging both sources lets
	 * Add rule offer fields whose possible values were imported but are not yet
	 * present in any note frontmatter.
	 */
	private getKnownMetadataFields(): string[] {
		const fields = new Set<string>(this.getFrontmatterFields());

		for (const field of Object.keys(this.plugin.settings.allowedValues)) {
			const normalizedField = field.trim();

			if (normalizedField) {
				fields.add(normalizedField);
			}
		}

		return Array.from(fields).sort((a, b) => a.localeCompare(b));
	}

	/**
	 * Imports external field definitions into this plugin's own value registry.
	 *
	 * The import is deliberately one-time and optional. Metadata Labels reads
	 * known local definition files when they are available, copies field names
	 * and configured values into its own data.json, and then operates
	 * independently from that point onward.
	 */
	private async importFieldDefinitions(): Promise<FieldDefinitionImportResult> {
		const definitions = await this.readMetadataMenuFieldDefinitions();

		if (definitions.size === 0) {
			return {
				changed: false,
				foundDefinitions: false,
			};
		}

		let changed = false;

		for (const [field, values] of definitions) {
			const existingValues = this.plugin.settings.allowedValues[field] ?? [];
			const mergedValues = this.sortMetadataValues(
				this.deduplicateValues([...existingValues, ...values])
					.filter((value) => value !== ''),
			);
			const shouldStoreField = !(field in this.plugin.settings.allowedValues)
				|| existingValues.join('\u0000') !== mergedValues.join('\u0000');

			if (shouldStoreField) {
				this.plugin.settings.allowedValues[field] = mergedValues;
				changed = true;
			}
		}

		if (changed) {
			await this.plugin.saveSettings();
		}

		return {
			changed,
			foundDefinitions: true,
		};
	}

	/**
	 * Reads Metadata Menu's data file when it exists and extracts preset fields.
	 *
	 * This is an import adapter, not a runtime dependency. The code uses only
	 * Obsidian's vault adapter and defensive JSON parsing so the plugin remains
	 * compatible with Obsidian 1.12.7 and continues to work if Metadata Menu is
	 * absent, disabled, or later removed.
	 */
	private async readMetadataMenuFieldDefinitions(): Promise<Map<string, string[]>> {
		const definitionsPaths = Array.from(new Set([
			`${this.app.vault.configDir}/plugins/metadata-menu/data.json`,
			['.obsidian', 'plugins', 'metadata-menu', 'data.json'].join('/'),
		]));

		for (const definitionsPath of definitionsPaths) {
			if (!(await this.app.vault.adapter.exists(definitionsPath))) {
				continue;
			}

			try {
				return this.parseMetadataMenuData(
					JSON.parse(await this.app.vault.adapter.read(definitionsPath)) as unknown,
				);
			} catch {
				return new Map();
			}
		}

		return new Map();
	}

	/**
	 * Extracts field names and configured value lists from Metadata Menu data.
	 *
	 * The inspected Metadata Menu data.json stores an array at presetFields. Each
	 * field has a name, and Select fields store their configured possible values
	 * in options.valuesList as an object whose numeric string keys preserve the
	 * configured order. This parser supports that structure directly and ignores
	 * malformed entries so a bad external data file cannot corrupt Metadata
	 * Labels settings.
	 */
	private parseMetadataMenuData(data: unknown): Map<string, string[]> {
		const definitions = new Map<string, string[]>();

		if (!this.isRecord(data) || !Array.isArray(data.presetFields)) {
			return definitions;
		}

		for (const presetField of data.presetFields) {
			if (!this.isRecord(presetField) || typeof presetField.name !== 'string') {
				continue;
			}

			const field = presetField.name.trim();

			if (!field) {
				continue;
			}

			definitions.set(
				field,
				this.sortMetadataValues(
					this.deduplicateValues(this.getMetadataMenuValues(presetField))
						.filter((value) => value !== ''),
				),
			);
		}

		return definitions;
	}

	/**
	 * Returns configured possible values from a Metadata Menu preset field.
	 *
	 * The actual Metadata Menu file in this vault uses:
	 *
	 * options: {
	 *   sourceType: "ValuesList",
	 *   valuesList: { "1": "First Draft", "2": "Published" }
	 * }
	 *
	 * Sorting by numeric keys keeps values such as Editing Stage in the order
	 * configured by the source before they are copied into Metadata Labels.
	 */
	private getMetadataMenuValues(presetField: Record<string, unknown>): string[] {
		const options = presetField.options;

		if (!this.isRecord(options)) {
			return [];
		}

		const valuesList = options.valuesList;

		if (Array.isArray(valuesList)) {
			return valuesList.filter((value): value is string => typeof value === 'string');
		}

		if (this.isRecord(valuesList)) {
			return Object.entries(valuesList)
				.sort(([keyA], [keyB]) => Number(keyA) - Number(keyB))
				.map(([, value]) => value)
				.filter((value): value is string => typeof value === 'string');
		}

		return [];
	}

	/**
	 * Narrowing helper for parsed JSON data from optional external sources.
	 */
	private isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null;
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

		return this.sortMetadataValues(Array.from(values));
	}

	/**
	 * Sorts field values for predictable rule generation and selector display.
	 *
	 * Common workflow statuses are promoted to the top in the same order writers
	 * expect to see them, while every other value remains alphabetical.
	 */
	private sortMetadataValues(values: string[]): string[] {
		return values.sort((a, b) => {
			const workflowIndexA = WORKFLOW_VALUE_ORDER.indexOf(a);
			const workflowIndexB = WORKFLOW_VALUE_ORDER.indexOf(b);
			const hasWorkflowA = workflowIndexA >= 0;
			const hasWorkflowB = workflowIndexB >= 0;

			if (hasWorkflowA && hasWorkflowB) {
				return workflowIndexA - workflowIndexB;
			}

			if (hasWorkflowA) {
				return -1;
			}

			if (hasWorkflowB) {
				return 1;
			}

			return a.localeCompare(b);
		});
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
	 * Cleans all plugin-owned allowed values before rendering controls.
	 *
	 * This keeps data.json standalone and predictable: values are normalised,
	 * duplicates are removed, and default Editing Status values are added when
	 * needed for existing Editing Status rule groups.
	 */
	private normalizeAllowedValues(): void {
		let changed = false;

		for (const [field, values] of Object.entries(this.plugin.settings.allowedValues)) {
			const normalizedValues = this.deduplicateValues(values);

			if (values.join('\u0000') !== normalizedValues.join('\u0000')) {
				this.plugin.settings.allowedValues[field] = normalizedValues;
				changed = true;
			}
		}

		if (
			this.plugin.settings.rules.some((rule) => rule.field === 'Editing Status')
			&& !this.plugin.settings.allowedValues['Editing Status']
		) {
			this.plugin.settings.allowedValues['Editing Status'] = ['To Do', 'In Progress', 'Done'];
			changed = true;
		}

		if (changed) {
			void this.plugin.saveSettings();
		}
	}

	/**
	 * Normalises and deduplicates value lists while preserving input order.
	 *
	 * Blank values are kept only for callers that are working with an active
	 * placeholder row. Rule generation and imports filter blanks back out before
	 * saving registry values.
	 */
	private deduplicateValues(values: string[]): string[] {
		const deduplicatedValues: string[] = [];
		let hasBlankValue = false;

		for (const value of values) {
			const normalizedValue = this.normalizeStatusValue(value);

			if (!normalizedValue) {
				hasBlankValue = true;
				continue;
			}

			if (!deduplicatedValues.includes(normalizedValue)) {
				deduplicatedValues.push(normalizedValue);
			}
		}

		if (hasBlankValue) {
			deduplicatedValues.push('');
		}

		return deduplicatedValues;
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
