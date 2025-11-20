import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const HomeTab: React.FC = () => {
  const handleLogout = () => {
    if (confirm("Вы уверены, что хотите выйти из системы?")) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-red-50 border-red-200">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-red-800">Выход из системы</h3>
              <p className="text-red-600">Нажмите для безопасного выхода из аккаунта</p>
            </div>
            <Button 
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white"
              size="lg"
            >
              🚪 Выйти
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-center">
            🚀 Crypto Trading Bot - 8 БИРЖ
          </CardTitle>
          <p className="text-center text-muted-foreground text-lg">
            Универсальная система арбитража и автоторговли
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card className="p-4 text-center">
              <div className="text-3xl mb-2">🚀</div>
              <h3 className="font-semibold">Сканирование фандинга</h3>
              <p className="text-sm text-muted-foreground">Фандинг сканер 8 бирж</p>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-3xl mb-2">💱</div>
              <h3 className="font-semibold">Межбиржевой - 8 БИРЖ</h3>
              <p className="text-sm text-muted-foreground">Спреды между биржами</p>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-3xl mb-2">🤖</div>
              <h3 className="font-semibold">Фандинг Бот</h3>
              <p className="text-sm text-muted-foreground">Автоторговля каждый час</p>
            </Card>
            <Card className="p-4 text-center">
              <div className="text-3xl mb-2">🔺</div>
              <h3 className="font-semibold">Треугольный Арбитраж</h3>
              <p className="text-sm text-muted-foreground">Арбитраж внутри биржи</p>
            </Card>
          </div>
          
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-bold">Статус системы</h2>
            <div className="flex justify-center space-x-4">
              <Badge className="bg-green-600 text-white px-4 py-2">
                ✅ Система активна
              </Badge>
              <Badge className="bg-blue-600 text-white px-4 py-2">
                🔧 Торговые функции
              </Badge>
              <Badge className="bg-purple-600 text-white px-4 py-2">
                📊 8 бирж подключены
              </Badge>
            </div>
          </div>

          <div className="mt-8 text-center">
            <Button 
              onClick={handleLogout}
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50"
            >
              🚪 Выйти из системы
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default HomeTab;
