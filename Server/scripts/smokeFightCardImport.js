const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const {
  backfillEventImageIfMissing,
  buildFightCardPreview,
  parseFightCardCsvFile,
  removePreviewAssets,
  runFightCardScraper,
} = require('../lib/fightCardImport');
const {
  syncFighterStyleFromFightCardRows,
} = require('../lib/fighterStyleSync');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Server/.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
const repoRoot = path.join(__dirname, '..', '..');

function parseArgs(argv) {
  const args = argv.slice(2);
  const previewOnly = args.includes('--preview-only');
  const positionalArgs = args.filter((arg) => !arg.startsWith('--'));
  const eventId = Number(positionalArgs[0]);

  if (!Number.isFinite(eventId)) {
    throw new Error('Usage: node scripts/smokeFightCardImport.js <eventId> [--preview-only]');
  }

  return {
    eventId,
    previewOnly,
  };
}

async function loadImportContext(eventId) {
  const [
    { data: eventRecord, error: eventError },
    { data: existingFightCardRows, error: existingFightCardError },
  ] = await Promise.all([
    supabase
      .from('events')
      .select('id, name, date, venue, location_city, location_state, location_country, image_url')
      .eq('id', eventId)
      .maybeSingle(),
    supabase
      .from('ufc_full_fight_card')
      .select('FightId, FighterId, Corner')
      .eq('EventId', eventId),
  ]);

  if (eventError) {
    throw new Error(`Failed to load event metadata: ${eventError.message}`);
  }

  if (existingFightCardError) {
    throw new Error(`Failed to load existing fight-card rows: ${existingFightCardError.message}`);
  }

  const existingFightIds = Array.from(
    new Set((existingFightCardRows || []).map((row) => row.FightId).filter(Boolean))
  );

  let existingFightResults = [];
  if (existingFightIds.length > 0) {
    const { data, error } = await supabase
      .from('fight_results')
      .select('fight_id, fighter_id, is_completed')
      .in('fight_id', existingFightIds);

    if (error) {
      throw new Error(`Failed to load existing fight results: ${error.message}`);
    }

    existingFightResults = data || [];
  }

  return {
    eventRecord,
    existingFightCardRows: existingFightCardRows || [],
    existingFightResults,
  };
}

async function verifyImportedState(eventId) {
  const [
    { count: rowCount, error: rowError },
    { data: fightRows, error: fightError },
    { data: eventRecord, error: eventError },
  ] = await Promise.all([
    supabase
      .from('ufc_full_fight_card')
      .select('*', { count: 'exact', head: true })
      .eq('EventId', eventId),
    supabase
      .from('ufc_full_fight_card')
      .select('FightId')
      .eq('EventId', eventId),
    supabase
      .from('events')
      .select('id, name, date, venue, location_city, location_state, location_country, image_url')
      .eq('id', eventId)
      .single(),
  ]);

  if (rowError) {
    throw new Error(`Failed to verify imported rows: ${rowError.message}`);
  }

  if (fightError) {
    throw new Error(`Failed to verify imported fights: ${fightError.message}`);
  }

  if (eventError) {
    throw new Error(`Failed to verify imported event metadata: ${eventError.message}`);
  }

  return {
    rowCount: rowCount || 0,
    fightCount: new Set((fightRows || []).map((row) => row.FightId)).size,
    event: eventRecord,
  };
}

async function main() {
  const { eventId, previewOnly } = parseArgs(process.argv);
  let scraperOutput = null;

  try {
    const importContext = await loadImportContext(eventId);

    scraperOutput = await runFightCardScraper({
      eventId,
      repoRoot,
    });

    const parsedCsv = await parseFightCardCsvFile(scraperOutput.csvPath);
    const preview = await buildFightCardPreview({
      eventId,
      csvPath: scraperOutput.csvPath,
      headers: parsedCsv.headers,
      rows: parsedCsv.rows,
      headerErrors: parsedCsv.headerErrors,
      eventRecord: importContext.eventRecord,
      existingFightCardRows: importContext.existingFightCardRows,
      existingFightResults: importContext.existingFightResults,
      scraperOutput,
    });

    console.log(
      JSON.stringify(
        {
          mode: previewOnly ? 'preview-only' : 'preview-and-import',
          eventId,
          preview: {
            rowCount: preview.rowCount,
            fightCount: preview.fightCount,
            existingFightCardRowCount: preview.existingFightCardRowCount,
            existingFightResultCount: preview.existingFightResultCount,
            eventFieldChanges: preview.eventFieldChanges,
            warnings: preview.warnings,
            blockers: preview.blockers,
            csvFileName: preview.csvFileName,
          },
        },
        null,
        2
      )
    );

    if (preview.blockers.length > 0) {
      process.exitCode = 1;
      return;
    }

    if (previewOnly) {
      return;
    }

    const { data: importResult, error: importError } = await supabase.rpc(
      'replace_ufc_full_fight_card_event',
      {
        p_event_id: eventId,
        p_event_name: preview.previewEvent.name,
        p_event_date: preview.previewEvent.date,
        p_venue: preview.previewEvent.venue,
        p_location_city: preview.previewEvent.location_city,
        p_location_state: preview.previewEvent.location_state,
        p_location_country: preview.previewEvent.location_country,
        p_rows: preview.rows,
      }
    );

    if (importError) {
      throw new Error(`Import failed: ${importError.message}`);
    }

    const eventImageUpdate = await backfillEventImageIfMissing({
      supabase,
      eventId,
      currentImageUrl: preview.currentEvent?.image_url,
      fallbackImageUrl: preview.previewEvent?.tapology_event_image_url,
    });

    const fighterStyleSync = await syncFighterStyleFromFightCardRows({
      supabase,
      fightCardRows: preview.rows,
    });

    const verification = await verifyImportedState(eventId);

    console.log(
      JSON.stringify(
        {
          importResult,
          eventImageUpdate,
          fighterStyleSync,
          verification,
        },
        null,
        2
      )
    );
  } finally {
    await removePreviewAssets(scraperOutput?.scratchDir);
  }
}

main().catch((error) => {
  console.error('Fight-card smoke test failed:', error.message || error);
  process.exit(1);
});
