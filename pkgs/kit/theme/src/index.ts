import { inlineScriptString } from './inline-script.ts';
import {
	choiceOf,
	nextChoice,
	paintOf,
	parseTheme,
	sunTheme,
	themeValue,
	type Choice,
	type Stored,
	type Theme,
} from './choice.ts';
import type { Sun } from './sun.ts';

export * from './choice.ts';
export * from './sun.ts';

const SYSTEM_DARK_QUERY = '(prefers-color-scheme:dark)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion:reduce)';

/**
 * How the theme cookie is written, wherever it is written.
 *
 * The script below settles every load, a control settles every press, and the server writes the
 * sun's times -- and any of the three that wrote a shorter life, or a different path, would let
 * them disagree about a preference the reader only set once. One set of values, spelled for a
 * framework's cookie API here and for `document.cookie` below.
 */
export const themeCookieOptions = { path: '/', maxAge: 31_536_000, sameSite: 'lax' } as const;
const COOKIE_ATTRIBUTES = `;path=${themeCookieOptions.path};max-age=${themeCookieOptions.maxAge};SameSite=Lax`;

// Every transition and animation off for the one frame a color moves, see withoutTransitions.
const SUPPRESS = '*,*::before,*::after{transition:none!important;animation:none!important}';

/**
 * Settle the class and the cookie before the first frame, and again whenever the system's
 * preference moves, the sun rises or sets, or the tab comes back from hiding, which is when a timer
 * held through sleep would fire late. Each run reads the cookie afresh, so a mode chosen after the
 * page loaded is followed as one chosen before it. The same reading as `parseTheme`, `isDay` and
 * `paintOf`, written small; the tests run both. **Only a change the reader did not make turns as a
 * view transition**, with `theme-turn` on the root for `turn.css` to answer; the first frame and a
 * press cut. See spec/kit/theme.md, "A change nobody pressed for turns, every other cuts".
 */
export const themeScript =
	'(function(){var d=document,h=d.documentElement,q=matchMedia(' +
	inlineScriptString(SYSTEM_DARK_QUERY) +
	'),t,p=d.cookie.match(/\\bpalette=(nord|contrast)\\b/);if(p)h.classList.add(p[1]);' +
	'function s(a){var c=d.cookie.match(/(?:^|;\\s*)theme=([^;]*)/),v=c?decodeURIComponent(c[1]):"",' +
	'f=new URLSearchParams(v),k=v.split("&")[0],m=f.get("mode"),u=f.get("sun")||"",z=new Date(),' +
	'x=z.getUTCHours()*60+z.getUTCMinutes(),w,r,e,n,y,g;' +
	'if(k!=="light"&&k!=="dark"){k="light";m="system"}else if(m!=="system"&&m!=="sun")m="fixed";' +
	'if(u==="day"||u==="night")w=u==="day";' +
	'else if(/^\\d{1,4}-\\d{1,4}$/.test(u)){r=+u.split("-")[0];e=+u.split("-")[1];' +
	'w=(x-r+1440)%1440<(e-r+1440)%1440;clearTimeout(t);' +
	't=setTimeout(function(){s(1)},(((w?e:r)-x+1440)%1440||1440)*6e4-z.getUTCSeconds()*1e3+1e3)}else u="";' +
	'n=m==="fixed"?k:m==="sun"&&w!==void 0?w?"light":"dark":q.matches?"dark":"light";' +
	'if(h.classList.contains("dark")!==(n==="dark")){g=function(){if(d.body){y=d.createElement("style");' +
	'y.textContent=' +
	inlineScriptString(SUPPRESS) +
	';d.head.appendChild(y)}h.classList.toggle("dark",n==="dark");if(y){void h.offsetHeight;y.remove()}};' +
	'if(a&&d.startViewTransition&&!d.hidden&&!matchMedia(' +
	inlineScriptString(REDUCED_MOTION_QUERY) +
	').matches){h.classList.add("theme-turn");' +
	'd.startViewTransition(g).finished.finally(function(){h.classList.remove("theme-turn")})}else g()}' +
	'c=n+"&mode="+m+(u?"&sun="+u:"");if(c!==v)d.cookie="theme="+c+' +
	inlineScriptString(COOKIE_ATTRIBUTES) +
	'}s();q.addEventListener("change",function(){s(1)});' +
	'd.addEventListener("visibilitychange",function(){if(!d.hidden)s(1)})})()';

/**
 * The theme a request asks for, read the way the server reads it: the color the cookie stores.
 * A first visit has no cookie and renders light; the script above corrects it before the first
 * frame.
 */
export function themeOf(cookies: { get(name: string): string | undefined }): Theme {
	return parseTheme(cookies.get('theme'))?.theme ?? 'light';
}

/** What the server settles from the cookie and the sun's times it worked out, if any. */
export interface Settled {
	/** The color the first byte is painted in. */
	theme: Theme;
	/** What the control shows. */
	choice: Choice;
	/** The cookie's value as it should now stand, to be written where it differs from the one read. */
	value: string;
}

/**
 * Read the cookie, take in today's sun where the server knows it, and paint the `sun` mode by it.
 * `system` keeps the color last painted, which is all a server can know of it. No cookie is a
 * reader following their system. See spec/kit/theme.md.
 */
export function settleTheme(
	value: string | undefined,
	sun: Sun | undefined,
	now: Date = new Date(),
): Settled {
	const stored = parseTheme(value) ?? { theme: 'light', mode: 'system' };
	const known = sun ?? stored.sun;
	const theme = stored.mode === 'sun' ? (sunTheme(known, now) ?? stored.theme) : stored.theme;
	const settled: Stored = known
		? { theme, mode: stored.mode, sun: known }
		: { theme, mode: stored.mode };
	return { theme, choice: choiceOf(settled), value: themeValue(settled) };
}

/**
 * Fill an `app.html`'s theme placeholders: `%theme.script%` always, and `%theme.class%` when the
 * render knows the theme. A render shared between readers passes none -- see
 * spec/kit/theme.md, "One cookie, read the same way everywhere".
 */
export function fillTheme(html: string, theme?: Theme): string {
	const classed = theme ? html.replace('%theme.class%', theme === 'dark' ? 'dark' : '') : html;
	return classed.replace('%theme.script%', themeScript);
}

/** The cookie a two-state control writes: the color alone, which reads as `fixed`. */
export function themeCookie(theme: Theme): string {
	return `theme=${theme}${COOKIE_ATTRIBUTES}`;
}

/** The cookie the four-choice control writes, its mode and the sun's times kept. */
export function choiceCookie(stored: Stored): string {
	return `theme=${themeValue(stored)}${COOKIE_ATTRIBUTES}`;
}

/** Whether this tab has pressed the control yet; a storage that throws counts as never. */
const PRESSED = 'theme-pressed';
function pressedBefore(): boolean {
	try {
		return window.sessionStorage.getItem(PRESSED) === '1';
	} catch {
		return false;
	}
}
function rememberPress(): void {
	try {
		window.sessionStorage.setItem(PRESSED, '1');
	} catch {
		// A tab that cannot remember treats every press as its first, which only skips a choice.
	}
}

/**
 * Move the control from `current` to the next choice: paint it, write the cookie, and return the
 * choice to show. The cookie is read afresh for the sun's times the server last wrote.
 */
export function pressTheme(current: Choice, now: Date = new Date()): Choice {
	const match = /(?:^|;\s*)theme=([^;]*)/.exec(document.cookie);
	const sun = parseTheme(match ? decodeURIComponent(match[1] ?? '') : undefined)?.sun;
	const system: Theme = window.matchMedia(SYSTEM_DARK_QUERY).matches ? 'dark' : 'light';
	const day = sunTheme(sun, now);
	const choice = nextChoice(current, system, day, !pressedBefore());
	const theme = paintOf(choice, system, day);
	const mode = choice === 'system' || choice === 'sun' ? choice : 'fixed';
	applyTheme(theme);
	document.cookie = choiceCookie(sun ? { theme, mode, sun } : { theme, mode });
	rememberPress();
	return choice;
}

/**
 * Which theme is on screen right now, read off the document rather than off the cookie.
 *
 * The class is what the page is actually painted from, and the script above sets it before the
 * first frame whether or not a cookie existed. Reading the cookie instead would answer nothing
 * on a first visit, which is exactly when the two can differ.
 */
export function currentTheme(root: HTMLElement = document.documentElement): Theme {
	return root.classList.contains('dark') ? 'dark' : 'light';
}

/** Paint a theme. Toggling the class is the whole of it; every color is a token beneath it. */
/**
 * Move the class with every transition in the document switched off, then switch them back on.
 *
 * A theme repaints in one frame, but anything easing a color for its own reasons eases this one
 * too: measured on an article's link cards, 150ms of grays belonging to neither theme, behind a
 * page that had already finished. **The reflow is the whole trick** -- without a layout read
 * between the writes the browser folds all three into one recalculation, sees only the ends, and
 * transitions anyway.
 */
function withoutTransitions(change: () => void, root: HTMLElement): void {
	// A root outside a document has nothing painting from it, so there is nothing to suppress and
	// the sheet would have nowhere to go. Make the change and return.
	const owner = root.ownerDocument as Document | undefined;
	if (!owner?.head) {
		change();
		return;
	}
	const suppress = owner.createElement('style');
	suppress.textContent = SUPPRESS;
	// `appendChild` rather than `append`: this library is read by the workers too, and their
	// types give `append` a different signature on the same name.
	owner.head.appendChild(suppress);
	change();
	// Read, and do not remove the read: it is what forces the new values to be committed under
	// the rule above rather than after it.
	void root.offsetHeight;
	suppress.remove();
}

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
	withoutTransitions(() => root.classList.toggle('dark', theme === 'dark'), root);
}

/**
 * Call back whenever the painted theme changes, and return the unsubscribe.
 *
 * For whatever copied a color out of the tokens and so cannot repaint on its own -- see
 * web's spec/styling/blocks.md, "A diagram is drawn in both themes at once, because the palette is
 * inside the SVG". The class is watched rather than `applyTheme` announcing, so `currentTheme`
 * reads it. `create` is injected like `followSystemTheme`'s media query, so the node suite can
 * drive it without a DOM.
 */
export function observeTheme(
	callback: (theme: Theme) => void,
	root: HTMLElement = document.documentElement,
	create: (react: () => void) => MutationObserver = (react) => new MutationObserver(react),
): () => void {
	let painted = currentTheme(root);
	const observer = create(() => {
		const next = currentTheme(root);
		// The class also carries the palette names, so most mutations here settle nothing.
		if (next === painted) return;
		painted = next;
		callback(next);
	});
	observer.observe(root, { attributeFilter: ['class'] });
	return () => observer.disconnect();
}

export function followSystemTheme(
	root: HTMLElement = document.documentElement,
	media: MediaQueryList = window.matchMedia(SYSTEM_DARK_QUERY),
): () => void {
	// The same class, so the same one frame in which nothing may animate.
	const apply = () => withoutTransitions(() => root.classList.toggle('dark', media.matches), root);
	apply();
	media.addEventListener('change', apply);
	return () => media.removeEventListener('change', apply);
}
