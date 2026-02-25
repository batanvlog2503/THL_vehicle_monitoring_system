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
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route
      path="/"
      element={<MainLayout />}
    >
      <Route
        index
        element={<Login />}
      ></Route>
    </Route>,
  ),
)

function App() {
  return <RouterProvider router={router} />
}

export default App
