// utils/plateGenerator.js

export const randomPlate = () => {
  // 2 số đầu (11 -> 99)
  const province = Math.floor(Math.random() * (99 - 11 + 1)) + 11

  // chữ A -> Y
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXY"
  const letter = letters[Math.floor(Math.random() * letters.length)]

  // ký tự thứ 4: chữ hoặc số
  const isLetter = Math.random() > 0.5
  const char4 = isLetter
    ? letters[Math.floor(Math.random() * letters.length)]
    : Math.floor(Math.random() * 10)

  // 5 số cuối
  const numbers = Math.floor(10000 + Math.random() * 90000)

  return `${province}${letter}${char4}-${numbers}`
}