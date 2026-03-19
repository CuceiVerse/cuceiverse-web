import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AcademicOfferProvider } from './context/AcademicOfferContext';
import { AppRoutes } from './AppRoutes';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AcademicOfferProvider>
          <AppRoutes />
        </AcademicOfferProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
