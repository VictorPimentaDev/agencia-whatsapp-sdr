import type { Lead, Stage } from './domain';

const people: Array<[string, string, string, Stage, number | null, string, boolean]> = [
  ['Marina Costa', 'Estúdio Aurora', 'Conteúdo mensal', 'qualifying', 6500, '', false],
  [
    'Rafael Nunes',
    'Curso Horizonte',
    'Lançamento digital',
    'qualified',
    18000,
    'Próximo mês',
    false,
  ],
  ['Clara Lima', 'Casa Botânica', 'Conteúdo mensal', 'new', null, '', false],
  ['Pedro Alves', 'Método Norte', 'Lançamento digital', 'booked', 24000, 'Em 30 dias', false],
  ['Beatriz Rocha', 'Ateliê Forma', 'Social media', 'qualifying', null, '', true],
  ['Lucas Reis', 'Escola Movimento', 'Vídeos curtos', 'qualified', 9000, 'Em 2 semanas', false],
  ['Sofia Melo', 'Café da Praça', '', 'new', null, '', false],
  ['Daniel Luz', 'Studio Frame', 'Conteúdo mensal', 'closed', 4000, 'Sem previsão', true],
];
export function demoLeads(now = new Date('2026-11-06T18:00:00Z')): Lead[] {
  return people.map(([name, company, service, stage, budget, timeline, human], i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    name,
    company,
    phone: `55000000000${i}`,
    service,
    stage,
    budget,
    timeline,
    human,
    consent: true,
    opted_out: false,
    call_at: stage === 'booked' ? new Date(now.getTime() + 86400000).toISOString() : null,
    last_inbound_at: now.toISOString(),
    revision: 0,
    messages: [
      {
        id: `in-${i}`,
        role: 'lead',
        text:
          i === 0
            ? 'Oi! Vi o trabalho de vocês e queria entender como funciona a produção de conteúdo mensal.'
            : `Olá! Tenho interesse em ${service || 'conhecer o trabalho de vocês'}.`,
        at: now.toISOString(),
        status: 'received',
      },
      {
        id: `out-${i}`,
        role: 'assistant',
        text: 'Oi! Sou a assistente virtual da agência. Posso fazer algumas perguntas sobre o seu projeto?',
        at: now.toISOString(),
        status: 'sent',
      },
      {
        id: `reply-${i}`,
        role: 'lead',
        text:
          i === 0
            ? 'Pode sim! Temos um estúdio de design. Reservamos R$ 6.500 por mês e queremos dar mais consistência ao Instagram.'
            : 'Pode sim, vamos conversar!',
        at: now.toISOString(),
        status: 'received',
      },
    ],
  }));
}
