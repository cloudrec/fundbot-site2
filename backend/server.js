const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const app = express();

// Устанавливаем парсер JSON для запросов
app.use(bodyParser.json());

// Путь к файлам
const chatHistoryPath = '/mnt/data/chat_history.txt';  // Переписка
const projectStatePath = '/mnt/data/project_state.json';  // Состояние проекта

// Функция для сохранения переписки в файл
const saveChatHistory = (message) => {
  const timestamp = new Date().toLocaleString(); // Текущее время
  const formattedMessage = `${timestamp}: ${message}\n`;

  // Добавляем сообщение в файл
  fs.appendFileSync(chatHistoryPath, formattedMessage);
};

// Функция для сохранения состояния проекта в файл
const saveProjectState = (state) => {
  fs.writeFileSync(projectStatePath, JSON.stringify(state, null, 2));  // Сохраняем в JSON формате
};

// Функция для очистки переписки
const clearChatHistory = () => {
  fs.truncateSync(chatHistoryPath, 0);  // Очищаем файл
};

// Функция для проверки размера файла чата
const isChatTooLarge = () => {
  const stats = fs.statSync(chatHistoryPath);
  const fileSizeInBytes = stats.size;
  const maxSize = 1000000; // Максимальный размер (например, 1MB)
  return fileSizeInBytes > maxSize;
};

// Маршрут для сохранения сообщений
app.post('/api/save-message', (req, res) => {
  const { message } = req.body;
  saveChatHistory(message); // Сохраняем сообщение

  // Обновляем состояние проекта
  const projectState = {
    currentTask: 'Настройка AI для сайта',
    status: 'В процессе',
    lastAction: `Получено сообщение: ${message}`
  };
  saveProjectState(projectState);

  // Если чат слишком большой, очищаем его
  if (isChatTooLarge()) {
    clearChatHistory();
  }

  res.json({ success: true, message: 'Сообщение сохранено' });
});

// Запуск сервера
app.listen(5000, () => {
  console.log('Сервер работает на порту 5000');
});
