import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Sparkles, UserCheck, ArrowRight, Lock, AlertCircle, CheckCircle2, X, FileText, Briefcase, Upload } from 'lucide-react';

const TYPES = ['College student', 'Fresher', 'Working professional', 'School student', 'Woman returning to work'];

export default function LoginModal({ isOpen, onClose, onSuccess }) {
  const [activeTab, setActiveTab] = useState('register'); // 'register' | 'login'
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  
  // Registration Form State
  const [categories, setCategories] = useState([]);
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [gender, setGender] = useState(''); // 'Female', 'Male', 'Others'
  const [type, setType] = useState('');
  const [subject, setSubject] = useState('');
  const [resumeFile, setResumeFile] = useState(null);

  // Login Form State
  const [interviewId, setInterviewId] = useState('');

  // Polling State
  const [pendingAppId, setPendingAppId] = useState(null);
  const [approvalTimer, setApprovalTimer] = useState(120);
  const [approvedInterviewId, setApprovedInterviewId] = useState(null);

  useEffect(() => {
    let interval;
    if (pendingAppId && !approvedInterviewId && approvalTimer > 0) {
      interval = setInterval(() => {
        setApprovalTimer(prev => prev - 1);
        
        // Poll every 5 seconds
        if (approvalTimer % 5 === 0) {
          fetch(`https://ai-interview-admin-node.onrender.com/api/applications/${pendingAppId}`)
            .then(res => res.json())
            .then(data => {
              if (data.status === 'approved' && data.interviewId) {
                setApprovedInterviewId(data.interviewId);
                setSuccessMsg(`Approved! Your Interview ID is: ${data.interviewId}`);
              }
            })
            .catch(err => console.error('Polling error:', err));
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [pendingAppId, approvedInterviewId, approvalTimer]);

  useEffect(() => {
    if (isOpen && activeTab === 'register' && categories.length === 0) {
      fetch('https://ai-interview-admin-node.onrender.com/api/categories')
        .then(res => res.json())
        .then(data => {
          setCategories(data);
          if (data.length > 0) setSubject(data[0]);
        })
        .catch(err => console.error('Failed to fetch categories:', err));
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const handleRegister = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMsg(null);

    if (!name || !email || !subject) {
      setError('First name, email, and subject are required.');
      setIsLoading(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('lastName', lastName);
      formData.append('email', email);
      formData.append('phone', phone);
      formData.append('city', city);
      formData.append('gender', gender);
      formData.append('type', type);
      formData.append('subject', subject);
      if (resumeFile) {
        formData.append('resumeFile', resumeFile);
      }

      const res = await fetch('https://ai-interview-admin-node.onrender.com/api/applications', {
        method: 'POST',
        body: formData // Let browser set Content-Type with boundary automatically
      });
      
      if (!res.ok) {
        throw new Error('Failed to submit application');
      }
      
      const data = await res.json();
      setSuccessMsg('Application submitted successfully! Please wait for admin approval to receive your Interview ID.');
      setPendingAppId(data.id);
      setApprovalTimer(120);
      setApprovedInterviewId(null);
      
      // Clear form
      setName(''); setLastName(''); setEmail(''); setPhone(''); setCity('');
      setGender(''); setType(''); setResumeFile(null);
      
    } catch (err) {
      setError(err.message || 'Something went wrong. Is the admin server running?');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!interviewId) {
      setError('Interview ID is required.');
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`https://ai-interview-admin-node.onrender.com/api/interviews/${interviewId.toUpperCase()}`);
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Invalid Interview ID');
      }

      if (onSuccess) {
        onSuccess({ 
          user: { displayName: data.name, role: 'interviewer', interviewId: interviewId.toUpperCase() },
          subject: data.subject
        });
      }
      if (onClose) onClose();
    } catch (err) {
      setError(err.message || 'Failed to connect to the server.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderInputStyle = {
    width: '100%',
    padding: '0.75rem 1rem',
    marginBottom: '0',
    backgroundColor: 'rgba(30, 27, 54, 0.6)',
    border: '1px solid rgba(168, 85, 247, 0.3)',
    borderRadius: '10px',
    color: '#ffffff',
    fontSize: '0.9rem',
    outline: 'none',
    boxSizing: 'border-box'
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.8rem',
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: '0.4rem',
    marginTop: '0.8rem'
  };

  const pillStyle = (isActive) => ({
    padding: '0.4rem 0.8rem',
    borderRadius: '20px',
    fontSize: '0.8rem',
    cursor: 'pointer',
    border: isActive ? '1px solid #a855f7' : '1px solid rgba(255,255,255,0.2)',
    background: isActive ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
    color: isActive ? '#fff' : '#94a3b8',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px'
  });

  return (
    <AnimatePresence>
      <div 
        style={{
          position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1.5rem', backgroundColor: 'rgba(3, 2, 9, 0.88)', backdropFilter: 'blur(20px)',
          fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif"
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
          style={{
            position: 'relative', width: '100%', maxWidth: activeTab === 'register' ? '650px' : '500px',
            backgroundColor: 'rgba(12, 9, 26, 0.96)', border: '1px solid rgba(168, 85, 247, 0.35)', borderRadius: '24px',
            boxShadow: '0 30px 100px rgba(0, 0, 0, 0.85), 0 0 60px rgba(147, 51, 234, 0.25)',
            padding: '2rem', maxHeight: '90vh', overflowY: 'auto'
          }}
        >
          {onClose && (
            <button onClick={onClose} style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', padding: '0.5rem', color: '#94a3b8', backgroundColor: 'transparent', border: 'none', cursor: 'pointer' }}>
              <X style={{ width: '20px', height: '20px' }} />
            </button>
          )}

          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 0.5rem 0', background: 'linear-gradient(135deg, #ffffff 0%, #f3e8ff 50%, #d8b4fe 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Candidate Portal
            </h2>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '6px', marginBottom: '1.5rem', backgroundColor: 'rgba(15, 12, 33, 0.9)', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '16px' }}>
            <button onClick={() => { setActiveTab('register'); setError(null); setSuccessMsg(null); }} style={{ padding: '0.65rem', borderRadius: '12px', fontSize: '0.825rem', fontWeight: 700, border: 'none', cursor: 'pointer', color: activeTab === 'register' ? '#fff' : '#94a3b8', background: activeTab === 'register' ? 'linear-gradient(135deg, #9333ea 0%, #6366f1 100%)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <FileText style={{ width: '16px', height: '16px' }} /> Register
            </button>
            <button onClick={() => { setActiveTab('login'); setError(null); setSuccessMsg(null); }} style={{ padding: '0.65rem', borderRadius: '12px', fontSize: '0.825rem', fontWeight: 700, border: 'none', cursor: 'pointer', color: activeTab === 'login' ? '#fff' : '#94a3b8', background: activeTab === 'login' ? 'linear-gradient(135deg, #9333ea 0%, #6366f1 100%)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <CheckCircle2 style={{ width: '16px', height: '16px' }} /> Start Interview
            </button>
          </div>

          {error && (
            <div style={{ padding: '0.85rem 1rem', marginBottom: '1.25rem', backgroundColor: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.35)', borderRadius: '16px', color: '#fca5a5', fontSize: '0.8rem', display: 'flex', gap: '10px' }}>
              <AlertCircle style={{ width: '18px', height: '18px', flexShrink: 0 }} /> <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div style={{ padding: '0.85rem 1rem', marginBottom: '1.25rem', backgroundColor: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.35)', borderRadius: '16px', color: '#86efac', fontSize: '0.8rem', display: 'flex', gap: '10px' }}>
              <CheckCircle2 style={{ width: '18px', height: '18px', flexShrink: 0 }} /> <span>{successMsg}</span>
            </div>
          )}

          {activeTab === 'register' ? (
            pendingAppId ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                {approvedInterviewId ? (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                    <CheckCircle2 style={{ width: '48px', height: '48px', color: '#1DB96A', margin: '0 auto 1rem auto' }} />
                    <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '0.5rem' }}>Application Approved!</h3>
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Here is your unique Interview ID. Please save it.</p>
                    <div style={{ background: 'rgba(29, 185, 106, 0.1)', border: '1px solid #1DB96A', padding: '1.5rem', borderRadius: '12px', marginBottom: '2rem' }}>
                      <span style={{ fontSize: '2rem', fontWeight: 'bold', letterSpacing: '2px', color: '#1DB96A' }}>{approvedInterviewId}</span>
                    </div>
                    <button onClick={() => { setActiveTab('login'); setInterviewId(approvedInterviewId); setPendingAppId(null); setSuccessMsg(null); }} className="primary-btn glow-btn" style={{ width: '100%', padding: '1rem', border: 'none', borderRadius: '12px', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                      Proceed to Login
                    </button>
                  </motion.div>
                ) : approvalTimer > 0 ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="spinner" style={{ borderTopColor: '#00f3ff', borderLeftColor: 'transparent', width: '40px', height: '40px', margin: '0 auto 1rem auto', animation: 'spin 1s linear infinite', border: '3px solid rgba(0, 243, 255, 0.2)', borderRadius: '50%' }}></div>
                    <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '0.5rem' }}>Waiting for Admin Approval</h3>
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>The admin is reviewing your application...</p>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#00f3ff', fontFamily: 'monospace' }}>
                      {Math.floor(approvalTimer / 60)}:{(approvalTimer % 60).toString().padStart(2, '0')}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <AlertCircle style={{ width: '48px', height: '48px', color: '#f59e0b', margin: '0 auto 1rem auto' }} />
                    <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '0.5rem' }}>Timeout</h3>
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                      The admin is currently unavailable to approve your application immediately.<br/>
                      Please check your registered email later for your Interview ID.
                    </p>
                    <button onClick={() => setPendingAppId(null)} style={{ width: '100%', padding: '1rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                      Back to Registration
                    </button>
                  </motion.div>
                )}
                <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
              </div>
            ) : (
            <form onSubmit={handleRegister}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>First name</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={renderInputStyle} required />
                </div>
                <div>
                  <label style={labelStyle}>Last name (Optional)</label>
                  <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} style={renderInputStyle} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={renderInputStyle} required />
              </div>

              <div>
                <label style={labelStyle}>Contact number</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input type="text" value="+91" disabled style={{ ...renderInputStyle, width: '70px', textAlign: 'center', opacity: 0.7 }} />
                  <input type="tel" placeholder="Mobile number" value={phone} onChange={(e) => setPhone(e.target.value)} style={renderInputStyle} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Current city</label>
                <input type="text" placeholder="Current location" value={city} onChange={(e) => setCity(e.target.value)} style={renderInputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Gender</label>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {['Female', 'Male', 'Others'].map(g => (
                    <div key={g} onClick={() => setGender(g)} style={pillStyle(gender === g)}>
                      {g === 'Female' ? '👩🏻‍💼' : g === 'Male' ? '👨🏻‍💼' : '⭐'} {g}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Type</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {TYPES.map(t => (
                    <div key={t} onClick={() => setType(t)} style={pillStyle(type === t)}>
                      {t}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Interview Subject</label>
                  <select value={subject} onChange={(e) => setSubject(e.target.value)} style={{ ...renderInputStyle, appearance: 'none' }}>
                    <option value="" disabled>Select Subject...</option>
                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Upload Resume</label>
                  <label style={{ ...renderInputStyle, display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', overflow: 'hidden' }}>
                    <Upload style={{ width: '16px', height: '16px', color: '#a855f7' }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {resumeFile ? resumeFile.name : 'Choose PDF file...'}
                    </span>
                    <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setResumeFile(e.target.files[0])} style={{ display: 'none' }} />
                  </label>
                </div>
              </div>
              
              <button type="submit" disabled={isLoading} style={{ width: '100%', padding: '1rem', background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '0.95rem', fontWeight: 700, cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.7 : 1, marginTop: '1.5rem' }}>
                {isLoading ? 'Submitting...' : 'Register Next'}
              </button>
            </form>
            )
          ) : (
            <form onSubmit={handleLogin}>
              <div style={{ margin: '2rem 0' }}>
                <input type="text" placeholder="Enter your Interview ID (e.g. JS-ABC123)" value={interviewId} onChange={(e) => setInterviewId(e.target.value.toUpperCase())} style={{ ...renderInputStyle, fontSize: '1.1rem', letterSpacing: '2px', textAlign: 'center' }} />
              </div>
              
              <button type="submit" disabled={isLoading} style={{ width: '100%', padding: '1rem', background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '0.95rem', fontWeight: 700, cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.7 : 1 }}>
                {isLoading ? 'Verifying...' : 'Start Assessment'}
              </button>
            </form>
          )}

          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <a href="https://ai-interview-admin-node.onrender.com/login.html" target="_blank" rel="noreferrer" style={{ color: '#94a3b8', fontSize: '0.8rem', textDecoration: 'none' }}>
              <Shield style={{ width: '12px', height: '12px', display: 'inline', marginRight: '4px' }} /> Admin Access
            </a>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
}

