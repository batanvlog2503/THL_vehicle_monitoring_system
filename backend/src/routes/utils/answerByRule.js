function answerByRule(intent, stats, lang) {
  const vi = lang !== "en"
  const { targetDate } = intent
  const d = targetDate ? stats.byDate[targetDate] : null

  // Hỏi ngày không có data
  if (targetDate && !d) {
    return vi
      ? `Không có dữ liệu ngày **${targetDate}**.`
      : `No data for **${targetDate}**.`
  }

  // Số video
  if (intent.wantsVideoCount) {
    const count = d ? d.soVideo : stats.tongSoVideo
    return vi
      ? `${targetDate ? `Ngày **${targetDate}**` : "Tổng cộng"} có **${count} video**.`
      : `**${count} videos**${targetDate ? ` on ${targetDate}` : " in total"}.`
  }

  // Vi phạm
  if (intent.wantsViolation) {
    const count = d ? d.soXeViPham : stats.tongXeViPham
    return vi
      ? `${targetDate ? `Ngày **${targetDate}**` : "Tổng cộng"} có **${count} xe vi phạm**.`
      : `**${count} violations**${targetDate ? ` on ${targetDate}` : " in total"}.`
  }

  // Danh sách video theo ngày
  if (intent.wantsList && d) {
    const list = d.videos.map((v, i) => `${i + 1}. ${v}`).join("\n")
    return vi
      ? `Danh sách **${d.soVideo} video** ngày **${targetDate}**:\n${list}`
      : `**${d.soVideo} videos** on ${targetDate}:\n${list}`
  }

  // Danh sách tổng
  if (intent.wantsList && !targetDate) {
    const lines = Object.entries(stats.byDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 5)
      .map(
        ([date, d]) =>
          `- **${date}**: ${d.soVideo} video, ${d.soXeViPham} xe vi phạm`,
      )
      .join("\n")
    return vi ? `5 ngày gần nhất:\n${lines}` : `Last 5 days:\n${lines}`
  }

  return null // → gọi AI
}

module.exports = { answerByRule }
