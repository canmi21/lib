/**
 * Hono's own refusals answered in the envelope: a path no route takes, and an error thrown anywhere
 * below a route, which Hono answers as `text/plain` unless told otherwise -- and a caller parsing
 * JSON then gets a syntax error instead of a message. See spec/response/envelope.md, "Every answer
 * is one envelope".
 */
import type { Env, Hono, Schema } from 'hono';
import { type Code, failure } from './index.ts';

export interface EnvelopeErrors {
	/** What a refusal's `Cache-Control` says: `no-store` unless the app says otherwise. */
	cacheControl?: string;
	/**
	 * A path no route takes: 404 `no_such_route` unless the app answers another, and `false` to
	 * leave it to the app's own catch-all.
	 */
	notFound?: { status: number; code: Code } | false;
	/** Where a thrown error is said before the refusal is answered: `console.error` by default. */
	log?: (error: unknown) => void;
}

/**
 * Install both on `app`: `notFound` answering its code, and `onError` saying what was thrown and
 * answering 500 `service_unavailable`. Each refusal is uncached unless `cacheControl` says more.
 */
export function envelopeErrors<E extends Env, S extends Schema, B extends string>(
	app: Hono<E, S, B>,
	options: EnvelopeErrors = {},
): Hono<E, S, B> {
	const headers = { 'Cache-Control': options.cacheControl ?? 'no-store' };
	const log = options.log ?? ((error: unknown) => console.error(error));
	if (options.notFound !== false) {
		const { status, code } = options.notFound ?? { status: 404, code: 'no_such_route' };
		app.notFound(() => failure(status, code, { headers }));
	}
	app.onError((error) => {
		log(error);
		return failure(500, 'service_unavailable', { headers });
	});
	return app;
}
