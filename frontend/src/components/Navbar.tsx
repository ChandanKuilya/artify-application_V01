import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/'); // Redirect to home on logout
  };

  return (
    <header className="bg-white shadow">
      <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
        <div>
          <Link to="/" className="text-3xl font-bold text-gray-800">Artify</Link>
          <p className="text-gray-600">Discover and buy unique art</p>
        </div>
        <div className="flex space-x-4">
          <Link to="/" className="text-gray-700 hover:text-indigo-600">Home</Link>
          {isLoggedIn ? (
            <>
              <Link to="/dashboard" className="text-gray-700 hover:text-indigo-600">Dashboard</Link>
              <button onClick={handleLogout} className="text-gray-700 hover:text-indigo-600">Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-gray-700 hover:text-indigo-600">Login</Link>
              <Link to="/register" className="text-gray-700 hover:text-indigo-600">Register</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}