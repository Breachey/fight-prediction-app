import React from 'react';

const VoteCard = ({ vote, username, rivalMarker = null }) => {
  const bgUrl = vote.playercard?.image_url || '';
  const fallbackBg = 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 55%, #ef4444 100%)';
  const isCurrentUser = vote.username === username;
  const isPickTwin = rivalMarker === 'twin';
  const isNemesis = rivalMarker === 'nemesis';
  const border = isCurrentUser
    ? '2.5px solid #22d3ee'
    : isPickTwin
    ? '2.5px solid rgba(34, 211, 238, 0.92)'
    : isNemesis
    ? '2.5px solid rgba(168, 85, 247, 0.95)'
    : 'none';
  const boxShadow = isCurrentUser
    ? '0 0 0 2.5px #22d3ee, 0 2px 8px #22d3ee44'
    : isPickTwin
    ? '0 0 0 2px rgba(34, 211, 238, 0.75), 0 6px 14px rgba(34, 211, 238, 0.2)'
    : isNemesis
    ? '0 0 0 2px rgba(168, 85, 247, 0.82), 0 6px 14px rgba(168, 85, 247, 0.22)'
    : '0 4px 12px rgba(37, 99, 235, 0.2)';
  const rivalryBadge = isPickTwin
    ? { label: '👯 Twin', bg: 'rgba(34, 211, 238, 0.2)', color: '#a5f3fc', border: '1px solid rgba(34, 211, 238, 0.45)' }
    : isNemesis
    ? { label: '😈 Nemesis', bg: 'rgba(168, 85, 247, 0.22)', color: '#e9d5ff', border: '1px solid rgba(168, 85, 247, 0.5)' }
    : null;

  return (
    <div
      className="vote-username-on-bg"
      style={{
        position: 'relative',
        background: bgUrl ? `url('${bgUrl}') center/cover no-repeat` : fallbackBg,
        borderRadius: 12,
        overflow: 'hidden',
        minHeight: 40,
        marginBottom: 12,
        boxShadow,
        border,
      }}
    >
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(90deg, rgba(8,12,22,0.84) 54%, rgba(37,99,235,0.26) 100%)',
        zIndex: 1,
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'relative',
        zIndex: 2,
        display: 'flex',
        alignItems: 'center',
        padding: '8px 16px',
        minHeight: 40,
      }}>
        <span style={{
          fontWeight: 700,
          color: '#fff',
          textShadow: '0 2px 8px #000a, 0 0 2px #000',
          fontSize: '1.1rem',
          letterSpacing: 0.01,
          borderRadius: 6,
          padding: '0 6px',
          marginRight: 8,
        }}>
          {vote.username}{isCurrentUser && ' (You)'}
        </span>
        {rivalryBadge && (
          <span style={{
            background: rivalryBadge.bg,
            color: rivalryBadge.color,
            padding: '2px 8px',
            borderRadius: 12,
            fontSize: '0.78rem',
            fontWeight: 600,
            fontFamily: '"Permanent Marker", "Brush Script MT", cursive',
            letterSpacing: '0.03em',
            border: rivalryBadge.border,
            marginLeft: 2
          }}>
            {rivalryBadge.label}
          </span>
        )}
        {vote.is_bot && (
          <span style={{
            background: 'rgba(59,130,246,0.2)',
            color: '#60a5fa',
            padding: '2px 8px',
            borderRadius: 12,
            fontSize: '0.85rem',
            fontWeight: 500,
            border: '1px solid rgba(59, 130, 246, 0.3)',
            marginLeft: 4,
          }}>AI</span>
        )}
      </div>
    </div>
  );
};

export default VoteCard;
