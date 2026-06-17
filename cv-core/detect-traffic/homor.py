import cv2

# ============================================================
# LOAD VIDEO
# ============================================================

cap= cv2.VideoCapture("test/testvd3.mp4")
ret, frame = cap.read()

if not ret:
    print("Không đọc được video")
    exit()
frame = cv2.resize(
        frame,
        (640, 640)
    )
# ============================================================
# LIST LƯU ĐIỂM
# ============================================================

points = []

# ============================================================
# HÀM CLICK CHUỘT
# ============================================================

def mouse_click(event, x, y, flags, param):

    if event == cv2.EVENT_LBUTTONDOWN:

        points.append([x, y])

        print(f"Point {len(points)}: ({x}, {y})")

        # vẽ điểm
        cv2.circle(
            frame,
            (x, y),
            5,
            (0, 0, 255),
            -1
        )

        # đánh số
        cv2.putText(
            frame,
            str(len(points)),
            (x + 10, y - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 0),
            2
        )

        cv2.imshow("Select SRC_PTS", frame)

# ============================================================
# WINDOW
# ============================================================

cv2.namedWindow("Select SRC_PTS")

cv2.setMouseCallback(
    "Select SRC_PTS",
    mouse_click
)

# ============================================================
# LOOP
# ============================================================

print("Click 4 diem:")
print("1. top-left")
print("2. top-right")
print("3. bottom-right")
print("4. bottom-left")
print("\nNhan ESC de thoat")

while True:

    cv2.imshow(
        "Select SRC_PTS",
        frame
    )

    key = cv2.waitKey(1)

    # ESC
    if key == 27:
        break

    # đủ 4 điểm
    if len(points) == 4:

        print("\nSRC_PTS = np.float32([")

        for p in points:
            print(f"    [{p[0]}, {p[1]}],")

        print("])")

        break

# ============================================================
# END
# ============================================================

cv2.waitKey(0)

cap.release()

cv2.destroyAllWindows()