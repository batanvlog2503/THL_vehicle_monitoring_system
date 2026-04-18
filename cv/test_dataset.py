import os

base_dir = os.path.dirname(__file__)
label_dir = os.path.join(base_dir, "dataset/train/labels")

truck_class_id = 4
files_have_truck = []

for file in os.listdir(label_dir):
    path = os.path.join(label_dir, file)

    if not file.endswith(".txt"):
        continue

    with open(path, "r") as f:
        for line in f:
            cls = int(line.split()[0])
            if cls == truck_class_id:
                files_have_truck.append(file)
                break

# 🔥 in ra từng file
print("📂 Các file có truck:")
for f in files_have_truck:
    print(f)

print("\nTổng:", len(files_have_truck))