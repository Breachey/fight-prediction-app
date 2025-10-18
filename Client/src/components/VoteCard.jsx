import React from 'react';

const VoteCard = ({ vote, username }) => {
  const bgUrl = vote.playercard?.image_url || '';
  const fallbackBg = 'linear-gradient(135deg, #4c1d95 0%, #a78bfa 100%)';

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
        boxShadow: vote.username === username ? '0 0 0 2.5px #22d3ee, 0 2px 8px #22d3ee44' : '0 2px 8px rgba(76,29,149,0.10)',
        border: vote.username === username ? '2.5px solid #22d3ee' : 'none',
      }}
    >
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(90deg, rgba(26,26,26,0.82) 60%, rgba(76,29,149,0.32) 100%)',
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
          {vote.username}{vote.username === username && ' (You)'}
        </span>
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

