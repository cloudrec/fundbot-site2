import { Toaster } from "@/components/ui/toaster";
import React from 'react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import AuthForm from '@/components/AuthForm';
import TradingDashboard from '@/components/TradingDashboard';

const AuthenticatedApp = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Загрузка торгового бота...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  return <TradingDashboard />;
};

function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
      <Toaster />
    </AuthProvider>
  );
}

export default App;
