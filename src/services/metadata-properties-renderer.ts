import {
	TFile,
} from 'obsidian';

import type {
	App,
	CachedMetadata,
} from 'obsidian';

import { MetadataVisualRule } from '../types';

const PROPERTY_COLOUR_CLASS = 'metadata-visuals-property-coloured';
const REFRESH_DELAY_MS = 50;

/**
 * Colours matching values in Obsidian's visible note Properties panel.
 *
 * This renderer is intentionally separate from FileExplorerIconRenderer. File
 * Explorer visuals are constrained to one selected field group, but metadata
 * values inside the note should be able to use every matching rule group. The
 * renderer only touches DOM nodes that belong to metadata properties whose
 * field/value pair matches a configured rule.
 */
export class MetadataPropertiesRenderer {
	private refreshTimer: number | null = null;
	private mutationObserver: MutationObserver | null = null;

	constructor(
		private readonly app: App,
		private readonly getRules: () => MetadataVisualRule[],
		private readonly getColourMetadata: () => boolean,
	) {}

	/**
	 * Starts watching for Properties panel DOM rebuilds.
	 *
	 * Obsidian can render the Properties panel after the active file and
	 * metadata-cache events have already fired. Observing child-list changes lets
	 * the plugin apply colours when property rows are inserted or rerendered,
	 * without coupling to a specific pane/view implementation.
	 */
	start(): void {
		if (this.mutationObserver) {
			return;
		}

		this.mutationObserver = new MutationObserver((mutations) => {
			if (mutations.some((mutation) => this.containsMetadataElement(mutation.target))) {
				this.scheduleRefresh();
			}
		});

		this.mutationObserver.observe(this.app.workspace.containerEl, {
			childList: true,
			subtree: true,
		});
	}

	/**
	 * Debounces Properties panel refreshes.
	 *
	 * Active-file changes, metadata cache updates, layout changes, and settings
	 * saves can happen close together. A short debounce avoids repeated DOM
	 * scans while keeping the colour update effectively immediate.
	 */
	scheduleRefresh(): void {
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
		}

		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = null;
			this.refresh();
		}, REFRESH_DELAY_MS);
	}

	/**
	 * Reapplies metadata value colours for the active markdown file.
	 */
	refresh(): void {
		this.clearAll();

		if (!this.getColourMetadata()) {
			return;
		}

		const activeFile = this.app.workspace.getActiveFile();
		if (!(activeFile instanceof TFile) || activeFile.extension !== 'md') {
			return;
		}

		const cache = this.app.metadataCache.getFileCache(activeFile);
		if (!cache?.frontmatter) {
			return;
		}

		for (const rule of this.getMatchingRules(cache)) {
			this.applyRuleToVisibleProperty(rule);
		}
	}

	/**
	 * Removes all inline colour styles this renderer owns.
	 */
	clearAll(): void {
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}

		this.app.workspace.containerEl.findAll(`.${PROPERTY_COLOUR_CLASS}`).forEach((valueEl) => {
			valueEl.removeClass(PROPERTY_COLOUR_CLASS);
			valueEl.style.removeProperty('color');
		});
	}

	/**
	 * Stops observing and removes injected styles.
	 */
	stop(): void {
		this.mutationObserver?.disconnect();
		this.mutationObserver = null;
		this.clearAll();
	}

	/**
	 * Finds every configured rule that matches the active note frontmatter.
	 *
	 * Metadata colouring deliberately uses all matching rule groups. It skips
	 * only empty placeholder rows because those cannot represent a meaningful
	 * frontmatter value.
	 */
	private getMatchingRules(cache: CachedMetadata): MetadataVisualRule[] {
		return this.getRules().filter((rule) => {
			const field = rule.field.trim();
			const expectedValue = rule.value.trim();

			return field !== ''
				&& expectedValue !== ''
				&& this.valueMatches(cache.frontmatter?.[field], expectedValue);
		});
	}

	/**
	 * Applies one rule colour to matching visible property value elements.
	 *
	 * Obsidian's Properties DOM has changed over time, so the renderer searches
	 * within property rows identified by data-property-key and colours only
	 * value-looking descendants whose visible text or input value normalises to
	 * the rule value. That avoids colouring unrelated fields or unrelated values
	 * in multi-value properties.
	 */
	private applyRuleToVisibleProperty(rule: MetadataVisualRule): void {
		for (const propertyEl of this.getPropertyElements(rule.field.trim())) {
			const matchingValueEls = this.getMatchingPropertyValueElements(propertyEl, rule.value);

			if (matchingValueEls.length > 0) {
				for (const valueEl of matchingValueEls) {
					this.colourPropertyValue(valueEl, rule.color);
				}

				continue;
			}

			const fallbackValueEl = this.getPropertyValueContainer(propertyEl);

			if (fallbackValueEl && this.propertyDisplaysRuleValue(fallbackValueEl, rule.value)) {
				this.colourPropertyValue(fallbackValueEl, rule.color);
			}
		}
	}

	/**
	 * Finds visible property rows for one frontmatter field.
	 */
	private getPropertyElements(field: string): HTMLElement[] {
		const normalizedField = this.normalizePropertyKey(field);

		return this.app.workspace.containerEl
			.findAll('.metadata-property')
			.filter((propertyEl) => this.getPropertyFieldName(propertyEl) === normalizedField);
	}

	/**
	 * Returns the normalised field name for a visible property row.
	 */
	private getPropertyFieldName(propertyEl: HTMLElement): string {
		for (const attributeName of [
			'data-property-key',
			'data-property-name',
			'data-property',
		]) {
			const attributeValue = propertyEl.getAttr(attributeName);

			if (attributeValue) {
				return this.normalizePropertyKey(attributeValue);
			}
		}

		const keyEl = propertyEl.querySelector<HTMLElement>([
			'.metadata-property-key',
			'.metadata-property-key-input',
			'.metadata-property-key-display',
			'.metadata-property-name',
			'.metadata-property-label',
		].join(', '));

		return this.normalizePropertyKey(this.getElementValue(keyEl));
	}

	/**
	 * Returns matching visible value nodes inside one property row.
	 *
	 * The selector covers common Obsidian Properties elements: scalar value
	 * containers, text inputs, multi-select pills, and link-value spans. The
	 * final filtering step keeps only nodes whose own visible value matches the
	 * rule value, which avoids colouring unrelated values in multi-value fields.
	 */
	private getMatchingPropertyValueElements(
		propertyEl: HTMLElement,
		expectedValue: string,
	): HTMLElement[] {
		const valueContainerEl = this.getPropertyValueContainer(propertyEl);

		if (!valueContainerEl) {
			return [];
		}

		const expectedNormalizedValue = this.normalizeStatusValue(expectedValue);

		return valueContainerEl
			.findAll([
				'.metadata-property-value-input',
				'.metadata-input',
				'.metadata-input-longtext',
				'.metadata-input-text',
				'.multi-select-pill',
				'.multi-select-pill-content',
				'.metadata-link',
				'.metadata-link-inner',
				'.metadata-property-token',
				'.metadata-property-value span',
				'input',
				'textarea',
			].join(', '))
			.filter((valueEl) => this.normalizeStatusValue(this.getElementValue(valueEl)) === expectedNormalizedValue);
	}

	/**
	 * Returns the broad value container for a property row.
	 */
	private getPropertyValueContainer(propertyEl: HTMLElement): HTMLElement | null {
		return propertyEl.querySelector<HTMLElement>('.metadata-property-value')
			?? propertyEl.querySelector<HTMLElement>('.metadata-property-value-container');
	}

	/**
	 * Checks whether a broad property value container displays a rule value.
	 */
	private propertyDisplaysRuleValue(
		valueEl: HTMLElement,
		expectedValue: string,
	): boolean {
		const visibleValue = this.normalizeStatusValue(this.getElementValue(valueEl));
		const expectedNormalizedValue = this.normalizeStatusValue(expectedValue);

		return visibleValue === expectedNormalizedValue
			|| visibleValue.split('\n').some((value) => this.normalizeStatusValue(value) === expectedNormalizedValue);
	}

	/**
	 * Applies the class and inline colour used for cleanup and visual styling.
	 */
	private colourPropertyValue(valueEl: HTMLElement, color: string): void {
		valueEl.addClass(PROPERTY_COLOUR_CLASS);
		valueEl.style.color = color;
	}

	/**
	 * Reads user-visible text from a property value element.
	 */
	private getElementValue(valueEl: HTMLElement | null): string {
		if (!valueEl) {
			return '';
		}

		if (valueEl.instanceOf(HTMLInputElement) || valueEl.instanceOf(HTMLTextAreaElement)) {
			return valueEl.value.trim();
		}

		return valueEl.textContent?.trim() ?? '';
	}

	/**
	 * Compares one frontmatter value with one rule value using plugin
	 * normalisation.
	 */
	private valueMatches(actualValue: unknown, expectedValue: string): boolean {
		if (Array.isArray(actualValue)) {
			return actualValue.some((value) => this.valueMatches(value, expectedValue));
		}

		if (
			actualValue === null
			|| actualValue === undefined
			|| (
				typeof actualValue !== 'string'
				&& typeof actualValue !== 'number'
				&& typeof actualValue !== 'boolean'
			)
		) {
			return false;
		}

		return this.normalizeStatusValue(String(actualValue)) === this.normalizeStatusValue(expectedValue);
	}

	/**
	 * Removes leading status emoji before matching display/property values.
	 */
	private normalizeStatusValue(value: string): string {
		return value
			.replace(/^[\s🔴🟠🟢🟡🔵🟣⚫⚪🟤]+/u, '')
			.trim();
	}

	/**
	 * Normalises property keys from DOM attributes or visible labels.
	 */
	private normalizePropertyKey(value: string): string {
		return value.trim().toLowerCase();
	}

	/**
	 * Returns whether a mutation target is part of the metadata/properties UI.
	 */
	private containsMetadataElement(target: Node): boolean {
		if (!target.instanceOf(HTMLElement)) {
			return false;
		}

		return target.hasClass('metadata-container')
			|| target.hasClass('metadata-property')
			|| target.querySelector('.metadata-container, .metadata-property') !== null;
	}
}
