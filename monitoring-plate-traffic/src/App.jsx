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
        path="main"
        element={<Main />}
      >
        <Route
          index q
          element={<Dashboard />}
        ></Route>
        <Route
          path="vehicle"
          element={<Vehicle />}
        ></Route>
        <Route
          path="statistic"
          element={<Statistic />}
        ></Route>
      </Route>
    </Route>,
  ),
)

function App() {
  return <RouterProvider router={router} />
}

export default App
