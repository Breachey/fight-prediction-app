const PAGE_SIZE = 500;
const CACHE_MS = 5 * 60 * 1000;

async function readPages(query) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await query().range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Calendar query returned no data');
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

async function loadCalendarEvents(supabase, now = new Date()) {
  const cutoff = new Date(now.getTime() - (90 * 24 + 7) * 60 * 60 * 1000).toISOString().slice(0, 10);
  const events = (await readPages(() => supabase.from('events')
    .select('id,name,date,is_completed,venue,location_city,location_state,location_country')
    .gte('date', cutoff).order('id', { ascending: true })))
    .filter(event => /\bUFC\b/i.test(event.name || ''));
  const byId = new Map(events.map(event => [String(event.id), { ...event, card_start_times: {} }]));
  // Bound the IN filter and paginate fight rows independently of the events query.
  for (let offset = 0; offset < events.length; offset += 100) {
    const ids = events.slice(offset, offset + 100).map(event => event.id);
    const fights = await readPages(() => supabase.from('ufc_full_fight_card')
      .select('id,EventId,StartTime,CardSegment,CardSegmentStartTime')
      .in('EventId', ids).order('id', { ascending: true }));
    const setEarliest = (target, key, value) => {
      if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value))) return;
      if (!target[key] || Date.parse(value) < Date.parse(target[key])) target[key] = value;
    };
    for (const fight of fights) {
      const event = byId.get(String(fight.EventId));
      if (!event) continue;
      setEarliest(event, 'start_time', fight.StartTime);
      const segment = String(fight.CardSegment || '').toLowerCase().replace(/\s/g, '');
      const key = { maincard: 'main_card', prelims1: 'prelims', prelims: 'prelims', prelims2: 'early_prelims', earlyprelims: 'early_prelims' }[segment];
      if (key) setEarliest(event.card_start_times, key, fight.CardSegmentStartTime);
    }
  }
  return [...byId.values()];
}

function createCalendarFeedHandler({ supabase, origin = 'https://fytpix.com', now = () => new Date(), logger = console }) {
  let cached = null;
  let pending = null;
  return async (_req, res) => {
    try {
      if (!cached || now().getTime() - cached.createdAt >= CACHE_MS) {
        if (!pending) {
          pending = (async () => {
            const generatedAt = now();
            const events = await loadCalendarEvents(supabase, generatedAt);
            const { buildEventCalendar } = await import('./eventCalendar.mjs');
            const body = buildEventCalendar(events, { now: generatedAt, origin, subscription: true });
            cached = { body, createdAt: generatedAt.getTime() };
          })().finally(() => { pending = null; });
        }
        await pending;
      }
      res.set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="ufc.ics"', 'Cache-Control': 'public, max-age=300' });
      return res.status(200).send(cached.body);
    } catch (error) {
      logger.error('Failed to generate UFC calendar feed:', error);
      // Never replace a subscriber's calendar with a partial/empty feed after a query failure.
      res.set({ 'Cache-Control': 'no-store', 'Retry-After': '300' });
      return res.status(503).send('Calendar temporarily unavailable. Please try again later.');
    }
  };
}
module.exports = { createCalendarFeedHandler, loadCalendarEvents };
