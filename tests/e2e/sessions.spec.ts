import { expect, test, type Page } from '@playwright/test';
import { demoLeads } from '../../src/lib/demo';

const accountA = demoLeads()
  .slice(0, 1)
  .map((lead) => ({ ...lead, name: 'Contato privado A' }));
const accountB = demoLeads()
  .slice(0, 1)
  .map((lead) => ({ ...lead, name: 'Contato privado B' }));

async function mockAuth(page: Page) {
  await page.route('http://127.0.0.1:54321/auth/v1/**', async (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/logout')) {
      await route.fulfill({ status: 204 });
      return;
    }
    const { email } = route.request().postDataJSON();
    await route.fulfill({
      json: {
        access_token: email === 'b@example.test' ? 'test-session-b' : 'test-session-a',
        token_type: 'bearer',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
        user: {
          id: '00000000-0000-4000-8000-000000000901',
          email,
          aud: 'authenticated',
          role: 'authenticated',
          created_at: new Date().toISOString(),
          app_metadata: { provider: 'email' },
          user_metadata: {},
        },
      },
    });
  });
}

async function signIn(page: Page, email = 'a@example.test') {
  await page.getByRole('button', { name: 'Conectar CRM' }).click();
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Entrar no workspace' }).click();
  await expect(page.getByText('Conectado ao Supabase', { exact: true })).toBeVisible();
}

test('changing contacts through calendar and board clears draft and consent/call inputs', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Resposta do operador').fill('Mensagem destinada somente à Marina');
  await page.getByText('Qualificação e próximos passos').click();
  await page.getByLabel('Evidência do consentimento').fill('Evidência exclusiva da Marina');
  await page.getByLabel('Call · horário local').fill('2030-01-02T10:00');
  await page.getByRole('button', { name: /Agenda/ }).click();
  await page.getByRole('button', { name: /Pedro Alves/ }).click();
  await expect(page.getByRole('heading', { name: 'Pedro Alves', exact: true })).toBeVisible();
  await expect(page.getByLabel('Resposta do operador')).toHaveValue('');
  await page.getByText('Qualificação e próximos passos').click();
  await expect(page.getByLabel('Evidência do consentimento')).toHaveValue('');
  await expect(page.getByLabel('Call · horário local')).toHaveValue('');
  await page.getByLabel('Resposta do operador').fill('Mensagem destinada somente ao Pedro');
  await page.getByLabel('Evidência do consentimento').fill('Evidência exclusiva do Pedro');
  await page.getByRole('button', { name: /Pipeline/ }).click();
  await page.getByRole('button', { name: /Marina Costa/ }).click();
  await expect(page.getByLabel('Resposta do operador')).toHaveValue('');
  await page.getByText('Qualificação e próximos passos').click();
  await expect(page.getByLabel('Evidência do consentimento')).toHaveValue('');
});

for (const operation of ['refresh', 'action'] as const) {
  test(`late ${operation} response cannot restore previous session after logout and login`, async ({
    page,
  }) => {
    await mockAuth(page);
    let hold = false;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let received: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      received = resolve;
    });
    await page.route('**/api/crm', async (route) => {
      const oldSession = route.request().headers().authorization === 'Bearer test-session-a';
      if (hold && oldSession) {
        received();
        await gate;
      }
      await route.fulfill({ json: { leads: oldSession ? accountA : accountB } });
    });
    await page.goto('/');
    await page.getByLabel('Resposta do operador').fill('Rascunho anterior ao login');
    await signIn(page);
    await expect(page.getByLabel('Resposta do operador')).toHaveValue('');
    await page.getByLabel('Resposta do operador').fill('Rascunho privado da conta A');
    hold = true;
    await page
      .getByRole('button', {
        name: operation === 'refresh' ? 'Atualizar CRM' : 'Assumir conversa',
      })
      .click();
    await started;
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(page.getByText('Demo interativa · dados fictícios')).toBeVisible();
    await expect(page.getByLabel('Resposta do operador')).toHaveValue('');
    await expect(page.getByText('Contato privado A', { exact: true })).toHaveCount(0);
    await signIn(page, 'b@example.test');
    await expect(
      page.getByRole('heading', { name: 'Contato privado B', exact: true }),
    ).toBeVisible();
    await page.getByLabel('Resposta do operador').fill('Rascunho exclusivo da conta B');
    const oldResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/crm') &&
        response.request().headers().authorization === 'Bearer test-session-a',
    );
    release();
    await (await oldResponse).finished();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    await expect(
      page.getByRole('heading', { name: 'Contato privado B', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Contato privado A', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Resposta do operador')).toHaveValue(
      'Rascunho exclusivo da conta B',
    );
  });
}
