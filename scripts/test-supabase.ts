import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export function localUrl(value: string) {
  const url = new URL(value);
  assert(
    url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port,
    'Integration requires an explicit http://127.0.0.1:PORT endpoint',
  );
  assert(
    !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash,
    'Integration endpoint must be a bare local origin',
  );
  return url.origin;
}

export function cleanEnvironment(source: Record<string, string | undefined>): NodeJS.ProcessEnv {
  // Do not inherit hosted credentials, provider settings or Node preload hooks.
  return {
    NODE_ENV: 'test' as const,
    ...Object.fromEntries(
      ['PATH', 'HOME', 'TMPDIR', 'SystemRoot'].flatMap((key) =>
        source[key] ? [[key, source[key]!]] : [],
      ),
    ),
  };
}

async function freePorts() {
  const servers = Array.from({ length: 3 }, () => createServer());
  try {
    return await Promise.all(
      servers.map(
        (server) =>
          new Promise<number>((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', () => {
              const address = server.address();
              assert(address && typeof address !== 'string');
              resolve(address.port);
            });
          }),
      ),
    );
  } finally {
    await Promise.all(
      servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
  }
}

export function isolatedConfig(config: string, project: string, ports: number[]) {
  assert(/^agency-integration-[a-f0-9-]+$/.test(project));
  assert(
    /^project_id = "agencia-whatsapp-sdr"$/m.test(config),
    'Cannot isolate an unexpected project config',
  );
  for (const port of ['port = 54321', 'port = 54322', 'shadow_port = 54320']) {
    assert(config.includes(port), 'Cannot isolate unexpected port configuration');
  }
  assert(ports.length === 3 && new Set(ports).size === 3);
  assert(ports.every((port) => Number.isInteger(port) && port > 1024 && port < 65536));
  return config
    .replace(/^project_id = .*$/m, `project_id = "${project}"`)
    .replace('port = 54321', `port = ${ports[0]}`)
    .replace('port = 54322', `port = ${ports[1]}`)
    .replace('shadow_port = 54320', `shadow_port = ${ports[2]}`);
}

async function main() {
  const env = cleanEnvironment(process.env);
  // Respect a selected local Docker context, but reject SSH/TCP/remote engines.
  const dockerEnv = {
    ...env,
    DOCKER_CONTEXT: process.env.DOCKER_CONTEXT,
    DOCKER_HOST: process.env.DOCKER_HOST,
  };
  let endpoint = process.env.DOCKER_HOST;
  if (!endpoint) {
    try {
      endpoint = (
        await exec('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], {
          env: dockerEnv,
          timeout: 10000,
        })
      ).stdout.trim();
    } catch {
      throw new Error(
        'BLOCKED: Docker CLI/local context is unavailable. Install/start a local Docker engine.',
      );
    }
  }
  assert(endpoint.startsWith('unix:///'), 'BLOCKED: remote Docker endpoints are forbidden');
  env.DOCKER_HOST = endpoint;
  try {
    await exec('docker', ['info', '--format', '{{.ServerVersion}}'], { env, timeout: 10000 });
  } catch {
    throw new Error(
      `BLOCKED: Docker daemon unavailable at ${endpoint}. Start the local engine and rerun; no live assertions ran.`,
    );
  }
  try {
    await exec('supabase', ['--version'], { env, timeout: 10000 });
  } catch {
    throw new Error('BLOCKED: Supabase CLI is unavailable. Install it and rerun.');
  }

  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const workdir = await mkdtemp(join(tmpdir(), 'agency-integration-'));
  const project = `agency-integration-${randomUUID()}`;
  const abort = new AbortController();
  const interrupt = () => abort.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  let started = false;
  try {
    await cp(join(root, 'supabase'), join(workdir, 'supabase'), {
      recursive: true,
      filter: (path) => !path.split('/').some((part) => part.startsWith('.')),
    });
    const ports = await freePorts();
    const config = await readFile(join(root, 'supabase/config.toml'), 'utf8');
    await writeFile(join(workdir, 'supabase/config.toml'), isolatedConfig(config, project, ports));
    console.log(
      `Starting disposable local project ${project}; image downloads may take several minutes.`,
    );
    started = true;
    // Only PostgreSQL, Auth, PostgREST and their API gateway are needed here.
    const excluded =
      'realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor';
    try {
      await exec('supabase', ['start', '--workdir', workdir, '-x', excluded], {
        env,
        timeout: 600000,
        maxBuffer: 8 * 1024 * 1024,
        signal: abort.signal,
      });
    } catch {
      throw new Error(
        'BLOCKED: isolated Supabase start failed (image pull, ports, resources or migration/seed). No live verification claimed; CLI output suppressed because it can contain keys.',
      );
    }
    let status;
    try {
      const { stdout } = await exec('supabase', ['status', '--workdir', workdir, '-o', 'json'], {
        env,
        timeout: 15000,
        signal: abort.signal,
      });
      status = JSON.parse(stdout);
    } catch {
      throw new Error(
        'FAIL: could not read isolated project status; credential-bearing output suppressed.',
      );
    }
    const url = localUrl(status.API_URL);
    assert.equal(url, `http://127.0.0.1:${ports[0]}`, 'Status must match the project just created');
    assert(typeof status.ANON_KEY === 'string' && status.ANON_KEY.length > 20);
    assert(typeof status.SERVICE_ROLE_KEY === 'string' && status.SERVICE_ROLE_KEY.length > 20);
    const testEnv = {
      ...env,
      SUPABASE_URL: url,
      SUPABASE_ANON_KEY: status.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
      AGENCY_INTEGRATION_PROJECT: project,
      DRAFT_PROVIDER: 'rules',
    };
    try {
      const result = await exec(
        process.execPath,
        ['--import', 'tsx', 'tests/integration/supabase.ts'],
        { cwd: root, env: testEnv, timeout: 120000, signal: abort.signal },
      );
      process.stdout.write(result.stdout);
    } catch (error) {
      // The test prints only assertion messages, never client objects or credentials.
      const output = error as { stdout?: string; stderr?: string };
      process.stdout.write(output.stdout ?? '');
      process.stderr.write(output.stderr ?? '');
      throw new Error('FAIL: live Supabase assertions did not complete.');
    }
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    if (started) {
      try {
        await exec(
          'supabase',
          ['stop', '--workdir', workdir, '--project-id', project, '--no-backup'],
          { env, timeout: 60000 },
        );
      } catch {
        // Preserve the disposable config for a narrowly scoped manual cleanup.
        throw new Error(
          `Cleanup failed. Run: supabase stop --workdir ${workdir} --project-id ${project} --no-backup`,
        );
      }
    }
    await rm(workdir, { recursive: true, force: true });
    console.log('Disposable project removed.');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Integration failed');
    process.exitCode = 1;
  });
}
