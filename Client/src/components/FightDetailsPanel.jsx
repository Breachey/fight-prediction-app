import React, { useEffect, useRef, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { API_URL } from '../config';
import { fetchWithAdminSession } from '../utils/adminSession';
import {
  FIGHT_CARD_EDITOR_FIELDS, buildManualPreviewUpdates, hasInvalidEditorValues,
  isEditorFieldDirty, scopeFightEditorRows,
} from '../utils/fightCardEditor';
import FighterDetailsEditor from './FighterDetailsEditor';
import ConfirmDialog from './ConfirmDialog';

async function request(url, options) {
  const response = await fetchWithAdminSession(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error([payload.error, payload.details].filter(Boolean).join(': ') || 'Could not update fighter details.');
  return payload;
}

export default function FightDetailsPanel({ eventId, fightId, onSaved }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [edits, setEdits] = useState({});
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState(null);
  const [scrapingKey, setScrapingKey] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const mounted = useRef(true);
  const pending = useRef(false);
  const dirty = rows.some((row) => FIGHT_CARD_EDITOR_FIELDS.some(([field]) => isEditorFieldDirty(row, edits, field)));
  const endpoint = `${API_URL}/admin/events/${eventId}/fight-card/stats`;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setFeedback(null);
    request(endpoint, { signal: controller.signal }).then((payload) => {
      if (controller.signal.aborted) return;
      const scoped = scopeFightEditorRows(payload.rows || [], fightId);
      if (!scoped.length) throw new Error('This fight is no longer on the saved card. Refresh the event.');
      setRows(scoped);
      setEdits({});
    }).catch((error) => {
      if (!controller.signal.aborted) setFeedback({ error: true, message: error.message });
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, fightId, open, loadAttempt]);

  const close = () => { setOpen(false); setEdits({}); setRows([]); setConfirmClose(false); };
  const save = async (rowKey) => {
    if (pending.current) return;
    const selected = rowKey === null ? rows : rows.filter((row) => row.rowKey === rowKey);
    if (hasInvalidEditorValues(selected, edits)) return;
    const patches = buildManualPreviewUpdates(selected, edits);
    const updates = selected.filter((row) => patches[row.rowKey]).map((row) => ({ id: row.id, values: patches[row.rowKey] }));
    if (!updates.length) return;
    pending.current = true;
    setSavingKey(rowKey || 'all');
    setFeedback(null);
    try {
      await request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates }) });
      if (!mounted.current) return;
      setRows((current) => current.map((row) => ({ ...row, ...patches[row.rowKey] })));
      setEdits((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !patches[key])));
      setFeedback({ message: 'Fighter details saved.' });
      onSaved?.();
    } catch (error) {
      if (mounted.current) setFeedback({ error: true, message: error.message });
    } finally {
      pending.current = false;
      if (mounted.current) setSavingKey(null);
    }
  };
  const scrape = async (row) => {
    if (pending.current) return;
    pending.current = true;
    setScrapingKey(row.rowKey);
    setFeedback(null);
    try {
      await request(`${endpoint}/${row.id}/scrape-profile`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tapologyFighterUrl: row.TapologyFighterURL }),
      });
      onSaved?.();
      const payload = await request(endpoint);
      if (!mounted.current) return;
      setRows(scopeFightEditorRows(payload.rows || [], fightId));
      setFeedback({ message: 'Fighter sources refreshed and saved.' });
    } catch (error) {
      if (mounted.current) setFeedback({ error: true, message: error.message });
    } finally {
      pending.current = false;
      if (mounted.current) setScrapingKey(null);
    }
  };
  const busy = loading || savingKey !== null || scrapingKey !== null;
  return (
    <div className="fight-details-panel">
      <button type="button" className="admin-edit-button" aria-expanded={open} disabled={busy}
        onClick={() => open ? dirty ? setConfirmClose(true) : close() : setOpen(true)}>
        {open ? <X size={16} aria-hidden="true" /> : <Pencil size={16} aria-hidden="true" />}
        {open ? 'Close Fighter Details' : 'Edit Fighter Details'}
      </button>
      {open && <>
        {loading && <p role="status">Loading fighter details…</p>}
        {feedback && <p role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
        {!loading && !rows.length && feedback?.error && <button type="button" onClick={() => setLoadAttempt((value) => value + 1)}>Try Again</button>}
        {!loading && rows.length > 0 && <FighterDetailsEditor rows={rows} edits={edits} filter={filter}
          onFilterChange={setFilter} onChange={(key, field, value) => setEdits((current) => ({ ...current, [key]: { ...current[key], [field]: value } }))}
          onSave={save} onScrape={scrape} busy={busy} savingKey={savingKey} scrapingKeys={scrapingKey ? [scrapingKey] : []} />}
      </>}
      <ConfirmDialog open={confirmClose} title="Discard unsaved fighter details?" summary="Your saved details will stay unchanged."
        confirmLabel="Discard Changes" onConfirm={close} onCancel={() => setConfirmClose(false)} />
    </div>
  );
}
