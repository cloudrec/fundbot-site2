#!/bin/bash

echo "🔄 Восстановление полной версии приложения..."

# Шаг 1: Восстанавливаем AuthContext
echo "1️⃣ Восстанавливаем AuthContext..."
cat > src/App.tsx << 'APPEOF'
import React from 'react';
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AuthForm from "@/components/AuthForm";

const queryClient = new QueryClient();

// Simple authenticated component for testing
const AuthenticatedApp = () => {
  const { user, loading, isAdmin } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">🤖 Фандинг Арбитраж Бот</h1>
        
        <div className="bg-gray-800 p-6 rounded-lg mb-6">
          <h2 className="text-xl mb-4">👤 Информация о пользователе</h2>
          <p><strong>Email:</strong> {user?.email}</p>
          <p><strong>ID:</strong> {user?.id}</p>
          <p><strong>Админ:</strong> {isAdmin ? '✅ Да' : '❌ Нет'}</p>
          <p><strong>Время входа:</strong> {new Date().toLocaleString('ru-RU')}</p>
        </div>
        
        <div className="bg-gray-800 p-6 rounded-lg mb-6">
          <h2 className="text-xl mb-4">🔧 Статус системы</h2>
          <p>✅ Аутентификация работает</p>
          <p>✅ Supabase подключен</p>
          <p>✅ Админ права: {isAdmin ? 'Активны' : 'Не активны'}</p>
        </div>
        
        <button 
          onClick={() => window.location.href = '/test.html'}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded mr-4"
        >
          🧪 Тестовая страница
        </button>
        
        <button 
          onClick={() => window.location.reload()}
          className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded"
        >
          🔄 Обновить
        </button>
      </div>
    </div>
  );
};

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Загрузка...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  return <>{children}</>;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route 
        path="/" 
        element={
          <ProtectedRoute>
            <AuthenticatedApp />
          </ProtectedRoute>
        } 
      />
      <Route path="/login" element={<AuthForm />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <Toaster />
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
APPEOF

echo "✅ Промежуточная версия с аутентификацией готова"
echo "🔄 Пересборка..."
docker-compose down && docker-compose up -d --build

echo "✅ Готово! Проверьте http://62.84.185.160"
echo "Если работает, запустите: ./restore_full_app.sh step2"

# Шаг 2: Восстанавливаем полную торговую панель
if [ "$1" = "step2" ]; then
    echo "2️⃣ Восстанавливаем полную торговую панель..."
    
    # Восстанавливаем оригинальный App.tsx
    cp src/App.tsx.backup src/App.tsx
    
    echo "✅ Полная версия восстановлена"
    echo "🔄 Пересборка..."
    docker-compose down && docker-compose up -d --build
    
    echo "✅ Готово! Проверьте http://62.84.185.160"
    echo "Теперь должна быть полная торговая панель с админ правами"
fi
