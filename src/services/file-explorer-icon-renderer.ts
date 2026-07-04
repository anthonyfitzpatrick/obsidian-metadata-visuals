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

/**
 * Renders Metadata Labels visuals into Obsidian's File Explorer.
 *
 * This service owns all DOM mutation for file and folder rows: adding icons,
 * applying inline filename colours, removing stale decorations, and refreshing
 * rows when Obsidian rebuilds the File Explorer. It receives settings through
 * callbacks so it always reads the current rule set without needing to own
 * plugin persistence.
 */
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

	/**
	 * Starts watching the workspace container for File Explorer DOM changes.
	 *
	 * Obsidian frequently re-renders tree rows as folders expand, collapse, or
	 * refresh. A MutationObserver lets the plugin reapply labels after those
	 * rebuilds. The suppressMutationRefresh flag prevents our own DOM edits from
	 * causing an immediate refresh loop.
	 */
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

	/**
	 * Refreshes one markdown file row.
	 *
	 * The row is cleared first so changes in metadata, rule colour, icon, target,
	 * or show/hide settings cannot leave old decorations behind. The matcher
	 * then decides whether the note should receive a rule.
	 */
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

	/**
	 * Refreshes one enabled smart folder row.
	 *
	 * Folder visuals are not matched against the folder's own frontmatter.
	 * Instead, getSmartFolderRule aggregates descendant note statuses and maps
	 * the calculated folder status back to the configured Editing Status rule.
	 */
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

	/**
	 * Debounces full File Explorer refreshes.
	 *
	 * Metadata changes, layout changes, and DOM mutations can arrive in bursts.
	 * A short delay coalesces those bursts into one refresh without making the
	 * visual update feel delayed to the user.
	 */
	scheduleRefreshAll(): void {
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
		}

		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = null;
			this.refreshAll();
		}, REFRESH_DELAY_MS);
	}

	/**
	 * Recomputes labels for every markdown file and every enabled smart folder.
	 *
	 * Missing smart folder paths are cleared from the DOM if possible. The
	 * persisted setting is left alone here; path removal is handled by the plugin
	 * lifecycle when Obsidian reports folder deletes.
	 */
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

	/**
	 * Removes every Metadata Labels decoration for one file or folder path.
	 *
	 * Cleanup removes inserted icon spans, the CSS class used to mark decorated
	 * rows, and the inline colour applied to the filename content. This method is
	 * used before re-rendering a row and when files/folders are deleted, disabled,
	 * or no longer match a rule.
	 */
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

	/**
	 * Removes all plugin-owned File Explorer DOM changes and stops observers.
	 *
	 * This is called on plugin unload. It is intentionally broad because the
	 * File Explorer may contain rows for many paths and Obsidian may have rebuilt
	 * portions of the tree since the last targeted refresh.
	 */
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

	/**
	 * Finds visible File Explorer note rows for a vault path.
	 *
	 * Obsidian can render more than one tree instance across workspaces or panes,
	 * so the renderer looks for all matching row elements rather than assuming a
	 * single DOM node.
	 */
	private findFileTitleEls(path: string): HTMLElement[] {
		return this.app.workspace.containerEl
			.findAll('.nav-file-title[data-path]')
			.filter((titleEl) => titleEl.getAttr('data-path') === path);
	}

	/**
	 * Finds visible File Explorer folder rows for a vault path.
	 */
	private findFolderTitleEls(path: string): HTMLElement[] {
		return this.app.workspace.containerEl
			.findAll('.nav-folder-title[data-path]')
			.filter((titleEl) => titleEl.getAttr('data-path') === path);
	}

	/**
	 * Applies one rule's visual effect to a File Explorer row.
	 *
	 * The same method is used for note rows and smart folder rows. showIcon
	 * controls whether an Obsidian icon span is inserted before the filename.
	 * colourFilename controls whether the row text receives the rule colour.
	 * Either visual effect marks the row as decorated for CSS alignment.
	 */
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

	/**
	 * Calculates which configured rule should be displayed for a smart folder.
	 *
	 * Smart folders currently use an Editing Status-style group: a field group
	 * must contain To Do, In Progress, and Done rules after value normalisation.
	 * The descendant note statuses are aggregated into one folder status, then
	 * that status is mapped back to the matching rule so the folder inherits the
	 * configured icon, colour, showIcon, colourFilename, and target behaviour.
	 */
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

	/**
	 * Finds the first smart-folder-capable status rule group.
	 *
	 * Rules targeted only at notes cannot colour folders. The settings tab also
	 * stores which fields have "Apply to enabled folders" turned on; only those
	 * fields participate in smart folder inheritance. Values are normalised so
	 * old rules containing emoji prefixes still satisfy the To Do/In Progress/
	 * Done requirement.
	 */
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

	/**
	 * Collects normalised Editing Status values from descendant markdown notes.
	 *
	 * Only notes that actually have the relevant metadata field and whose value
	 * matches one of the supported statuses are counted. Folder-note/dashboard
	 * files are skipped when they are direct children of the folder because those
	 * files represent the folder itself rather than manuscript content inside it.
	 */
	private getChildStatuses(folder: TFolder, field: string): string[] {
		const statuses: string[] = [];
		const prefix = folder.path === '/' ? '' : `${folder.path}/`;

		for (const file of this.app.vault.getMarkdownFiles()) {
			if (file.parent?.path !== folder.path && !file.path.startsWith(prefix)) {
				continue;
			}

			if (this.isFolderSelfNote(file, folder)) {
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

	/**
	 * Detects common folder-note/dashboard files that should not affect folder
	 * inheritance.
	 *
	 * A folder can contain a note named exactly like the folder, "Dashboard", or
	 * "<Something> Dashboard". Those notes usually summarize the folder rather
	 * than representing a child scene/note. Only direct children are excluded;
	 * dashboard notes deeper in descendant folders are evaluated by their own
	 * folder's aggregation rules.
	 */
	private isFolderSelfNote(file: TFile, folder: TFolder): boolean {
		if (folder.path === '/' || file.parent?.path !== folder.path) {
			return false;
		}

		const normalizedBasename = file.basename.trim().toLowerCase();
		const normalizedFolderName = folder.name.trim().toLowerCase();

		return normalizedBasename === normalizedFolderName
			|| normalizedBasename === 'dashboard'
			|| normalizedBasename.endsWith(' dashboard');
	}

	/**
	 * Converts an arbitrary frontmatter value into one supported status.
	 *
	 * Arrays are searched recursively and match on the first valid status. Scalar
	 * strings, numbers, and booleans are converted to strings before
	 * normalisation. Unsupported values do not count toward folder status.
	 */
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

	/**
	 * Aggregates descendant note statuses into one smart folder status.
	 *
	 * The order is intentionally explicit:
	 * - no counted child notes means no folder rule;
	 * - any explicit In Progress child makes the folder In Progress;
	 * - a mix of Done and To Do also means In Progress;
	 * - only Done children means Done;
	 * - only To Do children means To Do.
	 *
	 * This avoids the common bug where a folder with one Done note and several
	 * To Do notes is incorrectly shown as To Do. Mixed completion is work in
	 * progress even if no child note has the literal In Progress value.
	 */
	private getFolderStatus(statuses: string[]): string | null {
		if (statuses.length === 0) {
			return null;
		}

		const hasDone = statuses.includes(STATUS_DONE);
		const hasTodo = statuses.includes(STATUS_TODO);
		const hasInProgress = statuses.includes(STATUS_IN_PROGRESS);

		if (hasInProgress) {
			return STATUS_IN_PROGRESS;
		}

		if (hasDone && hasTodo) {
			return STATUS_IN_PROGRESS;
		}

		if (hasDone && !hasTodo) {
			return STATUS_DONE;
		}

		if (hasTodo && !hasDone) {
			return STATUS_TODO;
		}

		return null;
	}

	/**
	 * Normalises status text before matching or aggregation.
	 *
	 * Leading status-colour emoji are ignored for backwards compatibility with
	 * older notes and rules that stored values such as "🔴 To Do". The raw status
	 * names remain "To Do", "In Progress", and "Done".
	 */
	private normalizeStatusValue(value: string): string {
		return value
			.replace(/^[\s🔴🟠🟢🟡🔵🟣⚫⚪🟤]+/u, '')
			.trim();
	}

	/**
	 * Runs DOM edits without allowing the MutationObserver to immediately
	 * schedule another refresh from those same edits.
	 *
	 * The flag is released on the next browser tick so Obsidian-driven DOM
	 * changes after this render pass are still observed normally.
	 */
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
