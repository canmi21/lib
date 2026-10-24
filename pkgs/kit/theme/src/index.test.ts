import { afterEach, describe, expect, it, vi } from 'vitest';
import { record } from '../../behavior/src/state';
import { inlineScriptString } from './inline-script';
import {
	applyTheme,
	choiceCookie,
	choiceOf,
	currentTheme,
	fillTheme,
	followSystemTheme,
	isDay,
	nextChoice,
	observeTheme,
	paintOf,
	parseTheme,
	pressTheme,
	settleTheme,
	sunOf,
	sunTheme,
	themeCookie,
	themeOf,
	themeScript,
	themeValue,
	type Stored,
	type Theme,
} from './index';

describe('inlineScriptString', () => {
	it('keeps serialized values inside the inline script element', () => {
		expect(inlineScriptString('</script>\u2028\u2029')).toBe(
			'"\\u003C/script\\u003E\\u2028\\u2029"',
		);
	});
});

/**
 * A page the script can run in: a cookie jar, a root's classes, the media queries, a timer, and a
 * view transition where `turns` is given, recording what it ran.
 */
function page(cookie: string, systemDark: boolean, turns?: { reduced: boolean }) {
	const classes = new Set<string>();
	const jar = new Map<string, string>();
	for (const pair of cookie ? cookie.split('; ') : []) {
		const at = pair.indexOf('=');
		jar.set(pair.slice(0, at), pair.slice(at + 1));
	}
	const listeners: Record<string, () => void> = {};
	const media = {
		matches: systemDark,
		addEventListener: (_type: string, callback: () => void) => (listeners.media = callback),
	};
	const timers: { run: () => void; delay: number }[] = [];
	const turned: string[][] = [];
	const document = {
		hidden: false,
		head: { appendChild: () => {} },
		body: null as object | null,
		createElement: () => ({ textContent: '', remove: () => {} }),
		documentElement: {
			offsetHeight: 0,
			classList: {
				add: (name: string) => classes.add(name),
				remove: (name: string) => classes.delete(name),
				contains: (name: string) => classes.has(name),
				toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)),
			},
		},
		addEventListener: (_type: string, callback: () => void) => (listeners.visible = callback),
		startViewTransition: turns
			? (update: () => void) => {
					turned.push([...classes]);
					update();
					return { finished: Promise.resolve() };
				}
			: undefined,
		get cookie() {
			return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
		},
		set cookie(line: string) {
			const [pair = ''] = line.split(';');
			const at = pair.indexOf('=');
			jar.set(pair.slice(0, at), pair.slice(at + 1));
		},
	};
	const run = new Function('document', 'matchMedia', 'setTimeout', 'clearTimeout', themeScript);
	return {
		start: () =>
			run(
				document,
				(query: string) => (query.includes('reduced') ? { matches: !!turns?.reduced } : media),
				(callback: () => void, delay: number) => timers.push({ run: callback, delay }),
				() => {},
			),
		classes,
		dark: () => classes.has('dark'),
		theme: () => jar.get('theme'),
		media,
		listeners,
		timers,
		turned,
		document,
	};
}

describe('themeScript', () => {
	afterEach(() => vi.useRealTimers());

	it('writes the same cookie attributes the control writes', () => {
		// The script settles every load and the control every press. A difference in path or
		// lifetime here is a preference that expires on one of the two paths and not the other.
		const [, attributes = ''] = /d\.cookie="theme="\+c\+"([^"]*)"/.exec(themeScript) ?? [];
		expect(attributes).not.toBe('');
		expect(themeCookie('dark')).toBe(`theme=dark${attributes}`);
		expect(choiceCookie({ theme: 'dark', mode: 'sun' })).toBe(`theme=dark&mode=sun${attributes}`);
	});

	it('follows the system on a first visit and writes the mode', () => {
		const first = page('', true);
		first.start();
		expect(first.dark()).toBe(true);
		expect(first.theme()).toBe('dark&mode=system');
	});

	it('keeps a cookie older than the mode as the reader chose it', () => {
		const old = page('theme=light', true);
		old.start();
		expect(old.dark()).toBe(false);
		expect(old.theme()).toBe('light&mode=fixed');
	});

	it('corrects a stale system color and follows the system after load', () => {
		const stale = page('theme=light&mode=system', true);
		stale.start();
		expect(stale.dark()).toBe(true);
		expect(stale.theme()).toBe('dark&mode=system');
		stale.media.matches = false;
		stale.listeners.media?.();
		expect(stale.dark()).toBe(false);
		expect(stale.theme()).toBe('light&mode=system');
	});

	it('paints the sun mode by the clock and sets a timer for the next sunset', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-21T16:00:00Z'));
		const sunny = page('theme=dark&mode=sun&sun=565-31', true);
		sunny.start();
		expect(sunny.dark()).toBe(false);
		expect(sunny.theme()).toBe('light&mode=sun&sun=565-31');
		// 16:00 to 00:31 UTC is 511 minutes, a second added past the minute.
		expect(sunny.timers[0]?.delay).toBe(511 * 60_000 + 1000);
		vi.setSystemTime(new Date('2026-06-22T00:31:01Z'));
		sunny.timers[0]?.run();
		expect(sunny.dark()).toBe(true);
	});

	it('turns a change nobody pressed for, and cuts the first frame', async () => {
		const turning = page('theme=light&mode=system', true, { reduced: false });
		turning.start();
		expect(turning.dark()).toBe(true);
		expect(turning.turned).toEqual([]);
		turning.media.matches = false;
		turning.listeners.media?.();
		expect(turning.dark()).toBe(false);
		// Marked for turn.css while the old frame is taken, and unmarked once the turn is over.
		expect(turning.turned).toEqual([['dark', 'theme-turn']]);
		await Promise.resolve();
		expect(turning.dark()).toBe(false);
		expect(turning.classes.has('theme-turn')).toBe(false);
	});

	it('cuts a change for a reader who asked for less motion', () => {
		const still = page('theme=light&mode=system', false, { reduced: true });
		still.start();
		still.media.matches = true;
		still.listeners.media?.();
		expect(still.dark()).toBe(true);
		expect(still.turned).toEqual([]);
	});

	it('paints the sun mode as the system where no times are known', () => {
		const unknown = page('theme=light&mode=sun', true);
		unknown.start();
		expect(unknown.dark()).toBe(true);
		expect(unknown.theme()).toBe('dark&mode=sun');
	});

	it('reads what the library reads', () => {
		// The script is the library's reading written small; the two must not drift.
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-12-21T03:00:00Z'));
		for (const cookie of [
			'',
			'theme=dark',
			'theme=nord',
			'theme=light&mode=system',
			'theme=light&mode=sun&sun=565-31',
			'theme=dark&mode=sun&sun=day',
			'theme=light&mode=sun&sun=night',
		]) {
			for (const systemDark of [false, true]) {
				const run = page(cookie, systemDark);
				run.start();
				const value = cookie ? cookie.slice('theme='.length) : undefined;
				const stored: Stored = parseTheme(value) ?? { theme: 'light', mode: 'system' };
				const system: Theme = systemDark ? 'dark' : 'light';
				const painted = paintOf(choiceOf(stored), system, sunTheme(stored.sun, new Date()));
				expect(run.dark(), cookie).toBe(painted === 'dark');
				expect(run.theme(), cookie).toBe(themeValue({ ...stored, theme: painted }));
			}
		}
	});
});

describe('sunOf', () => {
	it('places New York at the solstices within a few minutes of the almanac', () => {
		// Sunrise 5:25 and sunset 20:31 EDT in June, 7:16 and 16:32 EST in December.
		const june = sunOf(40.7128, -74.006, new Date('2026-06-21T12:00:00Z'));
		const december = sunOf(40.7128, -74.006, new Date('2026-12-21T12:00:00Z'));
		expect(june).toEqual({ rise: expect.closeTo(565, -1), set: expect.closeTo(31, -1) });
		expect(december).toEqual({ rise: expect.closeTo(736, -1), set: expect.closeTo(1292, -1) });
	});

	it('answers day or night where the sun does not cross the horizon', () => {
		expect(sunOf(78.2, 15.6, new Date('2026-06-21T12:00:00Z'))).toBe('day');
		expect(sunOf(78.2, 15.6, new Date('2026-12-21T12:00:00Z'))).toBe('night');
	});
});

describe('isDay', () => {
	it('takes a day that wraps past midnight UTC', () => {
		const sun = { rise: 565, set: 31 };
		expect(isDay(sun, new Date('2026-06-21T23:59:00Z'))).toBe(true);
		expect(isDay(sun, new Date('2026-06-21T00:30:00Z'))).toBe(true);
		expect(isDay(sun, new Date('2026-06-21T00:31:00Z'))).toBe(false);
		expect(isDay(sun, new Date('2026-06-21T09:24:00Z'))).toBe(false);
		expect(isDay(sun, new Date('2026-06-21T09:25:00Z'))).toBe(true);
	});
});

describe('parseTheme and themeValue', () => {
	it('reads a value written before the mode as fixed, and nothing it does not know', () => {
		expect(parseTheme('dark')).toEqual({ theme: 'dark', mode: 'fixed' });
		expect(parseTheme('light&mode=sun&sun=565-31')).toEqual({
			theme: 'light',
			mode: 'sun',
			sun: { rise: 565, set: 31 },
		});
		expect(parseTheme('nord')).toBeUndefined();
		expect(parseTheme(undefined)).toBeUndefined();
	});

	it('writes the color first, so a reader older than the mode still matches it', () => {
		const value = themeValue({ theme: 'dark', mode: 'system', sun: 'night' });
		expect(value).toBe('dark&mode=system&sun=night');
		expect(`theme=${value}`).toMatch(/\btheme=(light|dark)\b/);
	});
});

describe('nextChoice', () => {
	it('walks the ring in order once the tab has pressed', () => {
		expect(nextChoice('system', 'dark', 'light', false)).toBe('light');
		expect(nextChoice('light', 'dark', 'light', false)).toBe('dark');
		expect(nextChoice('dark', 'dark', 'light', false)).toBe('sun');
		expect(nextChoice('sun', 'dark', 'light', false)).toBe('system');
	});

	it('changes the color on the first press of a session', () => {
		// From the system's own color fixed, past the sun and the system that paint it too.
		expect(nextChoice('dark', 'dark', 'dark', true)).toBe('light');
		expect(nextChoice('dark', 'dark', 'light', true)).toBe('sun');
		expect(nextChoice('system', 'dark', 'dark', true)).toBe('light');
		expect(nextChoice('light', 'dark', 'light', true)).toBe('dark');
		expect(nextChoice('sun', 'dark', 'dark', true)).toBe('light');
		expect(nextChoice('sun', 'dark', 'light', true)).toBe('system');
	});
});

describe('settleTheme', () => {
	const noon = new Date('2026-06-21T16:00:00Z');
	const sun = { rise: 565, set: 31 };

	it('follows the system on a first visit and keeps the sun it was given', () => {
		expect(settleTheme(undefined, sun, noon)).toEqual({
			theme: 'light',
			choice: 'system',
			value: 'light&mode=system&sun=565-31',
		});
	});

	it('paints the sun mode by the sun, and keeps a fixed color as it is', () => {
		expect(settleTheme('dark&mode=sun', sun, noon).theme).toBe('light');
		expect(settleTheme('dark', sun, noon)).toEqual({
			theme: 'dark',
			choice: 'dark',
			value: 'dark&mode=fixed&sun=565-31',
		});
	});

	it('keeps the stored sun where the server knows none', () => {
		expect(settleTheme('dark&mode=sun&sun=565-31', undefined, noon).value).toBe(
			'light&mode=sun&sun=565-31',
		);
	});
});

/** A cookie jar holding at most a `theme` cookie. */
function jar(value?: string) {
	return { get: (name: string) => (name === 'theme' ? value : undefined) };
}

describe('themeOf', () => {
	it('reads dark only from a dark cookie', () => {
		expect(themeOf(jar('dark'))).toBe('dark');
		expect(themeOf(jar('light'))).toBe('light');
	});

	it('renders light when the cookie is missing or unrecognized', () => {
		// A first visit, and anything the script would not have written.
		expect(themeOf(jar())).toBe('light');
		expect(themeOf(jar('nord'))).toBe('light');
	});
});

describe('fillTheme', () => {
	const page = '<html class="%theme.class%"><script>%theme.script%</script></html>';

	it('classes a dark render and leaves a light one bare', () => {
		expect(fillTheme(page, 'dark')).toBe(
			`<html class="dark"><script>${themeScript}</script></html>`,
		);
		expect(fillTheme(page, 'light')).toBe(`<html class=""><script>${themeScript}</script></html>`);
	});

	it('fills only the script when the render does not know the theme', () => {
		expect(fillTheme(page)).toBe(
			`<html class="%theme.class%"><script>${themeScript}</script></html>`,
		);
	});
});

/** A root holding the classes it was given, and those classes, to read back. */
function watched(dark: boolean) {
	const classes = new Set(dark ? ['dark'] : []);
	const root = {
		classList: {
			contains: (name: string) => classes.has(name),
			toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)),
		},
	} as unknown as HTMLElement;
	return { root, classes };
}

function painted(dark: boolean): HTMLElement {
	return watched(dark).root;
}

describe('reading and painting a theme', () => {
	it('reads what is painted rather than what was stored', () => {
		// On a first visit there is no cookie yet and the class is already correct, which is
		// exactly when the two would disagree.
		expect(currentTheme(painted(true))).toBe('dark');
		expect(currentTheme(painted(false))).toBe('light');
	});

	it('paints either theme, from either theme', () => {
		const element = painted(false);
		applyTheme('dark', element);
		expect(currentTheme(element)).toBe('dark');
		applyTheme('dark', element);
		expect(currentTheme(element)).toBe('dark');
		applyTheme('light', element);
		expect(currentTheme(element)).toBe('light');
	});
});

describe('followSystemTheme', () => {
	it('applies the current mode and follows changes', () => {
		const modes: boolean[] = [];
		let listener: (() => void) | undefined;
		let removed: (() => void) | undefined;
		const root = {
			classList: { toggle: (_name: string, enabled: boolean) => modes.push(enabled) },
		} as unknown as HTMLElement;
		const media = {
			matches: false,
			addEventListener: (_type: string, callback: () => void) => {
				listener = callback;
			},
			removeEventListener: (_type: string, callback: () => void) => {
				removed = callback;
			},
		} as unknown as MediaQueryList;

		const stop = followSystemTheme(root, media);
		(media as unknown as { matches: boolean }).matches = true;
		listener?.();
		stop();

		expect(modes).toEqual([false, true]);
		expect(removed).toBe(listener);
	});
});

describe('observeTheme', () => {
	it('reports a change once, and says nothing about the mutations that are not one', () => {
		const { root, classes } = watched(false);
		const seen: Theme[] = [];
		let react!: () => void;
		let disconnected = false;
		const observer = {
			observe: () => {},
			disconnect: () => (disconnected = true),
		} as unknown as MutationObserver;

		const stop = observeTheme(
			(theme) => seen.push(theme),
			root,
			(callback) => {
				react = callback;
				return observer;
			},
		);

		// The palette names ride on the same attribute, so a mutation is not itself an answer.
		classes.add('nord');
		react();
		applyTheme('dark', root);
		react();
		react();

		expect(seen).toEqual(['dark']);
		stop();
		expect(disconnected).toBe(true);
	});
});

describe('pressTheme', () => {
	afterEach(() => vi.unstubAllGlobals());

	/** A document whose cookie and root the press writes, under a system of the given color. */
	function pressing(cookie: string, systemDark: boolean) {
		const jar = { value: cookie };
		const classes = new Set<string>(systemDark ? ['dark'] : []);
		vi.stubGlobal('document', {
			get cookie() {
				return jar.value;
			},
			set cookie(line: string) {
				jar.value = line.split(';')[0] ?? '';
			},
			documentElement: {
				classList: {
					contains: (name: string) => classes.has(name),
					toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)),
				},
			},
		});
		vi.stubGlobal('window', { matchMedia: () => ({ matches: systemDark }) });
		const items = new Map<string, string>();
		const storage = {
			getItem: (key: string) => items.get(key) ?? null,
			setItem: (key: string, value: string) => void items.set(key, value),
		};
		return { jar, classes, items, storage };
	}

	const tab = record('state', []);
	const pressed = { record: tab, key: 'theme.pressed' };

	it('keeps whether the tab has pressed in the record it is given, as a boolean', () => {
		const page = pressing('theme=dark&mode=fixed', true);
		// The first press from the system's own color fixed skips to the opposite.
		expect(pressTheme('dark', pressed, page.storage)).toBe('light');
		expect(JSON.parse(page.items.get('state') ?? '{}')).toEqual({
			version: 1,
			'theme.pressed': true,
		});
		expect(page.jar.value).toBe('theme=light&mode=fixed');
		expect(page.classes.has('dark')).toBe(false);
		// Once pressed, the tab walks the ring in order.
		expect(pressTheme('light', pressed, page.storage)).toBe('dark');
		expect(pressTheme('dark', pressed, page.storage)).toBe('sun');
	});

	it('walks the ring at once in a tab that already pressed', () => {
		const page = pressing('theme=dark&mode=fixed', true);
		tab.remember(page.storage, 'theme.pressed', true);
		expect(pressTheme('dark', pressed, page.storage)).toBe('sun');
	});
});
