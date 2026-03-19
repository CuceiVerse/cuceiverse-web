import { useContext } from 'react';
import { AcademicOfferContext } from './AcademicOfferContextStore';

export function useAcademicOffer() {
  const context = useContext(AcademicOfferContext);
  if (context === undefined) {
    throw new Error('useAcademicOffer must be used within an AcademicOfferProvider');
  }
  return context;
}
