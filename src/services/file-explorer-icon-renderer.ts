import {
	setIcon,
	TFolder,
} from 'obsidian';

import type {
	App,
	TFile,
} from 'obsidian';

import { MetadataRuleMatcher } from './metadata-rule-matcher';
import { MetadataLabelRule } from '../types';

const ICON_CLASS = 'metadata-labels-file-icon';
const DECORATED_CLASS = 'metadata-labels-file-has-icon';
const COLOURED_NAME_CLASS = 'metadata-labels-file-has-coloured-name';
const STATUS_TODO = 'To Do';
const STATUS_IN_PROGRESS = 'In Progress';
const STATUS_DONE = 'Done';
const REFRESH_DELAY_MS = 50;

export class FileExplorerIconRenderer {
	private refreshTimer: number | null = null;
	private mutationObserver: MutationObserver | null = null;
	private suppressMutationRefresh = false;

	constructor(
		private readonly app: App,
		private readonly matcher: MetadataRuleMatcher,
		private readonly getRules: () => MetadataLabelRule[],
		private readonly getSmartFolderPaths: () => string[],
		private readonly getSmartFolderFields: () => string[],
	) {}

	start(): void {
		if (this.mutationObserver) {
			return;
		}

		this.mutationObserver = new MutationObserver(() => {
			if (this.suppressMutationRefresh) {
				return;
			}

			this.scheduleRefreshAll();
		});

		this.mutationObserver.observe(this.app.workspace.containerEl, {
			childList: true,
			subtree: true,
		});
	}

	refreshFile(file: TFile): void {
		this.withMutationRefreshSuppressed(() => {
			this.clearPath(file.path);

			const rule = this.matcher.matchFile(file);
			if (!rule) {
				return;
			}

			for (const titleEl of this.findFileTitleEls(file.path)) {
				const contentEl = titleEl.querySelector<HTMLElement>('.nav-file-title-content');
				if (!contentEl) {
					continue;
				}

				this.applyRule(titleEl, contentEl, rule);
			}
		});
	}

	refreshSmartFolder(folder: TFolder): void {
		this.withMutationRefreshSuppressed(() => {
			this.clearPath(folder.path);

			const rule = this.getSmartFolderRule(folder);
			if (!rule) {
				return;
			}

			for (const titleEl of this.findFolderTitleEls(folder.path)) {
				const contentEl = titleEl.querySelector<HTMLElement>('.nav-folder-title-content');
				if (!contentEl) {
					continue;
				}

				this.applyRule(titleEl, contentEl, rule);
			}
		});
	}

	scheduleRefreshAll(): void {
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
		}

		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = null;
			this.refreshAll();
		}, REFRESH_DELAY_MS);
	}

	refreshAll(): void {
		for (const file of this.app.vault.getMarkdownFiles()) {
			this.refreshFile(file);
		}

		for (const path of this.getSmartFolderPaths()) {
			const folder = this.app.vault.getAbstractFileByPath(path);

			if (folder instanceof TFolder) {
				this.refreshSmartFolder(folder);
			} else {
				this.clearPath(path);
			}
		}
	}

	clearPath(path: string): void {
		this.withMutationRefreshSuppressed(() => {
			for (const titleEl of [
				...this.findFileTitleEls(path),
				...this.findFolderTitleEls(path),
			]) {
				titleEl.findAll(`.${ICON_CLASS}`).forEach((iconEl) => {
					iconEl.remove();
				});
				titleEl.findAll(`.${COLOURED_NAME_CLASS}`).forEach((contentEl) => {
					contentEl.removeClass(COLOURED_NAME_CLASS);
					contentEl.style.removeProperty('color');
				});
				titleEl.removeClass(DECORATED_CLASS);
			}
		});
	}

	clearAll(): void {
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}

		this.mutationObserver?.disconnect();
		this.mutationObserver = null;

		this.app.workspace.containerEl.findAll(`.${ICON_CLASS}`).forEach((iconEl) => {
			iconEl.remove();
		});

		this.app.workspace.containerEl.findAll(`.${DECORATED_CLASS}`).forEach((titleEl) => {
			titleEl.removeClass(DECORATED_CLASS);
		});

		this.app.workspace.containerEl.findAll(`.${COLOURED_NAME_CLASS}`).forEach((contentEl) => {
			contentEl.removeClass(COLOURED_NAME_CLASS);
			contentEl.style.removeProperty('color');
		});
	}

	private findFileTitleEls(path: string): HTMLElement[] {
		return this.app.workspace.containerEl
			.findAll('.nav-file-title[data-path]')
			.filter((titleEl) => titleEl.getAttr('data-path') === path);
	}

	private findFolderTitleEls(path: string): HTMLElement[] {
		return this.app.workspace.containerEl
			.findAll('.nav-folder-title[data-path]')
			.filter((titleEl) => titleEl.getAttr('data-path') === path);
	}

	private applyRule(
		titleEl: HTMLElement,
		contentEl: HTMLElement,
		rule: MetadataLabelRule,
	): void {
		if (rule.showIcon) {
			const iconEl = titleEl.createSpan({
				cls: ICON_CLASS,
				attr: {
					'aria-hidden': 'true',
				},
			});

			setIcon(iconEl, rule.icon.trim());
			iconEl.style.color = rule.color;
			titleEl.insertBefore(iconEl, contentEl);
		}

		if (rule.colourFilename) {
			contentEl.addClass(COLOURED_NAME_CLASS);
			contentEl.style.color = rule.color;
		}

		if (rule.showIcon || rule.colourFilename) {
			titleEl.addClass(DECORATED_CLASS);
		}
	}

	private getSmartFolderRule(folder: TFolder): MetadataLabelRule | null {
		const editingStatusRules = this.getEditingStatusRules();
		if (!editingStatusRules) {
			return null;
		}

		const childStatuses = this.getChildStatuses(folder, editingStatusRules.field);
		if (childStatuses.length === 0) {
			return null;
		}

		const nextStatus = this.getFolderStatus(childStatuses);
		if (!nextStatus) {
			return null;
		}

		return editingStatusRules.rulesByValue.get(nextStatus) ?? null;
	}

	private getEditingStatusRules(): {
		field: string;
		rulesByValue: Map<string, MetadataLabelRule>;
	} | null {
		const groups = new Map<string, MetadataLabelRule[]>();
		const smartFolderFields = new Set(this.getSmartFolderFields());

		for (const rule of this.getRules()) {
			if (rule.target === 'notes') {
				continue;
			}

			const field = rule.field.trim();
			if (!field) {
				continue;
			}

			if (!smartFolderFields.has(field)) {
				continue;
			}

			const rules = groups.get(field) ?? [];
			rules.push(rule);
			groups.set(field, rules);
		}

		for (const [field, rules] of groups) {
			const rulesByValue = new Map<string, MetadataLabelRule>();

			for (const rule of rules) {
				rulesByValue.set(this.normalizeStatusValue(rule.value), rule);
			}

			if (
				rulesByValue.has(STATUS_TODO)
				&& rulesByValue.has(STATUS_IN_PROGRESS)
				&& rulesByValue.has(STATUS_DONE)
			) {
				return { field, rulesByValue };
			}
		}

		return null;
	}

	private getChildStatuses(folder: TFolder, field: string): string[] {
		const statuses: string[] = [];
		const prefix = folder.path === '/' ? '' : `${folder.path}/`;

		for (const file of this.app.vault.getMarkdownFiles()) {
			if (file.parent?.path !== folder.path && !file.path.startsWith(prefix)) {
				continue;
			}

			const value: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.[field];
			const matchedStatus = this.getMatchedStatus(value);

			if (matchedStatus) {
				statuses.push(matchedStatus);
			}
		}

		return statuses;
	}

	private getMatchedStatus(value: unknown): string | null {
		if (Array.isArray(value)) {
			for (const item of value) {
				const status = this.getMatchedStatus(item);

				if (status) {
					return status;
				}
			}

			return null;
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
			return null;
		}

		const normalizedValue = this.normalizeStatusValue(String(value));

		if (
			normalizedValue === STATUS_TODO
			|| normalizedValue === STATUS_IN_PROGRESS
			|| normalizedValue === STATUS_DONE
		) {
			return normalizedValue;
		}

		return null;
	}

	private getFolderStatus(statuses: string[]): string | null {
		if (statuses.every((status) => status === STATUS_DONE)) {
			return STATUS_DONE;
		}

		if (statuses.some((status) => status === STATUS_IN_PROGRESS)) {
			return STATUS_IN_PROGRESS;
		}

		if (statuses.every((status) => status === STATUS_TODO)) {
			return STATUS_TODO;
		}

		return null;
	}

	private normalizeStatusValue(value: string): string {
		return value
			.replace(/^[\s🔴🟠🟢🟡🔵🟣⚫⚪🟤]+/u, '')
			.trim();
	}

	private withMutationRefreshSuppressed(callback: () => void): void {
		this.suppressMutationRefresh = true;

		try {
			callback();
		} finally {
			window.setTimeout(() => {
				this.suppressMutationRefresh = false;
			}, 0);
		}
	}
}
