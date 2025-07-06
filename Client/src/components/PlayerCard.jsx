import React from 'react';
import './PlayerCard.css';

/**
 * PlayerCard component
 * @param {string} username - The user's display name
 * @param {object} playercard - { image_url, name, category, ... }
 * @param {string} size - 'small' | 'medium' | 'large'
 * @param {boolean} isCurrentUser - Highlight if this is the current user
 * @param {React.ReactNode} children - Optional children (badges, etc.)
 */
function PlayerCard({ username, playercard, size = 'medium', isCurrentUser = false, children }) {
  const bgUrl = playercard?.image_url || '';
  const cardName = playercard?.name || 'Default';
  const cardCategory = playercard?.category || 'basic';

  // Fallback background (gradient)
  const fallbackBg = 'linear-gradient(135deg, #4c1d95 0%, #a78bfa 100%)';

  return (
    <div
      className={`playercard-root playercard-size-${size} playercard-category-${cardCategory}${isCurrentUser ? ' playercard-current-user' : ''}`}
      style={{
        background: bgUrl ? `url('${bgUrl}') center/cover no-repeat` : fallbackBg,
        boxShadow: isCurrentUser ? '0 0 0 3px #22d3ee, 0 2px 8px rgba(0,0,0,0.18)' : undefined,
      }}
      title={cardName}
    >
      <span className="playercard-username">{username}</span>
      {children && <span className="playercard-badges">{children}</span>}
    </div>
  );
}

export default PlayerCard; 