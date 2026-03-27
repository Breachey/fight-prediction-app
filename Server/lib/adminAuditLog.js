function getRequestIp(req) {
  const forwardedFor = req?.headers?.['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  if (typeof req?.ip === 'string' && req.ip.trim()) {
    return req.ip.trim();
  }

  return null;
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  try {
    return JSON.parse(JSON.stringify(metadata));
  } catch (error) {
    return {};
  }
}

async function writeAdminAuditLog({
  supabase,
  req,
  adminUser,
  action,
  status = 'success',
  targetType = null,
  targetId = null,
  eventId = null,
  metadata = {},
}) {
  if (!supabase || !adminUser || !action) {
    return;
  }

  const normalizedEventId = Number(eventId);

  const { error } = await supabase
    .from('admin_action_audit_log')
    .insert({
      admin_user_id: adminUser.user_id,
      admin_username: adminUser.username,
      action,
      status,
      target_type: targetType,
      target_id: targetId === null || targetId === undefined ? null : String(targetId),
      event_id: Number.isFinite(normalizedEventId) ? normalizedEventId : null,
      request_method: req?.method || 'UNKNOWN',
      request_path: req?.originalUrl || req?.path || '',
      ip_address: getRequestIp(req),
      metadata: sanitizeMetadata(metadata),
    });

  if (error) {
    console.error('Failed to write admin audit log:', error);
  }
}

module.exports = {
  writeAdminAuditLog,
};
