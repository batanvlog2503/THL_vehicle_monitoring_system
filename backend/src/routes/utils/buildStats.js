function buildStats(logs) {
  return {
    tongSoVideo: logs.length,

    danhSachVideo: logs.map((l, i) => ({
      stt: i + 1,

      videoName: l.videoName,

      createdAt: l.createdAt,

      soLanPhatHien: l.detections?.length || 0,

      cacNhan: [...new Set(l.detections?.map((d) => d.label) || [])],
    })),
  }
}

module.exports = { buildStats }


//  danhSachVideo: logs.map((l, i) => {
//       const detections = l.detections || []

//       const violations = detections.filter(
//         (d) => normalize(d.status) === "violation",
//       )

//       const speedViolations = detections.filter(
//         (d) =>
//           normalize(d.status) === "violation" ||
//           (d.speed && d.speed > 60), // 🔥 vi phạm tốc độ

//       )
//  danhSachVideo: logs.map((l, i) => {
//       const detections = l.detections || []

//       const violations = detections.filter(
//         (d) => normalize(d.status) === "violation",
//       )

//       const speedViolations = detections.filter(
//         (d) =>
//           normalize(d.status) === "violation" ||
//           (d.speed && d.speed > 60), // 🔥 vi phạm tốc độ

//       )