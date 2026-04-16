import shutil

src = "runs/detect/train"
dst = "backup/train_v1"

shutil.copytree(src, dst)

print("✅ Backup full folder")