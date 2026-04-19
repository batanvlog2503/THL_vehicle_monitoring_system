import os

DATASET_DIR = r"E:\LPR_ttcs\dataset"
PLATE_OLD_CLASS = 2   # class cũ của plate
PLATE_NEW_CLASS = 0   # class mới sau khi chuyển sang dataset 1 class

IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".bmp", ".webp"]

def find_image(image_dir, base_name):
    for ext in IMAGE_EXTS:
        p = os.path.join(image_dir, base_name + ext)
        if os.path.exists(p):
            return p
    return None

def process_split(split):
    label_dir = os.path.join(DATASET_DIR, split, "labels")
    image_dir = os.path.join(DATASET_DIR, split, "images")

    kept_files = 0
    removed_files = 0
    empty_files = 0

    for fname in os.listdir(label_dir):
        if not fname.endswith(".txt"):
            continue

        label_path = os.path.join(label_dir, fname)

        with open(label_path, "r", encoding="utf-8") as f:
            lines = [line.strip() for line in f if line.strip()]

        new_lines = []

        for line in lines:
            parts = line.split()

            # chỉ xử lý label detect chuẩn
            if len(parts) < 5:
                continue

            try:
                cls = int(float(parts[0]))
            except:
                continue

            # chỉ giữ class plate cũ
            if cls == PLATE_OLD_CLASS:
                parts[0] = str(PLATE_NEW_CLASS)
                new_lines.append(" ".join(parts[:5]))  # chỉ giữ format detect 5 phần tử

        if new_lines:
            with open(label_path, "w", encoding="utf-8") as f:
                f.write("\n".join(new_lines) + "\n")
            kept_files += 1
        else:
            # không còn plate => xóa label + ảnh tương ứng
            os.remove(label_path)
            base = os.path.splitext(fname)[0]
            img_path = find_image(image_dir, base)
            if img_path:
                os.remove(img_path)
            removed_files += 1
            empty_files += 1

    print(f"[{split}] kept_files = {kept_files}, removed_files = {removed_files}, empty_files = {empty_files}")

def main():
    for split in ["train", "val"]:
        process_split(split)

if __name__ == "__main__":
    main()