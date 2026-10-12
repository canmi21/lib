import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTRACT } from '../../contract/src/index.ts';

/** Every style is a stylesheet beside this test; what a style keeps under it is in a directory. */
const STYLES = import.meta.dirname;

/** The names a rule declares, from its selector's opening brace to its close. */
function declared(css: string, selector: RegExp): string[] {
	const start = css.search(selector);
	const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start));
	return [...body.matchAll(/^\t(--[a-z0-9-]+):/gm)].map(([, name]) => name as string);
}

describe.each(readdirSync(STYLES).filter((file) => file.endsWith('.css')))('%s', (file) => {
	const css = readFileSync(join(STYLES, file), 'utf8');

	it("gives every name in the contract a value, on the root and on either theme's mark", () => {
		const names = declared(css, /^:root,\n\[data-theme='light'\],\n\[data-theme='dark'\] \{/m);
		for (const name of CONTRACT.flatMap((group) => group.names)) {
			expect(names).toContain(name);
		}
	});

	it("puts every name it declares under the contract's groups, or its own parameters", () => {
		const groups = CONTRACT.map(({ group }) => `--${group}`);
		for (const name of declared(css, /^:root,/m)) {
			expect(groups.some((group) => name === group || name.startsWith(`${group}-`))).toBe(true);
		}
	});
});

/**
 * Mono's grays read off its stylesheets: each name's value in a block, a `var()` put in from the
 * block or the palette's. Only what this test needs: plain oklch grays and one level of reference.
 */
describe('mono', () => {
	const mono = readFileSync(join(STYLES, 'mono.css'), 'utf8');
	const palette = readFileSync(join(STYLES, 'mono', 'palette.css'), 'utf8');

	/** The body of the first rule whose selector list starts as `head` does. */
	const block = (css: string, head: RegExp) => {
		const start = css.search(head);
		return css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start));
	};
	const value = (body: string, name: string) =>
		new RegExp(`^\\t${name}:\\s*([^;]+);`, 'm').exec(body)?.[1]?.replace(/\s+/g, ' ').trim();

	const light = block(mono, /^:root,\n\[data-theme='light'\]/m);
	// The dark's own rule stands after a blank line; the first rule's list ends on the same mark.
	const dark = block(mono, /(?<=\n\n)\[data-theme='dark'\] \{/);
	const paletteLight = block(palette, /^:root,\n\[data-theme='light'\]/m);
	const paletteDark = block(palette, /(?<=\n\n)\[data-theme='dark'\] \{/);

	/** A name in a theme: the dark's own value where it gives one, else the light's. */
	function read(name: string, theme: 'light' | 'dark'): string {
		const own = theme === 'dark' ? (value(dark, name) ?? value(light, name)) : value(light, name);
		if (!own) throw new Error(`${name} has no value in the ${theme}`);
		return own.replace(/var\((--[\w-]+)\)/g, (_, ref: string) => {
			const fromPalette = theme === 'dark' ? value(paletteDark, ref) : value(paletteLight, ref);
			return fromPalette ?? read(ref, theme);
		});
	}

	/** An oklch gray's lightness and its alpha, which is 1 where none is written. */
	function gray(css: string): { l: number; alpha: number } {
		const [, l, alpha] = /oklch\(([\d.]+) 0 0(?: \/ ([\d.]+))?\)/.exec(css) ?? [];
		return { l: Number(l), alpha: alpha === undefined ? 1 : Number(alpha) };
	}

	/** sRGB's encoding and its inverse, and CIELAB's lightness of a linear luminance. */
	const encode = (y: number) => (y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055);
	const decode = (s: number) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4);
	const lStar = (y: number) => (y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (y * 24389) / 27);

	/** How far `css`, laid on the theme's base as a browser blends it, stands off the base in L*. */
	function step(css: string, theme: 'light' | 'dark'): number {
		const base = gray(read('--background-base', theme)).l ** 3;
		const { l, alpha } = gray(css);
		const laid = encode(base) * (1 - alpha) + encode(l ** 3) * alpha;
		return Math.abs(lStar(decode(laid)) - lStar(base));
	}

	it.each([
		'--background-surface',
		'--interaction-subtle',
		'--interaction-muted',
		'--interaction-default',
		'--interaction-strong',
		'--border-subtle',
		'--border-default',
		'--border-strong',
	])("steps %s off the base 1.5 times as far in the dark's L* as in the light's", (name) => {
		const ratio = step(read(name, 'dark'), 'dark') / step(read(name, 'light'), 'light');
		expect(ratio).toBeCloseTo(1.5, 1);
	});
});
