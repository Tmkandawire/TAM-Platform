import { Outlet } from "react-router-dom";
export default () => (
  <div style={{ background: "#fff0f0" }}>
    <nav>
      <h1>Admin Panel</h1>
    </nav>
    <Outlet />
  </div>
);
