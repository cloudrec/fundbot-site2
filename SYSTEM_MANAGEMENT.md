# 🛠️ Управление системой торгового бота

## 📊 Мониторинг и резервное копирование

### 🔄 Автоматические процессы
- **Мониторинг диска**: каждые 30 минут
- **Автобэкап**: ежедневно в 3:00 UTC
- **Автоочистка**: при заполнении диска >85%

### 💾 Ручное резервное копирование
```bash
cd /root/crypto-trading-bot-universal
./backup_to_git.sh "Описание изменений"
```

### 📊 Проверка места на диске
```bash
cd /root/crypto-trading-bot-universal
./monitor_disk_space.sh
```

### 🔍 Просмотр логов
```bash
# Логи мониторинга диска
tail -f /var/log/disk_monitor.log

# Логи бэкапов
tail -f /var/log/backup.log

# Логи Docker
docker-compose logs -f
```

## 🚀 Управление проектом

### 🔄 Перезапуск проекта
```bash
cd /root/crypto-trading-bot-universal
docker-compose down
docker-compose up -d --build
```

### 📦 Обновление кода
```bash
cd /root/crypto-trading-bot-universal

# Создать бэкап перед изменениями
./backup_to_git.sh "Бэкап перед обновлением"

# Внести изменения в код...

# Пересобрать и запустить
docker-compose down
docker-compose up -d --build

# Создать бэкап после изменений
./backup_to_git.sh "Обновление функционала"
```

### 🔧 Восстановление из бэкапа
```bash
cd /root/crypto-trading-bot-universal

# Посмотреть доступные коммиты
git log --oneline

# Восстановить конкретную версию
git checkout COMMIT_HASH

# Или восстановить последнюю рабочую версию
git checkout main

# Пересобрать проект
docker-compose down
docker-compose up -d --build
```

## 🔐 Управление доступом

### 👑 Назначение админ прав
```sql
-- В Supabase SQL Editor
UPDATE user_profiles 
SET is_admin = true 
WHERE user_id = (
    SELECT id FROM auth.users 
    WHERE email = 'admin@example.com'
);
```

### 🚫 Отзыв админ прав
```sql
UPDATE user_profiles 
SET is_admin = false 
WHERE user_id = (
    SELECT id FROM auth.users 
    WHERE email = 'user@example.com'
);
```

## 🧹 Очистка системы

### 🐳 Очистка Docker
```bash
# Остановить все контейнеры
docker-compose down

# Очистить неиспользуемые образы и контейнеры
docker system prune -af --volumes

# Запустить проект заново
docker-compose up -d --build
```

### 📁 Очистка логов
```bash
# Очистить системные логи
journalctl --vacuum-time=7d

# Очистить логи приложения
> /var/log/disk_monitor.log
> /var/log/backup.log
```

## 🔧 Настройка внешних сервисов

### 💳 Plisio (криптоплатежи)
1. Получите API ключ на https://plisio.net/
2. Добавьте в Supabase Environment Variables:
   ```
   PLISIO_API_KEY=ваш_ключ
   ```

### 🌐 Настройка домена
```bash
# В Supabase Environment Variables добавьте:
FRONTEND_URL=https://ваш-домен.com
```

## 📈 Мониторинг производительности

### 🔍 Проверка статуса
```bash
# Статус Docker контейнеров
docker-compose ps

# Использование ресурсов
docker stats

# Логи приложения
docker-compose logs --tail=100
```

### 📊 Статистика базы данных
```sql
-- В Supabase SQL Editor
SELECT 
    schemaname,
    tablename,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes
FROM pg_stat_user_tables
ORDER BY n_tup_ins DESC;
```

## 🆘 Аварийное восстановление

### 🚨 При критических ошибках
1. **Создать бэкап текущего состояния**:
   ```bash
   ./backup_to_git.sh "Аварийный бэкап перед восстановлением"
   ```

2. **Восстановить последнюю рабочую версию**:
   ```bash
   git log --oneline | head -10  # Найти последний рабочий коммит
   git checkout WORKING_COMMIT_HASH
   docker-compose down
   docker-compose up -d --build
   ```

3. **Если проблемы с базой данных**:
   - Проверить Supabase Dashboard
   - Восстановить из бэкапа Supabase
   - Пересоздать Edge Functions

### 📞 Контакты поддержки
- **Supabase**: https://supabase.com/support
- **Plisio**: https://plisio.net/contacts
- **Docker**: https://docs.docker.com/

## 🔄 Регулярное обслуживание

### Еженедельно:
- [ ] Проверить логи на ошибки
- [ ] Проверить место на диске
- [ ] Обновить зависимости (при необходимости)

### Ежемесячно:
- [ ] Проверить бэкапы
- [ ] Очистить старые логи
- [ ] Обновить API ключи (при необходимости)
- [ ] Проверить статистику использования

---

**💡 Совет**: Всегда создавайте бэкап перед внесением изменений!
