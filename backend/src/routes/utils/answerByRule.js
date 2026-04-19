function answerByRule(intent, stats) {
  switch (intent) {
    case "TOTAL_VIDEO":
      return `Có ${stats.tongSoVideo} video`

    case "TOTAL_VEHICLE":
      return `Có ${stats.tongViolationXe} xe vi phạm`

    case "TOTAL_FRAME":
      return `Có ${stats.tongViolationFrame} lần vi phạm`

    case "TOP_VIDEO":
      if (!stats.danhSachVideo.length) return "Không có dữ liệu"

      const top = [...stats.danhSachVideo].sort(
        (a, b) => b.soXeViPham - a.soXeViPham,
      )[0]

      return `Video ${top.videoName} có nhiều vi phạm nhất (${top.soXeViPham} xe)`

    case "LIST_VIDEO":
      if (!stats.danhSachVideo.length) return "Không có dữ liệu"

      return stats.danhSachVideo
        .map((v, i) => `${i + 1}. ${v.videoName} - ${v.soXeViPham} xe vi phạm`)
        .join("\n")

    default:
      return null
  }
}

module.exports = { answerByRule }
