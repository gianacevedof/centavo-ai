import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { toast } from 'react-toastify';

const Signup = () => {
  const [formData, setFormData] = useState({ email: '', password: '', name: '' });
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.password.length < 8) {
      toast.error('Password must be at least 8 characters long.');
      return;
    }

    try {
      await api.signup(formData);
      toast.success('Signup successful! Please log in.');
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      toast.error(err.message || 'Signup failed');
    }
  };

  return (
    <div>
      <h1>Sign Up</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Name:</label>
          <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
        </div>
        <div>
          <label>Email:</label>
          <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
        </div>
        <div>
          <label>Password:</label>
          <input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required />
          <small style={{ display: 'block', color: '#666' }}>Minimum 8 characters</small>
        </div>
        <button type="submit">Sign Up</button>
      </form>
      <p>Already have an account? <Link to="/login">Log In</Link></p>
    </div>
  );
};

export default Signup;
