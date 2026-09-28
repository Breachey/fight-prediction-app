import { useState } from 'react';

const FALLBACK_IMAGE = '/fighter-placeholder.svg';

export default function FighterImage({ src, alt, ...props }) {
  const [failedSource, setFailedSource] = useState(null);
  const source = typeof src === 'string' ? src.trim() : '';
  const imageSource = !source || failedSource === source ? FALLBACK_IMAGE : source;

  return (
    <img
      {...props}
      src={imageSource}
      alt={alt}
      onError={() => {
        if (imageSource !== FALLBACK_IMAGE) setFailedSource(source);
      }}
    />
  );
}
