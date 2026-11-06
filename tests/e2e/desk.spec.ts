import { expect, test } from '@playwright/test';
test('operator qualifies, books, pauses AI and reviews a draft before sending', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Cada conversa, uma possibilidade.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Gerar rascunho', exact: true }).click();
  await expect(page.getByText('Assistente virtual · rascunho')).toBeVisible();
  await page.getByRole('button', { name: 'Usar último rascunho' }).click();
  await expect(page.getByLabel('Resposta do operador')).not.toHaveValue('');
  await page.getByRole('button', { name: 'Simular envio' }).click();
  await expect(page.getByLabel('Resposta do operador')).toHaveValue('');
  await page.getByRole('button', { name: 'Assumir conversa' }).click();
  await expect(page.getByRole('button', { name: 'Gerar rascunho', exact: true })).toBeDisabled();
  await page.getByText('Qualificação e próximos passos').click();
  await page.getByLabel('Prazo', { exact: true }).fill('Em 30 dias');
  await page.getByRole('button', { name: 'Confirmar qualificação' }).click();
  await expect(
    page
      .getByRole('region', { name: 'Qualificados', exact: true })
      .getByRole('button', { name: /Marina Costa/ }),
  ).toBeVisible();
  const future = new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 16);
  await page.getByLabel('Call · horário local').fill(future);
  await page.getByRole('button', { name: 'Registrar call' }).click();
  await page.getByRole('button', { name: /Agenda/ }).click();
  await expect(page.getByRole('button', { name: /Marina Costa/ })).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('private endpoints fail closed without credentials', async ({ request }) => {
  expect((await request.get('/api/crm')).status()).toBe(401);
  expect((await request.post('/api/crm', { data: {} })).status()).toBe(401);
  expect(
    (await request.get('/api/webhooks/cloud?hub.mode=subscribe&hub.verify_token=no')).status(),
  ).toBe(403);
});
