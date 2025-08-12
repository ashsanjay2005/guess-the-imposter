import React from 'react';
import { createPortal } from 'react-dom';

export const MobileActions: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const container = document.getElementById('mobile-actions');
  if (!container) return null;
  return createPortal(children, container);
};


