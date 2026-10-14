/**
 * `lib-local` for every consumer of this library: `node .mise/tasks/consumer/lib-local.ts <root>
 * [--link | --off]`, run by the shim each consumer keeps as its `.mise/tasks/lib-local`, so the
 * steps are written once -- RFC zlifc. See spec/repository.md, "Trying a change before it is
 * released".
 *
 * `--link`, for iterating: every `@canmi/*` package the consumer names resolves to its directory
 * here by a `link:` override in its `pnpm-workspace.yaml`, so a change is seen as soon as
 * `mise run build --watch` rebuilds its `dist/`. Without it, for a last look at what a published
 * tarball holds: every package is pinned to the newest version `release --local` put in the local
 * registry, and installed from there. In both, each crate is taken from this checkout by a
 * `[patch]` in the consumer's `.cargo/config.toml`, its requirement loosened to the version here.
 * Every file either mode rewrites is copied to the consumer's `.local/lib/` first, `--off` puts
 * each back, and the consumer's `verify` refuses to pass while the copies exist, so neither a local
 * version nor a `link:` reaches a commit. See the workspace's spec/architecture/layers.md,
 * "Publishing".
 */
import { spawnSync } from 'node:child_process';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** This checkout, whose packages and crates a consumer takes. */
const LIB = fileURLToPath(new URL('../../..', import.meta.url)).replace(/\/$/, '');
const LOCAL = 'http://localhost:4873';
const WORKSPACE = 'pnpm-workspace.yaml';
export const CRATES = ['canmi', 'response', 'whereabouts'];

/** Why a mode stopped, said to whoever ran it; nothing is written after one. */
export class Stop extends Error {
	override name = 'Stop';
}

export interface Answer {
	status: number;
	stdout: string;
}

export type Run = (command: string[], options?: { check?: boolean; capture?: boolean }) => Answer;

/** The consumer acted on, the checkout it takes from, and how it runs a command and speaks. */
export interface Here {
	root: string;
	lib: string;
	/** The copies of every file a mode rewrote, which `--off` puts back. */
	saved: string;
	/** Which mode the copies were taken for; beside them, so `--off` never puts it back. */
	mode: string;
	cargoConfig: string;
	run: Run;
	say: (line: string) => void;
}

export function consumer(root: string, run?: Run, say = console.log, lib = LIB): Here {
	const at = resolve(root);
	return {
		root: at,
		lib,
		saved: join(at, '.local', 'lib'),
		mode: join(at, '.local', 'lib-mode'),
		cargoConfig: join(at, '.cargo', 'config.toml'),
		run: run ?? spawned(at),
		say,
	};
}

/** Each command in `root`, echoed first; one that fails stops the mode unless `check` is false. */
function spawned(root: string): Run {
	return (command, { check = true, capture = false } = {}) => {
		console.log(`$ ${command.join(' ')}`);
		const [program = '', ...rest] = command;
		const done = spawnSync(program, rest, {
			cwd: root,
			encoding: 'utf8',
			stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
			// `cargo metadata` answers in megabytes, past spawnSync's default of one.
			maxBuffer: 1 << 28,
		});
		const status = done.status ?? 1;
		if (check && status !== 0) throw new Stop(`lib-local: \`${command.join(' ')}\` failed`);
		return { status, stdout: done.stdout ?? '' };
	};
}

/** `path` as the consumer names it, from its root. */
function named(here: Here, path: string): string {
	return relative(here.root, path);
}

function read(here: Here, path: string): string {
	return readFileSync(join(here.root, path), 'utf8');
}

function tracked(here: Here, pattern: string): string[] {
	return here
		.run(['git', 'ls-files', pattern], { capture: true })
		.stdout.split(/\s+/)
		.filter(Boolean);
}

/** Every npm package this checkout publishes, by name, with its directory here. */
export function packages(here: Here): Map<string, string> {
	const found = new Map<string, string>();
	const root = join(here.lib, 'pkgs');
	for (const name of readdirSync(root).toSorted()) {
		const manifest = join(root, name, 'package.json');
		if (!existsSync(manifest)) continue;
		found.set(JSON.parse(readFileSync(manifest, 'utf8')).name, join(root, name));
	}
	return found;
}

/** The tracked package.json files that name one of `published`, and every name they use. */
function naming(here: Here, published: Iterable<string>): { paths: string[]; names: Set<string> } {
	const wanted = new Set(published);
	const paths: string[] = [];
	const names = new Set<string>();
	for (const path of tracked(here, '*package.json')) {
		const manifest = JSON.parse(read(here, path));
		const used = ['dependencies', 'devDependencies'].flatMap((key) =>
			Object.keys(manifest[key] ?? {}),
		);
		const ours = used.filter((name) => wanted.has(name));
		if (ours.length > 0) paths.push(path);
		for (const name of ours) names.add(name);
	}
	return { paths, names };
}

/**
 * Every file a mode rewrites: both lockfiles, each Cargo.toml that names a crate, and either the
 * workspace file the `link:` overrides go in or the package.json files that are pinned.
 */
function manifests(here: Here, published: Iterable<string>, linking: boolean): string[] {
	const found = ['pnpm-lock.yaml', 'Cargo.lock'];
	found.push(...(linking ? [WORKSPACE] : naming(here, published).paths));
	const crate = new RegExp(`^(${CRATES.join('|')}) = `, 'm');
	found.push(...tracked(here, '*Cargo.toml').filter((path) => crate.test(read(here, path))));
	return found;
}

/**
 * Copy each file to `.local/lib/` once: a second `lib-local` in the same mode keeps the copies of
 * the first, and one in the other mode is refused, since its files are not among them.
 */
export function save(here: Here, paths: string[], mode: 'link' | 'registry'): void {
	if (existsSync(here.saved)) {
		const taken = existsSync(here.mode) ? readFileSync(here.mode, 'utf8').trim() : 'registry';
		if (taken !== mode)
			throw new Stop(`lib-local: on in ${taken} mode; \`mise run lib-local --off\` first`);
		return;
	}
	for (const path of paths) {
		mkdirSync(dirname(join(here.saved, path)), { recursive: true });
		copyFileSync(join(here.root, path), join(here.saved, path));
	}
	writeFileSync(here.mode, `${mode}\n`);
}

/** Each package's newest local version, the registry's `local` tag, for those it holds. */
function localVersions(here: Here, published: Iterable<string>): Map<string, string> {
	const found = new Map<string, string>();
	for (const name of published) {
		const asked = ['npm', 'view', name, 'dist-tags.local', '--registry', LOCAL];
		const answer = here.run(asked, { check: false, capture: true });
		if (answer.status === 0 && answer.stdout.trim()) found.set(name, answer.stdout.trim());
	}
	return found;
}

function pin(here: Here, paths: string[], versions: Map<string, string>): void {
	for (const path of paths.filter((file) => file.endsWith('package.json'))) {
		const manifest = JSON.parse(read(here, path));
		for (const key of ['dependencies', 'devDependencies']) {
			for (const name of Object.keys(manifest[key] ?? {})) {
				const version = versions.get(name);
				if (version) manifest[key][name] = version;
			}
		}
		writeFileSync(join(here.root, path), `${JSON.stringify(manifest, null, '\t')}\n`);
	}
}

/**
 * An override per package, `link:` its directory here, at the top of the workspace file's
 * `overrides`: one file rewritten whatever number of manifests name the package, and the
 * package.json files left as they are, so an edit to one while linked survives `--off`.
 */
export function link(here: Here, directories: Map<string, string>): void {
	if (directories.size === 0) return;
	const lines = [
		'  # Written by `mise run lib-local --link`, removed by `--off`; never committed.',
	];
	for (const [name, directory] of [...directories].toSorted(([a], [b]) => a.localeCompare(b))) {
		lines.push(`  '${name}': link:${named(here, directory)}`);
	}
	const block = `overrides:\n${lines.join('\n')}\n`;
	let text = read(here, WORKSPACE);
	text = /^overrides:\n/m.test(text)
		? text.replace(/^overrides:\n/m, () => block)
		: `${text.replace(/\n*$/, '')}\n\n${block}`;
	writeFileSync(join(here.root, WORKSPACE), text);
}

/**
 * Point each crate at this checkout, at the version it holds: the dated `canmi` reads `0.0.0` here
 * until a release stamps it, which no published requirement matches.
 */
function patch(here: Here, paths: string[]): void {
	const held = new Map<string, string>();
	for (const crate of CRATES) {
		const text = readFileSync(join(here.lib, 'crates', crate, 'Cargo.toml'), 'utf8');
		held.set(crate, /^version = "([^"]+)"/m.exec(text)?.[1] ?? '');
	}
	for (const path of paths.filter((file) => file.endsWith('Cargo.toml'))) {
		let text = read(here, path);
		for (const [crate, version] of held) {
			text = text.replace(new RegExp(`^${crate} = "[^"]*"`, 'gm'), `${crate} = "=${version}"`);
			text = text.replace(
				new RegExp(`^(${crate} = \\{ version = )"[^"]*"`, 'gm'),
				`$1"=${version}"`,
			);
		}
		writeFileSync(join(here.root, path), text);
	}
	mkdirSync(dirname(here.cargoConfig), { recursive: true });
	const lines = ['# Written by `mise run lib-local`, removed by `--off`; never committed.'];
	lines.push('[patch.crates-io]');
	for (const crate of CRATES) {
		lines.push(`${crate} = { path = "${named(here, join(here.lib, 'crates', crate))}" }`);
	}
	writeFileSync(here.cargoConfig, `${lines.join('\n')}\n`);
}

function crates(here: Here): void {
	here.run(['cargo', 'metadata', '--format-version', '1', '--quiet'], { capture: true });
	for (const crate of CRATES)
		here.say(`  ${crate} from ${named(here, join(here.lib, 'crates', crate))}`);
}

export function linked(here: Here): void {
	const published = packages(here);
	const used = new Map(
		[...naming(here, published.keys()).names]
			.toSorted()
			.map((name) => [name, published.get(name) ?? '']),
	);
	const unbuilt = [...used].filter(([, directory]) => {
		const dist = join(directory, 'dist');
		return !existsSync(dist) || readdirSync(dist).length === 0;
	});
	if (unbuilt.length > 0) {
		const names = unbuilt.map(([name]) => name).join(', ');
		const build = '`mise run build --watch`';
		throw new Stop(
			`lib-local: ${names} has no dist/ in ../lib; run ${build} there and leave it running`,
		);
	}
	const paths = manifests(here, published.keys(), true);
	save(here, paths, 'link');
	// Linked again, it starts from the file as it was before the first, never stacks a second block.
	copyFileSync(join(here.saved, WORKSPACE), join(here.root, WORKSPACE));
	link(here, used);
	patch(here, paths);
	here.run(['pnpm', 'install']);
	here.say('lib-local: linked, until `mise run lib-local --off`:');
	for (const [name, directory] of used) here.say(`  ${name} from ${named(here, directory)}`);
	crates(here);
	here.say('Keep `mise run build --watch` running in ../lib: what is linked is its dist/.');
}

function registry(here: Here): void {
	const ping = ['curl', '-sf', '-o', '/dev/null', `${LOCAL}/-/ping`];
	if (here.run(ping, { check: false }).status !== 0) {
		throw new Stop(`lib-local: nothing answers at ${LOCAL}; run \`mise run registry\` in ../lib`);
	}
	const versions = localVersions(here, packages(here).keys());
	if (versions.size === 0) {
		throw new Stop(
			'lib-local: the local registry holds nothing; `mise run release --local` in ../lib',
		);
	}
	const paths = manifests(here, versions.keys(), false);
	save(here, paths, 'registry');
	pin(here, paths, versions);
	patch(here, paths);
	here.run(['pnpm', 'install', '--registry', LOCAL]);
	here.say('lib-local: on, until `mise run lib-local --off`:');
	for (const [name, version] of versions) here.say(`  ${name}@${version}`);
	crates(here);
}

export function off(here: Here): void {
	if (!existsSync(here.saved)) {
		rmSync(here.mode, { force: true });
		here.say('lib-local: already off');
		return;
	}
	const saved = readdirSync(here.saved, { recursive: true, encoding: 'utf8' });
	for (const path of saved.toSorted()) {
		if (statSync(join(here.saved, path)).isFile()) {
			copyFileSync(join(here.saved, path), join(here.root, path));
		}
	}
	rmSync(here.cargoConfig, { force: true });
	const cargo = dirname(here.cargoConfig);
	if (existsSync(cargo) && readdirSync(cargo).length === 0) rmdirSync(cargo);
	here.run(['pnpm', 'install']);
	rmSync(here.saved, { recursive: true });
	rmSync(here.mode, { force: true });
	here.say("lib-local: off; every package and crate is its registry's again");
}

/** `<consumer root> [--link | --off]`, as each consumer's `.mise/tasks/lib-local` passes it. */
export function main(argv: string[]): void {
	const [root, ...rest] = argv;
	if (!root)
		throw new Stop("lib-local: run from a consumer's `mise run lib-local`, which names its root");
	const here = consumer(root);
	if (rest.includes('--off')) off(here);
	else if (rest.includes('--link')) linked(here);
	else registry(here);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		main(process.argv.slice(2));
	} catch (error) {
		if (!(error instanceof Stop)) throw error;
		console.error(error.message);
		process.exit(1);
	}
}
