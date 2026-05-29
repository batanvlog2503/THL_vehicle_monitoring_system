from config import TRACK_IOU_THR, TRACK_MAX_MISS, TRACK_BOX_ALPHA
from utils import iou_xyxy


# ============================================================
# TRACKING - IoU + EMA box smoothing
# ============================================================
class Tracker:
    """
    Tracker đơn giản dùng IoU match + EMA box để giảm nhảy bbox.
    """

    def __init__(self):
        self._tracks: list[dict] = []
        self._next_id = 0

    def _new_track(self, det: dict, frame_idx: int) -> dict:
        tr = {
            "id":         self._next_id,
            "box":        det["box"],
            "smooth_box": list(det["box"]),  # EMA smoothed
            "det_conf":   det["det_conf"],
            "last_seen":  frame_idx,
            "miss":       0,
        }
        self._next_id += 1
        return tr

    @staticmethod
    def _ema(old: list, new: tuple, alpha: float = TRACK_BOX_ALPHA) -> list:
        """EMA: smooth_box = alpha * old + (1 - alpha) * new"""
        return [int(alpha * o + (1 - alpha) * n) for o, n in zip(old, new)]

    def update(self, detections: list[dict], frame_idx: int) -> list[tuple]:
        """
        Khớp detection với track hiện tại.
        Trả về list (det, track) đã được gán / tạo mới.
        """
        matched: list[tuple] = []
        used_ids: set = set()

        for det in detections:
            best_tr, best_iou = None, 0.0
            for tr in self._tracks:
                ov = iou_xyxy(det["box"], tr["box"])
                if ov > best_iou:
                    best_iou, best_tr = ov, tr

            if best_tr is not None and best_iou >= TRACK_IOU_THR \
                    and best_tr["id"] not in used_ids:
                # Cập nhật track
                best_tr["smooth_box"] = self._ema(best_tr["smooth_box"], det["box"])
                best_tr["box"]        = det["box"]
                best_tr["det_conf"]   = det["det_conf"]
                best_tr["last_seen"]  = frame_idx
                best_tr["miss"]       = 0
                used_ids.add(best_tr["id"])
                matched.append((det, best_tr))
            else:
                # Track mới
                tr = self._new_track(det, frame_idx)
                self._tracks.append(tr)
                matched.append((det, tr))

        # Tăng miss cho track không được khớp
        for tr in self._tracks:
            if tr["id"] not in used_ids and \
                    any(det is tr for _, tr2 in matched for det in [tr2]) is False:
                # Chỉ tăng miss cho track KHÔNG có trong matched này
                pass
        matched_track_ids = {tr["id"] for _, tr in matched}
        for tr in self._tracks:
            if tr["id"] not in matched_track_ids:
                tr["miss"] += 1

        # Xóa track đã miss quá lâu
        self._tracks[:] = [tr for tr in self._tracks if tr["miss"] <= TRACK_MAX_MISS]
        return matched
