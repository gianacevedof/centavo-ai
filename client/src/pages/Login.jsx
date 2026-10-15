import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const Login = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (response.ok) {
        setMessage('Login successful! Redirecting...');
        setTimeout(() => navigate('/'), 2000);
      } else {
        setMessage(data.message || 'Login failed');
      }
    } catch (err) {
      setMessage('An error occurred during login.');
    }
  };

  return (
    <div>
      <h1>Log In</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Email:</label>
          <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
        </div>
        <div>
          <label>Password:</label>
          <input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required />
        </div>
        <button type="submit">Log In</button>
      </form>
      {message && <p>{message}</p>}
      <p>Don't have an account? <Link to="/signup">Sign Up</Link></p>
    </div>
  );
};

export default Login;
