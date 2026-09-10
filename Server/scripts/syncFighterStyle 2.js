const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const {
  syncFighterStyleFromAllFightCards,
  syncFighterStyleFromEvent,
} = require('../lib/fighterStyleSync');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Server/.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
const eventIdArg = process.argv
  .slice(2)
  .find((arg) => arg.startsWith('--event-id='));
const eventId = eventIdArg ? Number.parseInt(eventIdArg.split('=')[1], 10) : null;

async function main() {
  try {
    const results = eventId !== null && Number.isFinite(eventId)
      ? await syncFighterStyleFromEvent(supabase, eventId)
      : await syncFighterStyleFromAllFightCards(supabase);

    console.log(
      JSON.stringify(
        {
          scope: eventId !== null && Number.isFinite(eventId) ? 'event' : 'all',
          eventId: eventId !== null && Number.isFinite(eventId) ? eventId : null,
          ...results,
        },
        null,
        2
      )
    );
  } catch (error) {
    const errorMessage = error && typeof error.message === 'string' ? error.message : '';
    const errorDetails = error && typeof error.details === 'string' ? error.details : '';

    if (
      errorMessage.includes('fighters')
      || errorDetails.includes('fighters')
      || errorMessage.includes('relation')
      || errorDetails.includes('relation')
    ) {
      console.error('fighters table not found. Run the Supabase migration first, then rerun this script.');
      process.exit(1);
    }

    console.error('Failed to sync fighter profiles:', error);
    process.exit(1);
  }
}

main();
