import type { App, CachedMetadata, TFile } from 'obsidian';

import { MetadataLabelRule } from '../types';

/**
 * Matches markdown notes against the configured metadata label rules.
 *
 * This service deliberately does not know anything about File Explorer DOM
 * rendering. It answers one question only: given a note, which rule should be
 * applied to it? Keeping matching separate from rendering makes it easier to
 * reason about frontmatter behaviour and avoids coupling metadata decisions to
 * the UI implementation.
 */
export class MetadataRuleMatcher {
	constructor(
		private readonly app: App,
		private readonly getRules: () => MetadataLabelRule[],
	) {}

	/**
	 * Returns the first rule that matches a markdown file's frontmatter.
	 *
	 * Obsidian's metadata cache is used instead of reading files from disk. That
	 * keeps matching fast during File Explorer refreshes and uses the same parsed
	 * frontmatter representation Obsidian exposes to other plugins.
	 */
	matchFile(file: TFile): MetadataLabelRule | null {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) {
			return null;
		}

		return this.matchFrontmatter(cache, this.getRules());
	}

	/**
	 * Iterates rules in settings order and returns the first matching note rule.
	 *
	 * Rules targeted only at folders are skipped here because note rows and
	 * smart folder rows are rendered through different paths. Empty placeholder
	 * rules are also skipped so incomplete settings rows do not accidentally
	 * match every note.
	 */
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

	/**
	 * Compares one frontmatter value with one rule value.
	 *
	 * Frontmatter values can be scalar values or arrays. Arrays match if any
	 * element matches the rule. Scalar strings, numbers, and booleans are
	 * converted to strings before comparison so a rule value can match common
	 * YAML scalar forms without special cases.
	 */
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

	/**
	 * Normalises the values used for matching.
	 *
	 * Metadata Labels originally allowed status emoji to live inside the raw
	 * value, for example "🟢 Done". Current rules store raw values such as
	 * "Done" and keep icon/colour choices in separate fields. Stripping only
	 * leading status-colour emoji preserves compatibility with older notes while
	 * still allowing ordinary text elsewhere in the value to remain meaningful.
	 */
	private normalizeStatusValue(value: string): string {
		return value
			.replace(/^[\s🔴🟠🟢🟡🔵🟣⚫⚪🟤]+/u, '')
			.trim();
	}
}
