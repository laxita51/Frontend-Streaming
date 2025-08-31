import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL
console.log("DEBUG",API_BASE_URL)

export default function Login() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("viewer");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isLoginMode, setIsLoginMode] = useState(true);
  const navigate = useNavigate();

  const validateForm = () => {
    setError("");

    if (!isLoginMode && !username.trim()) {
      setError("Please enter a username");
      return false;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address");
      return false;
    }

    // Password validation
    if (password.length < 6) {
      setError("Password must be at least 6 characters long");
      return false;
    }

    // For registration, check if passwords match
    if (!isLoginMode && password !== confirmPassword) {
      setError("Passwords do not match");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsLoading(true);
    setError("");

    try {
      const endpoint = isLoginMode ? "/api/auth/login" : "/api/auth/register";
      const payload = isLoginMode 
        ? { email, password }
        : { username, email, password, role };

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        credentials: 'include' // Important for HTTP-only cookies
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || "Authentication failed");
      }

      // Store user data (token is in HTTP-only cookie)
      localStorage.setItem("user", JSON.stringify({
        id: data.data._id,
        username: data.data.username,
        email: data.data.email,
        role: data.data.role
      }));

      // Redirect based on role
      if (data.data.role === "publisher") {
        navigate("/publisher");
      } else {
        navigate("/viewer");
      }

    } catch (error) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLoginMode(!isLoginMode);
    setError("");
    setUsername("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Stream Platform</h1>
          <p>{isLoginMode ? "Sign in to your account" : "Create a new account"}</p>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          {!isLoginMode && (
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
              />
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {!isLoginMode && (
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
          )}

          {!isLoginMode && (
            <div className="form-group">
              <label>Select Role</label>
              <div className="role-options">
                <div 
                  className={`role-option ${role === "publisher" ? "selected" : ""}`}
                  onClick={() => setRole("publisher")}
                >
                  <div className="role-icon">📹</div>
                  <h4>Publisher</h4>
                  <p>Stream your content to viewers</p>
                  <input
                    type="radio"
                    name="role"
                    value="publisher"
                    checked={role === "publisher"}
                    onChange={(e) => setRole(e.target.value)}
                    className="role-radio"
                  />
                </div>
                
                <div 
                  className={`role-option ${role === "viewer" ? "selected" : ""}`}
                  onClick={() => setRole("viewer")}
                >
                  <div className="role-icon">👁️</div>
                  <h4>Viewer</h4>
                  <p>Watch streams from publishers</p>
                  <input
                    type="radio"
                    name="role"
                    value="viewer"
                    checked={role === "viewer"}
                    onChange={(e) => setRole(e.target.value)}
                    className="role-radio"
                  />
                </div>
              </div>
            </div>
          )}
          
          <button 
            type="submit" 
            className="login-button"
            disabled={isLoading}
          >
            {isLoading ? "Processing..." : (isLoginMode ? "Sign In" : "Register")}
          </button>
        </form>

        <div className="auth-toggle">
          <p>
            {isLoginMode ? "Don't have an account? " : "Already have an account? "}
            <span onClick={toggleMode} className="toggle-link">
              {isLoginMode ? "Register" : "Sign In"}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}