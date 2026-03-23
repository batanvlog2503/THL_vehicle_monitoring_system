import axios from "axios"

// nởi để xử lí requrest có bearer và gửi request trước khi
// hết accessToken
const axiosInstance = axios.create()
// gửi request thay vì dùng Bearer
axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken")

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})
// interceptors chạy trước khi request gửi đi
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (
      error.response &&
      (error.response.status === 401 || error.response.status === 403) &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true

      const refreshToken = localStorage.getItem("refreshToken")
      if (!refreshToken) {
        localStorage.clear()
        window.location.href = "/login"
        return Promise.reject(error)
      }
      try {
        const res = await axios.post(
          `${import.meta.env.VITE_APP_URL}/user/refresh-token`,
          { refreshToken },
        )

        const newAccessToken = res.data.accessToken

        localStorage.setItem("accessToken", newAccessToken)

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`

        return axiosInstance(originalRequest)
      } catch (err) {
        localStorage.clear()
        window.location.href = "/login"
      }
    }
    return Promise.reject(error)
  },
)

export default axiosInstance
