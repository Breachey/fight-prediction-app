export function appendViewerUserId(url, viewerUserId) {
  if (!viewerUserId) {
    return url;
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}viewer_user_id=${encodeURIComponent(viewerUserId)}`;
}
