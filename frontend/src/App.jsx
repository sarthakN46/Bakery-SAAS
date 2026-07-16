import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard,
  Boxes,
  ChefHat,
  Cookie,
  TrendingUp,
  Coins,
  LogOut,
  Plus,
  Trash2,
  Edit,
  AlertCircle,
  Calendar,
  DollarSign,
  LineChart,
  Activity,
  Info,
  Sparkles,
  Lock,
  User,
  Loader2,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw
} from 'lucide-react';
import './App.css';

const API_BASE = "http://127.0.0.1:8000";

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [username, setUsername] = useState('');
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [backendOffline, setBackendOffline] = useState(false);

  // Sign-up & Google Auth States
  const [isSignUp, setIsSignUp] = useState(false);
  const [signUpUser, setSignUpUser] = useState('');
  const [signUpPass, setSignUpPass] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const GOOGLE_CLIENT_ID = "216839352932-placeholder.apps.googleusercontent.com"; // User placeholder Client ID

  // App Tabs: 'dashboard', 'inventory', 'recipes', 'production', 'sales-expenses', 'forecasting'
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Data States
  const [ingredients, setIngredients] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [productionHistory, setProductionHistory] = useState([]);
  const [salesHistory, setSalesHistory] = useState([]);
  const [expensesHistory, setExpensesHistory] = useState([]);
  const [analyticsSummary, setAnalyticsSummary] = useState({
    revenue: 0,
    production_cost: 0,
    opex: 0,
    net_profit: 0,
    margin: 0
  });
  const [chartData, setChartData] = useState({ timeline: [], expense_breakdown: [] });
  const [predictionsData, setPredictionsData] = useState([]);
  const [predictionDate, setPredictionDate] = useState(
    new Date(Date.now() + 86400000).toISOString().split('T')[0] // Tomorrow
  );

  // Loading & Modals
  const [loading, setLoading] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // 'add-ingredient', 'edit-ingredient', 'add-recipe'
  const [errorMsg, setErrorMsg] = useState('');

  // Form states
  const [ingForm, setIngForm] = useState({ name: '', quantity: '', unit: 'g', cost_per_unit: '' });
  const [selectedIngId, setSelectedIngId] = useState(null);
  
  // Recipe form states
  const [recipeName, setRecipeName] = useState('');
  const [recipePrice, setRecipePrice] = useState('');
  const [recipeIngredients, setRecipeIngredients] = useState([{ ingredient_id: '', quantity_required: '' }]);

  // Production batch form state
  const [prodBatch, setProdBatch] = useState({ recipe_id: '', quantity_produced: '', quantity_wasted: '0' });

  // Sale form state
  const [saleForm, setSaleForm] = useState({ recipe_id: '', quantity_sold: '', revenue_override: '' });

  // Expense form state
  const [expenseForm, setExpenseForm] = useState({ name: '', amount: '', category: 'Utilities' });

  // Chart Tooltip Hover State
  const [hoveredPoint, setHoveredPoint] = useState(null);

  // Dynamically load Google OAuth Script when on login page
  useEffect(() => {
    if (token) return;

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    script.onload = () => {
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse
        });
        
        const btnDiv = document.getElementById("google-signin-btn");
        if (btnDiv) {
          window.google.accounts.id.renderButton(btnDiv, {
            theme: "outline",
            size: "large",
            width: 360
          });
        }
      }
    };

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [token, isSignUp]);

  const handleGoogleResponse = async (response) => {
    setLoading(true);
    setLoginError('');
    try {
      const resData = await apiFetch('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ credential: response.credential })
      });
      
      localStorage.setItem('token', resData.access_token);
      setToken(resData.access_token);
      setUsername(resData.username);
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoGoogleLogin = async () => {
    setLoading(true);
    setLoginError('');
    try {
      // Generate a mock Google JWT credential
      const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
      const mockSub = "mock_" + Math.random().toString(36).substring(2, 10);
      const payload = btoa(JSON.stringify({
        iss: "accounts.google.com",
        sub: mockSub,
        email: `${mockSub}@demo-bakery.com`,
        email_verified: true,
        name: `Demo Owner ${mockSub.substring(5, 8).toUpperCase()}`
      }));
      const mockCredential = `${header}.${payload}.signature_placeholder`;

      const resData = await apiFetch('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ credential: mockCredential })
      });
      
      localStorage.setItem('token', resData.access_token);
      setToken(resData.access_token);
      setUsername(resData.username);
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLoginError('');
    try {
      await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: signUpUser,
          password: signUpPass,
          email: signUpEmail
        })
      });
      
      alert("Registration successful! You can now log in.");
      setIsSignUp(false);
      setLoginUser(signUpUser);
      setLoginPass('');
      setSignUpUser('');
      setSignUpPass('');
      setSignUpEmail('');
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Helper fetch function
  const apiFetch = async (path, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    try {
      const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
      setBackendOffline(false);
      if (response.status === 401) {
        // Logout on unauthorized
        handleLogout();
        throw new Error("Session expired. Please log in again.");
      }
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const detail = errData.detail || `Request failed with code ${response.status}`;
        throw new Error(typeof detail === 'object' ? JSON.stringify(detail) : detail);
      }
      return await response.json();
    } catch (err) {
      if (err.message.includes('Failed to fetch')) {
        setBackendOffline(true);
      }
      throw err;
    }
  };

  // Login handler
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLoginError('');
    try {
      const formData = new URLSearchParams();
      formData.append('username', loginUser);
      formData.append('password', loginPass);

      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: "Login failed" }));
        throw new Error(error.detail || "Login failed");
      }

      const data = await res.json();
      localStorage.setItem('token', data.access_token);
      setToken(data.access_token);
      setUsername(loginUser);
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Logout handler
  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setUsername('');
    setIngredients([]);
    setRecipes([]);
    setProductionHistory([]);
    setSalesHistory([]);
    setExpensesHistory([]);
  };

  // Fetch Username Info
  useEffect(() => {
    if (token) {
      apiFetch('/api/auth/me')
        .then(data => setUsername(data.username))
        .catch(() => handleLogout());
    }
  }, [token]);

  // Load Main Data based on Active Tab
  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg('');
    try {
      if (activeTab === 'dashboard') {
        const [sum, chart] = await Promise.all([
          apiFetch('/api/analytics/summary'),
          apiFetch('/api/analytics/charts')
        ]);
        setAnalyticsSummary(sum);
        setChartData(chart);
      } else if (activeTab === 'inventory') {
        const ings = await apiFetch('/api/ingredients');
        setIngredients(ings);
      } else if (activeTab === 'recipes') {
        const recs = await apiFetch('/api/recipes');
        setRecipes(recs);
      } else if (activeTab === 'production') {
        const [batches, recs] = await Promise.all([
          apiFetch('/api/production'),
          apiFetch('/api/recipes')
        ]);
        setProductionHistory(batches);
        setRecipes(recs);
      } else if (activeTab === 'sales-expenses') {
        const [sales, exps, recs] = await Promise.all([
          apiFetch('/api/sales'),
          apiFetch('/api/expenses'),
          apiFetch('/api/recipes')
        ]);
        setSalesHistory(sales);
        setExpensesHistory(exps);
        setRecipes(recs);
      } else if (activeTab === 'forecasting') {
        const [preds, recs] = await Promise.all([
          apiFetch(`/api/analytics/predictions?target=${predictionDate}`),
          apiFetch('/api/recipes')
        ]);
        setPredictionsData(preds.predictions);
        setRecipes(recs);
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab, token]);

  // Refresh forecasts when date changes
  useEffect(() => {
    if (activeTab === 'forecasting' && token) {
      apiFetch(`/api/analytics/predictions?target=${predictionDate}`)
        .then(data => setPredictionsData(data.predictions))
        .catch(err => setErrorMsg(err.message));
    }
  }, [predictionDate]);

  // Add/Edit Ingredient submit
  const submitIngredient = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: ingForm.name,
        quantity: parseFloat(ingForm.quantity),
        unit: ingForm.unit,
        cost_per_unit: parseFloat(ingForm.cost_per_unit)
      };

      if (selectedIngId) {
        await apiFetch(`/api/ingredients/${selectedIngId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch('/api/ingredients', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }
      
      setActiveModal(null);
      setIngForm({ name: '', quantity: '', unit: 'g', cost_per_unit: '' });
      loadData();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  // Recipe Ingredient Builder Helper
  const handleRecipeIngChange = (index, field, value) => {
    const updated = [...recipeIngredients];
    updated[index][field] = value;
    setRecipeIngredients(updated);
  };

  const addRecipeIngField = () => {
    setRecipeIngredients([...recipeIngredients, { ingredient_id: '', quantity_required: '' }]);
  };

  const removeRecipeIngField = (index) => {
    const updated = recipeIngredients.filter((_, i) => i !== index);
    setRecipeIngredients(updated);
  };

  // Real-time calculations of Recipe cost during creation
  const liveRecipeCost = useMemo(() => {
    let total = 0;
    recipeIngredients.forEach(ri => {
      const ing = ingredients.find(i => i.id === parseInt(ri.ingredient_id));
      const qty = parseFloat(ri.quantity_required);
      if (ing && qty) {
        total += ing.cost_per_unit * qty;
      }
    });
    return total;
  }, [recipeIngredients, ingredients]);

  const submitRecipe = async (e) => {
    e.preventDefault();
    try {
      // Validate ingredients list
      const cleanIngs = recipeIngredients.filter(ri => ri.ingredient_id && ri.quantity_required);
      if (cleanIngs.length === 0) {
        throw new Error("A recipe must have at least one ingredient.");
      }

      const payload = {
        name: recipeName,
        selling_price: parseFloat(recipePrice),
        ingredients: cleanIngs.map(ri => ({
          ingredient_id: parseInt(ri.ingredient_id),
          quantity_required: parseFloat(ri.quantity_required)
        }))
      };

      await apiFetch('/api/recipes', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setActiveModal(null);
      setRecipeName('');
      setRecipePrice('');
      setRecipeIngredients([{ ingredient_id: '', quantity_required: '' }]);
      loadData();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  // Log Production batch
  const submitProduction = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        recipe_id: parseInt(prodBatch.recipe_id),
        quantity_produced: parseFloat(prodBatch.quantity_produced),
        quantity_wasted: parseFloat(prodBatch.quantity_wasted) || 0.0,
        cost_of_production: 0.0 // Backend will recalculate
      };

      await apiFetch('/api/production', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setProdBatch({ recipe_id: '', quantity_produced: '', quantity_wasted: '0' });
      loadData();
      alert("Production batch logged successfully. Stock deducted!");
    } catch (err) {
      // Handle the custom dict error structure from backend
      try {
        const parsed = JSON.parse(err.message);
        if (parsed.error === "Insufficient ingredients stock") {
          const detailStr = parsed.details.map(d => `${d.ingredient}: Need ${d.needed}${d.unit}, have ${d.available.toFixed(1)}${d.unit}`).join('\n');
          alert(`Cannot bake: Insufficient Ingredient Stock!\n\n${detailStr}`);
          return;
        }
      } catch (e) {}
      alert(err.message);
    }
  };

  // Submit Sale
  const submitSale = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        recipe_id: parseInt(saleForm.recipe_id),
        quantity_sold: parseFloat(saleForm.quantity_sold),
        revenue: parseFloat(saleForm.revenue_override) || 0.0
      };

      await apiFetch('/api/sales', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setSaleForm({ recipe_id: '', quantity_sold: '', revenue_override: '' });
      loadData();
      alert("Sale registered successfully!");
    } catch (err) {
      alert(err.message);
    }
  };

  // Submit Expense
  const submitExpense = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: expenseForm.name,
        amount: parseFloat(expenseForm.amount),
        category: expenseForm.category
      };

      await apiFetch('/api/expenses', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setExpenseForm({ name: '', amount: '', category: 'Utilities' });
      loadData();
      alert("Expense logged successfully!");
    } catch (err) {
      alert(err.message);
    }
  };

  // SVG Line Chart Drawer Component
  const drawChart = () => {
    const timeline = chartData.timeline;
    if (!timeline || timeline.length === 0) return null;

    const width = 600;
    const height = 200;
    const padding = 20;

    // Find Max Value
    const maxVal = Math.max(
      ...timeline.map(d => Math.max(d.revenue, d.cogs, d.opex, d.profit, 10))
    );

    // Coordinate mapping helpers
    const getX = (index) => padding + (index / (timeline.length - 1)) * (width - padding * 2);
    const getY = (val) => height - padding - (val / maxVal) * (height - padding * 2);

    // Build SVG paths
    const buildPath = (key) => {
      let path = "";
      timeline.forEach((d, i) => {
        const x = getX(i);
        const y = getY(d[key]);
        if (i === 0) path += `M ${x} ${y}`;
        else path += ` L ${x} ${y}`;
      });
      return path;
    };

    // Area path helper for Revenue
    const buildAreaPath = (key) => {
      if (timeline.length === 0) return "";
      let path = buildPath(key);
      const lastX = getX(timeline.length - 1);
      const firstX = getX(0);
      const bottomY = height - padding;
      path += ` L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
      return path;
    };

    const revPath = buildPath('revenue');
    const cogsPath = buildPath('cogs');
    const profitPath = buildPath('profit');
    const revArea = buildAreaPath('revenue');

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--success)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--success)" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
          const y = padding + ratio * (height - padding * 2);
          const gridVal = maxVal * (1 - ratio);
          return (
            <g key={idx}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#1f2231" strokeDasharray="4 4" />
              <text x={padding - 4} y={y + 4} fill="var(--text-dim)" fontSize="8" textAnchor="end">
                ${gridVal.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* Timeline Areas */}
        {revArea && <path d={revArea} fill="url(#revGrad)" />}

        {/* Timeline Lines */}
        {revPath && <path d={revPath} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" />}
        {cogsPath && <path d={cogsPath} fill="none" stroke="var(--danger)" strokeWidth="1.5" strokeDasharray="3 3" />}
        {profitPath && <path d={profitPath} fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" />}

        {/* Hover Interaction Bar */}
        {timeline.map((d, i) => {
          const x = getX(i);
          return (
            <rect
              key={i}
              x={x - (width / timeline.length) / 2}
              y={padding}
              width={width / timeline.length}
              height={height - padding * 2}
              fill="transparent"
              style={{ cursor: 'crosshair' }}
              onMouseEnter={() => setHoveredPoint({ ...d, x, index: i })}
              onMouseLeave={() => setHoveredPoint(null)}
            />
          );
        })}

        {/* Hover vertical line and tooltips */}
        {hoveredPoint && (
          <g>
            <line x1={hoveredPoint.x} y1={padding} x2={hoveredPoint.x} y2={height - padding} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            <circle cx={hoveredPoint.x} cy={getY(hoveredPoint.revenue)} r="4" fill="var(--primary)" />
            <circle cx={hoveredPoint.x} cy={getY(hoveredPoint.profit)} r="4" fill="var(--success)" />
          </g>
        )}
      </svg>
    );
  };

  // Rendering logic
  if (!token) {
    return (
      <div className="login-container">
        <div className="login-card glass">
          <div className="login-header">
            <span className="login-logo">🥖</span>
            <h2>{isSignUp ? "Create Owner Account" : "ERP Bakery Login"}</h2>
            <p>{isSignUp ? "Register your bakery to start tracking inventory & operations" : "Access the Owner Analytics & Operations Dashboard"}</p>
          </div>
          
          {loginError && (
            <div className="badge badge-danger" style={{ display: 'flex', width: '100%', padding: '12px', marginBottom: '20px', borderRadius: '8px' }}>
              <AlertCircle size={16} />
              <span>{loginError}</span>
            </div>
          )}
          {backendOffline && (
            <div className="badge badge-warning" style={{ display: 'flex', width: '100%', padding: '12px', marginBottom: '20px', borderRadius: '8px' }}>
              <AlertCircle size={16} />
              <span>FastAPI Backend offline. Start it on port 8000.</span>
            </div>
          )}

          {isSignUp ? (
            /* Sign Up Form */
            <form onSubmit={handleRegister}>
              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="name@example.com"
                  value={signUpEmail}
                  onChange={(e) => setSignUpEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Bakery Owner Username</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. sarthak"
                  value={signUpUser}
                  onChange={(e) => setSignUpUser(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="••••••••"
                  value={signUpPass}
                  onChange={(e) => setSignUpPass(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '16px' }} disabled={loading}>
                {loading ? <Loader2 className="animate-spin" size={16} /> : "Create Account"}
              </button>
            </form>
          ) : (
            /* Login Form */
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label>Owner Username</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="form-control"
                    style={{ width: '100%', paddingLeft: '40px' }}
                    placeholder="admin"
                    value={loginUser}
                    onChange={(e) => setLoginUser(e.target.value)}
                    required
                  />
                  <User size={16} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-dim)' }} />
                </div>
              </div>
              <div className="form-group">
                <label>Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="password"
                    className="form-control"
                    style={{ width: '100%', paddingLeft: '40px' }}
                    placeholder="••••••••"
                    value={loginPass}
                    onChange={(e) => setLoginPass(e.target.value)}
                    required
                  />
                  <Lock size={16} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-dim)' }} />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '16px' }} disabled={loading}>
                {loading ? <Loader2 className="animate-spin" size={16} /> : "Unlock Dashboard"}
              </button>
            </form>
          )}

          {/* Toggle Login/Signup Link */}
          <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>
              {isSignUp ? "Already have an account? " : "New owner? "}
            </span>
            <button 
              type="button" 
              onClick={() => {
                setIsSignUp(!isSignUp);
                setLoginError('');
              }}
              style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: '600', textDecoration: 'underline' }}
            >
              {isSignUp ? "Log In Here" : "Register Bakery"}
            </button>
          </div>

          {/* Social Divider */}
          <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0 16px 0' }}>
            <div style={{ flexGrow: 1, height: '1px', background: 'var(--border-color)' }}></div>
            <span style={{ padding: '0 12px', fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Or Authenticate With</span>
            <div style={{ flexGrow: 1, height: '1px', background: 'var(--border-color)' }}></div>
          </div>

          {/* Google Sign-in Containers */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
            {/* Real Google Button Container */}
            <div id="google-signin-btn"></div>
            
            {/* Demo/Simulated Google Button (Developer Fallback) */}
            <button 
              type="button" 
              onClick={handleDemoGoogleLogin} 
              className="btn btn-secondary" 
              style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '10px', background: '#131520', borderColor: '#232738' }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.47h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.91c1.7-1.56 2.69-3.86 2.69-6.6z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.2l-2.91-2.26c-.8.54-1.83.86-3.05.86-2.34 0-4.33-1.58-5.04-3.7H.92v2.33A9 9 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.96 10.7a5.4 5.4 0 0 1 0-3.4V4.97H.92a9 9 0 0 0 0 8.06l3.04-2.33z"/>
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35L15 2.1A9 9 0 0 0 .92 4.97l3.04 2.33c.7-2.12 2.7-3.7 5.04-3.7z"/>
              </svg>
              <span>Demo Google Sign-In (Skip Setup)</span>
            </button>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textAlign: 'center', marginTop: '2px' }}>
              *Demo Sign-In registers a clean, mock Google owner database instantly.
            </div>
          </div>

          {!isSignUp && (
            <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              Seeded Admin: username: <strong>admin</strong> | password: <strong>admin123</strong>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo-container">
          <span style={{ fontSize: '1.5rem' }}>🥖</span>
          <div className="logo-text">ERP BAKERY</div>
        </div>
        
        <ul className="nav-links">
          <li className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </li>
          <li className={`nav-link ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>
            <Boxes size={18} />
            <span>Inventory</span>
          </li>
          <li className={`nav-link ${activeTab === 'recipes' ? 'active' : ''}`} onClick={() => setActiveTab('recipes')}>
            <ChefHat size={18} />
            <span>Recipes Formulator</span>
          </li>
          <li className={`nav-link ${activeTab === 'production' ? 'active' : ''}`} onClick={() => setActiveTab('production')}>
            <Cookie size={18} />
            <span>Production Log</span>
          </li>
          <li className={`nav-link ${activeTab === 'sales-expenses' ? 'active' : ''}`} onClick={() => setActiveTab('sales-expenses')}>
            <Coins size={18} />
            <span>Sales & Expenses</span>
          </li>
          <li className={`nav-link ${activeTab === 'forecasting' ? 'active' : ''}`} onClick={() => setActiveTab('forecasting')}>
            <Sparkles size={18} />
            <span>AI Demand Forecast</span>
          </li>
        </ul>

        <div className="sidebar-footer">
          {backendOffline && (
            <div className="badge badge-danger" style={{ fontSize: '0.7rem', padding: '6px' }}>
              <AlertCircle size={10} /> Backend Offline
            </div>
          )}
          <div className="user-info">
            <User size={16} />
            <span>Owner: <strong>{username}</strong></span>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <main className="main-content">
        {/* Error message strip */}
        {errorMsg && (
          <div className="badge badge-danger" style={{ display: 'flex', width: '100%', padding: '12px', marginBottom: '24px', borderRadius: '8px' }}>
            <AlertCircle size={16} />
            <span>Error: {errorMsg}</span>
            <button style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }} onClick={() => setErrorMsg('')}>✕</button>
          </div>
        )}

        {/* Tab 1: Dashboard View */}
        {activeTab === 'dashboard' && (
          <div className="animate-fade">
            <div className="view-header">
              <div className="view-title">
                <h1>Bakery Performance</h1>
                <p>Track sales, ingredient COGS, utility expenses, and net profit margins</p>
              </div>
              <button onClick={loadData} className="btn btn-secondary">
                <RefreshCw size={16} /> Refresh
              </button>
            </div>

            {/* Metrics cards grid */}
            <div className="metrics-grid">
              <div className="card metric-card">
                <div className="metric-info">
                  <h3>Revenue</h3>
                  <div className="metric-val">${analyticsSummary.revenue.toLocaleString()}</div>
                  <span className="metric-trend" style={{ color: 'var(--success)' }}>
                    <ArrowUpRight size={14} /> Sales Register
                  </span>
                </div>
                <div className="metric-icon" style={{ background: 'var(--primary-glow)', color: 'var(--primary)' }}>
                  <TrendingUp size={20} />
                </div>
              </div>

              <div className="card metric-card">
                <div className="metric-info">
                  <h3>Production Cost (COGS)</h3>
                  <div className="metric-val">${analyticsSummary.production_cost.toLocaleString()}</div>
                  <span className="metric-trend" style={{ color: 'var(--text-dim)' }}>
                    Ingredient baking costs
                  </span>
                </div>
                <div className="metric-icon" style={{ background: 'var(--danger-glow)', color: 'var(--danger)' }}>
                  <ChefHat size={20} />
                </div>
              </div>

              <div className="card metric-card">
                <div className="metric-info">
                  <h3>OpEx</h3>
                  <div className="metric-val">${analyticsSummary.opex.toLocaleString()}</div>
                  <span className="metric-trend" style={{ color: 'var(--text-dim)' }}>
                    Utilities, rent, labor
                  </span>
                </div>
                <div className="metric-icon" style={{ background: 'var(--info-glow)', color: 'var(--info)' }}>
                  <DollarSign size={20} />
                </div>
              </div>

              <div className="card metric-card">
                <div className="metric-info">
                  <h3>Net Profit</h3>
                  <div className="metric-val" style={{ color: 'var(--success)' }}>
                    ${analyticsSummary.net_profit.toLocaleString()}
                  </div>
                  <span className="metric-trend" style={{ color: 'var(--success)' }}>
                    Margin: {analyticsSummary.margin}%
                  </span>
                </div>
                <div className="metric-icon" style={{ background: 'var(--success-glow)', color: 'var(--success)' }}>
                  <Coins size={20} />
                </div>
              </div>
            </div>

            {/* Performance charts */}
            <div className="analytics-grid">
              <div className="card chart-card">
                <div className="chart-header">
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: '700' }}>Sales & Profit Timeline</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Daily metrics over the last 30 days</p>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '8px', height: '8px', background: 'var(--primary)', borderRadius: '50%' }} /> Revenue
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '8px', height: '8px', background: 'var(--success)', borderRadius: '50%' }} /> Net Profit
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '8px', height: '8px', background: 'var(--danger)', borderRadius: '50%' }} /> COGS (Dotted)
                    </span>
                  </div>
                </div>
                
                <div className="chart-container">
                  {drawChart()}
                </div>

                {hoveredPoint && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', padding: '12px', background: '#1c1f2b', borderRadius: '8px', fontSize: '0.85rem' }}>
                    <span>Date: <strong>{hoveredPoint.date}</strong></span>
                    <span>Revenue: <strong style={{ color: 'var(--primary)' }}>${hoveredPoint.revenue}</strong></span>
                    <span>Profit: <strong style={{ color: 'var(--success)' }}>${hoveredPoint.profit}</strong></span>
                    <span>COGS: <strong style={{ color: 'var(--danger)' }}>${hoveredPoint.cogs}</strong></span>
                  </div>
                )}
              </div>

              {/* Expense categories breakdown */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '4px' }}>Operating Expenses</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '20px' }}>Category distribution</p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flexGrow: '1' }}>
                  {chartData.expense_breakdown && chartData.expense_breakdown.map((item, idx) => {
                    const totalExps = chartData.expense_breakdown.reduce((a, b) => a + b.value, 0);
                    const percent = totalExps > 0 ? (item.value / totalExps) * 100 : 0;
                    return (
                      <div key={idx}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                          <span style={{ fontWeight: '600' }}>{item.category}</span>
                          <span style={{ color: 'var(--text-muted)' }}>${item.value.toLocaleString()} ({percent.toFixed(0)}%)</span>
                        </div>
                        <div className="stock-bar-container">
                          <div
                            className="stock-bar-fill"
                            style={{
                              width: `${percent}%`,
                              backgroundColor: idx % 3 === 0 ? 'var(--info)' : idx % 3 === 1 ? 'var(--primary)' : 'var(--success)'
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {(!chartData.expense_breakdown || chartData.expense_breakdown.length === 0) && (
                    <div style={{ textAlign: 'center', color: 'var(--text-dim)', marginTop: '40px' }}>
                      No operating expenses logged in this range.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Inventory View */}
        {activeTab === 'inventory' && (
          <div className="animate-fade">
            <div className="view-header">
              <div className="view-title">
                <h1>Ingredients Inventory</h1>
                <p>Track dry stock, fats, sweeteners, dairy levels and unit baking costs</p>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => {
                  setSelectedIngId(null);
                  setIngForm({ name: '', quantity: '', unit: 'g', cost_per_unit: '' });
                  setActiveModal('add-ingredient');
                }} className="btn btn-primary">
                  <Plus size={16} /> Add Ingredient
                </button>
              </div>
            </div>

            <div className="cards-grid">
              {ingredients.map((ing) => {
                // Determine stock health
                // e.g. < 5000g or < 50 eggs/units is low stock
                const isLow = ing.quantity < (ing.unit === 'unit' ? 100 : 8000);
                return (
                  <div key={ing.id} className="card" style={{ position: 'relative' }}>
                    {isLow && (
                      <span className="badge badge-danger" style={{ position: 'absolute', top: '16px', right: '16px' }}>
                        Low Stock
                      </span>
                    )}
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '8px' }}>{ing.name}</h3>
                    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '14px 0', fontSize: '0.9rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Stock Quantity</span>
                      <strong style={{ color: isLow ? 'var(--danger)' : '#fff' }}>
                        {ing.quantity.toLocaleString()} {ing.unit}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Cost Per Unit</span>
                      <span>${ing.cost_per_unit.toFixed(4)} / {ing.unit}</span>
                    </div>

                    <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                      <button onClick={() => {
                        setSelectedIngId(ing.id);
                        setIngForm({
                          name: ing.name,
                          quantity: ing.quantity.toString(),
                          unit: ing.unit,
                          cost_per_unit: ing.cost_per_unit.toString()
                        });
                        setActiveModal('add-ingredient');
                      }} className="btn btn-secondary" style={{ width: '100%', padding: '8px', fontSize: '0.8rem' }}>
                        <Edit size={12} /> Edit Ingredient / Refill
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 3: Recipes Book View */}
        {activeTab === 'recipes' && (
          <div className="animate-fade">
            <div className="view-header">
              <div className="view-title">
                <h1>Recipes & Cost Estimator</h1>
                <p>Build baking recipe cards, calculate dynamic material production costs, and inspect margins</p>
              </div>
              <button onClick={() => {
                // Fetch ingredients for selection dropdowns
                apiFetch('/api/ingredients')
                  .then(data => {
                    setIngredients(data);
                    setRecipeName('');
                    setRecipePrice('');
                    setRecipeIngredients([{ ingredient_id: '', quantity_required: '' }]);
                    setActiveModal('add-recipe');
                  });
              }} className="btn btn-primary">
                <Plus size={16} /> Design New Recipe
              </button>
            </div>

            <div className="cards-grid">
              {recipes.map((rec) => {
                const markupPercent = rec.cost_of_production > 0 
                  ? ((rec.selling_price - rec.cost_of_production) / rec.selling_price * 100)
                  : 0;
                return (
                  <div key={rec.id} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: '700' }}>{rec.name}</h3>
                      <span className="badge badge-success">${rec.selling_price.toFixed(2)}</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px 0', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', margin: '14px 0', fontSize: '0.9rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Material Baking Cost</span>
                        <strong style={{ color: 'var(--danger)' }}>${rec.cost_of_production.toFixed(2)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Net Margin</span>
                        <strong style={{ color: 'var(--success)' }}>
                          {markupPercent.toFixed(1)}% (${(rec.selling_price - rec.cost_of_production).toFixed(2)})
                        </strong>
                      </div>
                    </div>

                    <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Ingredients Formula</h4>
                    <div className="custom-scroll" style={{ maxHeight: '120px' }}>
                      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
                        {rec.ingredients && rec.ingredients.map((ing, idx) => (
                          <li key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>{ing.name}</span>
                            <span style={{ color: 'var(--text-muted)' }}>
                              {ing.quantity_required.toLocaleString()} {ing.unit} (${(ing.quantity_required * ing.cost_per_unit).toFixed(2)})
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 4: Production Log View */}
        {activeTab === 'production' && (
          <div className="animate-fade">
            <div className="view-header">
              <div className="view-title">
                <h1>Daily Production Logs</h1>
                <p>Record batches baked. Logging automatically deducts ingredients from inventory based on recipe formulas.</p>
              </div>
            </div>

            <div className="analytics-grid">
              {/* Form to log production */}
              <div className="card">
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '16px' }}>Log Baking Batch</h3>
                <form onSubmit={submitProduction}>
                  <div className="form-group">
                    <label>Select Product / Recipe</label>
                    <select
                      className="form-control"
                      value={prodBatch.recipe_id}
                      onChange={(e) => setProdBatch({ ...prodBatch, recipe_id: e.target.value })}
                      required
                    >
                      <option value="">-- Choose Recipe --</option>
                      {recipes.map(r => (
                        <option key={r.id} value={r.id}>{r.name} (Cost: ${r.cost_of_production.toFixed(2)})</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Quantity Produced / Baked</label>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      className="form-control"
                      placeholder="e.g. 50"
                      value={prodBatch.quantity_produced}
                      onChange={(e) => setProdBatch({ ...prodBatch, quantity_produced: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Wasted Units (Ruined or spoiled during baking)</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      className="form-control"
                      placeholder="e.g. 2"
                      value={prodBatch.quantity_wasted}
                      onChange={(e) => setProdBatch({ ...prodBatch, quantity_wasted: e.target.value })}
                      required
                    />
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '12px' }}>
                    <Cookie size={16} /> Deduct Ingredients & Log Batch
                  </button>
                </form>
              </div>

              {/* History list */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '16px' }}>Baking Logs History</h3>
                <div className="custom-scroll" style={{ flexGrow: 1, maxHeight: '350px' }}>
                  <div className="list-group">
                    {productionHistory.map((batch) => (
                      <div key={batch.id} className="list-item">
                        <div>
                          <div className="list-item-title">{batch.recipe_name}</div>
                          <div className="list-item-subtitle">
                            Baked {batch.quantity_produced} | Spoilage: {batch.quantity_wasted}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--danger)' }}>
                            -${batch.cost_of_production.toFixed(2)}
                          </span>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                            {batch.date}
                          </div>
                        </div>
                      </div>
                    ))}
                    {productionHistory.length === 0 && (
                      <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '40px' }}>
                        No production batches logged yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Sales & Expenses */}
        {activeTab === 'sales-expenses' && (
          <div className="animate-fade">
            <div className="view-header">
              <div className="view-title">
                <h1>Sales & Expenses Tracker</h1>
                <p>Input daily customers transactions and operating costs (labor, utility, rent)</p>
              </div>
            </div>

            <div className="form-grid" style={{ marginBottom: '32px' }}>
              {/* Log Sale Card */}
              <div className="card">
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '16px', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ArrowUpRight size={18} /> Register Customer Sale
                </h3>
                <form onSubmit={submitSale}>
                  <div className="form-group">
                    <label>Select Product Sold</label>
                    <select
                      className="form-control"
                      value={saleForm.recipe_id}
                      onChange={(e) => setSaleForm({ ...saleForm, recipe_id: e.target.value })}
                      required
                    >
                      <option value="">-- Choose Product --</option>
                      {recipes.map(r => (
                        <option key={r.id} value={r.id}>{r.name} (${r.selling_price.toFixed(2)})</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Quantity Sold</label>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      className="form-control"
                      placeholder="e.g. 5"
                      value={saleForm.quantity_sold}
                      onChange={(e) => setSaleForm({ ...saleForm, quantity_sold: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Total Revenue Override (Optional, defaults to Quantity * Price)</label>
                    <input
                      type="number"
                      step="any"
                      className="form-control"
                      placeholder="Leave blank to use base recipe price"
                      value={saleForm.revenue_override}
                      onChange={(e) => setSaleForm({ ...saleForm, revenue_override: e.target.value })}
                    />
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '12px' }}>
                    Register Income Sale
                  </button>
                </form>
              </div>

              {/* Log Expense Card */}
              <div className="card">
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '16px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ArrowDownRight size={18} /> Log Operational Expense
                </h3>
                <form onSubmit={submitExpense}>
                  <div className="form-group">
                    <label>Expense Name / Description</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Monthly Electricity, Yeast bulk buy"
                      value={expenseForm.name}
                      onChange={(e) => setExpenseForm({ ...expenseForm, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Category</label>
                    <select
                      className="form-control"
                      value={expenseForm.category}
                      onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                      required
                    >
                      <option value="Utilities">Utilities</option>
                      <option value="Labor">Labor / Salaries</option>
                      <option value="Rent">Rent / Landlord</option>
                      <option value="Ingredients">Variable Ingredients</option>
                      <option value="Variable">Miscellaneous</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Amount Paid ($)</label>
                    <input
                      type="number"
                      step="any"
                      min="0.1"
                      className="form-control"
                      placeholder="e.g. 150.00"
                      value={expenseForm.amount}
                      onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                      required
                    />
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '12px' }}>
                    Log Debit Expense
                  </button>
                </form>
              </div>
            </div>

            {/* Logs tables grid */}
            <div className="form-grid">
              <div className="card">
                <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '14px' }}>Recent Sales Income</h3>
                <div className="custom-scroll" style={{ maxHeight: '300px' }}>
                  <div className="list-group">
                    {salesHistory.map((s) => (
                      <div key={s.id} className="list-item">
                        <div>
                          <div className="list-item-title">{s.recipe_name}</div>
                          <div className="list-item-subtitle">Qty Sold: {s.quantity_sold}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--success)' }}>
                            +${s.revenue.toFixed(2)}
                          </span>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                            {s.date}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="card">
                <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '14px' }}>Recent Operational Expenses</h3>
                <div className="custom-scroll" style={{ maxHeight: '300px' }}>
                  <div className="list-group">
                    {expensesHistory.map((e) => (
                      <div key={e.id} className="list-item">
                        <div>
                          <div className="list-item-title">{e.name}</div>
                          <div className="list-item-subtitle">Category: {e.category}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--danger)' }}>
                            -${e.amount.toFixed(2)}
                          </span>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                            {e.date}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: ML Forecasting Panel */}
        {activeTab === 'forecasting' && (
          <div className="animate-fade">
            <div className="view-header">
              <div className="view-title">
                <h1>AI Sales Demand Forecasting</h1>
                <p>Run machine learning models to forecast product demand and recommend daily production amounts</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Calendar size={16} style={{ color: 'var(--text-dim)' }} />
                <input
                  type="date"
                  className="form-control"
                  style={{ width: '180px' }}
                  value={predictionDate}
                  onChange={(e) => setPredictionDate(e.target.value)}
                />
              </div>
            </div>

            {/* Explanation box */}
            <div className="card" style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(12, 13, 18, 1) 100%)', borderColor: 'rgba(245, 158, 11, 0.25)', marginBottom: '32px' }}>
              <div className="metric-icon" style={{ background: 'var(--primary-glow)', color: 'var(--primary)', flexShrink: '0', marginTop: '4px' }}>
                <Sparkles size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--primary)', marginBottom: '6px' }}>
                  AI & Data Science Student Project Showcase
                </h3>
                <p style={{ fontSize: '0.9rem', lineHeight: '1.5', color: 'var(--text-muted)' }}>
                  This dashboard trains a <strong>Random Forest Regressor</strong> on your historical bakery sales database (30 days of seeded and current activity). It automatically analyzes weekly peaks, monthly cycles, and lag indicators (such as previous-day and same-day-last-week sales volumes) to generate daily forecasts.
                </p>
                <div style={{ display: 'flex', gap: '20px', marginTop: '14px', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  <span>✓ <strong>Algorithm:</strong> Scikit-Learn RandomForestRegressor</span>
                  <span>✓ <strong>Fallback:</strong> 7-day Simple Moving Average for sparse data</span>
                  <span>✓ <strong>Goal:</strong> Minimize waste and maximize product availability</span>
                </div>
              </div>
            </div>

            {/* Prediction cards list */}
            <div className="cards-grid">
              {predictionsData.map((pred, idx) => (
                <div key={idx} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: '4px solid var(--primary)' }}>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '14px' }}>{pred.recipe_name}</h3>
                    
                    <div style={{ background: '#0e1016', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>AI Forecast Demand</span>
                      <strong style={{ fontSize: '1.3rem', color: 'var(--primary)' }}>
                        {pred.predicted_demand.toFixed(1)} <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>{pred.unit}</span>
                      </strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '8px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Recommended to Bake</span>
                      <strong style={{ color: 'var(--success)' }}>
                        {pred.suggested_production} {pred.unit}
                      </strong>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '16px', fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Info size={12} />
                    <span>Based on historical daily lags</span>
                  </div>
                </div>
              ))}
              {predictionsData.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-dim)', padding: '60px' }}>
                  No recipe data available to forecast. Add a recipe to get started!
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: ADD / EDIT INGREDIENT */}
      {activeModal === 'add-ingredient' && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{selectedIngId ? "Edit / Refill Ingredient" : "Add New Ingredient"}</h2>
              <button className="close-btn" onClick={() => setActiveModal(null)}>✕</button>
            </div>
            <form onSubmit={submitIngredient}>
              <div className="form-group">
                <label>Ingredient Name</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Organic Flour, White Sugar"
                  value={ingForm.name}
                  onChange={(e) => setIngForm({ ...ingForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Unit of Measure</label>
                <select
                  className="form-control"
                  value={ingForm.unit}
                  onChange={(e) => setIngForm({ ...ingForm, unit: e.target.value })}
                  required
                >
                  <option value="g">Grams (g)</option>
                  <option value="ml">Milliliters (ml)</option>
                  <option value="unit">Units (e.g. Eggs, cups)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Current Stock Quantity</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  className="form-control"
                  placeholder="e.g. 10000"
                  value={ingForm.quantity}
                  onChange={(e) => setIngForm({ ...ingForm, quantity: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Cost Per Single Unit ($ per 1g, 1ml, or 1 unit)</label>
                <input
                  type="number"
                  step="any"
                  min="0.0001"
                  className="form-control"
                  placeholder="e.g. 0.001"
                  value={ingForm.cost_per_unit}
                  onChange={(e) => setIngForm({ ...ingForm, cost_per_unit: e.target.value })}
                  required
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                  Tip: If 1kg flour costs $1.00, cost per 1g is $0.001
                </span>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Ingredient</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD RECIPE (WITH LIVE BUILDER) */}
      {activeModal === 'add-recipe' && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '650px' }}>
            <div className="modal-header">
              <h2>Design New Recipe</h2>
              <button className="close-btn" onClick={() => setActiveModal(null)}>✕</button>
            </div>
            <form onSubmit={submitRecipe}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Recipe Name</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Chocolate Fudge Cake"
                    value={recipeName}
                    onChange={(e) => setRecipeName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Selling Price ($)</label>
                  <input
                    type="number"
                    step="any"
                    min="0.1"
                    className="form-control"
                    placeholder="e.g. 25.00"
                    value={recipePrice}
                    onChange={(e) => setRecipePrice(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ margin: '20px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)' }}>
                    Baking Ingredients Formula
                  </label>
                  <button type="button" onClick={addRecipeIngField} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                    + Add Ingredient Link
                  </button>
                </div>

                <div className="recipe-builder-list">
                  {recipeIngredients.map((ri, idx) => (
                    <div key={idx} className="recipe-builder-row">
                      <select
                        className="form-control"
                        style={{ flexGrow: 2 }}
                        value={ri.ingredient_id}
                        onChange={(e) => handleRecipeIngChange(idx, 'ingredient_id', e.target.value)}
                        required
                      >
                        <option value="">-- Choose Ingredient --</option>
                        {ingredients.map(ing => (
                          <option key={ing.id} value={ing.id}>{ing.name} (${ing.cost_per_unit.toFixed(4)}/{ing.unit})</option>
                        ))}
                      </select>

                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        className="form-control"
                        style={{ width: '120px' }}
                        placeholder="Quantity"
                        value={ri.quantity_required}
                        onChange={(e) => handleRecipeIngChange(idx, 'quantity_required', e.target.value)}
                        required
                      />

                      <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', width: '30px' }}>
                        {ingredients.find(i => i.id === parseInt(ri.ingredient_id))?.unit || ''}
                      </span>

                      <button
                        type="button"
                        onClick={() => removeRecipeIngField(idx)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Real-time Dynamic calculations */}
                <div style={{ background: '#0e1016', padding: '16px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-color)' }}>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Estimated Cost of Materials:</span>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--danger)' }}>
                      ${liveRecipeCost.toFixed(2)}
                    </h3>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Estimated Net Profit Margin:</span>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--success)', textAlign: 'right' }}>
                      {recipePrice && parseFloat(recipePrice) > 0
                        ? `${(((parseFloat(recipePrice) - liveRecipeCost) / parseFloat(recipePrice)) * 100).toFixed(0)}%`
                        : '0%'
                      }
                    </h3>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Recipe Formulation</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
