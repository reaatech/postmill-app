import React from 'react';

export const LocalIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="8" fill="#888888" fillOpacity="0.15" />
    <rect x="10" y="12" width="20" height="18" rx="2" stroke="#888888" strokeWidth="1.5" fill="none" />
    <rect x="14" y="16" width="12" height="10" rx="1" fill="#888888" fillOpacity="0.3" />
    <path d="M18 12V10C18 9.44772 18.4477 9 19 9H21C21.5523 9 22 9.44772 22 10V12" stroke="#888888" strokeWidth="1.5" />
  </svg>
);
