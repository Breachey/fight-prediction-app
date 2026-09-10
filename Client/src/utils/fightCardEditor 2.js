const MANUAL_METHOD_STAT_FIELDS = [
  ['KO_TKO_Wins', 'KO/TKO W'],
  ['KO_TKO_Losses', 'KO/TKO L'],
  ['Submission_Wins', 'Sub W'],
  ['Submission_Losses', 'Sub L'],
  ['Decision_Wins', 'Dec W'],
  ['Decision_Losses', 'Dec L'],
];
export const FIGHT_CARD_EDITOR_FIELDS = [
  ['odds', 'Odds', 'odds'],
  ['TapologyFighterURL', 'Tapology URL', 'url'],
  ['Rank', 'Rank (0 = champion)', 'number'],
  ['style', 'Style', 'text'],
  ['Streak', 'Streak', 'signed-number'],
  ...MANUAL_METHOD_STAT_FIELDS.map(([field, label]) => [field, label, 'number']),
];

export const normalizeStatEditorValue = (value) => (
  value === null || value === undefined ? '' : String(value)
);

export const isValidStatEditorValue = (type, value) => {
  if (!value) return true;
  if (type === 'number') return /^\d+$/.test(value);
  if (type === 'signed-number') return /^-?\d+$/.test(value);
  if (type === 'odds') return /^[+-]?\d+$/.test(value);
  if (type === 'url') return /^https:\/\/www\.tapology\.com\/fightcenter\/fighters\//i.test(value);
  return true;
};

export const buildManualPreviewUpdates = (editableRows, edits) => {
  const updates = {};

  (editableRows || []).forEach((row) => {
    const rowEdits = edits?.[row.rowKey];
    if (!rowEdits) return;

    const patch = {};
    FIGHT_CARD_EDITOR_FIELDS.forEach(([field, , type]) => {
      if (!Object.prototype.hasOwnProperty.call(rowEdits, field)) return;

      const originalValue = normalizeStatEditorValue(row[field]).trim();
      const editedValue = normalizeStatEditorValue(rowEdits[field]).trim();
      if (originalValue === editedValue || !isValidStatEditorValue(type, editedValue)) return;
      patch[field] = editedValue === '' ? null : editedValue;
    });

    if (Object.keys(patch).length > 0) {
      updates[row.rowKey] = patch;
    }
  });

  return updates;
};

export const countManualPreviewValues = (editableRows, edits) => (
  Object.values(buildManualPreviewUpdates(editableRows, edits))
    .reduce((count, patch) => count + Object.keys(patch).length, 0)
);

export const getEditorValue = (edits, rowId, row, field) => (
  Object.prototype.hasOwnProperty.call(edits?.[rowId] || {}, field)
    ? edits[rowId][field]
    : normalizeStatEditorValue(row?.[field])
);

export const isEditorFieldDirty = (row, edits, field) => (
  normalizeStatEditorValue(getEditorValue(edits, row.rowKey, row, field)).trim()
    !== normalizeStatEditorValue(row[field]).trim()
);

export const hasUnsavedEditorChanges = (rows, edits) => rows.some((row) => (
  FIGHT_CARD_EDITOR_FIELDS.some(([field]) => isEditorFieldDirty(row, edits, field))
));

export const getVisibleEditorFields = (row, edits, filter) => FIGHT_CARD_EDITOR_FIELDS.filter(([field]) => {
  if (filter === 'changed') return isEditorFieldDirty(row, edits, field);
  // Keep a newly filled input mounted until save, so typing never steals focus.
  if (filter === 'missing') return !normalizeStatEditorValue(row[field]).trim()
    || !normalizeStatEditorValue(getEditorValue(edits, row.rowKey, row, field)).trim();
  return true;
});

export const hasInvalidEditorValues = (rows, edits) => rows.some((row) => (
  FIGHT_CARD_EDITOR_FIELDS.some(([field, , type]) => !isValidStatEditorValue(
    type, normalizeStatEditorValue(getEditorValue(edits, row.rowKey, row, field)).trim(),
  ))
));

export const groupEditorRows = (rows) => {
  const fights = new Map();
  rows.forEach((row) => {
    const key = String(row.fightId);
    if (!fights.has(key)) fights.set(key, []);
    fights.get(key).push(row);
  });
  return [...fights.entries()].map(([fightId, fighters]) => ({
    fightId,
    fighters: [...fighters].sort((a, b) => (a.corner === 'Red' ? 0 : 1) - (b.corner === 'Red' ? 0 : 1)),
  }));
};

export const scopeFightEditorRows = (rows, fightId) => rows
  .filter((row) => String(row.FightId) === String(fightId))
  .map((row) => ({ ...row, rowKey: String(row.id), fightId: row.FightId,
    corner: row.Corner, firstName: row.FirstName, lastName: row.LastName }));
