import { Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Publisher from "./pages/Publisher";
import Viewer from "./pages/Viewer";
import ProtectedRoute from "./components/ProtectedRoute";
import "./App.css";

export default function App() {
  return (
    <div className="app-container">
      <Routes>
        <Route path="/" element={<Login />} />
        <Route 
          path="/publisher" 
          element={
            <ProtectedRoute requiredRole="publisher">
              <Publisher />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/viewer" 
          element={
            <ProtectedRoute requiredRole="viewer">
              <Viewer />
            </ProtectedRoute>
          } 
        />
      </Routes>
    </div>
  );
}