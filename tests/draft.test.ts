import { afterEach, expect, it, vi } from 'vitest';
import { draftReply } from '../src/lib/draft';
import { demoLeads } from '../src/lib/demo';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it('works offline and asks only for the missing field', async () => {
  vi.stubEnv('DRAFT_PROVIDER', 'rules');
  expect(await draftReply(demoLeads()[0])).toContain('começar');
});
it('sends qualification fields only to Ollama and validates output', async () => {
  vi.stubEnv('DRAFT_PROVIDER', 'ollama');
  vi.stubEnv('OLLAMA_URL', 'http://127.0.0.1:11434');
  vi.stubEnv('OLLAMA_MODEL', 'test');
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ message: { content: '{"reply":"Qual seria o prazo?"}' } }));
  vi.stubGlobal('fetch', fetcher);
  expect(await draftReply(demoLeads()[0])).toBe('Qual seria o prazo?');
  const body = String(fetcher.mock.calls[0][1].body);
  expect(body).not.toContain('Marina');
  expect(body).not.toContain('550000');
});
