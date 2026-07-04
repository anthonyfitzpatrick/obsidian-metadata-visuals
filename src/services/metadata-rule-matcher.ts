import type { App, CachedMetadata, TFile } from 'obsidian';

import { MetadataLabelRule } from '../types';

export class MetadataRuleMatcher {
	constructor(
		private readonly app: App,
		private readonly getRules: () => MetadataLabelRule[],
	) {}

	matchFile(file: TFile): MetadataLabelRule | null {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) {
			return null;
		}

		return this.matchFrontmatter(cache, this.getRules());
	}

	private matchFrontmatter(
		cache: CachedMetadata,
		rules: MetadataLabelRule[],
	): MetadataLabelRule | null {
		for (const rule of rules) {
			if (rule.target === 'folders') {
				continue;
			}

			const field = rule.field.trim();
			const expectedValue = rule.value.trim();

			if (!field || !expectedValue || !rule.icon.trim()) {
				continue;
			}

			const actualValue: unknown = cache.frontmatter?.[field];
			if (this.valueMatches(actualValue, expectedValue)) {
				return rule;
			}
		}

		return null;
	}

	private valueMatches(actualValue: unknown, expectedValue: string): boolean {
		if (Array.isArray(actualValue)) {
			return actualValue.some((value) => this.valueMatches(value, expectedValue));
		}

		if (actualValue === null || actualValue === undefined) {
			return false;
		}

		if (
			typeof actualValue !== 'string'
			&& typeof actualValue !== 'number'
			&& typeof actualValue !== 'boolean'
		) {
			return false;
		}

		return this.normalizeStatusValue(String(actualValue)) === this.normalizeStatusValue(expectedValue);
	}

	private normalizeStatusValue(value: string): string {
		return value
			.replace(/^[\s🔴🟠🟢🟡🔵🟣⚫⚪🟤]+/u, '')
			.trim();
	}
}
