import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TriangularArbitrageNew: React.FC = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">
            🔺 Треугольный Арбитраж - В разработке
          </CardTitle>
          <p className="text-muted-foreground">
            Поиск арбитражных возможностей внутри одной биржи
          </p>
        </CardHeader>
        <CardContent>
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🔺</div>
            <h3 className="text-xl font-semibold mb-2">Модуль в разработке</h3>
            <p className="text-muted-foreground">Треугольный арбитраж будет добавлен в следующем обновлении</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TriangularArbitrageNew;
