import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './LoginPage.jsx';
import SCDashboard from './SCDashboard.jsx';
import SCReportViewer from './SCReportViewer.jsx';

function PrivateRoute({ children }) {
  const token = localStorage.getItem('mp_token');
  return token ? children : <Navigate to="/" replace />;
}

function PublicRoute({ children }) {
  const token = localStorage.getItem('mp_token');
  return token ? <Navigate to="/dashboard" replace /> : children;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/dashboard" element={<PrivateRoute><SCDashboard /></PrivateRoute>} />
        <Route path="/sc-reports/:id" element={<PrivateRoute><SCReportViewer /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
