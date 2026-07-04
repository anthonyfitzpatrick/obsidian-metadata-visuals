import {
	Menu,
	Notice,
	Plugin,
	TAbstractFile,
	TFile,
	TFolder,
	parseYaml,
	stringifyYaml,
} from 'obsidian';

import type { MenuItem } from 'obsidian';

import { FileExplorerIconRenderer } from './services/file-explorer-icon-renderer';
import { MetadataRuleMatcher } from './services/metadata-rule-matcher';
import { MetadataLabelsSettingsTab } from './settings-tab';
import {
	DEFAULT_SETTINGS,
	MetadataLabelRule,
	MetadataLabelRuleTarget,
	MetadataLabelsSettings,
} from './types';

/**
 * Main Obsidian plugin entry point.
 *
 * This class owns the durable plugin settings, wires together the matcher,
 * renderer, and settings tab, and registers every Obsidian event that can
 * affect File Explorer labels. The actual matching and DOM rendering are kept
 * in separate services so this file stays focused on lifecycle, persistence,
 * context menu actions, and bulk metadata writes.
 */
export default class MetadataLabelsPlugin extends Plugin {
	settings: MetadataLabelsSettings = DEFAULT_SETTINGS;
	private matcher!: MetadataRuleMatcher;
	private explorerIcons!: FileExplorerIconRenderer;

	/**
	 * Loads settings, constructs the collaborating services, and subscribes to
	 * vault/workspace events that should refresh labels.
	 *
	 * Notes refresh when metadata changes. Smart folders refresh when metadata,
	 * file structure, or File Explorer layout changes because their visual state
	 * is calculated from descendant note metadata rather than from a folder note.
	 */
	async onload(): Promise<void> {
		await this.loadSettings();

		this.matcher = new MetadataRuleMatcher(this.app, () => this.settings.rules);
		this.explorerIcons = new FileExplorerIconRenderer(
			this.app,
			this.matcher,
			() => this.settings.rules,
			() => this.settings.smartFolders,
			() => this.settings.smartFolderFields,
		);

		this.addSettingTab(new MetadataLabelsSettingsTab(this.app, this));

		this.registerEvent(
			this.app.metadataCache.on('changed', (file) => {
				this.refreshFile(file);
				this.explorerIcons.scheduleRefreshAll();
			}),
		);

		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (file instanceof TFile) {
					this.explorerIcons.clearPath(oldPath);
					this.refreshFile(file);
					this.explorerIcons.scheduleRefreshAll();
				} else if (file instanceof TFolder) {
					this.renameSmartFolder(oldPath, file.path);
					this.explorerIcons.scheduleRefreshAll();
				}
			}),
		);

		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile) {
					this.explorerIcons.clearPath(file.path);
					this.explorerIcons.scheduleRefreshAll();
				} else if (file instanceof TFolder) {
					this.removeSmartFolder(file.path);
					this.explorerIcons.clearPath(file.path);
					this.explorerIcons.scheduleRefreshAll();
				}
			}),
		);

		this.registerEvent(
			this.app.vault.on('create', () => {
				this.explorerIcons.scheduleRefreshAll();
			}),
		);

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				this.addMetadataLabelsMenuItem(menu, [file], file);
			}),
		);

		this.registerEvent(
			this.app.workspace.on('files-menu', (menu, files) => {
				this.addMetadataLabelsMenuItem(menu, files);
			}),
		);

		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.explorerIcons.scheduleRefreshAll();
			}),
		);

		this.app.workspace.onLayoutReady(() => {
			this.explorerIcons.start();
			this.explorerIcons.scheduleRefreshAll();
		});
	}

	/**
	 * Removes all DOM decorations installed by the renderer before Obsidian
	 * unloads the plugin. This prevents stale icons or inline filename colours
	 * from remaining in the File Explorer after the plugin is disabled.
	 */
	onunload(): void {
		this.explorerIcons?.clearAll();
	}

	/**
	 * Reads persisted JSON data and migrates it into the current settings shape.
	 *
	 * The spread with DEFAULT_SETTINGS is deliberately retained even though
	 * parseSettings already returns all current properties. It protects future
	 * additions by ensuring newly introduced settings always receive defaults
	 * when loading older plugin data.
	 */
	async loadSettings(): Promise<void> {
		const savedSettings = this.parseSettings(await this.loadData());

		this.settings = {
			...DEFAULT_SETTINGS,
			...savedSettings,
			rules: savedSettings.rules,
			smartFolders: savedSettings.smartFolders,
			smartFolderFields: savedSettings.smartFolderFields,
		};
	}

	/**
	 * Persists plugin settings and schedules a visual refresh.
	 *
	 * Saving settings can change matching rules, filename colour behaviour,
	 * smart-folder enablement, or folder inheritance fields, so the renderer is
	 * asked to recompute the File Explorer after the write completes.
	 */
	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.explorerIcons.scheduleRefreshAll();
	}

	/**
	 * Refreshes a single file row when Obsidian reports a file-level event.
	 *
	 * Non-markdown files cannot have Obsidian frontmatter metadata, so any
	 * decoration for that path is cleared instead of trying to match rules.
	 */
	private refreshFile(file: TFile): void {
		if (file.extension !== 'md') {
			this.explorerIcons.clearPath(file.path);
			return;
		}

		this.explorerIcons.refreshFile(file);
	}

	/**
	 * Converts unknown persisted plugin data into safe, current settings.
	 *
	 * This is the plugin's data migration layer. It ignores malformed rules,
	 * normalises old emoji-prefixed status defaults such as "🔴 To Do" into
	 * "To Do", and supplies defaults for fields added after earlier releases:
	 * colourFilename defaults to true, showIcon defaults to true, and target
	 * defaults to "both". Smart folder field enablement is also backfilled for
	 * older users who already had Editing Status rules before the per-field
	 * smart-folder toggle existed.
	 */
	private parseSettings(data: unknown): MetadataLabelsSettings {
		if (!this.isRecord(data) || !Array.isArray(data.rules)) {
			return { rules: [], smartFolders: [], smartFolderFields: [] };
		}

		const rules = data.rules
			.filter((rule) => this.isMetadataLabelRuleData(rule))
			.map((rule) => ({
				...rule,
				value: this.normalizeStatusValue(rule.value),
				colourFilename: typeof rule.colourFilename === 'boolean'
					? rule.colourFilename
					: true,
				showIcon: typeof rule.showIcon === 'boolean'
					? rule.showIcon
					: true,
				target: this.parseRuleTarget(rule.target),
			}));

		return {
			rules,
			smartFolders: Array.isArray(data.smartFolders)
				? data.smartFolders.filter((path): path is string => typeof path === 'string')
				: [],
			smartFolderFields: Array.isArray(data.smartFolderFields)
				? data.smartFolderFields.filter((field): field is string => typeof field === 'string')
				: this.getDefaultSmartFolderFields(rules),
		};
	}

	/**
	 * Runtime guard for persisted rule objects.
	 *
	 * Obsidian plugin data is untyped JSON. This method accepts the required
	 * fields from all supported historical rule versions and lets parseSettings
	 * fill in optional fields that may be missing from older saved data.
	 */
	private isMetadataLabelRuleData(
		value: unknown,
	): value is Omit<MetadataLabelRule, 'colourFilename' | 'showIcon' | 'target'>
		& Partial<Pick<MetadataLabelRule, 'colourFilename' | 'showIcon' | 'target'>> {
		return this.isRecord(value)
			&& typeof value.id === 'string'
			&& typeof value.field === 'string'
			&& typeof value.value === 'string'
			&& typeof value.icon === 'string'
			&& typeof value.color === 'string';
	}

	/**
	 * Narrowing helper for unknown JSON-like values.
	 */
	private isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null;
	}

	/**
	 * Normalises legacy visual status values into the raw metadata value used
	 * by current rules.
	 *
	 * Early defaults stored values like "🔴 To Do" directly in the rule value.
	 * Current rules store "To Do" and keep the visual shape/colour separately.
	 * Removing only leading whitespace and status-colour emoji keeps matching
	 * backwards compatible with notes that still contain emoji-prefixed values.
	 */
	private normalizeStatusValue(value: string): string {
		return value
			.replace(/^[\s🔴🟠🟢🟡🔵🟣⚫⚪🟤]+/u, '')
			.trim();
	}

	/**
	 * Safely parses a persisted target value.
	 *
	 * Unknown values fall back to "both" so older or manually edited data keeps
	 * producing visible labels instead of silently disabling a rule.
	 */
	private parseRuleTarget(value: unknown): MetadataLabelRuleTarget {
		if (value === 'notes' || value === 'folders' || value === 'both') {
			return value;
		}

		return 'both';
	}

	/**
	 * Backfills smart folder inheritance for older settings.
	 *
	 * Before smart folder inheritance was controlled per metadata field, the
	 * Editing Status group was the only supported smart-folder source. Returning
	 * Editing Status here preserves that behaviour for existing users while new
	 * installs still start with no smart folder paths enabled.
	 */
	private getDefaultSmartFolderFields(rules: MetadataLabelRule[]): string[] {
		return rules.some((rule) => rule.field === 'Editing Status')
			? ['Editing Status']
			: [];
	}

	/**
	 * Adds the top-level "Metadata Labels" context-menu item for File Explorer
	 * single-item and multi-item menus.
	 *
	 * Folder right-clicks include the smart-folder enable/disable action.
	 * Every note/folder selection also receives bulk metadata update submenus
	 * generated from the current rule list.
	 */
	private addMetadataLabelsMenuItem(
		menu: Menu,
		files: TAbstractFile[],
		clickedFile?: TAbstractFile,
	): void {
		menu.addItem((item) => {
			item
				.setTitle('Metadata Labels')
				.setIcon('tags');

			const submenu = this.getSubmenu(item);

			if (submenu) {
				if (clickedFile instanceof TFolder) {
					this.addSmartFolderAction(submenu, clickedFile);
				}

				this.addBulkUpdateActions(submenu, files);
			}
		});
	}

	/**
	 * Adds the folder-specific smart folder toggle action.
	 *
	 * The folder path remains stored internally in settings.smartFolders. The
	 * settings UI controls which metadata fields participate in inheritance,
	 * while this context-menu action controls which folder paths are enabled.
	 */
	private addSmartFolderAction(
		menu: Menu,
		folder: TFolder,
	): void {
		const enabled = this.settings.smartFolders.includes(folder.path);

		menu.addItem((item) => {
			item
				.setTitle(enabled ? 'Disable smart folder rule' : 'Enable smart folder rule')
				.setIcon(enabled ? 'folder-x' : 'folder-check')
				.onClick(async () => {
					if (enabled) {
						this.removeSmartFolder(folder.path);
						this.explorerIcons.clearPath(folder.path);
					} else {
						this.addSmartFolder(folder.path);
					}

					await this.saveSettings();
					this.explorerIcons.scheduleRefreshAll();
				});
		});
	}

	/**
	 * Adds bulk metadata update submenus based on configured rule groups.
	 *
	 * For a field such as Editing Status, the menu becomes:
	 * Metadata Labels > Apply Editing Status > To Do / In Progress / Done.
	 * Values are taken from rule.value, which is the raw frontmatter value, not
	 * the icon, emoji, preview text, or colour.
	 */
	private addBulkUpdateActions(menu: Menu, files: TAbstractFile[]): void {
		const ruleGroups = this.getBulkUpdateRuleGroups();

		for (const [field, rules] of ruleGroups) {
			menu.addItem((item) => {
				item
					.setTitle(`Apply ${field}`)
					.setIcon('list-checks');

				const submenu = this.getSubmenu(item);

				if (!submenu) {
					return;
				}

				for (const rule of rules) {
					submenu.addItem((valueItem) => {
						valueItem
							.setTitle(rule.value)
							.setIcon(rule.icon)
							.onClick(async () => {
								await this.applyBulkMetadataValue(files, field, rule.value);
							});
					});
				}
			});
		}
	}

	/**
	 * Groups current rules by metadata field for the bulk update menu.
	 *
	 * Empty placeholder rules are skipped, and duplicate values within the same
	 * field are collapsed so the user does not see repeated menu actions.
	 */
	private getBulkUpdateRuleGroups(): Map<string, MetadataLabelRule[]> {
		const groups = new Map<string, MetadataLabelRule[]>();

		for (const rule of this.settings.rules) {
			const field = rule.field.trim();
			const value = rule.value.trim();

			if (!field || !value) {
				continue;
			}

			const rules = groups.get(field) ?? [];

			if (!rules.some((existingRule) => existingRule.value === value)) {
				rules.push(rule);
			}

			groups.set(field, rules);
		}

		return groups;
	}

	/**
	 * Applies a selected rule value to every markdown note represented by a
	 * File Explorer selection.
	 *
	 * Selected folders expand to all descendant markdown notes. A Map keyed by
	 * path deduplicates overlapping folder selections so each note is written at
	 * most once. After writing, changed note rows are refreshed immediately and a
	 * full refresh is scheduled so smart folders can recalculate from metadata.
	 */
	private async applyBulkMetadataValue(
		files: TAbstractFile[],
		field: string,
		value: string,
	): Promise<void> {
		const markdownFiles = this.getMarkdownFilesFromSelection(files);

		try {
			for (const file of markdownFiles) {
				await this.updateFrontmatterValue(file, field, value);
				this.refreshFile(file);
			}

			this.explorerIcons.scheduleRefreshAll();
		} catch (error) {
			console.error('Metadata Labels: failed to update metadata.', error);
			new Notice('Metadata Labels: failed to update metadata.');
		}
	}

	/**
	 * Reads, updates, and writes a markdown note's frontmatter.
	 *
	 * This intentionally uses Vault.read and Vault.modify instead of
	 * FileManager.processFrontMatter because the plugin keeps minAppVersion at
	 * 1.0.0. The newer helper is convenient, but the linter correctly rejects it
	 * for that advertised compatibility range.
	 */
	private async updateFrontmatterValue(
		file: TFile,
		field: string,
		value: string,
	): Promise<void> {
		const content = await this.app.vault.read(file);
		const updatedContent = this.setFrontmatterValue(content, field, value);

		if (updatedContent !== content) {
			await this.app.vault.modify(file, updatedContent);
		}
	}

	/**
	 * Returns markdown content with one frontmatter property updated.
	 *
	 * Existing frontmatter is parsed and re-stringified so unrelated fields are
	 * preserved as data. If the note has no frontmatter block, a new block is
	 * created at the top of the file.
	 */
	private setFrontmatterValue(content: string, field: string, value: string): string {
		const frontmatterInfo = this.getFrontmatterInfo(content);
		const frontmatter = frontmatterInfo
			? this.parseFrontmatter(frontmatterInfo.yaml)
			: {};

		frontmatter[field] = value;

		const yaml = stringifyYaml(frontmatter);
		const normalizedYaml = yaml.endsWith('\n') ? yaml : `${yaml}\n`;
		const frontmatterBlock = `---\n${normalizedYaml}---\n`;

		if (!frontmatterInfo) {
			return `${frontmatterBlock}${content}`;
		}

		return `${frontmatterBlock}${content.slice(frontmatterInfo.contentStart)}`;
	}

	/**
	 * Locates the leading YAML frontmatter block in a markdown file.
	 *
	 * Only a block at the very start of the file counts as frontmatter. The
	 * returned contentStart offset points to the first byte after the closing
	 * fence, allowing setFrontmatterValue to replace the whole block cleanly.
	 */
	private getFrontmatterInfo(content: string): { yaml: string; contentStart: number } | null {
		const openingFence = content.startsWith('---\r\n') ? '---\r\n' : '---\n';

		if (!content.startsWith(openingFence)) {
			return null;
		}

		const rest = content.slice(openingFence.length);
		const closingFenceMatch = rest.match(/(^|\r?\n)---[ \t]*(?:\r?\n|$)/);

		if (!closingFenceMatch || closingFenceMatch.index === undefined) {
			return null;
		}

		return {
			yaml: rest.slice(0, closingFenceMatch.index),
			contentStart: openingFence.length + closingFenceMatch.index + closingFenceMatch[0].length,
		};
	}

	/**
	 * Parses YAML into an object suitable for frontmatter mutation.
	 *
	 * Invalid or non-object YAML is treated as empty frontmatter. Obsidian's
	 * parseYaml helper is used so parsing behaviour matches the host app.
	 */
	private parseFrontmatter(yaml: string): Record<string, unknown> {
		const parsedFrontmatter = parseYaml(yaml) as unknown;

		if (this.isRecord(parsedFrontmatter) && !Array.isArray(parsedFrontmatter)) {
			return parsedFrontmatter;
		}

		return {};
	}

	/**
	 * Expands a File Explorer selection into markdown notes.
	 *
	 * Individual markdown files are included directly. Folders contribute every
	 * descendant markdown file. The map prevents duplicate writes when the user
	 * selects both a parent folder and one of its child folders or notes.
	 */
	private getMarkdownFilesFromSelection(files: TAbstractFile[]): TFile[] {
		const markdownFiles = new Map<string, TFile>();

		for (const file of files) {
			if (file instanceof TFile && file.extension === 'md') {
				markdownFiles.set(file.path, file);
			} else if (file instanceof TFolder) {
				for (const child of this.app.vault.getMarkdownFiles()) {
					if (this.isFileInsideFolder(child, file)) {
						markdownFiles.set(child.path, child);
					}
				}
			}
		}

		return Array.from(markdownFiles.values());
	}

	/**
	 * Checks whether a markdown file is contained by a folder path.
	 *
	 * The vault root is a special case because every file is inside it, while
	 * normal folders use a path prefix with a slash boundary.
	 */
	private isFileInsideFolder(file: TFile, folder: TFolder): boolean {
		if (folder.path === '/') {
			return true;
		}

		return file.path.startsWith(`${folder.path}/`);
	}

	/**
	 * Accesses Obsidian's native MenuItem.setSubmenu API through a typed wrapper.
	 *
	 * Some Obsidian typings do not expose setSubmenu even when the runtime
	 * supports it. This helper keeps submenu creation centralised and avoids the
	 * older click-fallback approach that could create empty or unreliable menus.
	 */
	private getSubmenu(item: MenuItem): Menu | null {
		const maybeSubmenuItem = item as MenuItem & {
			setSubmenu?: () => Menu;
		};

		return maybeSubmenuItem.setSubmenu?.() ?? null;
	}

	/**
	 * Enables smart folder inheritance for a folder path.
	 *
	 * This only stores the path. The active metadata fields are controlled by
	 * settings.smartFolderFields, and the renderer combines both settings when
	 * deciding whether a folder should receive inherited visuals.
	 */
	addSmartFolder(path: string): void {
		if (!this.settings.smartFolders.includes(path)) {
			this.settings.smartFolders.push(path);
			this.settings.smartFolders.sort((a, b) => a.localeCompare(b));
		}
	}

	/**
	 * Disables smart folder inheritance for a folder path.
	 */
	removeSmartFolder(path: string): void {
		this.settings.smartFolders = this.settings.smartFolders.filter((folderPath) => folderPath !== path);
	}

	/**
	 * Keeps stored smart folder paths valid after folder renames.
	 *
	 * Both the renamed folder itself and any enabled descendant paths are moved
	 * to the new prefix so users do not have to re-enable smart folders after
	 * reorganising the vault.
	 */
	private renameSmartFolder(oldPath: string, newPath: string): void {
		this.settings.smartFolders = this.settings.smartFolders.map((folderPath) => {
			if (folderPath === oldPath) {
				return newPath;
			}

			if (folderPath.startsWith(`${oldPath}/`)) {
				return `${newPath}${folderPath.slice(oldPath.length)}`;
			}

			return folderPath;
		});

		void this.saveSettings();
	}
}
