'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { LoginDialog } from './login-dialog';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  CirclePause,
  Columns3,
  Leaf,
  LogOut,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { demoLeads } from '@/lib/demo';
import {
  canSend,
  leadSchema,
  qualification,
  stages,
  stageLabels,
  transition,
  type Action,
} from '@/lib/domain';
import { z } from 'zod';

interface Connection {
  url: string;
  key: string;
}
export function Desk({ connection }: { connection: Connection | null }) {
  const [leads, setLeads] = useState(demoLeads);
  const [selected, setSelected] = useState(leads[0].id);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'pipeline' | 'calendar'>('pipeline');
  const [token, setToken] = useState('');
  const [login, setLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [compose, setCompose] = useState('');
  const [detailVersion, setDetailVersion] = useState(0);
  const sessionGeneration = useRef(0);
  const selectedLead = useRef(selected);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const lead = leads.find((l) => l.id === selected);
  const filtered = leads.filter((l) =>
    `${l.name} ${l.company}`.toLowerCase().includes(search.toLowerCase()),
  );
  function selectLead(id: string) {
    selectedLead.current = id;
    setSelected(id);
    setCompose('');
    setDetailVersion((version) => version + 1);
  }
  async function refresh(access = token, generation = sessionGeneration.current) {
    try {
      const response = await fetch('/api/crm', {
        headers: { Authorization: `Bearer ${access}` },
      });
      if (!response.ok) throw new Error('Sessão expirada ou CRM indisponível. Entre novamente.');
      const data = z.object({ leads: z.array(leadSchema) }).parse(await response.json());
      // A response from a previous session must never restore its private records.
      if (generation !== sessionGeneration.current) return null;
      setLeads(data.leads);
      return data.leads;
    } catch (error) {
      if (generation !== sessionGeneration.current) return null;
      throw error;
    }
  }
  async function act(action: Action, target = lead) {
    if (!target || busy) return;
    const generation = sessionGeneration.current;
    setBusy(true);
    setNotice('');
    try {
      if (token) {
        const response = await fetch('/api/crm', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: target.id, revision: target.revision, action }),
        });
        const data: unknown = await response.json();
        if (generation !== sessionGeneration.current) return;
        if (!response.ok) {
          await refresh(token, generation);
          throw new Error(z.object({ error: z.string() }).parse(data).error);
        }
        setLeads(z.object({ leads: z.array(leadSchema) }).parse(data).leads);
      } else if (action.type === 'forget')
        setLeads((previous) => previous.filter((l) => l.id !== target.id));
      else {
        const now = new Date();
        const next = transition({ ...target, last_inbound_at: now.toISOString() }, action, now);
        if (action.type === 'send') next.messages[next.messages.length - 1].status = 'sent';
        setLeads((previous) => previous.map((l) => (l.id === target.id ? next : l)));
      }
      if (action.type === 'send' && selectedLead.current === target.id) setCompose('');
      setNotice(token ? 'CRM atualizado.' : 'Demo atualizada. Nenhuma mensagem real enviada.');
    } catch (error) {
      if (generation === sessionGeneration.current)
        setNotice(error instanceof Error ? error.message : 'Não foi possível atualizar.');
    } finally {
      if (generation === sessionGeneration.current) setBusy(false);
    }
  }
  async function signIn(form: FormData) {
    if (!connection) return;
    const client =
      supabase ??
      createClient(connection.url, connection.key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    setSupabase(client);
    const generation = ++sessionGeneration.current;
    selectLead(selected);
    setBusy(true);
    setNotice('');
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: String(form.get('email')),
        password: String(form.get('password')),
      });
      if (generation !== sessionGeneration.current) return;
      if (error || !data.session) throw new Error('E-mail ou senha inválidos.');
      const loaded = await refresh(data.session.access_token, generation);
      if (!loaded || generation !== sessionGeneration.current) return;
      setToken(data.session.access_token);
      selectLead(loaded[0]?.id ?? '');
      setSearch('');
      setView('pipeline');
      setLogin(false);
    } catch (error) {
      if (generation === sessionGeneration.current)
        setNotice(error instanceof Error ? error.message : 'Falha ao entrar.');
    } finally {
      if (generation === sessionGeneration.current) setBusy(false);
    }
  }
  function signOut() {
    sessionGeneration.current += 1;
    void supabase?.auth.signOut({ scope: 'local' });
    const demo = demoLeads();
    setToken('');
    setLeads(demo);
    selectLead(demo[0].id);
    setSearch('');
    setView('pipeline');
    setBusy(false);
    setNotice('Sessão encerrada.');
  }
  function closeLogin() {
    sessionGeneration.current += 1;
    setLogin(false);
    setBusy(false);
  }
  const budget = leads
    .filter((l) => l.stage !== 'closed')
    .reduce((total, l) => total + (l.budget ?? 0), 0);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Agência SDR início">
          <span className="brand-icon">
            <Leaf size={22} />
          </span>
          agência<span className="brand-dot">.</span>
        </Link>
        <div className="workspace">
          <span className="workspace-avatar">A</span>
          <div>
            <strong>Agência Studio</strong>
            <small>Workspace de demonstração</small>
          </div>
        </div>
        <p className="nav-label">SEU ESPAÇO</p>
        <nav aria-label="Navegação principal">
          <button
            className={view === 'pipeline' ? 'active' : ''}
            onClick={() => setView('pipeline')}
          >
            <Columns3 size={18} />
            Pipeline<span className="count">{leads.length}</span>
          </button>
          <button
            className={view === 'calendar' ? 'active' : ''}
            onClick={() => setView('calendar')}
          >
            <CalendarDays size={18} />
            Agenda<span className="count">{leads.filter((l) => l.call_at).length}</span>
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="live-dot" />
          <strong>Você no comando</strong>
          <p>
            A IA prepara a conversa.
            <br />
            Sua equipe dá o próximo passo.
          </p>
          <span className="tiny-tag">HUMAN IN THE LOOP</span>
        </div>
        <div className="sidebar-bottom">
          <ShieldCheck size={17} />
          <span>Consentimento vem primeiro</span>
        </div>
        <a
          className="help-link"
          href="https://github.com/VictorPimentaDev/agencia-whatsapp-sdr#readme"
          target="_blank"
          rel="noreferrer"
        >
          <CircleHelp size={16} />
          Documentação
          <ArrowUpRight size={14} />
        </a>
        <div className="profile">
          <span className="profile-avatar">OP</span>
          <div>
            <strong>Operador</strong>
            <small>{token ? 'Supabase conectado' : 'Modo demonstração'}</small>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            Workspace
            <ChevronRight size={13} />
            <strong>{view === 'pipeline' ? 'Pipeline' : 'Agenda'}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-pill">
              <span className="live-dot" />
              {token ? 'Conectado ao Supabase' : 'Demo interativa · dados fictícios'}
            </span>
            {token && (
              <button className="text-button" aria-label="Sair" onClick={signOut}>
                <LogOut size={14} />
                Sair
              </button>
            )}
            {connection && !token && (
              <button className="text-button" onClick={() => setLogin(true)}>
                Conectar CRM
                <ArrowUpRight size={14} />
              </button>
            )}
          </div>
        </header>
        <section className="page-intro">
          <div>
            <p className="eyebrow">BOAS CONVERSAS. NOVOS PROJETOS.</p>
            <h1>
              {view === 'pipeline' ? 'Cada conversa, uma possibilidade.' : 'Um bom próximo passo.'}
            </h1>
            <p className="subtitle">
              {view === 'pipeline'
                ? 'Do primeiro oi à próxima call. Com contexto, cuidado e a sua voz.'
                : 'Calls registradas no CRM. Combine o horário com o lead antes de confirmar.'}
            </p>
          </div>
          <button
            className="primary-button"
            onClick={() => {
              if (token) {
                void refresh().catch((e) => setNotice(String(e)));
              } else {
                setLeads(demoLeads());
                selectLead(demoLeads()[0].id);
                setNotice('Demo restaurada.');
              }
            }}
          >
            <Plus size={16} />
            {token ? 'Atualizar CRM' : 'Recomeçar demo'}
          </button>
        </section>
        <section className="metrics" aria-label="Resumo do pipeline">
          <Metric
            label="Conversas abertas"
            value={String(leads.filter((l) => l.stage !== 'closed').length).padStart(2, '0')}
            detail="Oportunidades em movimento"
            icon={<MessageCircle size={18} />}
          />
          <Metric
            label="Prontos para conversar"
            value={String(leads.filter((l) => l.stage === 'qualified').length).padStart(2, '0')}
            detail="Serviço, verba e prazo alinhados"
            icon={<Sparkles size={18} />}
          />
          <Metric
            label="Calls agendadas"
            value={String(leads.filter((l) => l.call_at).length).padStart(2, '0')}
            detail="Seu próximo encontro"
            icon={<CalendarDays size={18} />}
          />
          <Metric
            label="Orçamento informado"
            value={money(budget)}
            detail="Declarado pelos leads · não é receita"
            icon={<ArrowUpRight size={18} />}
          />
        </section>
        <section className="work-area">
          <div className="board-toolbar">
            <div className="board-title">
              <span className="live-dot" />
              <h2>{view === 'pipeline' ? 'Pipeline de relacionamento' : 'Agenda de calls'}</h2>
              <span className="quiet">{leads.length} contatos</span>
            </div>
            <label className="search">
              <Search size={16} />
              <input
                aria-label="Buscar contato ou empresa"
                placeholder="Buscar contato ou empresa"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>⌕</kbd>
            </label>
          </div>
          <div className="board-and-detail">
            <div className="board-scroll">
              {view === 'pipeline' ? (
                <div className="kanban">
                  {stages.map((stage, index) => (
                    <section
                      key={stage}
                      className={`column stage-${stage}`}
                      aria-label={stageLabels[stage]}
                    >
                      <div className="column-heading">
                        <span className="stage-dot" />
                        <h3>{stageLabels[stage]}</h3>
                        <span>{filtered.filter((l) => l.stage === stage).length}</span>
                        <span className="stage-index">0{index + 1}</span>
                      </div>
                      <div className="cards">
                        {filtered
                          .filter((l) => l.stage === stage)
                          .map((l) => (
                            <button
                              className={`lead-card ${selected === l.id ? 'selected' : ''}`}
                              key={l.id}
                              onClick={() => selectLead(l.id)}
                            >
                              <div className="card-top">
                                <span className={`avatar tone-${index}`}>{initials(l.name)}</span>
                                <span className={`status-tag ${l.human ? 'human' : ''}`}>
                                  {l.human ? (
                                    <>
                                      <Users size={11} />
                                      Humano
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles size={11} />
                                      Assistido
                                    </>
                                  )}
                                </span>
                              </div>
                              <strong>{l.name}</strong>
                              <span className="company">{l.company || 'Novo contato'}</span>
                              <span className="service">
                                {l.service || 'Descobrindo o projeto'}
                              </span>
                              <div className="card-bottom">
                                <span>
                                  {l.budget === null ? 'Verba a entender' : money(l.budget)}
                                </span>
                                <span
                                  className="progress-dots"
                                  aria-label={`${qualification(l)} de 3 campos preenchidos`}
                                >
                                  {[1, 2, 3].map((n) => (
                                    <i key={n} className={qualification(l) >= n ? 'filled' : ''} />
                                  ))}
                                </span>
                              </div>
                            </button>
                          ))}
                        {filtered.filter((l) => l.stage === stage).length === 0 && (
                          <div className="empty-column">
                            Espaço para a próxima
                            <br />
                            boa conversa.
                          </div>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="calendar-list">
                  {filtered
                    .filter((l) => l.call_at)
                    .map((l) => (
                      <button key={l.id} className="appointment" onClick={() => selectLead(l.id)}>
                        <CalendarDays />
                        <div>
                          <strong>{l.name}</strong>
                          <span>{l.call_at ? dateLabel(l.call_at) : ''}</span>
                        </div>
                        <ChevronRight />
                      </button>
                    ))}
                  {!filtered.some((l) => l.call_at) && <p>Nenhuma call agendada ainda.</p>}
                  <p className="calendar-note">
                    Agendamento interno. Este starter não envia convites nem verifica
                    disponibilidade em calendários externos.
                  </p>
                </div>
              )}
            </div>
            {lead ? (
              <aside
                key={`${detailVersion}:${lead.id}`}
                className="detail"
                aria-label="Detalhes do contato"
              >
                <div className="detail-heading">
                  <span className="eyebrow">A CONVERSA EM CONTEXTO</span>
                  <MessageCircle size={16} />
                </div>
                <div className="contact-heading">
                  <span className="avatar large tone-0">{initials(lead.name)}</span>
                  <div>
                    <h2>{lead.name}</h2>
                    <p>{lead.company || 'WhatsApp'}</p>
                  </div>
                </div>
                <div className="contact-tags">
                  <span>
                    <span className="live-dot" />
                    WhatsApp
                  </span>
                  <span>
                    {lead.consent && !lead.opted_out ? (
                      <>
                        <ShieldCheck size={12} />
                        Consentimento registrado
                      </>
                    ) : (
                      'Consentimento pendente'
                    )}
                  </span>
                </div>
                <div className="qualification">
                  <div>
                    <strong>Contexto do projeto</strong>
                    <span>{qualification(lead)}/3</span>
                  </div>
                  <div className="qualification-bar">
                    <i style={{ width: `${(qualification(lead) / 3) * 100}%` }} />
                  </div>
                  <dl>
                    <div>
                      <dt>Serviço</dt>
                      <dd>{lead.service || 'A entender'}</dd>
                    </div>
                    <div>
                      <dt>Investimento</dt>
                      <dd>{lead.budget === null ? 'A entender' : `${money(lead.budget)}`}</dd>
                    </div>
                    <div>
                      <dt>Prazo</dt>
                      <dd className={!lead.timeline ? 'missing' : ''}>
                        {lead.timeline || 'Próxima pergunta'}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="conversation" aria-label="Histórico da conversa">
                  {lead.messages.slice(-6).map((m) => (
                    <div key={m.id} className={`message ${m.role}`}>
                      <span className="message-label">
                        {m.role === 'lead'
                          ? lead.name.split(' ')[0]
                          : m.role === 'note'
                            ? 'Registro do CRM'
                            : m.role === 'assistant'
                              ? 'Assistente virtual'
                              : 'Operador'}
                        {m.status === 'draft' && ' · rascunho'}
                      </span>
                      <p>{m.text}</p>
                      {m.status === 'uncertain' && (
                        <strong className="warning">Entrega incerta — confira no provedor.</strong>
                      )}
                    </div>
                  ))}
                </div>
                <div className="assistant-note">
                  <Sparkles size={15} />
                  <p>
                    {lead.human
                      ? 'Atendimento humano ativo. A IA está pausada.'
                      : 'A IA sugere. Você revisa e aprova antes de enviar.'}
                  </p>
                </div>
                <div className="detail-actions">
                  <button
                    disabled={busy || lead.human || !lead.consent || lead.opted_out}
                    onClick={() => void act({ type: 'draft' })}
                  >
                    <Sparkles size={14} />
                    Gerar rascunho
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void act({ type: 'handoff', human: !lead.human })}
                  >
                    <CirclePause size={14} />
                    {lead.human ? 'Retomar IA' : 'Assumir conversa'}
                  </button>
                </div>
                <details className="contact-controls">
                  <summary>
                    Qualificação e próximos passos
                    <ChevronRight size={14} />
                  </summary>
                  <form
                    key={`qualify-${lead.id}`}
                    action={(form) =>
                      void act({
                        type: 'qualify',
                        service: String(form.get('service')),
                        budget: Number(form.get('budget')),
                        timeline: String(form.get('timeline')),
                      })
                    }
                  >
                    <label>
                      Serviço
                      <input name="service" defaultValue={lead.service} required maxLength={120} />
                    </label>
                    <label>
                      Orçamento (R$)
                      <input
                        name="budget"
                        type="number"
                        min="0"
                        max="1000000000"
                        defaultValue={lead.budget ?? ''}
                        required
                      />
                    </label>
                    <label>
                      Prazo
                      <input
                        name="timeline"
                        defaultValue={lead.timeline}
                        required
                        maxLength={120}
                      />
                    </label>
                    <button disabled={busy} className="small-primary">
                      <Check size={13} />
                      Confirmar qualificação
                    </button>
                  </form>
                  <label>
                    Etapa
                    <select
                      value={lead.stage}
                      disabled={busy}
                      onChange={(e) => {
                        const stage = stages.find((s) => s === e.target.value);
                        if (stage) void act({ type: 'move', stage });
                      }}
                    >
                      {stages.map((s) => (
                        <option value={s} key={s}>
                          {stageLabels[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <form
                    action={(form) => {
                      const value = String(form.get('at'));
                      if (value) void act({ type: 'schedule', at: new Date(value).toISOString() });
                    }}
                  >
                    <label>
                      Call · horário local
                      <input name="at" type="datetime-local" required />
                    </label>
                    <button disabled={busy} className="small-primary">
                      <CalendarDays size={13} />
                      Registrar call
                    </button>
                  </form>
                  <form
                    action={(form) =>
                      void act({
                        type: 'consent',
                        consent: !lead.consent,
                        evidence: String(form.get('evidence')),
                      })
                    }
                  >
                    <label>
                      Evidência do consentimento
                      <input
                        name="evidence"
                        minLength={8}
                        maxLength={500}
                        placeholder="Ex.: confirmado por mensagem"
                        required
                      />
                    </label>
                    <button disabled={busy}>
                      {lead.consent ? 'Revogar consentimento' : 'Registrar consentimento'}
                    </button>
                  </form>
                  {lead.messages
                    .filter((m) => m.status === 'uncertain' || m.status === 'sending')
                    .map((m) => (
                      <form
                        key={m.id}
                        action={(form) =>
                          void act({
                            type: 'reconcile',
                            messageId: m.id,
                            delivered: form.get('delivered') === 'yes',
                            evidence: String(form.get('evidence')),
                          })
                        }
                      >
                        <p>Confira o envio no provedor antes de liberar uma nova tentativa.</p>
                        <label>
                          Resultado confirmado
                          <select name="delivered">
                            <option value="yes">Mensagem entregue</option>
                            <option value="no">Mensagem não enviada</option>
                          </select>
                        </label>
                        <label>
                          Evidência da conferência
                          <input name="evidence" minLength={8} maxLength={500} required />
                        </label>
                        <button disabled={busy}>Registrar conferência</button>
                      </form>
                    ))}
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          'Apagar este contato e suas mensagens? Esta ação não pode ser desfeita.',
                        )
                      )
                        void act({ type: 'forget' });
                    }}
                  >
                    Apagar contato e histórico
                  </button>
                </details>
                <form
                  className="composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act({ type: 'send', text: compose });
                  }}
                >
                  <label htmlFor="reply">Resposta do operador</label>
                  <textarea
                    id="reply"
                    value={compose}
                    maxLength={2000}
                    onChange={(e) => setCompose(e.target.value)}
                    placeholder="Revise um rascunho ou escreva sua resposta…"
                  />
                  <div>
                    <button
                      type="button"
                      disabled={busy || !lead.messages.some((m) => m.status === 'draft')}
                      onClick={() =>
                        setCompose(
                          lead.messages.filter((m) => m.status === 'draft').at(-1)?.text ?? '',
                        )
                      }
                    >
                      Usar último rascunho
                    </button>
                    <button
                      className="send-button"
                      disabled={
                        busy ||
                        !compose.trim() ||
                        (token ? !canSend(lead) : !lead.consent || lead.opted_out)
                      }
                      type="submit"
                    >
                      {token ? 'Aprovar e enviar' : 'Simular envio'}
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                </form>
              </aside>
            ) : (
              <aside className="detail">
                <p>Selecione um contato para ver a conversa.</p>
              </aside>
            )}
          </div>
          <footer className="board-footer">
            <span>
              <ShieldCheck size={13} />
              Sem disparos em massa. Sem mensagens sem consentimento.
            </span>
            <span>
              <ArrowDownLeft size={13} />
              Feito para conversas de verdade.
            </span>
          </footer>
        </section>
        <div role="status" aria-live="polite" className={`notice ${notice ? 'visible' : ''}`}>
          {notice || 'Pronto.'}
          <button aria-label="Fechar aviso" onClick={() => setNotice('')}>
            <X size={14} />
          </button>
        </div>
        {login && <LoginDialog busy={busy} onClose={closeLogin} onSubmit={signIn} />}
      </main>
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="metric">
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('');
}
function money(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
}
function dateLabel(value: string) {
  return (
    new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(value)) + ' · São Paulo'
  );
}
