const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const EXPECTED_FIGHT_CARD_HEADERS = [
  'id',
  'Event',
  'EventId',
  'StartTime',
  'TimeZone',
  'EventStatus',
  'OrganizationId',
  'OrganizationName',
  'Venue',
  'VenueId',
  'Location_City',
  'Location_State',
  'Location_Country',
  'TriCode',
  'FightId',
  'FightOrder',
  'FightStatus',
  'CardSegment',
  'CardSegmentStartTime',
  'CardSegmentBroadcaster',
  'FighterId',
  'MMAId',
  'Corner',
  'FirstName',
  'LastName',
  'Nickname',
  'DOB',
  'Age',
  'Stance',
  'Weight_lbs',
  'Height_in',
  'Reach_in',
  'UFC_Profile',
  'FighterWeightClass',
  'Record_Wins',
  'Record_Losses',
  'Record_Draws',
  'Record_NoContests',
  'Born_City',
  'Born_State',
  'Born_Country',
  'FightingOutOf_City',
  'FightingOutOf_State',
  'FightingOutOf_Country',
  'ImageURL',
  'Rank',
  'odds',
  'Streak',
  'style',
  'KO_TKO_Wins',
  'KO_TKO_Losses',
  'Submission_Wins',
  'Submission_Losses',
  'Decision_Wins',
  'Decision_Losses',
  'TapologyEventURL',
  'TapologyFighterURL',
  'TapologyMatchConfidence',
];

const FIGHT_CARD_PREVIEW_TTL_MS = 15 * 60 * 1000;
const PREVIEW_STORE = new Map();
const HEADER_SET = new Set(EXPECTED_FIGHT_CARD_HEADERS);
const COMPLETENESS_FIELDS = [
  'style',
  'odds',
  'KO_TKO_Wins',
  'KO_TKO_Losses',
  'Submission_Wins',
  'Submission_Losses',
  'Decision_Wins',
  'Decision_Losses',
  'TapologyEventURL',
  'TapologyFighterURL',
  'TapologyMatchConfidence',
];

function normalizeText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function normalizeName(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, ' ');
}

function parseInteger(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeRowForDatabase(row) {
  return Object.fromEntries(
    EXPECTED_FIGHT_CARD_HEADERS.map((header) => {
      const value = normalizeText(row[header]);
      return [header, value === '' ? null : value];
    })
  );
}

function parseCsvText(text) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (insideQuotes) {
      if (char === '"') {
        if (next === '"') {
          currentField += '"';
          index += 1;
        } else {
          insideQuotes = false;
        }
      } else {
        currentField += char;
      }
      continue;
    }

    if (char === '"') {
      insideQuotes = true;
      continue;
    }

    if (char === ',') {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if (char === '\n') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
      continue;
    }

    if (char === '\r') {
      continue;
    }

    currentField += char;
  }

  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  if (rows.length > 0 && rows[0].length > 0) {
    rows[0][0] = rows[0][0].replace(/^\uFEFF/, '');
  }

  return rows;
}

async function parseFightCardCsvFile(csvPath) {
  const csvText = await fs.readFile(csvPath, 'utf8');
  const records = parseCsvText(csvText);

  if (records.length === 0) {
    return {
      headers: [],
      rows: [],
      headerErrors: ['CSV file is empty.'],
    };
  }

  const headers = records[0];
  const headerErrors = [];

  if (headers.length !== EXPECTED_FIGHT_CARD_HEADERS.length) {
    headerErrors.push(
      `Expected ${EXPECTED_FIGHT_CARD_HEADERS.length} columns but found ${headers.length}.`
    );
  }

  const missingHeaders = EXPECTED_FIGHT_CARD_HEADERS.filter((header) => !headers.includes(header));
  const unexpectedHeaders = headers.filter((header) => !HEADER_SET.has(header));

  if (missingHeaders.length > 0) {
    headerErrors.push(`Missing headers: ${missingHeaders.join(', ')}`);
  }

  if (unexpectedHeaders.length > 0) {
    headerErrors.push(`Unexpected headers: ${unexpectedHeaders.join(', ')}`);
  }

  const rows = records
    .slice(1)
    .filter((values) => values.some((value) => normalizeText(value) !== ''))
    .map((values, rowIndex) => {
      const row = {};
      headers.forEach((header, headerIndex) => {
        row[header] = values[headerIndex] ?? '';
      });
      row.__rowNumber = rowIndex + 2;
      return row;
    });

  return { headers, rows, headerErrors };
}

async function loadScraperMetadata(csvPath) {
  if (!csvPath) {
    return {};
  }

  const metadataPath = `${csvPath}.meta.json`;

  try {
    const rawText = await fs.readFile(metadataPath, 'utf8');
    const parsed = JSON.parse(rawText);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {};
    }

    throw new Error(`Failed to parse scraper metadata: ${error.message}`);
  }
}

function compareFightCardShape(existingRows, previewRows) {
  const existingSignatures = new Set(
    (existingRows || []).map((row) => [row.FightId, row.Corner, row.FighterId].join('|'))
  );
  const previewSignatures = new Set(
    (previewRows || []).map((row) => [row.FightId, row.Corner, row.FighterId].join('|'))
  );

  if (existingSignatures.size !== previewSignatures.size) {
    return true;
  }

  for (const signature of previewSignatures) {
    if (!existingSignatures.has(signature)) {
      return true;
    }
  }

  return false;
}

function buildEventFieldChanges(currentEvent, previewEvent) {
  const fields = [
    ['name', 'name'],
    ['date', 'date'],
    ['venue', 'venue'],
    ['location_city', 'location_city'],
    ['location_state', 'location_state'],
    ['location_country', 'location_country'],
    ['image_url', 'image_url'],
  ];

  return fields
    .map(([currentKey, previewKey]) => ({
      field: currentKey,
      from: normalizeText(currentEvent?.[currentKey]) || null,
      to: normalizeText(previewEvent?.[previewKey]) || null,
    }))
    .filter((entry) => entry.from !== entry.to && entry.to !== null);
}

async function removePreviewAssets(scratchDir) {
  if (!scratchDir) {
    return;
  }

  try {
    await fs.rm(scratchDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors for temp preview artifacts.
  }
}

async function cleanupExpiredFightCardPreviews() {
  const now = Date.now();
  const expiredEntries = Array.from(PREVIEW_STORE.entries()).filter(
    ([, preview]) => preview.expiresAt <= now
  );

  await Promise.all(
    expiredEntries.map(async ([token, preview]) => {
      PREVIEW_STORE.delete(token);
      await removePreviewAssets(preview.scratchDir);
    })
  );
}

function storeFightCardPreview(preview) {
  const previewToken = crypto.randomUUID();
  const expiresAt = Date.now() + FIGHT_CARD_PREVIEW_TTL_MS;
  const storedPreview = {
    ...preview,
    previewToken,
    expiresAt,
  };

  PREVIEW_STORE.set(previewToken, storedPreview);

  return {
    previewToken,
    expiresAt,
  };
}

async function replaceFightCardPreview(preview) {
  const matchingEntries = Array.from(PREVIEW_STORE.entries()).filter(
    ([, existingPreview]) => String(existingPreview.eventId) === String(preview.eventId)
  );

  await Promise.all(
    matchingEntries.map(async ([token, existingPreview]) => {
      PREVIEW_STORE.delete(token);
      await removePreviewAssets(existingPreview.scratchDir);
    })
  );

  return storeFightCardPreview(preview);
}

function getFightCardPreview(previewToken, eventId) {
  const preview = PREVIEW_STORE.get(previewToken);
  if (!preview) {
    return null;
  }

  if (preview.expiresAt <= Date.now()) {
    PREVIEW_STORE.delete(previewToken);
    removePreviewAssets(preview.scratchDir);
    return null;
  }

  if (String(preview.eventId) !== String(eventId)) {
    return null;
  }

  return preview;
}

async function deleteFightCardPreview(previewToken) {
  const preview = PREVIEW_STORE.get(previewToken);
  if (!preview) {
    return;
  }

  PREVIEW_STORE.delete(previewToken);
  await removePreviewAssets(preview.scratchDir);
}

async function runFightCardScraper({
  eventId,
  repoRoot,
  timeoutMs = 300000,
  imageDelaySeconds = '0.25',
}) {
  const scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), `fight-card-${eventId}-`));
  const scraperRoot = path.join(repoRoot, 'Server', 'scraper');
  const scriptPath = path.join(scraperRoot, 'scrape_full_ufc_event_with_tapology.py');
  const tapologyMapPath = path.join(scraperRoot, 'tapology_event_map.csv');

  await Promise.all([fs.access(scriptPath), fs.access(tapologyMapPath)]);

  const args = [
    scriptPath,
    String(eventId),
    '--output-dir',
    scratchDir,
    '--tapology-map',
    tapologyMapPath,
    '--image-delay-seconds',
    String(imageDelaySeconds),
  ];

  return new Promise((resolve, reject) => {
    const child = spawn('python3', args, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', async (error) => {
      clearTimeout(timeoutId);
      await removePreviewAssets(scratchDir);
      reject(error);
    });

    child.on('close', async (code) => {
      clearTimeout(timeoutId);

      if (timedOut) {
        await removePreviewAssets(scratchDir);
        reject(new Error(`Scraper timed out after ${timeoutMs}ms.`));
        return;
      }

      if (code !== 0) {
        await removePreviewAssets(scratchDir);
        reject(
          new Error(
            `Scraper exited with code ${code}.\n${stdout}${stderr ? `\n${stderr}` : ''}`.trim()
          )
        );
        return;
      }

      const exportedPathMatch = stdout.match(/Exported Tapology-ready fight card to (.+)\s*$/m);
      let csvPath = exportedPathMatch ? exportedPathMatch[1].trim() : '';

      if (!csvPath) {
        const generatedFiles = (await fs.readdir(scratchDir))
          .filter((fileName) => fileName.endsWith('.csv'))
          .map((fileName) => path.join(scratchDir, fileName));
        csvPath = generatedFiles[0] || '';
      }

      if (!csvPath) {
        await removePreviewAssets(scratchDir);
        reject(new Error('Scraper completed but no CSV file was generated.'));
        return;
      }

      resolve({
        scratchDir,
        csvPath,
        metadata: await loadScraperMetadata(csvPath),
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

async function backfillEventImageIfMissing({
  supabase,
  eventId,
  currentImageUrl,
  fallbackImageUrl,
}) {
  const normalizedCurrentImageUrl = normalizeText(currentImageUrl);
  const normalizedFallbackImageUrl = normalizeText(fallbackImageUrl);

  if (normalizedCurrentImageUrl || !normalizedFallbackImageUrl) {
    return {
      updated: false,
      image_url: normalizedCurrentImageUrl || null,
    };
  }

  const { data, error } = await supabase
    .from('events')
    .update({ image_url: normalizedFallbackImageUrl })
    .eq('id', eventId)
    .is('image_url', null)
    .select('id, image_url')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update event image_url: ${error.message}`);
  }

  return {
    updated: Boolean(data?.image_url),
    image_url: data?.image_url || normalizedCurrentImageUrl || null,
  };
}

async function buildFightCardPreview({
  eventId,
  csvPath,
  headers,
  rows,
  headerErrors,
  eventRecord,
  existingFightCardRows,
  existingFightResults,
  scraperOutput,
}) {
  const blockers = [...headerErrors];
  const warnings = [];
  const rawRows = rows || [];
  const sanitizedRows = rawRows.map(sanitizeRowForDatabase);
  const fightMap = new Map();
  const eventFieldKeys = [
    'Event',
    'EventId',
    'StartTime',
    'TimeZone',
    'Venue',
    'Location_City',
    'Location_State',
    'Location_Country',
  ];

  if (!eventRecord) {
    blockers.push(`Event ${eventId} was not found in the events table.`);
  }

  rawRows.forEach((row) => {
    const rowLabel = `Row ${row.__rowNumber}`;
    const eventIdValue = parseInteger(row.EventId);
    const fightIdValue = parseInteger(row.FightId);
    const fighterIdValue = parseInteger(row.FighterId);
    const cornerValue = normalizeText(row.Corner);

    if (!normalizeText(row.Event)) {
      blockers.push(`${rowLabel} is missing Event.`);
    }

    if (eventIdValue === null) {
      blockers.push(`${rowLabel} is missing EventId.`);
    } else if (eventIdValue !== Number(eventId)) {
      blockers.push(`${rowLabel} has EventId ${row.EventId}, expected ${eventId}.`);
    }

    if (fightIdValue === null) {
      blockers.push(`${rowLabel} is missing FightId.`);
    }

    if (fighterIdValue === null) {
      blockers.push(`${rowLabel} is missing FighterId.`);
    }

    if (!cornerValue) {
      blockers.push(`${rowLabel} is missing Corner.`);
    } else if (!['Red', 'Blue'].includes(cornerValue)) {
      blockers.push(`${rowLabel} has invalid Corner "${cornerValue}".`);
    }

    if (!normalizeText(row.FirstName) || !normalizeText(row.LastName)) {
      blockers.push(`${rowLabel} is missing the fighter name.`);
    }

    if (fightIdValue !== null) {
      if (!fightMap.has(fightIdValue)) {
        fightMap.set(fightIdValue, []);
      }
      fightMap.get(fightIdValue).push({
        rowNumber: row.__rowNumber,
        corner: cornerValue,
      });
    }
  });

  if (rawRows.length === 0) {
    blockers.push('The scraper returned zero fight-card rows.');
  }

  if (rawRows.length % 2 !== 0) {
    blockers.push(`Expected an even number of fighter rows but found ${rawRows.length}.`);
  }

  for (const eventFieldKey of eventFieldKeys) {
    const distinctValues = new Set(
      rawRows
        .map((row) => normalizeText(row[eventFieldKey]))
        .filter(Boolean)
    );

    if (distinctValues.size > 1) {
      blockers.push(`Preview rows contain inconsistent ${eventFieldKey} values.`);
    }
  }

  fightMap.forEach((rowsForFight, fightId) => {
    const corners = rowsForFight.map((entry) => entry.corner);
    if (rowsForFight.length !== 2) {
      blockers.push(`Fight ${fightId} has ${rowsForFight.length} rows instead of 2.`);
      return;
    }

    if (!corners.includes('Red') || !corners.includes('Blue')) {
      blockers.push(`Fight ${fightId} must contain both Red and Blue corners.`);
    }
  });

  const existingRows = existingFightCardRows || [];
  const existingResults = existingFightResults || [];
  const changedFightCard = compareFightCardShape(
    existingRows,
    sanitizedRows.map((row) => ({
      FightId: parseInteger(row.FightId),
      Corner: row.Corner,
      FighterId: parseInteger(row.FighterId),
    }))
  );

  if (existingRows.length > 0) {
    if (changedFightCard && existingResults.length > 0) {
      blockers.push(
        `This import would change ${eventId}'s fight card while ${existingResults.length} fight result record(s) already exist.`
      );
    } else if (changedFightCard) {
      warnings.push(
        `Existing fight-card rows for event ${eventId} will be replaced with a different set of fights.`
      );
    } else {
      warnings.push(`Existing fight-card rows for event ${eventId} will be refreshed with the same fights.`);
    }
  }

  const fieldCompleteness = Object.fromEntries(
    COMPLETENESS_FIELDS.map((field) => [
      field,
      rawRows.reduce((count, row) => count + (normalizeText(row[field]) ? 0 : 1), 0),
    ])
  );

  if (fieldCompleteness.style > 0) {
    warnings.push(`style is blank on ${fieldCompleteness.style} row(s).`);
  }

  const previewEvent = {
    name: normalizeText(rawRows[0]?.Event) || normalizeText(eventRecord?.name) || null,
    date: normalizeText(rawRows[0]?.StartTime).split('T')[0] || normalizeText(eventRecord?.date) || null,
    venue: normalizeText(rawRows[0]?.Venue) || null,
    location_city: normalizeText(rawRows[0]?.Location_City) || null,
    location_state: normalizeText(rawRows[0]?.Location_State) || null,
    location_country: normalizeText(rawRows[0]?.Location_Country) || null,
    image_url:
      normalizeText(eventRecord?.image_url) ||
      normalizeText(scraperOutput?.metadata?.tapology_event_image_url) ||
      null,
    tapology_event_url: normalizeText(rawRows[0]?.TapologyEventURL) || null,
    tapology_event_image_url:
      normalizeText(scraperOutput?.metadata?.tapology_event_image_url) || null,
  };

  return {
    eventId: Number(eventId),
    csvPath,
    csvFileName: path.basename(csvPath),
    headers,
    rowCount: rawRows.length,
    fightCount: fightMap.size,
    fighterCount: rawRows.length,
    previewEvent,
    currentEvent: eventRecord
      ? {
          id: eventRecord.id,
          name: eventRecord.name || null,
          date: eventRecord.date || null,
          venue: eventRecord.venue || null,
          location_city: eventRecord.location_city || null,
          location_state: eventRecord.location_state || null,
          location_country: eventRecord.location_country || null,
          image_url: eventRecord.image_url || null,
        }
      : null,
    eventFieldChanges: buildEventFieldChanges(eventRecord, previewEvent),
    existingFightCardRowCount: existingRows.length,
    existingFightCount: new Set(existingRows.map((row) => row.FightId)).size,
    existingFightResultCount: existingResults.length,
    changedFightCard,
    fieldCompleteness,
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(warnings)),
    scraperStdout: normalizeText(scraperOutput?.stdout) || null,
    scraperStderr: normalizeText(scraperOutput?.stderr) || null,
    rows: sanitizedRows.map((row) => {
      const normalizedRow = { ...row };
      delete normalizedRow.id;
      return normalizedRow;
    }),
  };
}

module.exports = {
  EXPECTED_FIGHT_CARD_HEADERS,
  FIGHT_CARD_PREVIEW_TTL_MS,
  buildFightCardPreview,
  cleanupExpiredFightCardPreviews,
  deleteFightCardPreview,
  getFightCardPreview,
  parseFightCardCsvFile,
  removePreviewAssets,
  runFightCardScraper,
  backfillEventImageIfMissing,
  storeFightCardPreview,
  replaceFightCardPreview,
};
