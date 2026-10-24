/**
 * Today's sunrise and sunset in UTC minutes, or `day` or `night` where the sun does not cross the
 * horizon. See spec/kit/theme.md, "One cookie, read the same way everywhere".
 */
export type Sun = { rise: number; set: number } | 'day' | 'night';

const DAY = 1440;
const RADIAN = Math.PI / 180;
// The sun's center when its upper edge meets the horizon, refraction included.
const HORIZON = 90.833 * RADIAN;

function wrap(minutes: number): number {
	return ((Math.round(minutes) % DAY) + DAY) % DAY;
}

/** NOAA's general solar position equations, taken at UTC noon of `date`'s UTC day. */
export function sunOf(latitude: number, longitude: number, date: Date): Sun {
	const start = Date.UTC(date.getUTCFullYear(), 0, 1);
	const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
	const year = (2 * Math.PI * ((today - start) / 86_400_000 + 0.5)) / 365;
	const time =
		229.18 *
		(0.000075 +
			0.001868 * Math.cos(year) -
			0.032077 * Math.sin(year) -
			0.014615 * Math.cos(2 * year) -
			0.040849 * Math.sin(2 * year));
	const declination =
		0.006918 -
		0.399912 * Math.cos(year) +
		0.070257 * Math.sin(year) -
		0.006758 * Math.cos(2 * year) +
		0.000907 * Math.sin(2 * year) -
		0.002697 * Math.cos(3 * year) +
		0.00148 * Math.sin(3 * year);
	const phi = latitude * RADIAN;
	const angle =
		(Math.cos(HORIZON) - Math.sin(phi) * Math.sin(declination)) /
		(Math.cos(phi) * Math.cos(declination));
	if (angle > 1) return 'night';
	if (angle < -1) return 'day';
	const hour = Math.acos(angle) / RADIAN;
	const noon = 720 - 4 * longitude - time;
	return { rise: wrap(noon - 4 * hour), set: wrap(noon + 4 * hour) };
}

/**
 * Whether `now` falls between sunrise and sunset. A day may wrap past midnight UTC, so each
 * distance is taken from sunrise modulo a day.
 */
export function isDay(sun: Sun, now: Date): boolean {
	if (typeof sun === 'string') return sun === 'day';
	const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
	return (minute - sun.rise + DAY) % DAY < (sun.set - sun.rise + DAY) % DAY;
}

/** The cookie's spelling, `rise-set` or `day` or `night`. */
export function sunText(sun: Sun): string {
	return typeof sun === 'string' ? sun : `${sun.rise}-${sun.set}`;
}

export function parseSun(text: string | null | undefined): Sun | undefined {
	if (text === 'day' || text === 'night') return text;
	const match = /^(\d{1,4})-(\d{1,4})$/.exec(text ?? '');
	if (!match) return undefined;
	const rise = Number(match[1]);
	const set = Number(match[2]);
	return rise < DAY && set < DAY ? { rise, set } : undefined;
}
