"""Экспорт расписания в формат сайта KGMU Community (kgmu-v8-multigroup).

    python scraper/friend_export.py --raw raw --template site-template/schedule.json --out out/

Берёт список групп, programs и groupMeta из текущего schedule.json сайта (template),
а сами занятия — из Excel-файлов КГМУ, разобранных нашим парсером.
Пишет schedule.json и schedule-data.js (встроенная копия для index.html).
"""
import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

import openpyxl

sys.path.insert(0, str(Path(__file__).parent))
import parse as P  # noqa: E402
from parse import HOLIDAYS, clean, fmt_time, parse_file, to_date  # noqa: E402

WEEK1 = dt.date(2026, 8, 31)
MAX_WEEK = 18
PROGRAM_BY_PROG = {"Лечебное дело": "lechebnoe", "Педиатрия": "pediatriya", "Стоматология": "stomatologiya",
                   "Медико-профилактическое дело": "medprof", "Фармация": "farmaciya",
                   "Медицинская биофизика": "biofizika", "Медицинская биохимия": "biohimiya",
                   "Психология (бакалавриат)": "psihologiya", "Сестринское дело (очн.)": "sestrinskoe",
                   "Социальная работа (бакалавриат, очн.)": "socrabota"}
PROGRAM_LABELS = {"lechebnoe": "Лечебное дело", "pediatriya": "Педиатрия", "stomatologiya": "Стоматология",
                  "medprof": "Медико-профилактическое дело", "farmaciya": "Фармация",
                  "biofizika": "Медицинская биофизика", "biohimiya": "Медицинская биохимия",
                  "psihologiya": "Психология", "sestrinskoe": "Сестринское дело", "socrabota": "Социальная работа"}
PROGRAM_ORDER = list(PROGRAM_LABELS)


def gkey(g):
    d = re.sub(r"\D", "", g)
    return (len(d), d, g)


def week_of(d):
    return (d - WEEK1).days // 7 + 1


def grid_event(e, short_names):
    title = e.get("tf") or e.get("t", "")
    weeks = sorted(w for w in e.get("w", []) if 1 <= w <= MAX_WEEK)
    loc = e.get("l") or e.get("lraw") or ""
    lec = bool(e.get("lec0")) or e.get("k") == "lec"
    return {
        "day": e["d"], "start": e["s"], "end": e["e"], "row": e.get("row", 0),
        "subject": short_names.get(title, title), "fullSubject": title,
        "lecture": lec, "teacher": e.get("p", "") or "",
        "location": loc, "shortLocation": loc,
        "weeks": weeks, "subgroup": str(e["sg"]) if e.get("sg") else None,
        "weekSpec": e.get("ws", ""), "lessonType": "lecture" if lec else "practice",
    }


def parse_cycles(path, wanted, short_names):
    """Циклы: блок = строка с дисциплиной + строки-продолжения с отдельными датами."""
    wb = openpyxl.load_workbook(path, data_only=True)
    out = {}
    for ws in wb.worksheets:
        hdr, hdr_row = None, None
        for row in ws.iter_rows(min_row=1, max_row=30):
            names = [clean(c.value) if c.value else "" for c in row]
            if "Группа" in names and "Дисциплина" in names:
                hdr = {n: i for i, n in enumerate(names) if n}
                hdr_row = row[0].row
                break
        if not hdr:
            continue
        col = lambda name: next((i for n, i in hdr.items() if n.startswith(name)), None)  # noqa: E731
        cg, cd, cp, cl, cr, cn, cdt, cs, ce = (col("Группа"), col("Дисциплина"), col("Преподаватель"), col("Локация"),
                                               col("Помещение"), col("Суммарное"), col("Даты"), col("Начало"), col("Окончание"))
        grp, block = None, None
        merged = {}
        for rng in ws.merged_cells.ranges:
            top = ws.cell(rng.min_row, rng.min_col).value
            for rr in range(rng.min_row, rng.max_row + 1):
                for cc in range(rng.min_col, rng.max_col + 1):
                    merged[(rr, cc)] = top

        def flush():
            if block and grp in wanted:
                out.setdefault(grp, []).append(block)

        for row in ws.iter_rows(min_row=hdr_row + 1):
            v = [merged.get((c.row, c.column), c.value) if c.value is None else c.value for c in row]
            get = lambda i: v[i] if i is not None and i < len(v) else None  # noqa: E731
            r = row[0].row
            if get(cg) and re.match(r"^\d{3,5}", clean(get(cg))):
                flush()
                grp, block = clean(get(cg)), None
            dates = get(cdt)
            if get(cd):
                flush()
                block = None
                if dates in (None, ""):
                    continue
                if isinstance(dates, str) and len(re.findall(r"\d{2}\.\d{2}\.\d{4}", dates)) >= 2:
                    a, b = re.findall(r"\d{2}\.\d{2}\.\d{4}", dates)[:2]
                    d1, d2 = to_date(a), to_date(b)
                else:
                    d1 = d2 = to_date(dates)
                if not d1:
                    continue
                loc = ", ".join(clean(x) for x in (get(cl), get(cr)) if x)
                cnt = get(cn)
                block = {"row": r, "title": clean(get(cd)), "teacher": clean(get(cp)) if get(cp) else "",
                         "location": loc, "d1": d1, "d2": d2, "start": fmt_time(get(cs)), "end": fmt_time(get(ce)),
                         "count": int(cnt) if str(cnt or "").strip().isdigit() else None}
            elif block and dates not in (None, ""):
                rng = re.findall(r"\d{2}\.\d{2}\.\d{4}", dates) if isinstance(dates, str) else []
                if len(rng) >= 2:  # та же дисциплина, новый диапазон дат — отдельный блок
                    flush()
                    prev = block
                    cnt = get(cn)
                    loc = ", ".join(clean(x) for x in (get(cl), get(cr)) if x) or prev["location"]
                    block = {**prev, "row": r, "d1": to_date(rng[0]), "d2": to_date(rng[1]),
                             "teacher": clean(get(cp)) if get(cp) else prev["teacher"], "location": loc,
                             "start": fmt_time(get(cs)) or prev["start"], "end": fmt_time(get(ce)) or prev["end"],
                             "count": int(cnt) if str(cnt or "").strip().isdigit() else None}
                else:
                    d = to_date(dates)
                    if d and d > block["d2"]:
                        block["d2"] = d
        flush()
    res = {}
    for g, blocks in out.items():
        for b in blocks:
            days = [b["d1"] + dt.timedelta(days=i) for i in range((b["d2"] - b["d1"]).days + 1)]
            weeks = sorted({week_of(d) for d in days if d.weekday() < 5 and 1 <= week_of(d) <= MAX_WEEK})
            if not weeks:
                continue
            weekdays = sorted({d.weekday() for d in days if d.weekday() < 5})
            for wd in weekdays:
                ev = {"day": wd, "start": b["start"], "end": b["end"], "row": b["row"],
                      "subject": b["title"], "fullSubject": b["title"], "lecture": False,
                      "teacher": b["teacher"], "location": b["location"], "shortLocation": b["location"],
                      "weeks": weeks, "subgroup": None, "weekSpec": str(b["row"]), "lessonType": "cycle",
                      "dateStart": b["d1"].isoformat(), "dateEnd": b["d2"].isoformat()}
                if b["count"] is not None:
                    ev["cycleSourceCount"] = b["count"]
                ev["cycleNeedsVerification"] = True
                ev["cycleRange"] = f"{b['d1']:%d.%m.%Y} — {b['d2']:%d.%m.%Y}"
                res.setdefault(g, []).append(ev)
    return res


def export(raw: Path, template: dict, out: Path, all_groups: bool = True):
    groups_wanted = set(template["groups"])
    dev_groups = {g for g, evs in template["groups"].items() if not evs}
    short_names = {}
    for evs in template["groups"].values():
        for e in evs:
            if e.get("fullSubject") and e.get("subject") and e["subject"] != e["fullSubject"]:
                short_names[e["fullSubject"]] = e["subject"]
    manifest = json.loads((raw / "manifest.json").read_text("utf-8"))
    result = {g: [] for g in groups_wanted}
    used_sources = {}
    new_meta = {}  # группы, которых ещё нет на сайте: program/course
    if all_groups:  # сначала узнаём все группы нужных направлений
        for m in manifest:
            prog = PROGRAM_BY_PROG.get(m["prog"])
            if not prog or not m["fn"].endswith(".xlsx"):
                continue
            _, res, _ = parse_file(raw / m["fn"])
            for g, v in res.items():
                if g not in groups_wanted:
                    nm = new_meta.setdefault(g, {"program": prog, "course": str(v["course"] or "1")})
                    if v["course"]:
                        nm["course"] = str(v["course"])
        groups_wanted |= set(new_meta)
        for g in new_meta:
            result.setdefault(g, [])
    for m in manifest:
        if m["prog"] not in PROGRAM_BY_PROG or not m["fn"].endswith(".xlsx"):
            continue
        if not all_groups and PROGRAM_BY_PROG[m["prog"]] not in template["programs"]:
            continue
        path = raw / m["fn"]
        first = openpyxl.load_workbook(path, read_only=True).worksheets[0]
        is_cycle = "ЦИКЛ" in str(first["B2"].value or "").upper()
        if is_cycle:
            part = parse_cycles(path, groups_wanted, short_names)
            for g, evs in part.items():
                result[g].extend(evs)
                used_sources.setdefault(g, m["fn"])
            continue
        _, res, _ = parse_file(path)
        for g, v in res.items():
            if g in groups_wanted and g not in dev_groups:
                for e in v["events"]:
                    only = re.search(r"\{гр\.?\s*([^}]*)\}", e.get("tf") or e.get("t", ""))
                    if only and g not in [x.strip() for x in only.group(1).split(",")]:
                        continue  # занятие только для перечисленных групп
                    result[g].append(grid_event(e, short_names))
                used_sources.setdefault(g, m["fn"])
    problems = []
    for g in groups_wanted:
        if g in dev_groups:
            result[g] = []
            continue
        seen, uniq = set(), []
        for e in result[g]:
            if not e["weeks"]:
                continue
            k = json.dumps(e, sort_keys=True, ensure_ascii=False)
            if k not in seen:
                seen.add(k)
                uniq.append(e)
        uniq.sort(key=lambda e: (e["day"], e["start"], e["row"]))
        result[g] = uniq
        if not uniq and g in new_meta:
            continue  # новая группа без занятий в пределах семестра — не показываем
        if not uniq:
            problems.append(f"группа {g}: не найдено ни одного занятия")
        if len(uniq) > 1500:
            problems.append(f"группа {g}: слишком много занятий ({len(uniq)})")
    if problems:
        raise SystemExit("Экспорт остановлен, сайт оставит прошлые данные:\n  " + "\n  ".join(problems))
    meta = json.loads(json.dumps(template["groupMeta"]))
    programs = json.loads(json.dumps(template["programs"]))
    order = list(template["groups"])
    added = sorted((g for g in new_meta if result.get(g)),
                   key=lambda g: (PROGRAM_ORDER.index(new_meta[g]["program"]), int(new_meta[g]["course"]), gkey(g)))
    for g in added:
        nm = new_meta[g]
        stream = P.GROUP_STREAMS.get(g, "1")
        meta[g] = {"program": nm["program"], "course": nm["course"], "stream": stream,
                   "source": used_sources.get(g, ""), "signed": template.get("signed"),
                   "hasCycles": any(e["lessonType"] == "cycle" for e in result[g])}
        prog = programs.setdefault(nm["program"], {"label": PROGRAM_LABELS[nm["program"]], "courses": {}})
        lst = prog["courses"].setdefault(nm["course"], {}).setdefault(stream, [])
        if g not in lst:
            lst.append(g)
        order.append(g)
    for prog in programs.values():
        prog["courses"] = {c: {st: sorted(gs, key=gkey) for st, gs in sorted(v.items())}
                           for c, v in sorted(prog["courses"].items(), key=lambda kv: int(kv[0]))}
    programs = {k: programs[k] for k in sorted(programs, key=lambda k: PROGRAM_ORDER.index(k) if k in PROGRAM_ORDER else 99)}
    for g, fn in used_sources.items():
        if g in meta:
            meta[g]["source"] = fn
    payload = {"format": "kgmu-v8-multigroup", "version": (template.get("version", "8.5").split("-auto")[0]) + "-auto",
               "updated": dt.date.today().isoformat(), "signed": template.get("signed"),
               "programs": programs, "groupMeta": meta,
               "groups": {g: result[g] for g in order}}
    out.mkdir(parents=True, exist_ok=True)
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    (out / "schedule.json").write_text(body, "utf-8")
    (out / "schedule-data.js").write_text(
        "/* Встроенная копия расписания (запасной вариант до загрузки schedule.json). Собрано автоматически. */\n"
        "window.KGMU_EMBEDDED_GROUPS=" + json.dumps(payload["groups"], ensure_ascii=False, separators=(",", ":")) + ";\n"
        "window.KGMU_PROGRAMS=" + json.dumps(payload["programs"], ensure_ascii=False, separators=(",", ":")) + ";\n"
        "window.KGMU_GROUP_INFO=" + json.dumps(payload["groupMeta"], ensure_ascii=False, separators=(",", ":")) + ";\n",
        "utf-8")
    print(f"✓ {sum(len(v) for v in payload['groups'].values())} занятий в {len(payload['groups'])} группах → {out}")
    return payload


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--template", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    export(Path(a.raw), json.loads(Path(a.template).read_text("utf-8")), Path(a.out))
