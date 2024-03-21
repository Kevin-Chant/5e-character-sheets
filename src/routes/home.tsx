import React from 'react';
import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <>
      <h1>Home</h1>
      <p>TODO: add link to WIP for cloud-stored sheet</p>
      <Link to="/local">Create a local sheet</Link>
    </>
  );
}