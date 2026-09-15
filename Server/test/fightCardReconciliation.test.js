const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

// Run against an isolated PostgreSQL runtime, never the live database:
// PGLITE_MODULE_PATH=/tmp/fight-picker-sql-test/node_modules/@electric-sql/pglite node --test Server/test/fightCardReconciliation.test.js
const runtimePath = process.env.PGLITE_MODULE_PATH;

test('canceled-fight reconciliation is atomic and preserves unaffected predictions', {
  skip: runtimePath ? false : 'Set PGLITE_MODULE_PATH to run isolated PostgreSQL regression tests',
}, async () => {
  const { PGlite } = require(runtimePath);
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.events (id bigint PRIMARY KEY, is_completed boolean DEFAULT false);
      CREATE TABLE public.ufc_full_fight_card (
        "EventId" bigint, "FightId" bigint, "FighterId" bigint, "StartTime" text
      );
      CREATE TABLE public.predictions (fight_id bigint, fighter_id bigint);
      CREATE TABLE public.fight_results (fight_id bigint);
      -- Stand-in for the existing importer; failures must roll back the wrapper's deletions.
      CREATE FUNCTION public.replace_ufc_full_fight_card_event(
        p_event_id bigint, p_event_name text, p_event_date date, p_venue text,
        p_location_city text, p_location_state text, p_location_country text, p_rows jsonb
      ) RETURNS jsonb LANGUAGE plpgsql AS $$
      BEGIN
        DELETE FROM public.ufc_full_fight_card WHERE "EventId" = p_event_id;
        IF p_event_name = 'fail' THEN RAISE EXCEPTION 'Simulated import failure'; END IF;
        INSERT INTO public.ufc_full_fight_card
        SELECT p_event_id, r."FightId", r."FighterId", '2099-01-01'
        FROM jsonb_to_recordset(p_rows) AS r("FightId" bigint, "FighterId" bigint);
        RETURN '{"imported":true}'::jsonb;
      END; $$;
    `);
    await db.exec(await fs.readFile(path.join(__dirname,
      '../../supabase/migrations/20260915143443_reconcile_cancelled_fights.sql'), 'utf8'));
    const rows = (fightId, blueId = fightId * 10 + 1) => [
      { EventId: 1, FightId: fightId, FighterId: fightId * 10, Corner: 'Red' },
      { EventId: 1, FightId: fightId, FighterId: blueId, Corner: 'Blue' },
    ];
    const reset = () => db.exec(`
      TRUNCATE events, ufc_full_fight_card, predictions, fight_results;
      INSERT INTO events VALUES (1, false), (2, false);
      INSERT INTO ufc_full_fight_card VALUES
        (1,10,100,'2099-01-01'), (1,10,101,'2099-01-01'),
        (1,11,110,'2099-01-01'), (1,11,111,'2099-01-01'),
        (2,20,200,'2099-01-01'), (2,20,201,'2099-01-01');
      INSERT INTO predictions VALUES (10,100), (11,110), (11,111), (20,200);
    `);
    const reconcile = (incoming, name = 'Test') => db.query(`
      SELECT public.reconcile_upcoming_fight_card_event(
        1, $1, NULL, NULL, NULL, NULL, NULL, $2::jsonb
      ) AS result`, [name, JSON.stringify(incoming)]);
    const picks = async () => (await db.query('SELECT * FROM predictions ORDER BY fight_id, fighter_id')).rows;
    const originalPicks = [
      { fight_id: 10, fighter_id: 100 }, { fight_id: 11, fighter_id: 110 },
      { fight_id: 11, fighter_id: 111 }, { fight_id: 20, fighter_id: 200 },
    ];

    await reset();
    const result = await reconcile([...rows(10), ...rows(12)]);
    assert.deepEqual(result.rows[0].result.removedFightIds, [11]);
    assert.equal(result.rows[0].result.removedPredictionCount, 2);
    assert.deepEqual(await picks(), [originalPicks[0], originalPicks[3]]);
    assert.deepEqual((await db.query('SELECT DISTINCT "FightId" FROM ufc_full_fight_card ORDER BY "FightId"')).rows,
      [{ FightId: 10 }, { FightId: 12 }, { FightId: 20 }]);
    assert.equal((await reconcile([...rows(10), ...rows(12)])).rows[0].result.removedPredictionCount, 0);

    await reset();
    await assert.rejects(reconcile(rows(10), 'fail'), /Simulated import failure/);
    assert.deepEqual(await picks(), originalPicks);
    assert.equal((await db.query('SELECT count(*)::integer AS n FROM ufc_full_fight_card')).rows[0].n, 6);
    await assert.rejects(reconcile(rows(10, 999)), /Opponent changes/);
    await assert.rejects(reconcile([]), /empty fight card/);
    await assert.rejects(reconcile([rows(10)[0]]), /complete fights/);
    await assert.rejects(reconcile(rows(10).map((row) => ({ ...row, EventId: 2 }))), /complete fights/);
    assert.deepEqual(await picks(), originalPicks);

    await db.exec('INSERT INTO fight_results VALUES (11)');
    await assert.rejects(reconcile(rows(10)), /started or completed/);
    await reset();
    await db.exec(`UPDATE ufc_full_fight_card SET "StartTime" = '2000-01-01' WHERE "EventId" = 1`);
    await assert.rejects(reconcile(rows(10)), /started or completed/);
    await reset();
    await db.exec('UPDATE events SET is_completed = true WHERE id = 1');
    await assert.rejects(reconcile(rows(10)), /started or completed/);
    assert.deepEqual(await picks(), originalPicks);

    const permissions = await db.query(`SELECT
      has_function_privilege('anon', 'public.reconcile_upcoming_fight_card_event(bigint,text,date,text,text,text,text,jsonb)', 'EXECUTE') AS anon,
      has_function_privilege('authenticated', 'public.reconcile_upcoming_fight_card_event(bigint,text,date,text,text,text,text,jsonb)', 'EXECUTE') AS authenticated,
      has_function_privilege('service_role', 'public.reconcile_upcoming_fight_card_event(bigint,text,date,text,text,text,text,jsonb)', 'EXECUTE') AS service_role`);
    assert.deepEqual(permissions.rows[0], { anon: false, authenticated: false, service_role: true });
  } finally {
    await db.close();
  }
});
