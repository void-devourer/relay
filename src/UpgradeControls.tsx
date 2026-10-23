import { useState } from 'react';
import { Cable, CalendarPlus, LockKeyhole, Unplug, X } from 'lucide-react';
import { previewCalendar } from '../shared/calendar.mjs';
import { changeMeetingLock, chooseScenario, connectBackend, disconnectBackend, importCalendarFile, type Action, type State } from './api';

export function ConstraintControls({ state, busy, act }: { state: State; busy: boolean; act: (action: () => Promise<Action>) => void }) {
  const [delay, setDelay] = useState(45);
  const [pickup, setPickup] = useState('15:10');
  const locked = state.tasks.find(task => task.id === 'meeting')?.flexible === false;
  return <section className="upgrade-panel panel" aria-label="Precise household constraints">
    <div className="section-title compact"><h2>Tell us exactly what changed.</h2><span>Facts accumulate throughout this day</span></div>
    <div className="constraint-controls">
      <label>Alex’s delay <span className="inline-control"><input aria-label="Delay in minutes" type="number" min="0" max="480" value={delay} onChange={e => setDelay(Number(e.target.value))} /><span>minutes</span></span><button className="secondary-button" disabled={busy || !Number.isInteger(delay) || delay < 0 || delay > 480} onClick={() => act(() => chooseScenario('partner-delayed', { delayMinutes: delay }))}>Update delay</button></label>
      <label>School pickup deadline<input aria-label="School pickup deadline" type="time" min="14:00" max="20:00" value={pickup} onChange={e => setPickup(e.target.value)} /><button className="secondary-button" disabled={busy || !pickup} onClick={() => { const [h, m] = pickup.split(':').map(Number); act(() => chooseScenario('school-early', { pickupTime: h * 60 + m })); }}>Update pickup</button></label>
      <div className="constraint-actions"><button className={`secondary-button ${locked ? 'locked' : ''}`} aria-pressed={locked} disabled={busy} onClick={() => act(() => changeMeetingLock(!locked))}><LockKeyhole size={15} />{locked ? 'Meeting locked · unlock' : 'Protect my client call'}</button><button className="secondary-button" disabled={busy || !state.members.find(person => person.id === 'morgan')?.availabilityConfirmed} onClick={() => act(() => chooseScenario('backup-unavailable'))}>Morgan is unavailable</button></div>
    </div>
    {!!state.disruptions?.length && <div className="fact-chips" aria-label="Active household facts">{state.disruptions.map(fact => <span key={fact.id}>{fact.title}</span>)}{locked && <span>Client call cannot move</span>}</div>}
    {state.lastFailure && <p className="failure-detail" role="status"><strong>{state.lastFailure.title} is unavailable.</strong> {state.lastFailure.detail}</p>}
  </section>;
}

export function CalendarImport({ busy, act }: { busy: boolean; act: (action: () => Promise<Action>) => void }) {
  const [owner, setOwner] = useState('priya');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ReturnType<typeof previewCalendar> | null>(null);
  const [error, setError] = useState('');
  return <section className="upgrade-panel panel">
    <div className="section-title compact"><h2><CalendarPlus size={19} /> Bring a real commitment.</h2><a href="/sample-calendar.ics" download>Download sample ICS</a></div>
    <p>Preview a single day from an ICS file, then import fixed work commitments. Priya’s import replaces her example client call. Nothing is written back to the source calendar.</p>
    <div className="calendar-controls"><label>Calendar owner<select aria-label="Calendar owner" value={owner} onChange={e => { setOwner(e.target.value); setPreview(null); }}><option value="priya">Priya</option><option value="alex">Alex</option></select></label><label>Choose ICS file<input aria-label="Choose ICS calendar" type="file" accept=".ics,text/calendar" disabled={busy} onChange={async e => {
      setError(''); setPreview(null);
      const file = e.target.files?.[0]; if (!file) return;
      try { if (file.size > 50000) throw new Error('Choose a calendar under 50 KB.'); const value = await file.text(); setText(value); setPreview(previewCalendar(value, owner)); } catch (problem) { setError(problem instanceof Error ? problem.message : 'Could not read that calendar.'); }
    }} /></label></div>
    {error && <p role="alert" className="import-error">{error}</p>}
    {preview && <div className="calendar-preview"><strong>{preview.day} · {preview.events.length} fixed commitment{preview.events.length === 1 ? '' : 's'}</strong>{preview.events.map((event, i) => <p key={i}>{event.title} · {String(Math.floor(event.start / 60)).padStart(2,'0')}:{String(event.start % 60).padStart(2,'0')}–{String(Math.floor(event.end / 60)).padStart(2,'0')}:{String(event.end % 60).padStart(2,'0')}</p>)}{!!preview.skipped && <p>{preview.skipped} events on other days excluded from this preview.</p>}<button className="primary-button" disabled={busy} onClick={() => act(() => importCalendarFile(text, owner, preview.day))}>Import these fixed commitments</button></div>}
    <small>Timed floating local events or UTC converted to India time. Recurrence, named timezones and all-day events require a supported one-day export.</small>
  </section>;
}

export function BackendConnection({ refresh }: { refresh: () => Promise<void> }) {
  const [open, setOpen] = useState(false), [url, setUrl] = useState('http://localhost:4317'), [token, setToken] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function change(disconnect = false) {
    setBusy(true); setError('');
    try { if (disconnect) await disconnectBackend(); else await connectBackend(url, token); setToken(''); await refresh(); setOpen(false); } catch (problem) { setError(problem instanceof Error ? problem.message : 'Could not connect.'); } finally { setBusy(false); }
  }
  return <div className="backend-connection"><button className="connection-button" onClick={() => setOpen(!open)}><Cable size={15} /> Connection</button>{open && <section className="connection-popover" aria-label="Backend connection"><button className="connection-close" aria-label="Close connection settings" onClick={() => setOpen(false)}><X size={17}/></button><h3>Connect your MCP backend</h3><p>The published app uses its hosted backend automatically. Connect another Node instance for your own Bedrock configuration.</p><label>Backend origin<input aria-label="Backend origin" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://your-backend.example" /></label><label>Backend bearer token<input aria-label="Backend bearer token" type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" /></label><small>The token stays in memory for this page only. Configure this app’s exact origin on the backend.</small>{error && <p role="alert" className="import-error">{error}</p>}<div className="connection-actions"><button disabled={busy} className="secondary-button" onClick={() => change(true)}><Unplug size={14} /> Use this app’s backend</button><button disabled={busy} className="primary-button" onClick={() => change()}>Test & connect</button></div></section>}</div>;
}
