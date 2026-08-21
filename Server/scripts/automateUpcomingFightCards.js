const path = require('path');
const fs = require('fs/promises');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const {
  assessLineupChange,
  hasEventStarted,
  mergeScrapedRowsWithStoredValues,
  selectDueEvents,
  summarizeFilledFightCardData,
  summarizeMissingFightCardData,
} = require('../lib/fightCardAutomation');
const {
  backfillEventImageIfMissing,
  buildFightCardPreview,
  parseFightCardCsvFile,
  removePreviewAssets,
  runFightCardScraper,
} = require('../lib/fightCardImport');
const { syncFighterStyleFromFightCardRows } = require('../lib/fighterStyleSync');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const repoRoot = path.resolve(__dirname, '..', '..');

function readInteger(value, fallback, minimum = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function readBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function parseArgs(argv) {
  const namedArgs = new Map(
    argv.slice(2)
      .filter((arg) => arg.startsWith('--'))
      .map((arg) => {
        const [key, ...valueParts] = arg.slice(2).split('=');
        return [key, valueParts.length > 0 ? valueParts.join('=') : 'true'];
      })
  );
  const eventIdValue = namedArgs.get('event-id') || process.env.AUTOMATION_EVENT_ID;
  const eventId = eventIdValue ? Number.parseInt(eventIdValue, 10) : null;

  if (eventIdValue && !Number.isFinite(eventId)) {
    throw new Error('AUTOMATION_EVENT_ID/--event-id must be an integer.');
  }

  return {
    eventId,
    dryRun: namedArgs.has('dry-run') || readBoolean(process.env.AUTOMATION_DRY_RUN),
    maxEvents: readInteger(
      namedArgs.get('max-events') || process.env.AUTOMATION_MAX_EVENTS,
      2,
      1
    ),
    newCardProfileLimit: readInteger(
      namedArgs.get('new-profile-limit') || process.env.AUTOMATION_NEW_CARD_PROFILE_LIMIT,
      4
    ),
    refreshProfileLimit: readInteger(
      namedArgs.get('refresh-profile-limit') || process.env.AUTOMATION_REFRESH_PROFILE_LIMIT,
      2
    ),
    scraperTimeoutMs: readInteger(
      namedArgs.get('timeout-ms') || process.env.AUTOMATION_SCRAPER_TIMEOUT_MS,
      300000,
      1000
    ),
    timeZone: namedArgs.get('time-zone')
      || process.env.AUTOMATION_TIME_ZONE
      || 'America/Denver',
  };
}

function warn(message) {
  console.warn(process.env.GITHUB_ACTIONS ? `::warning::${message}` : message);
}

async function emitReport(report) {
  const serialized = JSON.stringify(report, null, 2);
  console.log(serialized);

  const reportPath = String(process.env.AUTOMATION_REPORT_PATH || '').trim();
  if (reportPath) {
    await fs.writeFile(reportPath, `${serialized}\n`, 'utf8');
  }
}

async function loadEvents(supabase, eventId) {
  let query = supabase
    .from('events')
    .select('id,name,date,is_completed,image_url,venue,location_city,location_state,location_country')
    .order('date', { ascending: true });

  if (Number.isFinite(eventId)) {
    query = query.eq('id', eventId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load events: ${error.message}`);
  }
  return data || [];
}

async function loadEventContext(supabase, event) {
  const { data: existingRows, error: rowError } = await supabase
    .from('ufc_full_fight_card')
    .select('*')
    .eq('EventId', event.id);

  if (rowError) {
    throw new Error(`Failed to load event ${event.id} fight card: ${rowError.message}`);
  }

  const fightIds = Array.from(
    new Set((existingRows || []).map((row) => row.FightId).filter((value) => value != null))
  );
  let existingResults = [];
  let existingPredictions = [];

  if (fightIds.length > 0) {
    const [resultResponse, predictionResponse] = await Promise.all([
      supabase
        .from('fight_results')
        .select('fight_id,fighter_id,is_completed')
        .in('fight_id', fightIds),
      supabase
        .from('predictions')
        .select('fight_id,fighter_id')
        .in('fight_id', fightIds),
    ]);

    if (resultResponse.error) {
      throw new Error(
        `Failed to load event ${event.id} fight results: ${resultResponse.error.message}`
      );
    }
    if (predictionResponse.error) {
      throw new Error(
        `Failed to load event ${event.id} predictions: ${predictionResponse.error.message}`
      );
    }
    existingResults = resultResponse.data || [];
    existingPredictions = predictionResponse.data || [];
  }

  return {
    existingRows: existingRows || [],
    existingResults,
    existingPredictions,
  };
}

async function importPreview(supabase, event, preview) {
  const { data, error } = await supabase.rpc('replace_ufc_full_fight_card_event', {
    p_event_id: event.id,
    p_event_name: preview.previewEvent.name,
    p_event_date: preview.previewEvent.date,
    p_venue: preview.previewEvent.venue,
    p_location_city: preview.previewEvent.location_city,
    p_location_state: preview.previewEvent.location_state,
    p_location_country: preview.previewEvent.location_country,
    p_rows: preview.rows,
  });

  if (error) {
    throw new Error(`Event ${event.id} import failed: ${error.message}`);
  }

  const eventImageUpdate = await backfillEventImageIfMissing({
    supabase,
    eventId: event.id,
    currentImageUrl: preview.currentEvent?.image_url,
    fallbackImageUrl: preview.previewEvent?.tapology_event_image_url,
  });
  const fighterSync = await syncFighterStyleFromFightCardRows({
    supabase,
    fightCardRows: preview.rows,
  });

  return { importResult: data, eventImageUpdate, fighterSync };
}

async function processEvent({ supabase, event, options, now }) {
  const context = await loadEventContext(supabase, event);
  const existingSummary = summarizeMissingFightCardData(context.existingRows);
  const eventDetails = {
    eventId: event.id,
    eventName: event.name,
    eventDate: event.date,
  };

  if (context.existingResults.length > 0 || hasEventStarted(context.existingRows, now)) {
    return {
      ...eventDetails,
      status: 'skipped-started',
      reason: 'Fight results exist or the stored card start time has passed.',
      existingMissing: existingSummary,
    };
  }

  if (options.dryRun) {
    return {
      ...eventDetails,
      status: 'dry-run',
      action: context.existingRows.length > 0 ? 'refresh-and-fill-blanks' : 'scrape-and-import',
      existingMissing: existingSummary,
    };
  }

  const profileLimit = context.existingRows.length === 0
    ? options.newCardProfileLimit
    : (existingSummary.missingValueCount > 0 ? options.refreshProfileLimit : 0);
  let scraperOutput = null;

  try {
    scraperOutput = await runFightCardScraper({
      eventId: event.id,
      repoRoot,
      timeoutMs: options.scraperTimeoutMs,
      tapologyProfileLimit: String(profileLimit),
    });
    const parsedCsv = await parseFightCardCsvFile(scraperOutput.csvPath);
    const mergedRows = mergeScrapedRowsWithStoredValues(parsedCsv.rows, context.existingRows);
    const preview = await buildFightCardPreview({
      eventId: event.id,
      csvPath: scraperOutput.csvPath,
      headers: parsedCsv.headers,
      rows: mergedRows,
      headerErrors: parsedCsv.headerErrors,
      eventRecord: event,
      existingFightCardRows: context.existingRows,
      existingFightResults: context.existingResults,
      scraperOutput,
    });

    if (preview.blockers.length > 0) {
      warn(`Event ${event.id} was not imported: ${preview.blockers.join(' ')}`);
      return {
        ...eventDetails,
        status: 'blocked',
        profileLimit,
        existingMissing: existingSummary,
        remainingMissing: summarizeMissingFightCardData(preview.rows),
        blockers: preview.blockers,
        warnings: preview.warnings,
      };
    }

    let lineupAssessment = null;
    if (context.existingRows.length > 0 && preview.changedFightCard) {
      lineupAssessment = assessLineupChange({
        existingRows: context.existingRows,
        nextRows: preview.rows,
        predictions: context.existingPredictions,
      });

      if (!lineupAssessment.canAutoApply) {
        const affectedCount = lineupAssessment.predictionImpact.affectedPredictionCount;
        warn(
          `Event ${event.id} lineup change needs review because ${affectedCount} prediction(s) `
          + 'belong to removed or changed fights.'
        );
        return {
          ...eventDetails,
          status: 'lineup-change-review-required',
          reason: `${affectedCount} prediction(s) would be invalidated by this lineup change.`,
          profileLimit,
          lineupChanges: lineupAssessment.lineupChanges,
          predictionImpact: lineupAssessment.predictionImpact,
          existingMissing: existingSummary,
          warnings: preview.warnings,
        };
      }
    }

    const newlyFilled = summarizeFilledFightCardData(context.existingRows, preview.rows);
    const remainingMissing = summarizeMissingFightCardData(preview.rows);
    if (context.existingRows.length > 0 && newlyFilled.filledValueCount === 0 && !lineupAssessment) {
      const eventImageUpdate = await backfillEventImageIfMissing({
        supabase,
        eventId: event.id,
        currentImageUrl: preview.currentEvent?.image_url,
        fallbackImageUrl: preview.previewEvent?.tapology_event_image_url,
      });
      return {
        ...eventDetails,
        status: 'checked-no-new-values',
        profileLimit,
        existingMissing: existingSummary,
        newlyFilled,
        remainingMissing,
        warnings: preview.warnings,
        eventImageUpdate,
      };
    }

    const persisted = await importPreview(supabase, event, preview);
    return {
      ...eventDetails,
      status: lineupAssessment
        ? 'lineup-updated'
        : (context.existingRows.length > 0 ? 'filled-missing-values' : 'imported-new-card'),
      profileLimit,
      filledValueCount: newlyFilled.filledValueCount,
      newlyFilled,
      existingMissing: existingSummary,
      rowCount: preview.rowCount,
      fightCount: preview.fightCount,
      remainingMissing,
      lineupChanges: lineupAssessment?.lineupChanges || null,
      predictionImpact: lineupAssessment?.predictionImpact || null,
      warnings: preview.warnings,
      ...persisted,
    };
  } finally {
    await removePreviewAssets(scraperOutput?.scratchDir);
  }
}

async function main() {
  const options = parseArgs(process.argv);
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = new Date();
  const events = await loadEvents(supabase, options.eventId);
  const dueEvents = selectDueEvents({
    events,
    now,
    timeZone: options.timeZone,
    explicitEventId: options.eventId,
    maxEvents: options.maxEvents,
  });

  if (dueEvents.length === 0) {
    await emitReport({
      status: 'no-events-due',
      checkedAt: now.toISOString(),
      timeZone: options.timeZone,
      explicitEventId: options.eventId,
      dryRun: options.dryRun,
      results: [],
    });
    return;
  }

  const results = [];
  for (const event of dueEvents) {
    try {
      results.push(await processEvent({ supabase, event, options, now }));
    } catch (error) {
      warn(`Event ${event.id} automation failed: ${error.message || error}`);
      results.push({
        eventId: event.id,
        eventName: event.name,
        eventDate: event.date,
        status: 'failed',
        error: error.message || String(error),
      });
    }
  }

  const attentionStatuses = new Set([
    'failed',
    'blocked',
    'lineup-change-refused',
    'lineup-change-review-required',
  ]);
  const needsAttention = results.some((result) => attentionStatuses.has(result.status));

  await emitReport({
    status: needsAttention ? 'attention-required' : 'complete',
    checkedAt: now.toISOString(),
    timeZone: options.timeZone,
    dryRun: options.dryRun,
    results,
  });

  if (needsAttention) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error('Fight-card automation failed:', error.message || error);
  try {
    await emitReport({
      status: 'failed',
      checkedAt: new Date().toISOString(),
      timeZone: process.env.AUTOMATION_TIME_ZONE || 'America/Denver',
      dryRun: readBoolean(process.env.AUTOMATION_DRY_RUN),
      results: [],
      error: error.message || String(error),
    });
  } catch (reportError) {
    console.error('Failed to write automation report:', reportError.message || reportError);
  }
  process.exit(1);
});
