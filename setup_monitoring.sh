#!/bin/bash

# Скрипт настройки автоматического мониторинга

echo "🔧 Настройка автоматического мониторинга диска..."

# Добавляем cron задачу для мониторинга диска каждые 30 минут
CRON_JOB="*/30 * * * * /root/crypto-trading-bot-universal/monitor_disk_space.sh >> /var/log/disk_monitor.log 2>&1"

# Проверяем, есть ли уже такая задача
if ! crontab -l 2>/dev/null | grep -q "monitor_disk_space.sh"; then
    # Добавляем новую cron задачу
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    echo "✅ Cron задача добавлена: мониторинг каждые 30 минут"
else
    echo "ℹ️  Cron задача уже существует"
fi

# Создаем ежедневный бэкап в 3:00
BACKUP_CRON="0 3 * * * /root/crypto-trading-bot-universal/backup_to_git.sh 'Ежедневный автобэкап' >> /var/log/backup.log 2>&1"

if ! crontab -l 2>/dev/null | grep -q "backup_to_git.sh"; then
    (crontab -l 2>/dev/null; echo "$BACKUP_CRON") | crontab -
    echo "✅ Ежедневный бэкап настроен на 3:00"
else
    echo "ℹ️  Ежедневный бэкап уже настроен"
fi

# Показываем текущие cron задачи
echo ""
echo "📋 Текущие cron задачи:"
crontab -l

# Создаем лог файлы
touch /var/log/disk_monitor.log
touch /var/log/backup.log

echo ""
echo "✅ Мониторинг настроен!"
echo "📊 Логи мониторинга: /var/log/disk_monitor.log"
echo "💾 Логи бэкапов: /var/log/backup.log"
echo ""
echo "🔍 Для просмотра логов используйте:"
echo "   tail -f /var/log/disk_monitor.log"
echo "   tail -f /var/log/backup.log"
