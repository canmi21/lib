import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { envelopeErrors } from './hono.ts';

/** An app with one route that answers and one that throws, its errors in `said`. */
function app(options: Parameters<typeof envelopeErrors>[1] = {}) {
	const said: unknown[] = [];
	const hono = new Hono();
	hono.get('/ok', (c) => c.text('fine'));
	hono.get('/throws', () => {
		throw new Error('a facet failed');
	});
	envelopeErrors(hono, { log: (error) => said.push(error), ...options });
	return { hono, said };
}

describe('envelopeErrors', () => {
	it('answers a thrown error in the envelope, uncached, and says it', async () => {
		const { hono, said } = app();
		const answer = await hono.request('/throws');
		expect(answer.status).toBe(500);
		expect(answer.headers.get('content-type')).toContain('application/json');
		expect(answer.headers.get('cache-control')).toBe('no-store');
		expect(await answer.json()).toEqual({
			status: 'error',
			code: 'service_unavailable',
			message: expect.any(String),
		});
		expect(String(said[0])).toContain('a facet failed');
	});

	it('answers a path no route takes with its code, and leaves the routes alone', async () => {
		const { hono } = app();
		const missing = await hono.request('/nowhere');
		expect(missing.status).toBe(404);
		expect(await missing.json()).toMatchObject({ status: 'error', code: 'no_such_route' });
		expect(await (await hono.request('/ok')).text()).toBe('fine');
	});

	it('takes the cache header and the not-found answer an app gives', async () => {
		const { hono } = app({
			cacheControl: 'public, max-age=300',
			notFound: { status: 400, code: 'invalid_address' },
		});
		const missing = await hono.request('/nowhere');
		expect(missing.status).toBe(400);
		expect(missing.headers.get('cache-control')).toBe('public, max-age=300');
		expect(await missing.json()).toMatchObject({ code: 'invalid_address' });
	});

	it('leaves not-found to the app when asked to', async () => {
		const { hono } = app({ notFound: false });
		const missing = await hono.request('/nowhere');
		expect(missing.status).toBe(404);
		expect(missing.headers.get('content-type')).not.toContain('application/json');
	});
});
