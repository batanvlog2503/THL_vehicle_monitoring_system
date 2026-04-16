from ultralytics import YOLO
import cv2

model = YOLO(r"C:\Users\Admin\THL_vehicle_monitoring_system\runs\detect\runs\train\vehicle_model_v23\weights\best.pt")

img = cv2.imread("test/test5.jpg")

# resize
img = cv2.resize(img, (640, 640))
results = model(img)

results[0].show()