import { isDay, parseSun, sunText, type Sun } from './sun.ts';

export type Theme = 'light' | 'dark';

/** How the stored color is kept: as it is, after the system, or after the sun. */
export type Mode = 'fixed' | 'system' | 'sun';

/** What the control shows and cycles: a color fixed, or one of the two that follow something. */
export type Choice = Theme | 'system' | 'sun';

/** The cookie's value read whole. `theme` is the color last painted, whatever the mode. */
export interface Stored {
	theme: Theme;
	mode: Mode;
	sun?: Sun;
}

/**
 * Read a `theme` cookie's value, `dark&mode=sun&sun=565-31`. A value without `mode` was written
 * before the mode existed and is kept as a choice, so it is `fixed`; one with no color this
 * understands is no cookie at all. See spec/kit/theme.md.
 */
export function parseTheme(value: string | undefined): Stored | undefined {
	if (!value) return undefined;
	const [theme] = value.split('&');
	if (theme !== 'light' && theme !== 'dark') return undefined;
	const fields = new URLSearchParams(value);
	const field = fields.get('mode');
	const mode: Mode = field === 'system' || field === 'sun' ? field : 'fixed';
	const sun = parseSun(fields.get('sun'));
	return sun ? { theme, mode, sun } : { theme, mode };
}

/** The cookie's value, the color first and bare so a reader older than the mode still reads it. */
export function themeValue(stored: Stored): string {
	const sun = stored.sun ? `&sun=${sunText(stored.sun)}` : '';
	return `${stored.theme}&mode=${stored.mode}${sun}`;
}

export function choiceOf(stored: Stored): Choice {
	return stored.mode === 'fixed' ? stored.theme : stored.mode;
}

/** The color a choice paints, given what the system and the sun say right now. */
export function paintOf(choice: Choice, system: Theme, sun?: Theme): Theme {
	if (choice === 'system') return system;
	if (choice === 'sun') return sun ?? system;
	return choice;
}

/** The color the sun paints at `now`, or nothing where the server knew no coordinates. */
export function sunTheme(sun: Sun | undefined, now: Date): Theme | undefined {
	if (!sun) return undefined;
	return isDay(sun, now) ? 'light' : 'dark';
}

/**
 * The choice a press moves to. The ring is `system`, the system's opposite fixed, the system's
 * own color fixed, then `sun`. A session's first press skips every choice painting what is already
 * painted, and the presses after it walk the ring in order. See spec/kit/theme.md.
 */
export function nextChoice(
	current: Choice,
	system: Theme,
	sun: Theme | undefined,
	first: boolean,
): Choice {
	const opposite: Theme = system === 'dark' ? 'light' : 'dark';
	const ring: Choice[] = ['system', opposite, system, 'sun'];
	const painted = paintOf(current, system, sun);
	const from = ring.indexOf(current);
	for (let step = 1; step < ring.length; step += 1) {
		const next = ring[(from + step) % ring.length] as Choice;
		if (!first || paintOf(next, system, sun) !== painted) return next;
	}
	// The ring holds both colors fixed, so a press that must change the color always finds one.
	return opposite;
}
