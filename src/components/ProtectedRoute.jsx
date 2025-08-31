import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children, requiredRole }) {
  const userData = localStorage.getItem("user");
  
  if (!userData) {
    return <Navigate to="/" replace />;
  }
  
  try {
    const user = JSON.parse(userData);
    
    if (requiredRole && user.role !== requiredRole) {
      return <Navigate to="/" replace />;
    }
    
    return children;
  } catch (error) {
    console.error("Error parsing user data:", error);
    return <Navigate to="/" replace />;
  }
}