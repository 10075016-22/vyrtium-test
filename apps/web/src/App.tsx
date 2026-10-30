import { AuthProvider } from './auth/AuthProvider';
import { useAuth } from './auth/useAuth';
import { Toaster } from './components/Toaster';
import { BalancePage } from './pages/BalancePage';
import { LoginPage } from './pages/LoginPage';

function Screens() {
  const { session } = useAuth();
  return session ? <BalancePage /> : <LoginPage />;
}

export function App() {
  return (
    <AuthProvider>
      <Screens />
      <Toaster />
    </AuthProvider>
  );
}
