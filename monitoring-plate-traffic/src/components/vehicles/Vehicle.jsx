import React from "react"
import "./Vehicle.css"
const Vehicle = () => {
  return (
    <div className="container vehicle">
      <div className="inner-wrap row px-3">
        <div className="inner-introduction col-12">
          <h3>
            <i class="fa-solid fa-car"></i> Vehicle & License Plate Details
          </h3>
          <span>
            Complete list of detected vehicles with license plate recognition
          </span>
        </div>

        <div className="inner-filter col-12 row">
          <div className="inner-plate col-4">
            <label>Search License Plate</label>
            <br />
            <input
              type="text"
              placeholder="Enter license plate..."
            />
          </div>
          <div className="inner-type col-4">
            <label htmlFor="">Vehicle Type</label>
            <div
              class="dropdown"
              style={{ marginTop: "32px" }}
            >
              <button
                class="btn btn-secondary dropdown-toggle"
                type="button"
                id="dropdownMenuButton"
                data-toggle="dropdown"
                aria-haspopup="true"
                aria-expanded="false"
              >
                Dropdown button
              </button>
              <div
                class="dropdown-menu"
                aria-labelledby="dropdownMenuButton"
              >
                <a
                  class="dropdown-item"
                  href="#"
                >
                  Action
                </a>
                <a
                  class="dropdown-item"
                  href="#"
                >
                  Another action
                </a>
                <a
                  class="dropdown-item"
                  href="#"
                >
                  Something else here
                </a>
              </div>
            </div>
          </div>
          <div className="inner-overspeed col-4 d-flex">
            <br />
            <input type="checkbox" />
            <span>Show violations only overspeed</span>
          </div>
        </div>

        <div className="inner-list col-12">
          <div className="inner-table">
            <table className="table ">
              <thead className="table-secondary">
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Type</th>
                  <th scope="col">Speed</th>
                  <th scope="col">License Plate</th>
                  <th scope="col">Timestamp</th>
                  <th scope="col">Status</th>
                  <th scope="col">Video</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>1</td>
                  <td>Car</td>
                  <td>65 km/h</td>
                  <td>30A-12345</td>
                  <td>10:23:15</td>
                  <td>Normal</td>
                  <td>
                    <button className="btn btn-primary btn-sm">View</button>
                  </td>
                </tr>
                <tr>
                  <td>2</td>
                  <td>Motorbike</td>
                  <td>55 km/h</td>
                  <td>29B-56789</td>
                  <td>10:23:15</td>
                  <td>Normal</td>
                  <td>
                    <button className="btn btn-primary btn-sm">View</button>
                  </td>
                </tr>
                <tr>
                  <td>3</td>
                  <td>Truck</td>
                  <td>80 km/h</td>
                  <td>88C-22222</td>
                  <td>10:23:15</td>
                  <td style={{ color: "red" }}>Over Speed</td>
                  <td>
                    <button className="btn btn-primary btn-sm">View</button>
                  </td>
                </tr>
                <tr>
                  <td>4</td>
                  <td>Car</td>
                  <td>72 km/h</td>
                  <td>30H-67890</td>
                  <td>10:23:15</td>
                  <td>Normal</td>
                  <td>
                    <button className="btn btn-primary btn-sm">View</button>
                  </td>
                </tr>
                <tr>
                  <td>5</td>
                  <td>Bus</td>
                  <td>60 km/h</td>
                  <td>51B-11111</td>
                  <td>10:23:15</td>
                  <td>Normal</td>
                  <td>
                    <button className="btn btn-primary btn-sm">View</button>
                  </td>
                </tr>
                <tr>
                  <td>6</td>
                  <td>Motorbike</td>
                  <td>45 km/h</td>
                  <td>29X-33333</td>
                  <td>10:23:15</td>
                  <td>Normal</td>
                  <td>
                    <button className="btn btn-primary btn-sm">View</button>
                  </td>
                </tr>
                <tr>
                  <td>7</td>
                  <td>Car</td>
                  <td>95 km/h</td>
                  <td>30A-99999</td>
                  <td>10:23:15</td>
                  <td style={{ color: "red" }}>Over Speed</td>
                  <td>
                    <button className="btn btn-primary btn-sm">View</button>
                  </td>
                </tr>
                <tr>
                  <td>8</td>
                  <td>Truck</td>
                  <td>70 km/h</td>
                  <td>77C-44444</td>
                  <td>10:23:15</td>
                  <td>Normal</td>
                  <td>
                    <button className="btn btn-primary btn-sm">View</button>
                  </td>
                </tr>
                <tr>
                  <td>9</td>
                  <td>Bus</td>
                  <td>68 km/h</td>
                  <td>43B-55555</td>
                  <td>10:23:15</td>
                  <td>Normal</td>
                  <td>
                    <button className="btn btn-primary btn-sm">View</button>
                  </td>
                </tr>
                <tr>
                  <td>10</td>
                  <td>Motorbike</td>
                  <td>50 km/h</td>
                  <td>29Y-88888</td>
                  <td>10:23:15</td>
                  <td>Normal</td>
                  <td>
                    <button className="btn btn-primary btn-sm">View</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Vehicle
