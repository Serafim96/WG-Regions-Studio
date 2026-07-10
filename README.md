# Minecraft Regions Viewer

Визуализатор иерархии регионов WorldGuard с отображением пересечений и вхождений.

## Установка

1. Python 3.11+
2. Node.js 18+ (для сборки UI)

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..
```

## Запуск

**Windows:** двойной клик `run.bat` или:

```bash
run.bat
```

**Linux/macOS:**

```bash
chmod +x run.sh && ./run.sh
```

Откройте в браузере: http://127.0.0.1:8000

## Тесты

```bash
pytest
```

## Документация

Полное руководство пользователя: [docs/ИНСТРУКЦИЯ.md](docs/ИНСТРУКЦИЯ.md)

Dev-логи: [docs/dev/STATUS.md](docs/dev/STATUS.md)

## Эталонные файлы (только чтение)

- `task.txt`, `all_flags.txt`, `regions.yml` — не изменять
