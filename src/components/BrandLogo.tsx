import React, { useId } from 'react';
import { useLanguage } from '../lib/translations';

interface BrandLogoProps {
  className?: string;
  ariaLabel?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = 'w-full h-full rounded-full',
  ariaLabel,
}) => {
  const { t } = useLanguage();
  const uid = useId().replace(/:/g, '');
  const gradId = `brand-logo-g-${uid}`;

  return (
    <svg
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={ariaLabel || t.brand.platformName}
      className={className}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="96" fill={`url(#${gradId})`} />
      <path
        d="M100 70C85 60 62 60 48 66V130C62 124 85 124 100 134C115 124 138 124 152 130V66C138 60 115 60 100 70Z"
        fill="#fff"
      />
      <path d="M100 70V134" stroke="#2563eb" strokeWidth="4" />
      <circle cx="148" cy="52" r="22" fill="#f59e0b" />
      <text
        x="148"
        y="59"
        fontSize="20"
        fontWeight="700"
        textAnchor="middle"
        fill="#fff"
        fontFamily="Arial"
      >
        Aa
      </text>
    </svg>
  );
};
