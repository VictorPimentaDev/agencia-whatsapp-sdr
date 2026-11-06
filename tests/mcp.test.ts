import { expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
it('negotiates MCP and exposes no sending, erasure or consent tools', async () => {
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', 'scripts/mcp.ts'],
    env: {
      PATH: process.env.PATH ?? '',
      CRM_URL: 'http://127.0.0.1:3000',
      CRM_ACCESS_TOKEN: 'test-only',
    },
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(['list_leads', 'update_lead']);
    const schema = JSON.stringify(tools.find((t) => t.name === 'update_lead')?.inputSchema);
    expect(schema).not.toContain('"send"');
    expect(schema).not.toContain('"forget"');
    expect(schema).not.toContain('"consent"');
  } finally {
    await client.close();
  }
}, 15000);
