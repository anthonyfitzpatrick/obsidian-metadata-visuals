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

export default class MetadataLabelsPlugin extends Plugin {
	settings: MetadataLabelsSettings = DEFAULT_SETTINGS;
	private matcher!: MetadataRuleMatcher;
	private explorerIcons!: FileExplorerIconRenderer;

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

	onunload(): void {
		this.explorerIcons?.clearAll();
	}

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

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.explorerIcons.scheduleRefreshAll();
	}

	private refreshFile(file: TFile): void {
		if (file.extension !== 'md') {
			this.explorerIcons.clearPath(file.path);
			return;
		}

		this.explorerIcons.refreshFile(file);
	}

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

	private isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null;
	}

	private normalizeStatusValue(value: string): string {
		return value
			.replace(/^[\s🔴🟠🟢🟡🔵🟣⚫⚪🟤]+/u, '')
			.trim();
	}

	private parseRuleTarget(value: unknown): MetadataLabelRuleTarget {
		if (value === 'notes' || value === 'folders' || value === 'both') {
			return value;
		}

		return 'both';
	}

	private getDefaultSmartFolderFields(rules: MetadataLabelRule[]): string[] {
		return rules.some((rule) => rule.field === 'Editing Status')
			? ['Editing Status']
			: [];
	}

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

	private parseFrontmatter(yaml: string): Record<string, unknown> {
		const parsedFrontmatter = parseYaml(yaml) as unknown;

		if (this.isRecord(parsedFrontmatter) && !Array.isArray(parsedFrontmatter)) {
			return parsedFrontmatter;
		}

		return {};
	}

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

	private isFileInsideFolder(file: TFile, folder: TFolder): boolean {
		if (folder.path === '/') {
			return true;
		}

		return file.path.startsWith(`${folder.path}/`);
	}

	private getSubmenu(item: MenuItem): Menu | null {
		const maybeSubmenuItem = item as MenuItem & {
			setSubmenu?: () => Menu;
		};

		return maybeSubmenuItem.setSubmenu?.() ?? null;
	}

	addSmartFolder(path: string): void {
		if (!this.settings.smartFolders.includes(path)) {
			this.settings.smartFolders.push(path);
			this.settings.smartFolders.sort((a, b) => a.localeCompare(b));
		}
	}

	removeSmartFolder(path: string): void {
		this.settings.smartFolders = this.settings.smartFolders.filter((folderPath) => folderPath !== path);
	}

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
