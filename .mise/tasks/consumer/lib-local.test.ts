import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { CRATES, consumer, link, linked, off, save, Stop } from './lib-local.ts';
import type { Here, Run } from './lib-local.ts';

const WORKSPACE = `packages:
  - apps/*

overrides:
  # Kept.
  'a>b': ^1.0.0
`;

let base: string;
let here: Here;
let commands: string[][];

/** Every file under `root` ending as `pattern` does after its `*`, as git would list it. */
function listed(root: string, pattern: string): string[] {
	const suffix = pattern.replace(/^\*/, '');
	const found = readdirSync(root, { recursive: true, encoding: 'utf8' });
	return found.filter((path) => path.endsWith(suffix) && !path.startsWith('.local'));
}

/** `run` without running: git's listing answered from the files there, the rest recorded. */
const run: Run = (command) => {
	commands.push(command);
	const git = command[0] === 'git' && command[1] === 'ls-files';
	return { status: 0, stdout: git ? listed(here.root, command[2] ?? '').join('\n') : '' };
};

function write(path: string, text: string): void {
	mkdirSync(dirname(join(here.root, path)), { recursive: true });
	writeFileSync(join(here.root, path), text);
}

function read(path: string): string {
	return readFileSync(join(here.root, path), 'utf8');
}

function exists(path: string): boolean {
	return existsSync(join(here.root, path));
}

beforeEach(() => {
	// Resolved, as the consumer's root is: macOS's temporary directory is a symlink.
	base = realpathSync(mkdtempSync(join(tmpdir(), 'lib-local-test-')));
	const lib = join(base, 'lib');
	for (const [name, built] of [
		['kit', true],
		['ui', false],
	] as const) {
		const directory = join(lib, 'pkgs', name);
		mkdirSync(directory, { recursive: true });
		writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: `@canmi/${name}` }));
		if (built) {
			mkdirSync(join(directory, 'dist'));
			writeFileSync(join(directory, 'dist', 'index.js'), '');
		}
	}
	for (const crate of CRATES) {
		mkdirSync(join(lib, 'crates', crate), { recursive: true });
		writeFileSync(join(lib, 'crates', crate, 'Cargo.toml'), 'version = "0.0.0"\n');
	}
	commands = [];
	here = consumer(join(base, 'web'), run, () => {}, lib);
	write('pnpm-workspace.yaml', WORKSPACE);
	write('pnpm-lock.yaml', "lockfileVersion: '9.0'\n");
	write('Cargo.lock', 'version = 4\n');
	write('apps/console/package.json', JSON.stringify({ dependencies: { '@canmi/kit': '^1' } }));
});

afterEach(() => {
	rmSync(base, { recursive: true, force: true });
});

describe('lib-local', () => {
	test('links ahead of the existing overrides, and --off restores every file exactly', () => {
		const before = { workspace: read('pnpm-workspace.yaml'), lock: read('pnpm-lock.yaml') };
		linked(here);
		const workspace = read('pnpm-workspace.yaml');
		expect(workspace).toContain('overrides:\n  # Written by `mise run lib-local --link`');
		expect(workspace).toContain("  '@canmi/kit': link:../lib/pkgs/kit\n  # Kept.");
		// Only what a manifest here names is linked; the package.json is left as it was.
		expect(workspace).not.toContain('@canmi/ui');
		expect(read('apps/console/package.json')).toContain('"^1"');
		expect(read('.cargo/config.toml')).toContain('canmi = { path = "../lib/crates/canmi" }');
		expect(commands).toContainEqual(['pnpm', 'install']);
		off(here);
		expect({ workspace: read('pnpm-workspace.yaml'), lock: read('pnpm-lock.yaml') }).toEqual(
			before,
		);
		expect(exists('.cargo')).toBe(false);
		expect(exists('.local/lib')).toBe(false);
		expect(exists('.local/lib-mode')).toBe(false);
	});

	test('gives a workspace with no overrides a block, and none when nothing is linked', () => {
		write('pnpm-workspace.yaml', 'packages:\n  - apps/*\n');
		link(here, new Map([['@canmi/kit', join(here.lib, 'pkgs', 'kit')]]));
		expect(read('pnpm-workspace.yaml')).toBe(
			'packages:\n  - apps/*\n\noverrides:\n' +
				'  # Written by `mise run lib-local --link`, removed by `--off`; never committed.\n' +
				"  '@canmi/kit': link:../lib/pkgs/kit\n",
		);
		// An `overrides:` with nothing under it would be refused, so nothing is written.
		write('pnpm-workspace.yaml', 'packages:\n  - apps/*\n');
		link(here, new Map());
		expect(read('pnpm-workspace.yaml')).toBe('packages:\n  - apps/*\n');
	});

	test('stops before writing anything when a linked package has no dist', () => {
		write('apps/console/package.json', JSON.stringify({ dependencies: { '@canmi/ui': '^1' } }));
		expect(() => linked(here)).toThrow(Stop);
		expect(() => linked(here)).toThrow(/@canmi\/ui has no dist\/.*mise run build --watch/);
		expect(read('pnpm-workspace.yaml')).toBe(WORKSPACE);
		expect(exists('.local')).toBe(false);
	});

	test('refuses the other mode until --off, and keeps the first copies in the same one', () => {
		linked(here);
		expect(() => save(here, ['pnpm-lock.yaml'], 'registry')).toThrow(/on in link mode/);
		// Linked again: the copies are the files as they were before the first, and one block.
		linked(here);
		expect(read('.local/lib/pnpm-workspace.yaml')).toBe(WORKSPACE);
		expect(read('pnpm-workspace.yaml').split("'@canmi/kit'").length - 1).toBe(1);
	});
});
