import { useState } from "react"
import "./App.css"
import {
  Route,
  Router,
  RouterProvider,
  BrowserRouter,
  createBrowserRouter,
  createRoutesFromElements,
} from "react-router-dom"

import "bootstrap/dist/css/bootstrap.min.css"
import "bootstrap/dist/js/bootstrap.bundle.min.js"

import "./index.css"

import MainLayout from "./layouts/MainLayout"
import Login from "./auth/Login/Login"
import Home from "./components/home/Home"
import Main from "./layouts/Main"
import Statistic from "./components/statistics/Statistic"
import Dashboard from "./components/dashboard/Dashboard"
import Vehicle from "./components/vehicles/Vehicle"
import SignUp from "./auth/Logout/SignUp"
import Log from "./components/log/Log"
import LogDetails from "./components/log/LogDetails"
import Chatbot from "./components/chatbot/Chatbot.jsx"
import Chatbot1 from "./components/chatbot/Chatbot1.jsx"
import Webcam from "./components/webcam/Webcam"
import ForgotPassword from "./auth/ForgotPassword/ForgotPassword"
import Dashboard1 from "./components/dashboard/Dashboard1"
import ReviewAdmin from "./components/review/ReviewAdmin.jsx"
import Review from "./components/review/Review.jsx"
import User from "./components/user/User.jsx"
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route
      path="/"
      element={<MainLayout />}
    >
      <Route
        index
        element={<Home />}
      ></Route>
      <Route
        path="login"
        element={<Login />}
      ></Route>
      <Route
        path="signup"
        element={<SignUp />}
      ></Route>
      <Route
        path="forgot-password"
        element={<ForgotPassword />}
      ></Route>

      <Route
        path="main"
        element={<Main />}
      >
        <Route
          index
          element={<Dashboard1 />}
        ></Route>
        <Route
          path="webcam"
          element={<Webcam />}
        ></Route>
        <Route
          path="vehicle"
          element={<Vehicle />}
        ></Route>
        <Route
          path="user"
          element={<User />}
        ></Route>
        <Route
          path="statistic"
          element={<Statistic />}
        ></Route>
        <Route
          path="chatbot"
          element={<Chatbot1 />}
        ></Route>
        <Route
          path="log"
          element={<Log />}
        ></Route>
        <Route
          path="log/:id"
          element={<LogDetails />}
        />
        <Route
          path="review"
          element={<ReviewAdmin />}
        ></Route>
      </Route>
    </Route>,
  ),
)

function App() {
  return <RouterProvider router={router} />
}

export default App
