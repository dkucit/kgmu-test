"""Автообновление schedule.json сайта KGMU Community.

1. Скачивает Excel-файлы со страницы расписания КГМУ (build.fetch_all).
2. Собирает расписание в формате kgmu-v8-multigroup для тех же групп, что уже есть в schedule.json.
3. Если занятия не изменились — ничего не пишет (чтобы не плодить коммиты).
При любой ошибке завершается с кодом 1, а сайт продолжает показывать прошлые данные.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).parent))
from build import fetch_all  # noqa: E402
from friend_export import export  # noqa: E402

if __name__ == "__main__":
    template = json.loads((ROOT / "schedule.json").read_text("utf-8"))
    raw = ROOT / "raw"
    print("Скачиваю расписание КГМУ…")
    fetch_all(raw)
    tmp = ROOT / "raw" / "out"
    payload = export(raw, template, tmp)
    if payload["groups"] == template["groups"]:
        print("Расписание не изменилось — файлы сайта не трогаю.")
        sys.exit(0)
    changed = [g for g in template["groups"] if payload["groups"].get(g) != template["groups"].get(g)]
    print(f"Изменилось расписание групп: {', '.join(changed)}")
    for name in ("schedule.json", "schedule-data.js"):
        (ROOT / name).write_text((tmp / name).read_text("utf-8"), "utf-8")
    print("✓ schedule.json и schedule-data.js обновлены")
