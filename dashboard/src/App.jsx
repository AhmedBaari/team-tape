import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, createContext } from 'react';
import Layout from './components/Layout';
import Home from './pages/Home';
import MeetingDetail from './pages/MeetingDetail';
import Analytics from './pages/Analytics';

// Create auth context to share logout function
export const AuthContext = createContext(null);

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log('🔐 Checking authentication...');
    try {
      const savedKey = localStorage.getItem('apiKey');
      if (savedKey) {
        console.log('✅ Found saved API key');
        setIsAuthenticated(true);
        setApiKey(savedKey);
      } else {
        console.log('ℹ️ No saved API key found');
      }
    } catch (error) {
      console.error('❌ Error reading localStorage:', error);
    }
    setIsLoading(false);
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    console.log('🔑 Attempting login...');
    if (apiKey.trim()) {
      try {
        localStorage.setItem('apiKey', apiKey);
        setIsAuthenticated(true);
        console.log('✅ Login successful');
      } catch (error) {
        console.error('❌ Error saving to localStorage:', error);
      }
    }
  };

  const handleLogout = () => {
    console.log('👋 Logging out...');
    try {
      localStorage.removeItem('apiKey');
      setApiKey('');
      setIsAuthenticated(false);
      console.log('✅ Logout successful');
    } catch (error) {
      console.error('❌ Error during logout:', error);
    }
  };

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-gray-800 rounded-lg shadow-xl p-8 max-w-md w-full border border-gray-700">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-white mb-2">
              🎙️ TeamTape Dashboard
            </h1>
            <p className="text-gray-400">Enter your API key to continue</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="apiKey" className="block text-sm font-medium text-gray-300 mb-2">
                API Key
              </label>
              <input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key"
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
            >
              Login
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-400">
              Don't have an API key?{' '}
              <a
                href="https://github.com/AhmedBaari/team-tape"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300"
              >
                Check the documentation
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ handleLogout }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="meeting/:id" element={<MeetingDetail />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}

export default App;
