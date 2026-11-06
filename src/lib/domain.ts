import { z } from 'zod';

export const stages = ['new', 'qualifying', 'qualified', 'booked', 'closed'] as const;
export const stageLabels: Record<Stage, string> = {
  new: 'Novos',
  qualifying: 'Em conversa',
  qualified: 'Qualificados',
  booked: 'Call marcada',
  closed: 'Encerrados',
};
export type Stage = (typeof stages)[number];
export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(['lead', 'assistant', 'operator', 'note']),
  text: z.string().max(4000),
  at: z.iso.datetime({ offset: true }),
  status: z.enum(['received', 'draft', 'sending', 'sent', 'uncertain', 'note']),
});
export type Message = z.infer<typeof messageSchema>;
export const leadSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(100),
  phone: z.string().regex(/^\d{10,15}$/),
  company: z.string().max(120),
  service: z.string().max(120),
  budget: z.number().nonnegative().max(1e9).nullable(),
  timeline: z.string().max(120),
  stage: z.enum(stages),
  consent: z.boolean(),
  opted_out: z.boolean(),
  human: z.boolean(),
  call_at: z.iso.datetime({ offset: true }).nullable(),
  last_inbound_at: z.iso.datetime({ offset: true }).nullable(),
  messages: z.array(messageSchema).max(200),
  revision: z.number().int().nonnegative(),
});
export type Lead = z.infer<typeof leadSchema>;
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'), stage: z.enum(stages) }),
  z.object({ type: z.literal('handoff'), human: z.boolean() }),
  z.object({
    type: z.literal('consent'),
    consent: z.boolean(),
    evidence: z.string().min(8).max(500),
  }),
  z.object({
    type: z.literal('qualify'),
    service: z.string().min(1).max(120),
    budget: z.number().nonnegative().max(1e9),
    timeline: z.string().min(1).max(120),
  }),
  z.object({ type: z.literal('schedule'), at: z.iso.datetime({ offset: true }) }),
  z.object({ type: z.literal('draft') }),
  z.object({ type: z.literal('send'), text: z.string().trim().min(1).max(2000) }),
  z.object({ type: z.literal('forget') }),
  z.object({
    type: z.literal('reconcile'),
    messageId: z.string().min(1),
    delivered: z.boolean(),
    evidence: z.string().min(8).max(500),
  }),
]);
export type Action = z.infer<typeof actionSchema>;
export function qualification(lead: Lead) {
  return [Boolean(lead.service), lead.budget !== null, Boolean(lead.timeline)].filter(Boolean)
    .length;
}
export function canSend(lead: Lead, now = new Date()) {
  const elapsed = lead.last_inbound_at
    ? now.getTime() - Date.parse(lead.last_inbound_at)
    : Infinity;
  return lead.consent && !lead.opted_out && elapsed >= 0 && elapsed < 24 * 60 * 60 * 1000;
}
export function ruleDraft(lead: Lead) {
  if (!lead.service)
    return 'Oi! Sou a assistente virtual da agência. Que tipo de conteúdo ou lançamento você quer criar?';
  if (lead.budget === null)
    return 'Legal! Qual faixa de investimento você reservou para esse projeto?';
  if (!lead.timeline)
    return 'E quando você gostaria de começar? Assim nossa equipe consegue avaliar a disponibilidade.';
  return 'Obrigada por compartilhar! Podemos combinar uma conversa com a equipe para entender o projeto? Qual horário funciona para você?';
}
export function transition(lead: Lead, action: Action, now = new Date()): Lead {
  const next = structuredClone(lead);
  let note = '';
  switch (action.type) {
    case 'move':
      if (action.stage === 'qualified' && qualification(lead) < 3)
        throw new Error('Preencha serviço, orçamento e prazo antes de qualificar.');
      if (action.stage === 'booked' && !lead.call_at)
        throw new Error('Agende uma call antes de mover para essa etapa.');
      next.stage = action.stage;
      note = `Etapa: ${stageLabels[action.stage]}`;
      break;
    case 'handoff':
      if (!action.human && lead.opted_out)
        throw new Error('Contato com opt-out: automação bloqueada.');
      next.human = action.human;
      note = action.human
        ? 'Operador assumiu a conversa. IA pausada.'
        : 'Operador reativou os rascunhos da IA.';
      break;
    case 'consent':
      next.consent = action.consent;
      next.opted_out = !action.consent;
      if (!action.consent) next.human = true;
      note = `Consentimento ${action.consent ? 'registrado' : 'revogado'}: ${action.evidence}`;
      break;
    case 'qualify':
      next.service = action.service;
      next.budget = action.budget;
      next.timeline = action.timeline;
      next.stage = 'qualified';
      note = 'Qualificação confirmada pelo operador.';
      break;
    case 'schedule':
      if (!lead.consent || lead.opted_out)
        throw new Error('Registre o consentimento antes de agendar.');
      if (qualification(lead) < 3) throw new Error('Complete a qualificação antes de agendar.');
      if (Date.parse(action.at) <= now.getTime()) throw new Error('Escolha um horário futuro.');
      next.call_at = action.at;
      next.stage = 'booked';
      note = `Call registrada no CRM: ${action.at}`;
      break;
    case 'draft':
      if (lead.human || lead.opted_out || !lead.consent)
        throw new Error('IA pausada: confira handoff e consentimento.');
      next.messages.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        text: ruleDraft(lead),
        at: now.toISOString(),
        status: 'draft',
      });
      break;
    case 'send':
      if (!canSend(lead, now))
        throw new Error('Envio exige consentimento e mensagem recebida nas últimas 24 horas.');
      if (lead.messages.some((m) => m.status === 'sending' || m.status === 'uncertain'))
        throw new Error('Confira o envio pendente no provedor antes de tentar novamente.');
      next.messages.push({
        id: crypto.randomUUID(),
        role: 'operator',
        text: action.text,
        at: now.toISOString(),
        status: 'sending',
      });
      break;
    case 'reconcile': {
      const pending = next.messages.find((m) => m.id === action.messageId);
      if (!pending || !['sending', 'uncertain'].includes(pending.status))
        throw new Error('Envio pendente não encontrado.');
      if (now.getTime() - Date.parse(pending.at) < 60000)
        throw new Error('Aguarde um minuto antes de reconciliar o envio.');
      pending.status = action.delivered ? 'sent' : 'note';
      note = `Envio conferido no provedor: ${action.delivered ? 'entregue' : 'não enviado'}. ${action.evidence}`;
      break;
    }
    case 'forget':
      throw new Error('A exclusão é executada pelo repositório.');
  }
  if (note)
    next.messages.push({
      id: crypto.randomUUID(),
      role: 'note',
      text: note,
      at: now.toISOString(),
      status: 'note',
    });
  next.messages = retainMessages(next.messages);
  next.revision += 1;
  return leadSchema.parse(next);
}

export function retainMessages(messages: Message[]) {
  const pending = messages.filter((m) => ['sending', 'uncertain'].includes(m.status));
  const recent = messages
    .filter((m) => !['sending', 'uncertain'].includes(m.status))
    .slice(-(200 - pending.length));
  const ids = new Set([...pending, ...recent].map((m) => m.id));
  return messages.filter((m) => ids.has(m.id));
}
