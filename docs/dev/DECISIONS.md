## 2026-07-10 | touch ≠ intersect

**Контекст:** граничащие cuboid по одной грани
**Решение:** touch-only не считается пересечением
**Причина:** соответствует легенде draw.io «области пересекаются»
**Файлы:** backend/geometry/intersections.py

## 2026-07-10 | draw.io edge classification

**Контекст:** различие иерархии и пересечений в mxGraph
**Решение:** intersects = dashed=1 + endArrow=none; contains = endArrow=doubleBlock; legend edges с locked=1 пропускаются
**Файлы:** backend/tools/extract_drawio_reference.py
