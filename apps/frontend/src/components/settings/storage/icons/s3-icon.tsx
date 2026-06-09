import React from 'react';

export const S3Icon = ({ className }: { className?: string }) => (
  <svg className={className} width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="8" fill="#FF9900" fillOpacity="0.15" />
    <path d="M20 8L28 12.5V18L20 14L12 18V12.5L20 8Z" fill="#FF9900" />
    <path d="M28 22L20 26L12 22V18L20 22L28 18V22Z" fill="#FF9900" fillOpacity="0.7" />
    <path d="M12 24L20 28L28 24V28L20 32L12 28V24Z" fill="#FF9900" fillOpacity="0.5" />
  </svg>
);
