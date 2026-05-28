import cv2

# ===== PATH =====
img_path = r"C:\Users\Admin\THL_vehicle_monitoring_system\trains\dataset_2\train\images\cam_09_00002_jpg.rf.a55e17bedde49644bd55464b9a99b188.jpg"
label_path = r"C:\Users\Admin\THL_vehicle_monitoring_system\trains\dataset_2\train\labels\cam_09_00002_jpg.rf.a55e17bedde49644bd55464b9a99b188.txt"

# ===== CLASS =====
class_names = ["Ambulance", "Bus", "Car", "Motorcycle", "Truck"]

# ===== LOAD =====
image = cv2.imread(img_path)
h, w, _ = image.shape

# ===== DRAW =====
with open(label_path, "r") as f:
    for line in f:
        cls, x, y, bw, bh = map(float, line.strip().split())

        cls = int(cls)

        # convert YOLO → pixel
        x1 = int((x - bw/2) * w)
        y1 = int((y - bh/2) * h)
        x2 = int((x + bw/2) * w)
        y2 = int((y + bh/2) * h)

        label = class_names[cls]

        cv2.rectangle(image, (x1, y1), (x2, y2), (0,255,0), 2)
        cv2.putText(image, label, (x1, y1-10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,255,0), 2)

cv2.imshow("Test 1 Image", image)
cv2.waitKey(0)
cv2.destroyAllWindows()