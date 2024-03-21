import React from 'react';
import { Outlet, Link } from "react-router-dom";

export default function Root() {
  return (
    <>
      <div id="sidebar">
        <h1>Navigation</h1>
        <nav>
          <Link to="/">Home</Link>
        </nav>
      </div>
      <div id="detail">
        <Outlet />
      </div>
    </>
  );
}