const path = require('path');
const dotenv = require('dotenv');
const {
  refreshTapologyCacheForEvent,
} = require('../lib/fightCardImport');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const repoRoot = path.resolve(__dirname, '..', '..');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const eventIdArg = process.argv
  .slice(2)
  .find((arg) => arg.startsWith('--event-id='));
const eventId = eventIdArg ? Number.parseInt(eventIdArg.split('=')[1], 10) : null;

async function main() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Server/.env');
    process.exit(1);
  }

  if (!Number.isFinite(eventId)) {
    console.error('Usage: npm run sync:tapology-cache -- --event-id=1313');
    process.exit(1);
  }

  try {
    const result = await refreshTapologyCacheForEvent({
      eventId,
      repoRoot,
    });

    console.log(JSON.stringify(result, null, 2));

    if (result.headerErrors?.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Failed to sync Tapology cache:', error);
    process.exit(1);
  }
}

main();
