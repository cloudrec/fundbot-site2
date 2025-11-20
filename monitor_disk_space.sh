#!/bin/bash

# Скрипт мониторинга места на диске и автоматической очистки
# Запускается автоматически при нехватке места

THRESHOLD=85  # Процент заполнения диска для срабатывания очистки
BACKUP_BEFORE_CLEAN=true

check_disk_space() {
    local usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    echo $usage
}

cleanup_docker() {
    echo "🧹 Очистка Docker..."
    docker system prune -af --volumes || true
    docker image prune -af || true
}

cleanup_logs() {
    echo "🧹 Очистка логов..."
    find /var/log -name "*.log" -type f -mtime +7 -delete 2>/dev/null || true
    journalctl --vacuum-time=7d 2>/dev/null || true
}

cleanup_temp() {
    echo "🧹 Очистка временных файлов..."
    rm -rf /tmp/* 2>/dev/null || true
    rm -rf /var/tmp/* 2>/dev/null || true
}

cleanup_old_backups() {
    echo "🧹 Удаление старых бэкапов (старше 30 дней)..."
    find /root -name "*.backup" -type f -mtime +30 -delete 2>/dev/null || true
    find /root -name "*.tar.gz" -type f -mtime +30 -delete 2>/dev/null || true
}

main() {
    local current_usage=$(check_disk_space)
    
    echo "💾 Текущее использование диска: ${current_usage}%"
    
    if [ $current_usage -gt $THRESHOLD ]; then
        echo "⚠️  Диск заполнен на ${current_usage}%! Начинаем очистку..."
        
        # Создаем бэкап перед очисткой
        if [ "$BACKUP_BEFORE_CLEAN" = true ]; then
            echo "💾 Создаем бэкап перед очисткой..."
            cd /root/crypto-trading-bot-universal
            ./backup_to_git.sh "Автобэкап перед очисткой диска (${current_usage}% заполнен)"
        fi
        
        # Выполняем очистку
        cleanup_docker
        cleanup_logs
        cleanup_temp
        cleanup_old_backups
        
        # Проверяем результат
        local new_usage=$(check_disk_space)
        local freed=$((current_usage - new_usage))
        
        echo "✅ Очистка завершена!"
        echo "📊 Освобождено: ${freed}% (было ${current_usage}%, стало ${new_usage}%)"
        
        if [ $new_usage -gt $THRESHOLD ]; then
            echo "⚠️  Внимание: диск все еще заполнен на ${new_usage}%"
            echo "💡 Рекомендуется ручная проверка больших файлов:"
            echo "   du -h / | sort -hr | head -20"
        fi
    else
        echo "✅ Место на диске в норме (${current_usage}%)"
    fi
    
    # Показываем статистику
    echo ""
    echo "📊 Статистика диска:"
    df -h /
    echo ""
    echo "🔍 Топ-5 самых больших директорий:"
    du -h /root | sort -hr | head -5
}

# Запускаем основную функцию
main "$@"
