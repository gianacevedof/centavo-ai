import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import styles from './Login.module.css';

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
    <div className={styles.pageContainer}>
      <div className={styles.loginCard}>
        
        {/* Brand Logo */}
        <div className={styles.brand}>
          <div className={styles.brandMark}>C</div>
          <span className={styles.brandName}>Centavo-ai</span>
        </div>

        <h1 className={styles.title}>Welcome back</h1>
        
        {message && <div className={styles.message}>{message}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label>Email</label>
            <input 
              type="email" 
              value={formData.email} 
              onChange={(e) => setFormData({ ...formData, email: e.target.value })} 
              required 
            />
          </div>

          <div className={styles.inputGroup}>
            <label>Password</label>
            <input 
              type="password" 
              value={formData.password} 
              onChange={(e) => setFormData({ ...formData, password: e.target.value })} 
              required 
            />
          </div>

          {/* Remember & Forgot Password Row */}
          <div className={styles.optionsRow}>
            <label className={styles.checkboxLabel}>
              <input type="checkbox" className={styles.checkbox} />
              Remember
            </label>
            <a href="#" className={styles.forgotLink}>Forgot password?</a>
          </div>

          <button type="submit" className={styles.submitBtn}>Sign In</button>
        </form>

        <div className={styles.footer}>
          <span>Don't have an account? </span>
          <Link to="/signup" className={styles.signupLink}>Create account</Link>
        </div>
      </div>
    </div>
  );
};

export default Login;