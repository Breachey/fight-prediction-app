import React from 'react';
import { RefreshCw, Save } from 'lucide-react';
import {
  FIGHT_CARD_EDITOR_FIELDS, buildManualPreviewUpdates, getEditorValue,
  getVisibleEditorFields, groupEditorRows, hasInvalidEditorValues,
  isEditorFieldDirty, isValidStatEditorValue, normalizeStatEditorValue,
} from '../utils/fightCardEditor';
import './FighterDetailsEditor.css';

export default function FighterDetailsEditor({
  title = 'Fighter Details', rows, edits, filter, onFilterChange, onChange,
  onSave, onScrape, onScrapeAll, busy = false, savingKey = null,
  scrapingKeys = [], scrapeProgress = null, saveLabel = 'Save Changes',
}) {
  const patches = buildManualPreviewUpdates(rows, edits);
  const dirty = rows.some((row) => FIGHT_CARD_EDITOR_FIELDS.some(([field]) => isEditorFieldDirty(row, edits, field)));
  const invalid = hasInvalidEditorValues(rows, edits);
  const missingCount = rows.reduce((count, row) => count + FIGHT_CARD_EDITOR_FIELDS.filter(([field]) => (
    !normalizeStatEditorValue(getEditorValue(edits, row.rowKey, row, field)).trim()
  )).length, 0);
  const groups = groupEditorRows(rows).filter(({ fighters }) => fighters.some((row) => getVisibleEditorFields(row, edits, filter).length));
  return (
    <section className="fighter-details-editor" aria-label={title}>
      <div className="fighter-details-editor__toolbar">
        <div>
          <h3 className="app-subsection-heading">{title}</h3>
          <p>{missingCount} missing values{dirty ? ' · Unsaved changes' : ''}</p>
        </div>
        <div className="fighter-details-editor__actions">
          {onScrapeAll && <button type="button" onClick={onScrapeAll} disabled={busy || dirty}
            title={dirty ? 'Save changes before refreshing sources' : 'Refresh fighter sources'}>
            <RefreshCw size={15} aria-hidden="true" />
            {scrapeProgress ? `Refreshing ${scrapeProgress.completed}/${scrapeProgress.total}` : 'Refresh Sources'}
          </button>}
          <button type="button" onClick={() => onSave(null)} disabled={busy || invalid || !Object.keys(patches).length}>
            <Save size={15} aria-hidden="true" />{savingKey === 'all' ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>
      <div className="fighter-details-editor__filters" role="group" aria-label="Show fighter fields">
        {[['all', 'All values'], ['missing', 'Missing values'], ['changed', 'Changed values']].map(([value, label]) => (
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => onFilterChange(value)}>{label}</button>
        ))}
      </div>
      {invalid && <p className="fighter-details-editor__error" role="alert">Correct the highlighted values before saving.</p>}
      {groups.map(({ fightId, fighters }) => (
        <div className="fighter-details-editor__fight" key={fightId}>
          <h4>Fight {fightId}</h4>
          <div className="fighter-details-editor__corners">
            {fighters.map((row) => {
              const name = [row.firstName, row.lastName].filter(Boolean).join(' ') || 'Unknown fighter';
              const fields = getVisibleEditorFields(row, edits, filter);
              const rowDirty = FIGHT_CARD_EDITOR_FIELDS.some(([field]) => isEditorFieldDirty(row, edits, field));
              const rowInvalid = hasInvalidEditorValues([row], edits);
              return (
                <section key={row.rowKey} aria-label={`${name} details`}
                  className={`fighter-details-editor__fighter fighter-details-editor__fighter--${String(row.corner).toLowerCase()}`}>
                  <header><span>{row.corner} corner</span><h4>{name}</h4></header>
                  {fields.length ? <>
                    <div className="fighter-details-editor__fields">
                      {fields.map(([field, label, type]) => {
                        const value = getEditorValue(edits, row.rowKey, row, field);
                        const valid = isValidStatEditorValue(type, normalizeStatEditorValue(value).trim());
                        const changed = isEditorFieldDirty(row, edits, field);
                        return (
                          <label key={field} className={changed ? 'is-changed' : ''}>
                            <span>{label}</span>
                            <input type={type === 'url' ? 'url' : 'text'}
                              inputMode={type === 'number' ? 'numeric' : 'text'}
                              value={value ?? ''} placeholder="Missing" disabled={busy}
                              aria-label={`${name}: ${label}`} aria-invalid={!valid}
                              onChange={(event) => onChange(row.rowKey, field, event.target.value)} />
                            {!valid && <small className="fighter-details-editor__error">{type === 'url' ? 'Enter a Tapology fighter URL.' : 'Enter a valid whole number.'}</small>}
                          </label>
                        );
                      })}
                    </div>
                    <div className="fighter-details-editor__actions">
                      {onScrape && <button type="button" onClick={() => onScrape(row)} disabled={busy || rowDirty || rowInvalid}
                        aria-label={`Refresh sources for ${name}`} title={rowDirty ? 'Save changes before refreshing sources' : 'Refresh fighter sources'}>
                        <RefreshCw size={14} aria-hidden="true" />{scrapingKeys.includes(row.rowKey) ? 'Refreshing…' : 'Refresh'}
                      </button>}
                      <button type="button" onClick={() => onSave(row.rowKey)} disabled={busy || rowInvalid || !patches[row.rowKey]}
                        aria-label={`Save ${name}`}><Save size={14} aria-hidden="true" />{savingKey === row.rowKey ? 'Saving…' : 'Save'}</button>
                    </div>
                  </> : <p className="fighter-details-editor__empty">{filter === 'missing' ? 'No missing values' : 'No changed values'}</p>}
                </section>
              );
            })}
          </div>
        </div>
      ))}
      {!groups.length && <p className="fighter-details-editor__empty">{filter === 'missing' ? 'No missing values. All fighter details are filled in.' : 'No fighters match this view.'}</p>}
    </section>
  );
}
