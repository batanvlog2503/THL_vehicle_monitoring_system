import csv
import cv2
from collections import defaultdict

from config import (
    VIDEO_PATH, RAW_CSV_PATH, FILLED_CSV_PATH, OUTPUT_VIDEO_PATH,
    FRAME_SKIP, OCR_EVERY_N, MIN_SCORE_ACCEPT, SHOW_WINDOW
)
from utils import open_video, draw_label, parse_box
from detector import detect_plates, crop_plate
from tracker import Tracker


# ============================================================
# PASS 1 - DETECT + OCR + LƯU RAW CSV
# ============================================================
def pass1_detect_ocr(model, ocr) -> list[dict]:
    print("\n===== PASS 1: Detect + OCR từng frame + lưu CSV thô =====")
    cap = open_video(VIDEO_PATH)
    if cap is None:
        raise RuntimeError("Không mở được video!")

    fps   = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    tracker = Tracker()
    rows, frame_idx = [], 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame_idx += 1

        if FRAME_SKIP > 1 and frame_idx % FRAME_SKIP != 0:
            continue

        dets    = detect_plates(model, frame)
        matched = tracker.update(dets, frame_idx)

        for det, tr in matched:
            x1, y1, x2, y2 = det["box"]
            do_ocr = (frame_idx % OCR_EVERY_N == 0)

            ocr_text = ocr_type = ocr_raw = ""
            ocr_layout = 0
            ocr_conf = ocr_score = 0.0

            if do_ocr:
                crop = crop_plate(frame, det["box"])
                if crop.size > 0:
                    cand = ocr.read_plate(crop)
                    if cand["text"] and cand["score"] >= MIN_SCORE_ACCEPT:
                        ocr_text   = cand["text"]
                        ocr_type   = cand["type"]
                        ocr_layout = cand["layout"]
                        ocr_conf   = cand["conf"]
                        ocr_score  = cand["score"]
                        ocr_raw    = cand["raw"]

            rows.append({
                "frame_nmr":            frame_idx,
                "track_id":             tr["id"],
                "plate_bbox":           f"{x1},{y1},{x2},{y2}",
                "det_conf":             round(det["det_conf"], 6),
                "license_number":       ocr_text,
                "license_number_score": round(ocr_score, 6),
                "ocr_conf":             round(ocr_conf, 6),
                "vehicle_type":         ocr_type,
                "layout":               ocr_layout,
                "raw_ocr":              ocr_raw,
            })

        if frame_idx % 50 == 0:
            print(f"  [Pass1] Frame {frame_idx}/{total}")

    cap.release()

    fieldnames = ["frame_nmr","track_id","plate_bbox","det_conf",
                  "license_number","license_number_score","ocr_conf",
                  "vehicle_type","layout","raw_ocr"]
    with open(RAW_CSV_PATH, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

    print(f"  Đã lưu CSV thô: {RAW_CSV_PATH}  ({len(rows)} dòng)")
    return rows


# ============================================================
# PASS 2 - SMOOTHING + CHỌN BIỂN TỐT NHẤT + LƯU FILLED CSV
# ============================================================
def _best_plate_for_track(track_rows: list[dict]) -> tuple[str, float]:
    """
    Chọn biển tốt nhất cho một track_id:
    - Ưu tiên biển xuất hiện nhiều nhất (majority vote)
    - Tie-break bằng tổng score và best score
    """
    valid = [r for r in track_rows if str(r.get("license_number","")).strip()]
    if not valid:
        return "", 0.0

    agg: dict[str, dict] = {}
    for r in valid:
        text  = r["license_number"]
        score = float(r.get("license_number_score", 0.0) or 0.0)
        if text not in agg:
            agg[text] = {"count": 0, "score_sum": 0.0, "best": 0.0}
        agg[text]["count"]     += 1
        agg[text]["score_sum"] += score
        agg[text]["best"]       = max(agg[text]["best"], score)

    best_text, data = max(
        agg.items(),
        key=lambda kv: (kv[1]["count"], kv[1]["score_sum"], kv[1]["best"])
    )
    return best_text, data["best"]


def _interpolate_boxes(track_rows: list[dict]) -> list[dict]:
    """Nội suy tuyến tính bbox cho các frame bị miss trong cùng track."""
    rows  = sorted(track_rows, key=lambda r: int(r["frame_nmr"]))
    boxes = [parse_box(r.get("plate_bbox","")) for r in rows]

    for i in range(len(rows)):
        if boxes[i] is not None:
            continue
        prev_i = next((j for j in range(i-1,-1,-1) if boxes[j]), None)
        next_i = next((j for j in range(i+1,len(rows)) if boxes[j]), None)
        if prev_i is not None and next_i is not None:
            f0, f1, f = (int(rows[x]["frame_nmr"]) for x in (prev_i, next_i, i))
            alpha = (f - f0) / max(1, f1 - f0)
            b0, b1 = boxes[prev_i], boxes[next_i]
            interp = tuple(int(b0[k] + alpha*(b1[k]-b0[k])) for k in range(4))
            rows[i]["plate_bbox"] = ",".join(map(str, interp))
    return rows


def pass2_smooth(rows: list[dict]) -> tuple[list[dict], dict]:
    print("\n===== PASS 2: Smoothing + chọn biển tốt nhất theo track =====")
    by_track: dict[int, list] = defaultdict(list)
    for r in rows:
        by_track[int(r["track_id"])].append(dict(r))

    filled, best_by_track = [], {}

    for tid, trows in by_track.items():
        best_text, best_score = _best_plate_for_track(trows)
        best_by_track[tid]    = {"text": best_text, "score": best_score}

        for r in _interpolate_boxes(trows):
            r["best_license_number"] = best_text
            r["best_license_score"]  = round(best_score, 6)
            filled.append(r)

    filled.sort(key=lambda r: (int(r["frame_nmr"]), int(r["track_id"])))

    fieldnames = ["frame_nmr","track_id","plate_bbox","det_conf",
                  "license_number","license_number_score","ocr_conf",
                  "vehicle_type","layout","raw_ocr",
                  "best_license_number","best_license_score"]
    with open(FILLED_CSV_PATH, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in filled:
            w.writerow({k: r.get(k,"") for k in fieldnames})

    print(f"  Đã lưu CSV sau smoothing: {FILLED_CSV_PATH}")
    print("  Biển tốt nhất theo xe:")
    for tid, info in best_by_track.items():
        print(f"    Track {tid}: '{info['text']}' | score={info['score']:.3f}")
    return filled, best_by_track


# ============================================================
# PASS 3 - VẼ BBOX + XUẤT VIDEO OUTPUT
# ============================================================
def pass3_visualize(filled: list[dict]) -> str:
    print("\n===== PASS 3: Vẽ bbox + xuất video demo =====")
    cap = open_video(VIDEO_PATH)
    if cap is None:
        raise RuntimeError("Không mở được video để visualize!")

    fps    = cap.get(cv2.CAP_PROP_FPS) or 25.0
    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    delay  = max(1, int(1000 / fps))

    # Chuẩn bị dict frame → list row
    by_frame: dict[int, list] = defaultdict(list)
    for r in filled:
        if str(r.get("best_license_number","")).strip() and \
                parse_box(r.get("plate_bbox","")) is not None:
            by_frame[int(r["frame_nmr"])].append(r)

    # Tạo VideoWriter
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out    = cv2.VideoWriter(OUTPUT_VIDEO_PATH, fourcc, fps, (width, height))
    out_path = OUTPUT_VIDEO_PATH
    if not out.isOpened():
        fallback = OUTPUT_VIDEO_PATH.rsplit(".", 1)[0] + ".avi"
        print(f"  MP4 writer thất bại, dùng AVI: {fallback}")
        out = cv2.VideoWriter(fallback, cv2.VideoWriter_fourcc(*"XVID"),
                              fps, (width, height))
        if not out.isOpened():
            raise RuntimeError("Không tạo được VideoWriter!")
        out_path = fallback

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame_idx += 1

        for r in by_frame.get(frame_idx, []):
            text  = str(r.get("best_license_number","")).strip()
            box   = parse_box(r.get("plate_bbox",""))
            score = float(r.get("best_license_score", 0.0) or 0.0)
            if not text or box is None:
                continue
            x1, y1, x2, y2 = box
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 220, 0), 2)
            draw_label(frame, x1, y1, text, score)

        out.write(frame)

        if SHOW_WINDOW:
            cv2.imshow("LPR - Nhan dien bien so xe", frame)
            if cv2.waitKey(delay) & 0xFF in (27, ord("q")):
                break

    cap.release()
    out.release()
    cv2.destroyAllWindows()
    print(f"  Đã xuất video: {out_path}")
    return out_path
