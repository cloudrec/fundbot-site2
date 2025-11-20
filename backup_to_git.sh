#!/bin/bash

# Скрипт автоматического резервного копирования в Git
# Использование: ./backup_to_git.sh "описание изменений"

set -e

BACKUP_DIR="/root/crypto-trading-bot-universal"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
COMMIT_MSG="${1:-Автоматический бэкап $TIMESTAMP}"

echo "🔄 Начинаем резервное копирование..."

cd $BACKUP_DIR

# Проверяем статус Git
if [ ! -d ".git" ]; then
    echo "📁 Инициализируем Git репозиторий..."
    git init
    git branch -M main
fi

# Добавляем .gitignore если его нет
if [ ! -f ".gitignore" ]; then
    cat > .gitignore << 'GITIGNORE'
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Production builds
dist/
build/

# Environment variables
.env
.env.local
.env.production

# Docker
.dockerignore

# Logs
*.log
logs/

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Temporary files
temp/
tmp/
*.tmp
GITIGNORE
fi

# Добавляем все файлы
echo "📦 Добавляем файлы в Git..."
git add .

# Проверяем есть ли изменения
if git diff --staged --quiet; then
    echo "✅ Нет изменений для коммита"
    exit 0
fi

# Коммитим изменения
echo "💾 Создаем коммит: $COMMIT_MSG"
git commit -m "$COMMIT_MSG"

# Показываем статистику
echo "📊 Статистика репозитория:"
echo "Всего коммитов: $(git rev-list --count HEAD)"
echo "Размер репозитория: $(du -sh .git | cut -f1)"
echo "Последние 5 коммитов:"
git log --oneline -5

echo "✅ Резервное копирование завершено!"
echo "📁 Репозиторий: $BACKUP_DIR"

# Опционально: отправка в удаленный репозиторий
if git remote get-url origin >/dev/null 2>&1; then
    echo "🌐 Отправляем в удаленный репозиторий..."
    git push origin main || echo "⚠️  Не удалось отправить в удаленный репозиторий"
else
    echo "ℹ️  Удаленный репозиторий не настроен"
    echo "   Для настройки выполните:"
    echo "   git remote add origin https://github.com/username/repo.git"
fi
