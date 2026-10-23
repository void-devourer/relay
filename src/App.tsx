import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, AudioLines, CalendarDays, Check, CheckCheck, ChevronRight, CircleHelp, Clock3, Coffee, GitBranch, History, Home, LoaderCircle, MapPin, Mic, MicOff, RotateCcw, Settings2, ShieldCheck, ShoppingBag, Sparkles, TriangleAlert, Users, Utensils, Volume2, VolumeX, X } from 'lucide-react';
import { approvePlan, chooseScenario, connectionLabel, loadMeta, loadState, resetDemo, sendMessage, setPreference, testFailure, undoPlan, type Action, type Change, type Member, type Meta, type Plan, type Preferences, type State, type Task, type Trace } from './api';
import { BackendConnection, CalendarImport, ConstraintControls } from './UpgradeControls';

type Tab = 'today' | 'recovery' | 'memory' | 'activity';
type SpeechAPI = { start(): void; stop(): void; onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; lang: string; continuous: boolean; interimResults: boolean };
type SpeechConstructor = new () => SpeechAPI;
const tabs = [{ id: 'today', label: 'Today', icon: CalendarDays }, { id: 'recovery', label: 'Recovery', icon: GitBranch }, { id: 'memory', label: 'Memory', icon: Settings2 }, { id: 'activity', label: 'Activity', icon: History }] as const;
const scenarios = [
  { id: 'partner-delayed', title: 'Alex is running late', detail: 'A meeting runs into pickup.', icon: Clock3 },
  { id: 'school-early', title: 'School closes early', detail: 'Pickup moves to 3:10 PM.', icon: Home },
  { id: 'car-unavailable', title: 'The car is unavailable', detail: 'Travel takes a little longer.', icon: MapPin },
];
function time(minutes: number) { const hour = Math.floor(minutes / 60); return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`; }
function shortTime(minutes: number) { return time(minutes).replace(' AM', '').replace(' PM', ''); }
function dollars(n: number) { return `$${n.toFixed(n % 1 ? 2 : 0)}`; }
function memberName(state: State, id: string | number) { return state.members.find(m => m.id === id)?.name || String(id); }
function valueLabel(state: State, change: Change, value: string | number) { return change.field === 'owner' ? memberName(state, value) : change.field === 'start' || change.field === 'end' ? time(Number(value)) : String(value); }
function TaskIcon({ kind, size = 17 }: { kind: string; size?: number }) { const Icon = kind === 'pickup' ? Home : kind === 'grocery' ? ShoppingBag : kind === 'dinner' ? Utensils : Coffee; return <Icon size={size} />; }
function Avatar({ member, small = false }: { member: Member; small?: boolean }) { return <span className={`avatar ${small ? 'small' : ''}`} style={{ backgroundColor: member.color || '#d5e9df' }}>{member.initials}</span>; }

export default function App() {
  const [state, setState] = useState<State | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [tab, setTab] = useState<Tab>('today');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [traces, setTraces] = useState<Trace[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [review, setReview] = useState<'apply' | 'failure' | null>(null);
  const [input, setInput] = useState('');
  const [speechOutput, setSpeechOutput] = useState(false);
  const [listening, setListening] = useState(false);
  const [resetReview, setResetReview] = useState(false);
  const recognition = useRef<SpeechAPI | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const dialogButton = useRef<HTMLButtonElement>(null);
  const SpeechRecognition = (window as unknown as { SpeechRecognition?: SpeechConstructor; webkitSpeechRecognition?: SpeechConstructor }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: SpeechConstructor }).webkitSpeechRecognition;
  const selectedPlan = state?.plans.find(p => p.id === selectedPlanId) || state?.plans.find(p => p.feasible) || state?.plans[0];
  const isDisrupted = !!state && ['disrupted', 'planned', 'rolled_back'].includes(state.phase);
  const isResolved = state?.phase === 'resolved';
  const noSolution = isDisrupted && !!state?.plans.length && !state.plans.some(plan => plan.feasible);
  const canUndo = isResolved;
  const canApprove = !!state && !!selectedPlan?.feasible && selectedPlan.baseRevision === state.revision && !isResolved;

  useEffect(() => { let active = true; Promise.all([loadState(), loadMeta()]).then(([s, m]) => { if (active) { setState(s); setMeta(m); } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [state?.conversation.length, busy]);
  useEffect(() => {
    if (!review && !resetReview) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogButton.current?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const dialog = document.querySelector('[role="dialog"]');
      const focusable = dialog ? Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]')) : [];
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trapFocus);
    return () => { document.removeEventListener('keydown', trapFocus); previous?.focus(); };
  }, [review, resetReview]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) { setReview(null); setResetReview(false); } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [busy]);
  useEffect(() => () => { recognition.current?.stop(); }, []);

  async function run(action: () => Promise<Action>, message?: string) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await action();
      setState(result.state); setTraces(result.trace);
      setSelectedPlanId(current => result.state.plans.some(p => p.id === current && p.feasible) ? current : result.state.plans.find(p => p.feasible)?.id || '');
      if (message) setNotice(message);
      if (result.reply && speechOutput && 'speechSynthesis' in window) { window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(result.reply); utterance.rate = 0.96; window.speechSynthesis.speak(utterance); }
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That action could not finish. Please try again.');
      try { setState(await loadState()); } catch { /* Keep the last confirmed state visible. */ }
    } finally { setBusy(false); }
  }
  async function submit(event?: FormEvent, text = input) {
    event?.preventDefault(); const message = text.trim(); if (!message || busy) return;
    const planId = selectedPlan?.feasible && state && selectedPlan.baseRevision === state.revision && !isResolved ? selectedPlan.id : undefined;
    setInput(''); const result = await run(() => sendMessage(message, planId));
    if (result?.state.plans.length && ['planned', 'rolled_back'].includes(result.state.phase)) setSelectedPlanId(result.state.plans.find(p => p.feasible)?.id || '');
  }
  function toggleVoice() {
    if (listening) { recognition.current?.stop(); setListening(false); return; }
    if (!SpeechRecognition) { composer.current?.focus(); return; }
    const rec = new SpeechRecognition(); recognition.current = rec; rec.lang = 'en-US'; rec.continuous = false; rec.interimResults = false;
    rec.onresult = event => { setInput(event.results[0][0].transcript); composer.current?.focus(); };
    rec.onend = () => setListening(false);
    rec.onerror = () => { setListening(false); setError('Voice input is unavailable or microphone access was declined. You can type your request below.'); };
    try { rec.start(); setListening(true); } catch { setError('Could not start voice input. Type your request below.'); }
  }
  async function confirm() {
    if (!selectedPlan || !canApprove) return;
    const failure = review === 'failure';
    const result = await run(() => failure ? testFailure(selectedPlan.id) : approvePlan(selectedPlan.id));
    if (result) {
      const rolledBack = result.state.phase === 'rolled_back';
      setNotice(rolledBack ? 'Tasks were restored. Review a fresh alternative; the failed workflow is excluded.' : 'Plan applied. Your household is back in sync.');
      setReview(null); setTab(rolledBack ? 'recovery' : 'today');
    }
  }
  async function preference(key: keyof Preferences, value: number | boolean) { await run(() => setPreference(key, value), 'Household preference saved.'); }

  return <div className="app-shell">
    <aside className="navigation" aria-label="Primary navigation">
      <a className="brand-mark" href="#" onClick={event => { event.preventDefault(); setTab('today'); }} aria-label="Relay home"><span className="relay-glyph">r<span /></span></a>
      <div className="navigation-items">{tabs.map(item => <button key={item.id} className={`nav-button ${tab === item.id ? 'active' : ''}`} onClick={() => setTab(item.id)} aria-current={tab === item.id ? 'page' : undefined}><item.icon size={21} /><span>{item.label}</span>{item.id === 'recovery' && isDisrupted && <i />}</button>)}</div>
      <div className="nav-bottom"><span className="nav-family">PK</span><span className="nav-version">SANDBOX</span></div>
    </aside>

    <main className="main-content">
      <BackendConnection refresh={async () => { const [next, mode] = await Promise.all([loadState(), loadMeta()]); setState(next); setMeta(mode); setTraces([]); }} />
      <header className="topbar"><div className="wordmark">relay<span>life, back in sync.</span></div><div className="topbar-right"><span className="sandbox-pill"><ShieldCheck size={13} /> Sandbox demo</span><button className="reset-button" onClick={() => setResetReview(true)} disabled={busy || !state}><RotateCcw size={14} /><span>Reset day</span></button></div></header>
      <div className="page-content">
        <div className="page-heading"><div><p className="eyebrow">THE MEHTA HOUSEHOLD <span> / </span> {tab === 'today' ? 'THURSDAY' : tabs.find(t => t.id === tab)?.label.toUpperCase()}</p><h1>{tab === 'today' ? isResolved ? 'Back to a good afternoon.' : 'Life happens. Keep your rhythm.' : tab === 'recovery' ? 'A change of plans, handled.' : tab === 'memory' ? 'The little things Relay remembers.' : 'Every action, accounted for.'}</h1><p className="heading-description">{tab === 'today' ? 'A shared day. A little room for the unexpected.' : tab === 'recovery' ? 'Compare the tradeoffs. You decide what happens next.' : tab === 'memory' ? 'Your household’s preferences make every recovery feel like yours.' : 'A clear record of what changed, why, and who approved it.'}</p></div><div className="date-card"><CalendarDays size={18} /><div>{state?.calendarDate || 'Oct 15, 2026'}<span>{state?.calendarDate ? 'IMPORTED CALENDAR DAY' : 'SEEDED DEMO DAY'}</span></div></div></div>

        {error && <div className="feedback error" role="alert"><TriangleAlert size={17} /><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
        {notice && <div className="feedback success" role="status"><CheckCheck size={17} /><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={16} /></button></div>}
        {!state && !error && <div className="loading-panel"><LoaderCircle className="spin" size={26} /><p>Getting your household in sync…</p></div>}
        {!state && error && <button className="primary-button" onClick={() => window.location.reload()}>Try loading again</button>}

        {state && <>
          {(tab === 'today' || tab === 'recovery') && <ConstraintControls state={state} busy={busy} act={action => { void run(action); }} />}
          {tab === 'memory' && <CalendarImport busy={busy} act={action => { void run(action, 'Fixed calendar commitments imported and checked against the household plan.'); }} />}
          {(tab === 'today' || tab === 'recovery') && <>
            <section className={`day-status ${isDisrupted ? 'disrupted' : ''} ${isResolved ? 'resolved' : ''}`} aria-live="polite"><div className="status-icon">{isDisrupted ? <GitBranch size={21} /> : <CheckCheck size={21} />}</div><div><strong>{isResolved ? 'Your recovery plan is in place.' : state.phase === 'rolled_back' ? 'The service failed. Your schedule is safe.' : noSolution ? 'No safe recovery fits these facts.' : isDisrupted ? 'Something changed. We have a way forward.' : 'The afternoon is looking good.'}</strong><p>{isResolved ? 'Approved changes are saved. You can undo them at any time.' : state.phase === 'rolled_back' ? 'All tasks were restored. The failed workflow is excluded; review a fresh alternative.' : noSolution ? 'A verified availability change or an explicitly relaxed constraint is needed. Review the blocked options.' : isDisrupted ? `Feasible options: ${state.plans.filter(p => p.feasible).length} · No changes made until you approve.` : 'Pickup, groceries, and dinner fit together. Try a real-life curveball below.'}</p></div>{isDisrupted && tab === 'today' ? <button onClick={() => setTab('recovery')}>See recovery options <ArrowRight size={16} /></button> : isResolved ? <button onClick={() => run(undoPlan, 'Previous schedule restored. You can choose a new recovery.')} disabled={busy}><RotateCcw size={15} /> Undo changes</button> : <span className="status-dot-label"><i /> {isDisrupted ? 'Review needed' : 'All in sync'}</span>}</section>
            <div className="scenario-heading"><span>TRY A CURVEBALL</span><span>Add a change. Earlier facts stay in place.</span></div><div className="scenario-grid">{scenarios.map(scenario => <button key={scenario.id} className={`scenario-card ${state.scenario === scenario.id ? 'selected' : ''}`} disabled={busy} onClick={async () => { await run(() => chooseScenario(scenario.id)); }}><span className="scenario-icon"><scenario.icon size={18} /></span><span><strong>{scenario.title}</strong><small>{scenario.detail}</small></span><ArrowUpRight size={16} /></button>)}</div>
          </>}

          {tab === 'today' && <>
            <section className="schedule-panel panel"><div className="section-title"><div><p className="eyebrow">A LITTLE BIG PICTURE</p><h2>Your afternoon, connected.</h2></div><span className="subtle-badge"><span className="tiny-dot" /> {state.tasks.length} shared commitments</span></div>
              <Timeline state={state} />
              <DependencyFlow state={state} />
              <div className="timeline-key"><span><i className="key-dot family" /> Family time</span><span><i className="key-dot flexible" /> Flexible commitment</span><span><i className="key-dot conflict" /> Needs attention</span><span className="timeline-note">Calendar imports are read-only · Schedule actions stay in the sandbox</span></div>
            </section>
            <section className="household-section"><div className="section-title compact"><h2>Your people.</h2><span>Permission & availability from demo fixtures</span></div><div className="member-grid">{state.members.map(member => <div className="member-card" key={member.id}><Avatar member={member} /><div className="member-identity"><strong>{member.name}</strong><span>{member.role}</span></div><div className="member-detail"><Clock3 size={13} /><span>{member.availableFrom > 16 * 60 ? `Available ${shortTime(member.availableFrom)}` : `${member.travelMinutes} min travel`}</span></div><span className={`member-status ${member.availableFrom > 16 * 60 ? 'away' : ''}`}><i /> {member.availableFrom > 16 * 60 ? 'Delayed' : member.availabilityConfirmed ? 'Confirmed' : 'Unconfirmed'}</span></div>)}</div></section>
            <div className="bottom-note"><ShieldCheck size={16} /><p>A real recovery engine. A safe practice day.<span>Every calendar change, pickup, and receipt stays inside this sandbox.</span></p><button onClick={() => setTab('activity')}>See the receipts <ArrowRight size={14} /></button></div>
          </>}

          {tab === 'recovery' && <section className="recovery-content">
            {state.plans.length > 0 ? <>
              <div className="section-title compact"><h2>A few ways to make it work.</h2><span>Ranked against your household preferences</span></div><div className="plan-grid">{state.plans.map((plan, index) => <button key={plan.id} onClick={() => setSelectedPlanId(plan.id)} className={`plan-card ${selectedPlan?.id === plan.id ? 'selected' : ''} ${!plan.feasible ? 'infeasible' : ''}`} disabled={busy}><div className="plan-topline"><span className={`plan-badge ${index === 0 && plan.feasible ? 'recommended' : ''}`}>{!plan.feasible ? 'Not feasible' : index === 0 ? 'Recommended' : 'Another good option'}</span><span className="radio-mark">{selectedPlan?.id === plan.id && <Check size={12} />}</span></div><h3>{plan.title}</h3><p>{plan.subtitle}</p><div className="plan-metrics"><span><span>{dollars(plan.extraCost)}</span> extra cost</span><span><span>{plan.changes.filter(c => c.field !== 'status').length}</span> changes</span></div></button>)}</div>
              {selectedPlan && <div className="review-panel panel"><div className="section-title"><div><p className="eyebrow">YOUR PLAN PREVIEW</p><h2>{selectedPlan.title}</h2></div><span className="subtle-badge"><ShieldCheck size={13} /> {isResolved ? 'Applied in sandbox' : 'Awaiting your approval'}</span></div><div className="review-columns"><div className="change-list"><div className="change-table-header"><span>Commitment</span><span>Before</span><span>After</span></div><Changes state={state} plan={selectedPlan} />{!selectedPlan.changes.length && <p className="muted">No schedule changes in this option.</p>}</div><div className="plan-rationale"><h4><Sparkles size={16} /> {selectedPlan.feasible ? 'Why this works' : 'Why this option is blocked'}</h4>{selectedPlan.reasons.map((reason, index) => <p key={index}><Check size={14} />{reason}</p>)}{selectedPlan.tradeoffs.length > 0 && <><h4 className="tradeoff-heading">The tradeoff</h4>{selectedPlan.tradeoffs.map((tradeoff, index) => <p className="tradeoff" key={index}><ArrowRight size={14} />{tradeoff}</p>)}</>}</div></div><div className="approval-bar"><p><ShieldCheck size={17} /><span>{isResolved ? 'This plan was explicitly approved and saved.' : 'You’re in control. Relay needs your approval before applying changes.'}<small>Fixture permissions only · No external messages or bookings</small></span></p>{isResolved ? <button className="secondary-button" disabled={busy || !canUndo} onClick={() => run(undoPlan, 'Previous schedule restored.')}><RotateCcw size={15} /> Undo this plan</button> : <button className="primary-button" disabled={busy || !canApprove} onClick={() => setReview('apply')}>Review & apply <ArrowRight size={16} /></button>}</div></div>}
              <div className="failure-test"><div><ShieldCheck size={20} /><p><strong>Plans should survive a bad connection, too.</strong><span>Restore partial changes, exclude the failed workflow, and compare fresh alternatives.</span></p></div><button className="text-button" disabled={busy || !canApprove} onClick={() => setReview('failure')}>Test safe rollback <ArrowUpRight size={15} /></button></div>
            </> : <div className="empty-state panel"><div className="empty-icon"><GitBranch size={30} /></div><p className="eyebrow">READY WHEN LIFE HAPPENS</p><h2>Every good plan has a little flexibility.</h2><p>Choose a curveball above or tell Relay what changed.<br />We’ll make a few thoughtful options for your household.</p><button className="primary-button" disabled={busy} onClick={() => run(() => chooseScenario('partner-delayed'))}>Try Alex running late <ArrowRight size={15} /></button></div>}
          </section>}

          {tab === 'memory' && <div className="memory-layout">
            <section className="panel preferences-panel">
              <div className="section-title"><div><p className="eyebrow">YOUR HOUSEHOLD’S DEFAULTS</p><h2>Less explaining. More understanding.</h2></div><Settings2 size={22} /></div>
              <p className="memory-intro">These preferences are saved with your demo household. Changing one refreshes pending recovery proposals.</p>
              <div className="preference-row"><div><strong>Keep extra spending within reach</strong><p>Options above this budget are marked infeasible.</p></div><BudgetInput value={state.preferences.maxExtraCost} disabled={busy} onCommit={value => preference('maxExtraCost', value)} /></div>
              <PreferenceToggle title="Keep it in the family" description="Prefer a household member over a trusted backup when possible." checked={state.preferences.preferFamily} disabled={busy} onChange={() => preference('preferFamily', !state.preferences.preferFamily)} />
              <PreferenceToggle title="Protect dinner together" description="Keep the evening meal at 6:30 PM when the constraints allow." checked={state.preferences.protectDinner} disabled={busy} onChange={() => preference('protectDinner', !state.preferences.protectDinner)} />
              <div className="memory-footnote"><ShieldCheck size={17} /> Saved in {meta?.storage || 'sandbox storage'}. No personal account connected.</div>
            </section>
            <section className="panel permissions-panel"><div className="section-title compact"><h2>A trusted circle.</h2><Users size={20} /></div><p>Pickup authorization and availability are explicit fixture facts, never guessed by the agent.</p>{state.members.map(member => <div key={member.id} className="permission-member"><Avatar member={member} small /><div><strong>{member.name}</strong><span>{member.role}</span></div><span className={`permission-chip ${member.authorizedPickup ? '' : 'neutral'}`}>{member.authorizedPickup ? <><Check size={11} /> Pickup approved</> : 'No pickup permission'}</span></div>)}<div className="permissions-note"><CircleHelp size={16} /><span>Real integrations would need live consent and verified availability. This demo uses labeled, preconfirmed fixtures.</span></div></section>
          </div>}

          {tab === 'activity' && <section className="panel activity-panel"><div className="section-title"><div><p className="eyebrow">THE PAPER TRAIL</p><h2>Nothing happens behind your back.</h2></div><span className="subtle-badge">{state.journal.length} receipts</span></div><div className="activity-legend"><ShieldCheck size={16} /><p>All receipts represent sandbox state changes. No real calendar, message, payment, or booking was made.</p></div>{state.journal.length ? <div className="receipt-list">{state.journal.map((entry, index) => <article className="receipt" key={entry.id}><span className={`receipt-symbol ${entry.type.includes('rollback') || entry.type.includes('fail') ? 'warning' : ''}`}>{entry.type.includes('undo') || entry.type.includes('rollback') ? <RotateCcw size={18} /> : entry.type.includes('preference') ? <Settings2 size={18} /> : <Check size={18} />}</span><div className="receipt-content"><div><h3>{entry.title}</h3><span>{entry.type.replace(/_/g, ' ')}</span></div><p>{entry.detail}</p><small>Receipt {String(index + 1).padStart(2, '0')} · {new Date(entry.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</small></div></article>)}</div> : <div className="receipt-empty"><History size={35} /><h3>A fresh day. A clean slate.</h3><p>Try a curveball to see how Relay records each step.</p><button className="text-button" onClick={() => setTab('today')}>Go to your day <ArrowRight size={15} /></button></div>}</section>}
        </>}
        <footer className="page-footer"><span>RELAY <span> / </span> BUILD, SHIP, SHAPE 2026</span><span>Alexa+ experience simulator · {connectionLabel}</span></footer>
      </div>
    </main>

    <aside className="assistant-pane" aria-label="Relay assistant"><div className="assistant-header"><div className="assistant-avatar"><AudioLines size={23} /></div><div><h2>A little help, right here.</h2><span><i /> {meta?.mode === 'bedrock' ? 'Amazon Bedrock host' : meta ? 'Scripted demo host' : 'Connecting to host'}</span></div><button className={`speech-toggle ${speechOutput ? 'enabled' : ''}`} onClick={() => setSpeechOutput(value => !value)} aria-label={speechOutput ? 'Turn spoken replies off' : 'Turn spoken replies on'} title={speechOutput ? 'Spoken replies on' : 'Spoken replies off'}>{speechOutput ? <Volume2 size={18} /> : <VolumeX size={18} />}</button></div>
      <div className="assistant-mode"><ShieldCheck size={13} /><span>Alexa+ simulator <span>·</span> sandbox actions</span></div>
      <div className="chat-area" aria-live="polite" aria-relevant="additions text">{state?.conversation.length ? state.conversation.map(message => <div key={message.id} className={`chat-message ${message.role === 'user' ? 'user' : 'assistant'}`}>{message.role !== 'user' && <span className="chat-author"><AudioLines size={12} /> RELAY</span>}<p>{message.text}</p></div>) : <div className="chat-message assistant"><span className="chat-author"><AudioLines size={12} /> RELAY</span><p>Hey, I’m Relay. I help keep your household’s plans moving when life gets in the way.</p><p>Tell me what changed, and we’ll find a way to make the afternoon work.</p></div>}
        {busy && <div className="thinking"><span /><span /><span /><small>Checking the household plan</small></div>}
        {!isDisrupted && !isResolved && <div className="conversation-starter"><span>A GOOD PLACE TO START</span><button disabled={busy || !state} onClick={() => submit(undefined, 'Alex is running late')}>“Alex is running late. Help?” <ArrowUpRight size={13} /></button><button disabled={busy || !state} onClick={() => submit(undefined, 'Show my afternoon')}>“How’s our afternoon looking?” <ArrowUpRight size={13} /></button></div>}
        {traces.length > 0 && <div className="tool-trace"><div className="trace-heading"><GitBranch size={13} /><span>WHAT RELAY ACTUALLY DID</span></div>{traces.map((trace, index) => <div className={`trace-item ${trace.status === 'failed' ? 'failed' : ''}`} key={`${trace.tool}-${index}`}><span>{trace.status === 'failed' ? <RotateCcw size={12} /> : <Check size={12} />}</span><div><code>{trace.tool}</code><p>{trace.summary}</p></div></div>)}</div>}
        {isDisrupted && <div className="chat-hint"><ShieldCheck size={13} /><p>Proposals are ready. Review a plan before approving changes.</p><button onClick={() => setTab('recovery')}>Open recovery <ChevronRight size={13} /></button></div>}
        <div ref={chatEnd} />
      </div>
      <div className="composer-area"><div className="quick-prompts"><button disabled={busy || !state} onClick={() => submit(undefined, 'Why this plan?')}>Why this plan?</button><button disabled={busy || !state} onClick={() => submit(undefined, 'Keep it in the family')}>Keep it in the family</button></div><form className={`composer ${listening ? 'listening' : ''}`} onSubmit={submit}><textarea ref={composer} rows={2} aria-label="Message Relay" placeholder={listening ? 'Listening…' : 'Tell Relay what changed…'} value={input} onChange={e => setInput(e.target.value)} disabled={busy || !state} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} /><div className="composer-controls"><button type="button" className={`mic-button ${listening ? 'active' : ''}`} disabled={busy || !state || !SpeechRecognition} onClick={toggleVoice} aria-label={listening ? 'Stop listening' : SpeechRecognition ? 'Use voice input' : 'Voice input unavailable in this browser'} title={SpeechRecognition ? 'Voice input fills the message; review before sending' : 'Type below: browser voice recognition unavailable'}>{SpeechRecognition ? <Mic size={17} /> : <MicOff size={17} />}<span>{listening ? 'Listening' : SpeechRecognition ? 'Voice or type' : 'Type a message'}</span></button><button className="send-button" type="submit" disabled={!input.trim() || busy || !state} aria-label="Send message">{busy ? <LoaderCircle className="spin" size={17} /> : <ArrowUp size={17} />}</button></div></form><p className="host-disclosure">{meta?.mode === 'bedrock' ? `Bedrock model: ${meta.model || 'configured on server'}` : 'Scripted host · understands the demo’s supported intents'}<span>{meta?.storage || 'Loading storage'} · Voice uses your browser</span></p></div>
    </aside>

    {(review && selectedPlan && state) && <div className="modal-backdrop" onClick={() => !busy && setReview(null)}><section className="approval-modal" role="dialog" aria-modal="true" aria-labelledby="approval-title" onClick={event => event.stopPropagation()}><button className="modal-close" aria-label="Close review" disabled={busy} onClick={() => setReview(null)}><X size={20} /></button><div className={`modal-symbol ${review === 'failure' ? 'warning' : ''}`}><ShieldCheck size={28} /></div><p className="eyebrow">{review === 'failure' ? 'SANDBOX FAILURE TEST' : 'ONE LAST LOOK'}</p><h2 id="approval-title">{review === 'failure' ? 'Approve a safe rollback test.' : 'Let’s get the day back in sync.'}</h2><p className="modal-description">{review === 'failure' ? 'This executes the selected sandbox plan, injects a persistent failure, restores all tasks, and checks different alternatives. The failed proposal cannot be reused.' : `You’re approving “${selectedPlan.title}” for your sandbox household. Here is exactly what will change.`}</p><div className="modal-changes"><Changes state={state} plan={selectedPlan} /></div><div className="modal-total"><span>Extra cost in this fixture</span><strong>{dollars(selectedPlan.extraCost)}</strong></div><p className="modal-footnote"><ShieldCheck size={14} /> No live calendar writes, messages, purchases, or bookings.</p><div className="modal-actions"><button className="secondary-button" disabled={busy} onClick={() => setReview(null)}>Keep reviewing</button><button ref={dialogButton} className="primary-button" disabled={busy || !canApprove} onClick={confirm}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{review === 'failure' ? 'Approve failure test' : 'Approve & apply plan'}</button></div>{error && <p className="modal-error" role="alert">{error}</p>}</section></div>}
    {resetReview && <div className="modal-backdrop" onClick={() => !busy && setResetReview(false)}><section className="approval-modal reset-modal" role="dialog" aria-modal="true" aria-labelledby="reset-title" onClick={event => event.stopPropagation()}><button className="modal-close" disabled={busy} aria-label="Close reset dialog" onClick={() => setResetReview(false)}><X size={20} /></button><div className="modal-symbol"><RotateCcw size={26} /></div><h2 id="reset-title">Start with a fresh afternoon?</h2><p className="modal-description">This clears this demo household’s conversation, preferences, recovery plans, and receipts, then restores the original fixture day.</p><div className="modal-actions"><button className="secondary-button" disabled={busy} onClick={() => setResetReview(false)}>Keep this day</button><button ref={dialogButton} className="primary-button" disabled={busy} onClick={async () => { const result = await run(resetDemo, 'A fresh demo day is ready.'); if (result) { setResetReview(false); setTab('today'); setSelectedPlanId(''); } }}>Reset demo day</button></div></section></div>}
  </div>;
}

function Timeline({ state }: { state: State }) {
  const start = 14 * 60, end = 20 * 60, range = end - start;
  const people = state.members.filter(member => state.tasks.some(task => task.owner === member.id));
  return <div className="timeline-scroll"><div className="timeline">
    <div className="timeline-hours"><span>YOUR PEOPLE</span><div>{[14, 15, 16, 17, 18, 19, 20].map(hour => <span key={hour} style={{ left: `${((hour * 60 - start) / range) * 100}%` }}>{hour % 12 || 12}<small> PM</small></span>)}</div></div>
    {people.map(member => <div className="timeline-row" key={member.id}>
      <div className="timeline-person"><Avatar member={member} small /><span>{member.name.split(' ')[0]}</span></div>
      <div className="timeline-track">
        {[0, 1, 2, 3, 4, 5, 6].map(line => <i key={line} className="hour-line" style={{ left: `${line / 6 * 100}%` }} />)}
        {state.tasks.filter(task => task.owner === member.id).map(task => {
          const left = Math.max(0, (task.start - start) / range * 100);
          const width = Math.max(0, (task.end - Math.max(start, task.start)) / range * 100);
          const description = `${task.title} · ${time(task.start)}–${time(task.end)} · ${task.location}`;
          if (task.kind === 'pickup') return <div className={`timeline-milestone ${task.status}`} key={task.id} style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }} title={description} role="img" aria-label={description} tabIndex={0}>
            <strong className="milestone-label">Pickup</strong><span className="milestone-icon">{task.status === 'conflict' ? <TriangleAlert size={13} /> : <Home size={13} />}</span><span className="milestone-time">{shortTime(task.start)}</span><i className="milestone-duration" />
          </div>;
          return <div className={`timeline-event ${task.kind} ${task.status}`} key={task.id} style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }} title={description} role="img" aria-label={description} tabIndex={0}>
            <div className="event-label"><TaskIcon kind={task.kind} size={14} /><strong>{task.kind === 'grocery' ? 'Groceries' : task.kind === 'dinner' ? 'Dinner' : task.title}</strong>{task.status === 'conflict' && <TriangleAlert size={13} />}</div><span>{shortTime(task.start)}{task.end - task.start >= 45 ? `–${shortTime(task.end)}` : ''}</span>
          </div>;
        })}
      </div>
    </div>)}
  </div></div>;
}
function DependencyFlow({ state }: { state: State }) {
  const ordered = ['pickup', 'grocery', 'dinner'].map(kind => state.tasks.find(task => task.kind === kind)).filter((task): task is Task => !!task);
  return <div className="dependency-flow"><span className="dependency-label"><GitBranch size={13} /> THE DOMINO EFFECT</span><div className="dependency-nodes">{ordered.map((task, index) => <div className="dependency-step" key={task.id}>{index > 0 && <span className="dependency-link"><i /><ArrowRight size={13} /></span>}<span className={`dependency-node ${task.status}`}><TaskIcon kind={task.kind} size={14} /><span>{task.kind === 'pickup' ? 'Pickup' : task.kind === 'grocery' ? 'Groceries' : 'Dinner'}<small>{time(task.start)}</small></span>{task.status === 'conflict' ? <TriangleAlert size={13} /> : <Check size={12} />}</span></div>)}</div></div>;
}
function Changes({ state, plan }: { state: State; plan: Plan }) {
  return <>{plan.changes.filter(change => change.field !== 'status').map((change, index) => { const task = state.tasks.find(t => t.id === change.taskId); return <div className="change-row" key={`${change.taskId}-${change.field}-${index}`}><span className="change-task"><TaskIcon kind={task?.kind || 'work'} size={15} /><span><strong>{task?.title || change.taskId}</strong><small>{change.field === 'owner' ? 'Who’s handling it' : change.field === 'start' ? 'Start time' : 'Finish time'}</small></span></span><span className="before-value">{valueLabel(state, change, change.before)}</span><span className="after-value"><ArrowRight size={12} />{valueLabel(state, change, change.after)}</span></div>; })}</>;
}
function PreferenceToggle({ title, description, checked, disabled, onChange }: { title: string; description: string; checked: boolean; disabled: boolean; onChange: () => void }) { return <div className="preference-row"><div><strong>{title}</strong><p>{description}</p></div><button className={`toggle-switch ${checked ? 'checked' : ''}`} role="switch" aria-checked={checked} aria-label={title} disabled={disabled} onClick={onChange}><span /></button></div>; }
function BudgetInput({ value, disabled, onCommit }: { value: number; disabled: boolean; onCommit: (value: number) => Promise<void> }) {
  const [draft, setDraft] = useState(String(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setDraft(String(value)); setInvalid(false); }, [value]);
  function commit() {
    const next = Number(draft);
    if (!draft.trim() || !Number.isFinite(next) || next < 0 || next > 1000) { setInvalid(true); return; }
    setInvalid(false);
    if (next !== value) onCommit(next);
  }
  return <div className="budget-control"><label className={`budget-input ${invalid ? 'invalid' : ''}`}><span>$</span><input aria-label="Maximum extra cost in dollars" aria-invalid={invalid} aria-describedby={invalid ? 'budget-error' : undefined} type="number" min="0" max="1000" step="1" value={draft} disabled={disabled} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>{invalid && <span id="budget-error" className="budget-error">Enter $0–$1,000</span>}</div>;
}
