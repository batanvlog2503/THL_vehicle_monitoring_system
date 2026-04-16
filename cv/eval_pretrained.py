from ultralytics import YOLO

# load pretrained model
model = YOLO("yolo11n.pt")

# đánh giá trên dataset của m
metrics = model.val(data="train/dataset_1/data.yaml")

# in kết quả
print("mAP50:", metrics.box.map50)
print("mAP50-95:", metrics.box.map)