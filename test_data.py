import os

label_folder = "trains/dataset_1/train/labels"

bad = 0

files = os.listdir(label_folder)

for i, file in enumerate(files):
    path = os.path.join(label_folder, file)

    with open(path, "r") as f:
        for line in f:
            if len(line.strip().split()) != 5:
                bad += 1
                print("Lỗi:", file)
                break

    if i % 1000 == 0:
        print(f"Đã check: {i}/{len(files)}")

print("Tổng file lỗi:", bad)