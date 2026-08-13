export const VALID_WORKSPACE_VIEWS = new Set(['picks', 'props', 'leaderboard']);

export function resolveWorkspaceState(search = '', storedEventId = null) {
  const params = new URLSearchParams(search);
  const requestedView = params.get('view');
  return {
    eventId: params.get('event') || storedEventId || null,
    view: VALID_WORKSPACE_VIEWS.has(requestedView) ? requestedView : 'picks',
    hasValidView: VALID_WORKSPACE_VIEWS.has(requestedView),
  };
}

export function buildWorkspaceSearch(eventId, view) {
  const params = new URLSearchParams();
  if (eventId !== null && eventId !== undefined && eventId !== '') {
    params.set('event', String(eventId));
  }
  params.set('view', VALID_WORKSPACE_VIEWS.has(view) ? view : 'picks');
  return `?${params.toString()}`;
}
