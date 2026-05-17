import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import RecipesPage from './pages/RecipesPage';
import RecipeDetailPage from './pages/RecipeDetailPage';
import AddRecipePage from './pages/AddRecipePage';
import MenuPage from './pages/MenuPage';
import ShoppingPage from './pages/ShoppingPage';
import InventoryPage from './pages/InventoryPage';
import ProductsPage from './pages/ProductsPage';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const userId = localStorage.getItem('homechef_userId');
    const name = localStorage.getItem('homechef_userName');
    if (userId && name) {
      setIsLoggedIn(true);
      setUserName(name);
    }
  }, []);

  const handleLogin = (userId: number, name: string) => {
    localStorage.setItem('homechef_userId', String(userId));
    localStorage.setItem('homechef_userName', name);
    setIsLoggedIn(true);
    setUserName(name);
  };

  const handleLogout = () => {
    localStorage.removeItem('homechef_userId');
    localStorage.removeItem('homechef_userName');
    setIsLoggedIn(false);
    setUserName('');
  };

  if (!isLoggedIn) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <Layout userName={userName} onLogout={handleLogout}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/recipes" element={<RecipesPage />} />
        <Route path="/recipes/:id" element={<RecipeDetailPage />} />
        <Route path="/recipes/add" element={<AddRecipePage />} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/shopping" element={<ShoppingPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;
