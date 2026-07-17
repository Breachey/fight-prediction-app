async function createNotifications({
  supabase,
  recipientUserIds,
  actorUserId = null,
  notificationType,
  entityType = null,
  entityId = null,
  title,
  body,
  payload = {},
}) {
  const recipients = [...new Set((recipientUserIds || [])
    .map((userId) => Number.parseInt(String(userId), 10))
    .filter((userId) => Number.isFinite(userId)))];

  if (!supabase || recipients.length === 0) {
    return [];
  }

  const rows = recipients.map((recipientUserId) => ({
    recipient_user_id: recipientUserId,
    actor_user_id: actorUserId,
    notification_type: notificationType,
    entity_type: entityType,
    entity_id: entityId,
    title,
    body,
    payload,
  }));

  const { data, error } = await supabase
    .from('notifications')
    .insert(rows)
    .select('*');

  if (error) {
    throw error;
  }

  return data || [];
}

module.exports = { createNotifications };
