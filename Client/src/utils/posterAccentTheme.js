import { API_URL } from '../config';

const DEFAULT_EVENT_ACCENTS = {
  mode: 'vivid',
  primaryHex: '#ef4444',
  secondaryHex: '#2563eb',
  primaryRgb: '239, 68, 68',
  secondaryRgb: '37, 99, 235',
  surfaceRgb: '18, 24, 38',
  backgroundRgb: '5, 7, 13',
  inkRgb: '245, 247, 250',
  mutedRgb: '178, 186, 200',
  borderRgb: '148, 163, 184',
  buttonTextRgb: '255, 255, 255',
  glow1Alpha: '0.2',
  glow2Alpha: '0.22',
  panelGlowAlpha: '0.12',
  panelGlowAlphaStrong: '0.16',
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const rgbToHex = ({ r, g, b }) =>
  `#${[r, g, b]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;

const rgbToString = ({ r, g, b }) =>
  `${clamp(Math.round(r), 0, 255)}, ${clamp(Math.round(g), 0, 255)}, ${clamp(Math.round(b), 0, 255)}`;

const rgbToHsl = ({ r, g, b }) => {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === nr) {
      hue = ((ng - nb) / delta) % 6;
    } else if (max === ng) {
      hue = (nb - nr) / delta + 2;
    } else {
      hue = (nr - ng) / delta + 4;
    }
  }

  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs((2 * lightness) - 1));

  return {
    h: (hue * 60 + 360) % 360,
    s: saturation,
    l: lightness,
  };
};

const hslToRgb = ({ h, s, l }) => {
  const c = (1 - Math.abs((2 * l) - 1)) * s;
  const hh = h / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hh >= 0 && hh < 1) {
    r1 = c;
    g1 = x;
  } else if (hh >= 1 && hh < 2) {
    r1 = x;
    g1 = c;
  } else if (hh >= 2 && hh < 3) {
    g1 = c;
    b1 = x;
  } else if (hh >= 3 && hh < 4) {
    g1 = x;
    b1 = c;
  } else if (hh >= 4 && hh < 5) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  const m = l - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
};

const colorDistance = (a, b) => {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
};

const stabilizeColor = (color) => {
  const hsl = rgbToHsl(color);
  const stabilized = hslToRgb({
    h: hsl.h,
    s: clamp(hsl.s, 0.35, 0.92),
    l: clamp(hsl.l, 0.32, 0.66),
  });

  return {
    r: clamp(stabilized.r, 24, 235),
    g: clamp(stabilized.g, 24, 235),
    b: clamp(stabilized.b, 24, 235),
  };
};

const stabilizeNeutralColor = (color, lightnessRange) => {
  const hsl = rgbToHsl(color);
  const stabilized = hslToRgb({
    h: hsl.h,
    s: clamp(hsl.s, 0.01, 0.12),
    l: clamp(hsl.l, lightnessRange.min, lightnessRange.max),
  });

  return {
    r: clamp(stabilized.r, 8, 248),
    g: clamp(stabilized.g, 8, 248),
    b: clamp(stabilized.b, 8, 248),
  };
};

const createVividTheme = (primary, secondary) => ({
  mode: 'vivid',
  primaryHex: rgbToHex(primary),
  secondaryHex: rgbToHex(secondary),
  primaryRgb: rgbToString(primary),
  secondaryRgb: rgbToString(secondary),
  surfaceRgb: '18, 24, 38',
  backgroundRgb: '5, 7, 13',
  inkRgb: '245, 247, 250',
  mutedRgb: '178, 186, 200',
  borderRgb: '148, 163, 184',
  buttonTextRgb: '255, 255, 255',
  glow1Alpha: '0.2',
  glow2Alpha: '0.22',
  panelGlowAlpha: '0.12',
  panelGlowAlphaStrong: '0.16',
});

const createMonoTheme = ({ lightTone, darkTone, midTone }) => ({
  mode: 'mono',
  primaryHex: rgbToHex(lightTone),
  secondaryHex: rgbToHex(darkTone),
  primaryRgb: rgbToString(lightTone),
  secondaryRgb: rgbToString(darkTone),
  surfaceRgb: rgbToString(stabilizeNeutralColor(midTone || darkTone, { min: 0.12, max: 0.18 })),
  backgroundRgb: rgbToString(stabilizeNeutralColor(darkTone, { min: 0.03, max: 0.08 })),
  inkRgb: rgbToString(stabilizeNeutralColor(lightTone, { min: 0.9, max: 0.97 })),
  mutedRgb: rgbToString(stabilizeNeutralColor(midTone || lightTone, { min: 0.62, max: 0.74 })),
  borderRgb: rgbToString(stabilizeNeutralColor(midTone || lightTone, { min: 0.48, max: 0.62 })),
  buttonTextRgb: rgbToString(stabilizeNeutralColor(darkTone, { min: 0.04, max: 0.1 })),
  glow1Alpha: '0.32',
  glow2Alpha: '0.24',
  panelGlowAlpha: '0.18',
  panelGlowAlphaStrong: '0.24',
});

const buildProxyImageUrl = (imageUrl) => {
  try {
    const normalized = new URL(imageUrl, window.location.origin);
    if (!['http:', 'https:'].includes(normalized.protocol)) {
      return normalized.toString();
    }

    return `${API_URL.replace(/\/$/, '')}/utils/image-proxy?url=${encodeURIComponent(normalized.toString())}`;
  } catch (error) {
    return imageUrl;
  }
};

const loadImageData = (imageUrl, sampleSize = 64) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.referrerPolicy = 'no-referrer';
    image.decoding = 'async';

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
          reject(new Error('Failed to create 2d canvas context'));
          return;
        }
        context.drawImage(image, 0, 0, sampleSize, sampleSize);
        resolve(context.getImageData(0, 0, sampleSize, sampleSize));
      } catch (error) {
        reject(error);
      }
    };

    image.onerror = () => reject(new Error('Failed to load event poster image'));
    image.src = imageUrl;
  });

const pickAccents = (imageData) => {
  const buckets = new Map();
  const { data } = imageData;
  let totalSamples = 0;
  let totalSaturation = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a < 150) continue;

    const { s, l } = rgbToHsl({ r, g, b });
    if (l < 0.06 || l > 0.94) continue;
    totalSamples += 1;
    totalSaturation += s;

    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const bucket = buckets.get(key) || {
      count: 0,
      sumR: 0,
      sumG: 0,
      sumB: 0,
      sumS: 0,
      sumL: 0,
    };

    bucket.count += 1;
    bucket.sumR += r;
    bucket.sumG += g;
    bucket.sumB += b;
    bucket.sumS += s;
    bucket.sumL += l;
    buckets.set(key, bucket);
  }

  const candidates = Array.from(buckets.values())
    .map((bucket) => {
      const r = bucket.sumR / bucket.count;
      const g = bucket.sumG / bucket.count;
      const b = bucket.sumB / bucket.count;
      const s = bucket.sumS / bucket.count;
      const l = bucket.sumL / bucket.count;
      const prominence =
        bucket.count *
        (0.65 + (s * 1.8)) *
        (1 - Math.abs(l - 0.5) * 0.9);

      return {
        color: { r, g, b },
        s,
        l,
        count: bucket.count,
        score: prominence,
      };
    })
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) {
    return null;
  }

  const vividCandidates = candidates.filter((candidate) => candidate.s >= 0.16);
  const averageSaturation = totalSamples > 0 ? totalSaturation / totalSamples : 0;
  const isMonochrome = averageSaturation < 0.18 || vividCandidates.length < 2;

  if (isMonochrome) {
    const darkCandidate =
      candidates
        .filter((candidate) => candidate.l <= 0.42)
        .sort((a, b) => (b.score + (b.count * 0.15)) - (a.score + (a.count * 0.15)))[0]
      || candidates[candidates.length - 1];

    const lightCandidate =
      candidates
        .filter((candidate) => candidate.l >= 0.55)
        .sort((a, b) => (b.score + (b.count * 0.15)) - (a.score + (a.count * 0.15)))[0]
      || candidates[0];

    const midCandidate =
      candidates
        .filter((candidate) => candidate.l > 0.32 && candidate.l < 0.68)
        .sort((a, b) => b.score - a.score)[0]
      || lightCandidate
      || darkCandidate;

    return createMonoTheme({
      lightTone: stabilizeNeutralColor(lightCandidate.color, { min: 0.82, max: 0.95 }),
      darkTone: stabilizeNeutralColor(darkCandidate.color, { min: 0.08, max: 0.18 }),
      midTone: stabilizeNeutralColor(midCandidate.color, { min: 0.4, max: 0.62 }),
    });
  }

  const primary = stabilizeColor(vividCandidates[0].color);

  const secondaryCandidate = vividCandidates.find((candidate) => {
    const stabilized = stabilizeColor(candidate.color);
    return colorDistance(primary, stabilized) >= 72;
  });

  const secondary = secondaryCandidate
    ? stabilizeColor(secondaryCandidate.color)
    : stabilizeColor(vividCandidates[Math.min(1, vividCandidates.length - 1)]?.color || { r: 37, g: 99, b: 235 });

  if (colorDistance(primary, secondary) < 52) {
    return createVividTheme(primary, { r: 37, g: 99, b: 235 });
  }

  return createVividTheme(primary, secondary);
};

export const extractPosterAccents = async (imageUrl) => {
  if (!imageUrl) return DEFAULT_EVENT_ACCENTS;

  try {
    const imageData = await loadImageData(buildProxyImageUrl(imageUrl));
    return pickAccents(imageData) || DEFAULT_EVENT_ACCENTS;
  } catch (error) {
    return DEFAULT_EVENT_ACCENTS;
  }
};

export { DEFAULT_EVENT_ACCENTS };
