import React from 'react';
import { Toasts } from './components/Toasts';

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <>
      {children}
      <Toasts />
    </>
  );
};


