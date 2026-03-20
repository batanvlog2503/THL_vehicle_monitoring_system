from ultralytics import YOLO

# load model đã train
model = YOLO(r"E:\LPR_ttcs\runs\License_Plate_Model-v113\weights\best.pt")
src = "E:\LPR_ttcs/test_images/vehicle.jpg"
# đưa ảnh vào nhận diện
results = model.predict(
    source=src,  # ảnh cần detect
    conf=0.25,
    save=True,
    project = "E:/LPR_ttcs/Predict"
)

print("Detect xong")