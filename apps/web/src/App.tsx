import { LoaderCircle } from 'lucide-react';
import { AuthProvider } from './auth/AuthProvider';
import { useAuth } from './auth/useAuth';
import { Brand } from './components/Brand';
import { Toaster } from './components/Toaster';
import { BalancePage } from './pages/BalancePage';
import { LoginPage } from './pages/LoginPage';
import { icon } from './ui/classes';

function Screens() {
  const { status } = useAuth();
  if (status === 'checking') {
    return (
      <main className="grid min-h-dvh place-items-center" aria-busy="true">
        <div className="grid justify-items-center gap-3 text-muted" role="status">
          <Brand />
          <LoaderCircle className={`${icon} animate-spin`} aria-hidden="true" />
          <span className="sr-only">Verificando tu sesión…</span>
        </div>
      </main>
    );
  }
  return status === 'signed-in' ? <BalancePage /> : <LoginPage />;
}

export function App() {
  return (
    <AuthProvider>
      <Screens />
      <Toaster />
    </AuthProvider>
  );
}
