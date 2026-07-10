# AGENTS.md — Minecraft Regions Viewer

## Запрет на изменение эталонных файлов

**Нельзя** изменять, удалять или переименовывать:

- `task.txt` — техническое задание
- `all_flags.txt` — справочник флагов WorldGuard
- `regions.yml` — пример данных регионов

Допустимо только **чтение** этих файлов.

## Возобновление работы

1. Прочитать `docs/dev/STATUS.md` или `docs/dev/STATE.yaml`
2. При блокерах — `docs/dev/KNOWN_ISSUES.md`
3. Детали — последние записи в `docs/dev/PROGRESS.md`

## Workflow

код → pytest → раздел в `docs/ИНСТРУКЦИЯ.md` (если блок готов в UI) → PROGRESS → commit
