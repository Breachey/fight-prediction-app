import React, { memo, useId } from 'react';
import { getAvatarContrastColor, normalizeAvatarConfig } from '../utils/avatarConfig';
import './SquidAvatar.css';

function scalePath(character, config) {
  const widthScale = config.width / 100;
  const heightScale = config.height / 100;
  const curve = config.roundness / 100;

  if (character === 'kirby') {
    const arm = 6 + (curve * 5);
    return {
      path: `M60 16 C78 16 91 29 92 47 C103 50 108 60 103 69 C99 77 91 79 84 75 C81 87 70 95 56 94 C47 94 40 91 35 86 C27 92 17 89 ${16 - arm * 0.2} 81 C11 73 17 66 27 62 C25 41 38 18 60 16Z`,
      eyeY: 53,
      detail: 'kirby',
      transform: `translate(60 60) scale(${widthScale} ${heightScale}) translate(-60 -60)`,
    };
  }

  if (character === 'cloudee') {
    const lift = 3 + (curve * 5);
    return {
      path: `M33 79 C19 79 14 63 23 53 C20 40 31 ${31 - lift} 44 31 C50 18 69 17 77 29 C90 25 102 37 99 50 C110 58 105 75 92 78 C78 83 48 83 33 79Z`,
      eyeY: 55,
      detail: 'cloudee',
      transform: `translate(60 60) scale(${widthScale} ${heightScale}) translate(-60 -60)`,
    };
  }

  if (character === 'red-panda') {
    const cheek = 86 + (curve * 5);
    return {
      path: `M60 22 C68 18 76 20 82 25 C87 17 99 17 101 27 C102 35 97 42 91 44 C95 58 90 76 78 ${cheek} C68 94 52 94 42 ${cheek} C30 76 25 58 29 44 C23 42 18 35 19 27 C21 17 33 17 38 25 C44 20 52 18 60 22Z`,
      eyeY: 58,
      detail: 'red-panda',
      transform: `translate(60 60) scale(${widthScale} ${heightScale}) translate(-60 -60)`,
    };
  }

  if (character === 'ogre') {
    const jaw = 88 + (curve * 7);
    return {
      path: `M32 31 C27 21 17 19 13 26 C9 34 17 42 28 40 C23 53 24 72 37 ${jaw} C48 99 72 99 83 ${jaw} C96 72 97 53 92 40 C103 42 111 34 107 26 C103 19 93 21 88 31 C80 20 71 16 60 16 C49 16 40 20 32 31Z`,
      eyeY: 55,
      detail: 'ogre',
      transform: `translate(60 60) scale(${widthScale} ${heightScale}) translate(-60 -60)`,
    };
  }

  if (character === 'golden-retriever') {
    const crown = 18 + ((1 - curve) * 5);
    return {
      path: `M39 28 C29 17 16 23 14 38 C12 54 20 78 34 84 C39 94 49 100 60 100 C71 100 81 94 86 84 C100 78 108 54 106 38 C104 23 91 17 81 28 C75 ${crown} 68 16 60 16 C52 16 45 ${crown} 39 28Z`,
      eyeY: 53,
      detail: 'golden-retriever',
      transform: `translate(60 60) scale(${widthScale} ${heightScale}) translate(-60 -60)`,
    };
  }

  const centerX = 60;
  const topY = 13;
  const halfWidth = 27 * widthScale;
  const headHeight = 52 * heightScale;
  const bottomY = topY + headHeight;
  const leftX = centerX - halfWidth;
  const rightX = centerX + halfWidth;
  const shoulderY = topY + headHeight * (0.12 + ((1 - curve) * 0.16));
  const topControl = halfWidth * (0.2 + (curve * 0.62));
  const tentacleLength = 23 * (config.tentacleLength / 100);
  const spreadScale = config.tentacleSpread / 100;
  const tentacleLeft = centerX - (halfWidth * spreadScale);
  const tentacleRight = centerX + (halfWidth * spreadScale);
  const segment = (tentacleRight - tentacleLeft) / 5;
  const silhouette = [
    `M${centerX} ${topY}`,
    `C${centerX - topControl} ${topY} ${leftX} ${shoulderY} ${leftX} ${bottomY - 8}`,
    `C${leftX} ${bottomY - 2} ${tentacleLeft} ${bottomY - 2} ${tentacleLeft} ${bottomY - 1}`,
  ];
  for (let index = 0; index < 5; index += 1) {
    const startX = tentacleLeft + (segment * index);
    const middleX = startX + (segment / 2);
    const endX = startX + segment;
    const alternatingLength = tentacleLength * (index === 2 ? 1.08 : index % 2 ? 0.92 : 0.82);
    silhouette.push(
      `C${startX} ${bottomY + alternatingLength * 0.45} ${middleX - segment * 0.23} ${bottomY + alternatingLength} ${middleX} ${bottomY + alternatingLength}`,
      `C${middleX + segment * 0.23} ${bottomY + alternatingLength} ${endX} ${bottomY + alternatingLength * 0.45} ${endX} ${bottomY - 1}`,
    );
  }
  silhouette.push(
    `C${rightX} ${bottomY - 2} ${rightX} ${bottomY - 2} ${rightX} ${bottomY - 8}`,
    `C${rightX} ${shoulderY} ${centerX + topControl} ${topY} ${centerX} ${topY}Z`,
  );
  return {
    path: silhouette.join(' '),
    eyeY: topY + headHeight * 0.52,
    detail: 'squid',
    transform: null,
  };
}

function AvatarPattern({ pattern, clipId, contrastColor }) {
  if (pattern === 'spots') {
    return (
      <g clipPath={`url(#${clipId})`} fill={contrastColor}>
        <circle cx="38" cy="39" r="6" />
        <circle cx="72" cy="30" r="4.5" />
        <circle cx="85" cy="58" r="7" />
        <circle cx="44" cy="73" r="5" />
      </g>
    );
  }
  if (pattern === 'stripes') {
    return (
      <g clipPath={`url(#${clipId})`} stroke={contrastColor} strokeWidth="8">
        <path d="M18 29 102 54" />
        <path d="M15 58 98 82" />
      </g>
    );
  }
  if (pattern === 'split') {
    return <path d="M60 0h60v120H60z" clipPath={`url(#${clipId})`} fill={contrastColor} />;
  }
  if (pattern === 'checker') {
    return (
      <g clipPath={`url(#${clipId})`} fill={contrastColor}>
        {Array.from({ length: 4 }, (_, row) => Array.from({ length: 4 }, (__, column) => (
          (row + column) % 2 === 0
            ? <rect key={`${row}-${column}`} x={20 + (column * 20)} y={18 + (row * 20)} width="20" height="20" />
            : null
        )))}
      </g>
    );
  }
  if (pattern === 'drips') {
    return (
      <path
        d="M10 5 H110 V43 C102 37 98 43 97 55 C96 67 84 68 82 54 C80 41 72 42 70 62 C68 79 53 77 52 59 C51 44 43 45 41 55 C38 69 27 66 28 51 C29 39 20 38 10 45Z"
        clipPath={`url(#${clipId})`}
        fill={contrastColor}
      />
    );
  }
  if (pattern === 'waves') {
    return (
      <g clipPath={`url(#${clipId})`} fill="none" stroke={contrastColor} strokeWidth="5.5" strokeLinecap="round">
        <path d="M10 31 C24 20 35 42 49 31 S74 20 88 31 S110 42 120 31" />
        <path d="M5 54 C19 43 30 65 44 54 S69 43 83 54 S105 65 115 54" />
        <path d="M11 77 C25 66 36 88 50 77 S75 66 89 77 S111 88 121 77" />
      </g>
    );
  }
  if (pattern === 'many-eyes') {
    return (
      <g clipPath={`url(#${clipId})`} fill="none" stroke={contrastColor} strokeWidth="2.8">
        <ellipse cx="34" cy="34" rx="7" ry="5" /><circle cx="35" cy="34" r="1.8" fill={contrastColor} stroke="none" />
        <ellipse cx="67" cy="28" rx="8" ry="5.5" /><circle cx="64" cy="28" r="2" fill={contrastColor} stroke="none" />
        <ellipse cx="89" cy="48" rx="6" ry="8" /><circle cx="89" cy="51" r="1.8" fill={contrastColor} stroke="none" />
        <ellipse cx="38" cy="69" rx="8" ry="5" /><circle cx="41" cy="69" r="2" fill={contrastColor} stroke="none" />
        <ellipse cx="73" cy="79" rx="7" ry="5" /><circle cx="71" cy="79" r="1.8" fill={contrastColor} stroke="none" />
      </g>
    );
  }
  return null;
}

function CharacterDetails({ character, detailColor }) {
  if (character === 'red-panda') {
    return (
      <g fill={detailColor} opacity="0.86">
        <path d="M25 28 C29 21 35 22 39 28 C34 30 30 34 28 39 C25 36 23 32 25 28Z" />
        <path d="M95 28 C91 21 85 22 81 28 C86 30 90 34 92 39 C95 36 97 32 95 28Z" />
        <path d="M36 54 C42 45 52 44 56 54 C53 67 45 74 36 69 C32 64 32 59 36 54Z" />
        <path d="M84 54 C78 45 68 44 64 54 C67 67 75 74 84 69 C88 64 88 59 84 54Z" />
        <ellipse cx="60" cy="76" rx="6" ry="4.5" />
      </g>
    );
  }
  if (character === 'ogre') {
    return (
      <g fill={detailColor} opacity="0.82">
        <ellipse cx="20" cy="30" rx="4.5" ry="3.5" transform="rotate(18 20 30)" />
        <ellipse cx="100" cy="30" rx="4.5" ry="3.5" transform="rotate(-18 100 30)" />
        <ellipse cx="55" cy="74" rx="2.6" ry="3.8" transform="rotate(18 55 74)" />
        <ellipse cx="65" cy="74" rx="2.6" ry="3.8" transform="rotate(-18 65 74)" />
      </g>
    );
  }
  if (character === 'golden-retriever') {
    return (
      <g fill={detailColor} opacity="0.86">
        <path d="M37 29 C27 22 20 29 20 42 C20 55 25 70 34 76 C37 62 40 45 37 29Z" />
        <path d="M83 29 C93 22 100 29 100 42 C100 55 95 70 86 76 C83 62 80 45 83 29Z" />
        <ellipse cx="60" cy="75" rx="17" ry="12" opacity="0.38" />
        <ellipse cx="60" cy="70" rx="5.5" ry="4.2" />
      </g>
    );
  }
  return null;
}

function AvatarEyes({ eyes, color, accentColor, eyeY, spacing }) {
  const leftX = 60 - spacing;
  const rightX = 60 + spacing;
  if (eyes === 'round') {
    return <g fill={color}><circle cx={leftX} cy={eyeY} r="6.5" /><circle cx={rightX} cy={eyeY} r="6.5" /></g>;
  }
  if (eyes === 'sleepy') {
    return (
      <g fill="none" stroke={color} strokeWidth="5.5" strokeLinecap="round">
        <path d={`M${leftX - 7} ${eyeY}c4.5 5 9.5 5 14 0`} />
        <path d={`M${rightX - 7} ${eyeY}c4.5 5 9.5 5 14 0`} />
      </g>
    );
  }
  if (eyes === 'focus') {
    return (
      <g fill={color}>
        <ellipse cx={leftX} cy={eyeY} rx="5.5" ry="8.5" />
        <ellipse cx={rightX} cy={eyeY} rx="5.5" ry="8.5" />
        <circle cx={leftX + 1.5} cy={eyeY - 2.5} r="1.8" fill={accentColor} />
        <circle cx={rightX + 1.5} cy={eyeY - 2.5} r="1.8" fill={accentColor} />
      </g>
    );
  }
  if (eyes === 'tiny') {
    return <g fill={color}><ellipse cx={leftX} cy={eyeY} rx="3.2" ry="5" /><ellipse cx={rightX} cy={eyeY} rx="3.2" ry="5" /></g>;
  }
  if (eyes === 'wide') {
    return <g fill={color}><rect x={leftX - 6.5} y={eyeY - 12} width="13" height="24" rx="6.5" /><rect x={rightX - 6.5} y={eyeY - 12} width="13" height="24" rx="6.5" /></g>;
  }
  if (eyes === 'side-eye') {
    return <g fill={color}><circle cx={leftX - 1} cy={eyeY} r="7" /><circle cx={rightX + 2} cy={eyeY - 2} r="3.5" /></g>;
  }
  if (eyes === 'skeptical') {
    return (
      <g fill={color} stroke={color} strokeWidth="5.5" strokeLinecap="round">
        <ellipse cx={leftX} cy={eyeY + 1} rx="5.2" ry="8" stroke="none" />
        <path d={`M${rightX - 5} ${eyeY - 1}l10 -3`} />
      </g>
    );
  }
  if (eyes === 'determined') {
    return (
      <g fill={color}>
        <rect x={leftX - 4.5} y={eyeY - 9} width="9" height="18" rx="4.5" transform={`rotate(-28 ${leftX} ${eyeY})`} />
        <rect x={rightX - 4.5} y={eyeY - 9} width="9" height="18" rx="4.5" transform={`rotate(28 ${rightX} ${eyeY})`} />
      </g>
    );
  }
  if (eyes === 'curious') {
    return <g fill={color}><circle cx={leftX - 1} cy={eyeY + 1} r="3.5" /><circle cx={rightX + 1} cy={eyeY - 1} r="7" /></g>;
  }
  if (eyes === 'joy') {
    return <g fill="none" stroke={color} strokeWidth="5.5" strokeLinecap="round"><path d={`M${leftX - 7} ${eyeY + 3} Q${leftX} ${eyeY - 6} ${leftX + 7} ${eyeY + 3}`} /><path d={`M${rightX - 7} ${eyeY + 3} Q${rightX} ${eyeY - 6} ${rightX + 7} ${eyeY + 3}`} /></g>;
  }
  if (eyes === 'angry') {
    return <g fill={color}><path d={`M${leftX - 8} ${eyeY - 7} L${leftX + 7} ${eyeY - 1} L${leftX + 4} ${eyeY + 7} L${leftX - 6} ${eyeY + 4}Z`} /><path d={`M${rightX + 8} ${eyeY - 7} L${rightX - 7} ${eyeY - 1} L${rightX - 4} ${eyeY + 7} L${rightX + 6} ${eyeY + 4}Z`} /></g>;
  }
  if (eyes === 'heart') {
    return <g fill={color}><path d="M0 6 C-12 -2 -7 -12 0 -7 C7 -12 12 -2 0 6Z" transform={`translate(${leftX} ${eyeY}) scale(.72)`} /><path d="M0 6 C-12 -2 -7 -12 0 -7 C7 -12 12 -2 0 6Z" transform={`translate(${rightX} ${eyeY}) scale(.72)`} /></g>;
  }
  if (eyes === 'stars') {
    return <g fill={color}><path d="M0-10 2.7-3.7 9.5-3.1 4.2 1.3 5.9 8 0 4.4-5.9 8-4.2 1.3-9.5-3.1-2.7-3.7Z" transform={`translate(${leftX} ${eyeY}) scale(.72)`} /><path d="M0-10 2.7-3.7 9.5-3.1 4.2 1.3 5.9 8 0 4.4-5.9 8-4.2 1.3-9.5-3.1-2.7-3.7Z" transform={`translate(${rightX} ${eyeY}) scale(.72)`} /></g>;
  }
  if (eyes === 'dead') {
    return <g fill="none" stroke={color} strokeWidth="5.2" strokeLinecap="round"><path d={`M${leftX - 6} ${eyeY - 6} L${leftX + 6} ${eyeY + 6} M${leftX + 6} ${eyeY - 6} L${leftX - 6} ${eyeY + 6}`} /><path d={`M${rightX - 6} ${eyeY - 6} L${rightX + 6} ${eyeY + 6} M${rightX + 6} ${eyeY - 6} L${rightX - 6} ${eyeY + 6}`} /></g>;
  }
  if (eyes === 'spiral') {
    return <g fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"><path d={`M${leftX} ${eyeY} c7 -7 13 5 5 10 c-11 7 -19 -9 -9 -19`} /><path d={`M${rightX} ${eyeY} c7 -7 13 5 5 10 c-11 7 -19 -9 -9 -19`} /></g>;
  }
  if (eyes === 'teary') {
    return <g fill={color}><ellipse cx={leftX} cy={eyeY - 2} rx="5.5" ry="8" /><ellipse cx={rightX} cy={eyeY - 2} rx="5.5" ry="8" /><path d={`M${leftX - 8} ${eyeY + 8} C${leftX - 14} ${eyeY + 15} ${leftX - 4} ${eyeY + 17} ${leftX - 8} ${eyeY + 8}Z`} /><path d={`M${rightX + 8} ${eyeY + 8} C${rightX + 14} ${eyeY + 15} ${rightX + 4} ${eyeY + 17} ${rightX + 8} ${eyeY + 8}Z`} /></g>;
  }
  if (eyes === 'possessed') {
    return <g fill={accentColor} stroke={color} strokeWidth="3"><ellipse cx={leftX} cy={eyeY} rx="8" ry="11" /><ellipse cx={rightX} cy={eyeY} rx="8" ry="11" /><circle cx={leftX} cy={eyeY} r="2.4" fill={color} stroke="none" /><circle cx={rightX} cy={eyeY} r="2.4" fill={color} stroke="none" /></g>;
  }
  return (
    <g fill={color}>
      <rect x={leftX - 5.5} y={eyeY - 10.5} width="11" height="21" rx="5.5" transform={`rotate(-7 ${leftX} ${eyeY})`} />
      <rect x={rightX - 5.5} y={eyeY - 10.5} width="11" height="21" rx="5.5" transform={`rotate(7 ${rightX} ${eyeY})`} />
    </g>
  );
}

function AvatarStreakEffect({ type, clipId }) {
  if (type === 'hot') {
    return (
      <g className="squid-avatar__streak squid-avatar__streak--hot" aria-hidden="true">
        <path className="squid-avatar__flame squid-avatar__flame--outer" d="M23 101 C9 84 22 69 16 49 C32 57 30 73 40 78 C38 57 50 43 48 19 C54 13 58 5 60 -3 C73 17 68 42 77 53 C79 33 92 25 96 7 C109 31 98 55 105 68 C114 84 102 96 96 101Z" fill="#E9170D" />
        <path className="squid-avatar__flame squid-avatar__flame--inner" d="M34 99 C26 85 39 75 36 61 C50 69 48 83 58 86 C55 67 67 55 65 36 C78 53 73 72 86 78 C93 84 90 93 86 99Z" fill="#F99EAD" />
        <path className="squid-avatar__ember squid-avatar__ember--one" d="M30 46 C24 39 29 34 31 29 C36 37 34 42 30 46Z" fill="#F99EAD" />
        <path className="squid-avatar__ember squid-avatar__ember--two" d="M88 36 C83 30 87 25 90 20 C94 28 92 33 88 36Z" fill="#E9170D" />
      </g>
    );
  }

  if (type === 'cold') {
    return (
      <g className="squid-avatar__streak squid-avatar__streak--cold" aria-hidden="true">
        <g className="squid-avatar__ice-shards" fill="#2B31B2" stroke="#FCFBFD" strokeWidth="1.2" strokeLinejoin="round">
          <path d="M25 87 15 94 25 98 30 91Z" />
          <path d="M39 101 34 112 45 106Z" />
          <path d="M78 103 84 114 90 103Z" />
          <path d="M94 85 108 91 98 99Z" />
        </g>
        <g clipPath={`url(#${clipId})`} className="squid-avatar__frost-overlay" fill="#FCFBFD">
          <path d="M10 77 C29 69 38 82 56 73 C75 64 88 77 110 67 V120 H10Z" opacity="0.24" />
          <circle cx="32" cy="48" r="2.1" />
          <circle cx="86" cy="43" r="1.6" />
          <circle cx="48" cy="81" r="1.7" />
          <circle cx="72" cy="91" r="2" />
        </g>
        <g className="squid-avatar__snow" fill="#FCFBFD">
          <circle cx="22" cy="48" r="1.8" />
          <circle cx="98" cy="59" r="2" />
          <circle cx="84" cy="27" r="1.4" />
        </g>
      </g>
    );
  }

  return null;
}

function AvatarReaction({ reaction, eyeY, spacing, bodyColor, detailColor }) {
  const leftX = 60 - spacing;
  const rightX = 60 + spacing;
  if (reaction === 'twin') {
    return (
      <g className="squid-avatar__reaction squid-avatar__reaction--twin" fill="#E9170D" aria-hidden="true">
        <path d="M0 6 C-12 -2 -7 -12 0 -7 C7 -12 12 -2 0 6Z" transform={`translate(${leftX} ${eyeY}) scale(.72)`} />
        <path d="M0 6 C-12 -2 -7 -12 0 -7 C7 -12 12 -2 0 6Z" transform={`translate(${rightX} ${eyeY}) scale(.72)`} />
        <path className="squid-avatar__reaction-heart-pop" d="M0 6 C-12 -2 -7 -12 0 -7 C7 -12 12 -2 0 6Z" transform="translate(91 31) scale(.42)" />
      </g>
    );
  }

  if (reaction === 'nemesis') {
    return (
      <g className="squid-avatar__reaction squid-avatar__reaction--nemesis" aria-hidden="true">
        <g fill="none" stroke={detailColor} strokeWidth="6" strokeLinecap="round">
          <path d={`M${leftX - 7} ${eyeY - 7} L${leftX + 5} ${eyeY - 2}`} />
          <path d={`M${rightX + 7} ${eyeY - 7} L${rightX - 5} ${eyeY - 2}`} />
        </g>
        <g className="squid-avatar__rude-hand" fill={bodyColor} stroke={detailColor} strokeWidth="1.8" strokeLinejoin="round">
          <path d="M88 91 C86 81 87 72 91 70 L92 51 C92 47 98 47 98 51 L98 68 L101 61 C103 58 108 61 106 65 L103 73 C108 71 111 76 107 79 C111 79 112 84 108 86 L103 91Z" />
        </g>
      </g>
    );
  }

  return null;
}

function SquidAvatar({
  config,
  className = '',
  title = 'Avatar',
  decorative = false,
  animated = false,
  streakType = null,
  streakCount = 0,
  reaction = null,
}) {
  const normalized = normalizeAvatarConfig(config);
  const geometry = scalePath(normalized.character, normalized);
  const eyeColor = normalized.eyeColor;
  const eyeAccent = getAvatarContrastColor(eyeColor);
  const numericStreakCount = Math.max(0, Number(streakCount) || 0);
  const activeStreak = streakType === 'hot' && numericStreakCount >= 3
    ? 'hot'
    : streakType === 'cold' && numericStreakCount >= 2
      ? 'cold'
      : null;
  const streakThreshold = activeStreak === 'hot' ? 3 : 2;
  const streakIntensity = activeStreak
    ? Math.min(1, 0.34 + ((numericStreakCount - streakThreshold) * 0.13))
    : 0;
  const rawId = useId();
  const clipId = `avatar-clip-${rawId.replace(/:/g, '')}`;
  const sizeScale = normalized.size / 100;
  const motionScale = normalized.motion / 100;
  const phase = -((normalized.width + normalized.height + normalized.eyeSpacing) % 37) / 10;
  const eyeSpacing = 13 * (normalized.eyeSpacing / 100);
  const style = {
    '--squid-bob': `${(motionScale * 3.3).toFixed(2)}px`,
    '--squid-tilt': `${(motionScale * 2.6).toFixed(2)}deg`,
    '--squid-tilt-start': `${(motionScale * -1.43).toFixed(2)}deg`,
    '--squid-motion-duration': `${(6.8 - (motionScale * 2.2)).toFixed(2)}s`,
    '--squid-eye-duration': `${(7.4 - (motionScale * 2)).toFixed(2)}s`,
    '--squid-phase': `${phase}s`,
    '--squid-reaction-phase': `${phase - 4.3}s`,
    '--squid-streak-intensity': streakIntensity.toFixed(2),
    '--squid-streak-opacity': (0.2 + (streakIntensity * 0.78)).toFixed(2),
    '--squid-streak-scale': (0.82 + (streakIntensity * 0.28)).toFixed(2),
  };
  const stateClasses = [
    animated && normalized.motion > 0 ? 'squid-avatar--animated' : '',
    activeStreak ? `squid-avatar--${activeStreak}` : '',
    animated && reaction ? `squid-avatar--reaction-${reaction}` : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <svg
      className={`squid-avatar ${stateClasses}`.trim()}
      viewBox="0 0 120 120"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? 'true' : undefined}
      aria-label={decorative ? undefined : title}
      focusable="false"
      style={style}
    >
      <defs><clipPath id={clipId}><path d={geometry.path} transform={geometry.transform || undefined} /></clipPath></defs>
      <g transform={`translate(60 60) scale(${sizeScale}) translate(-60 -60)`}>
        <g className="squid-avatar__motion">
          {activeStreak === 'hot' && <AvatarStreakEffect type="hot" clipId={clipId} />}
          <g transform={geometry.transform || undefined}>
            <path className="squid-avatar__silhouette" d={geometry.path} fill={normalized.color} />
          </g>
          {activeStreak === 'cold' && <AvatarStreakEffect type="cold" clipId={clipId} />}
          <AvatarPattern pattern={normalized.pattern} clipId={clipId} contrastColor={normalized.patternColor} />
          <g transform={geometry.transform || undefined}>
            <CharacterDetails character={geometry.detail} detailColor={normalized.patternColor} />
            <g className="squid-avatar__eye-look">
              <g className="squid-avatar__eye-blink">
                <AvatarEyes eyes={normalized.eyes} color={eyeColor} accentColor={eyeAccent} eyeY={geometry.eyeY} spacing={eyeSpacing} />
              </g>
            </g>
            <AvatarReaction
              reaction={animated ? reaction : null}
              eyeY={geometry.eyeY}
              spacing={eyeSpacing}
              bodyColor={normalized.color}
              detailColor={eyeColor}
            />
          </g>
        </g>
      </g>
    </svg>
  );
}

export default memo(SquidAvatar);
