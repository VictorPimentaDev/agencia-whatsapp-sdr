import { expect, it } from 'vitest';
import { cleanEnvironment, isolatedConfig, localUrl } from '../scripts/test-supabase';
import { readFileSync } from 'node:fs';

it('rejects hosted, remote and ambiguous integration endpoints', () => {
  expect(localUrl('http://127.0.0.1:56321')).toBe('http://127.0.0.1:56321');
  for (const url of [
    'https://example.supabase.co',
    'http://localhost:56321',
    'http://127.0.0.1',
    'http://127.0.0.1:56321/path',
    'http://user@127.0.0.1:56321',
    'http://127.0.0.1:56321?remote=true',
    'http://127.0.0.1:56321#remote',
  ]) {
    expect(() => localUrl(url)).toThrow();
  }
});

it('drops ambient credentials, preload hooks and provider settings', () => {
  expect(
    cleanEnvironment({
      PATH: '/bin',
      HOME: '/tmp/local',
      SUPABASE_URL: 'hosted',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
      META_ACCESS_TOKEN: 'secret',
      NODE_OPTIONS: '--require bad',
      DRAFT_PROVIDER: 'ollama',
      DOCKER_HOST: 'ssh://remote',
    }),
  ).toEqual({ NODE_ENV: 'test', PATH: '/bin', HOME: '/tmp/local' });
});

it('isolates project identity and database/API ports while retaining migrations and seed config', () => {
  const source = readFileSync('supabase/config.toml', 'utf8');
  const config = isolatedConfig(source, 'agency-integration-abcd', [56321, 56322, 56320]);
  expect(config).toContain('project_id = "agency-integration-abcd"');
  for (const port of [56321, 56322, 56320]) expect(config).toContain(`port = ${port}`);
  for (const port of [54321, 54322, 54320]) expect(config).not.toContain(`port = ${port}`);
  expect(config).toContain('sql_paths = ["./seed.sql"]');
  expect(() => isolatedConfig(source, 'existing-project', [56321, 56322, 56320])).toThrow();
  expect(() =>
    isolatedConfig(
      source.replace('project_id =', 'project_id='),
      'agency-integration-abcd',
      [56321, 56322, 56320],
    ),
  ).toThrow();
  expect(() =>
    isolatedConfig(
      source.replace('54321', '55555'),
      'agency-integration-abcd',
      [56321, 56322, 56320],
    ),
  ).toThrow();
  expect(() => isolatedConfig(source, 'agency-integration-abcd', [56321, 56321, 56320])).toThrow();
});
