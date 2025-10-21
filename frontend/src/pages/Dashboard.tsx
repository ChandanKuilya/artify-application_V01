import { useAuth } from '../context/AuthContext';
// NOTE: In the future, we will fetch and display the *artist's* products here
// and add forms to create/edit/delete them.

export default function Dashboard() {
  const { logout } = useAuth();

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">Artist Dashboard</h1>
      <p className="mt-4">Welcome to your personal dashboard. Here you will manage your art products.</p>
      <button 
        onClick={logout} 
        className="mt-6 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-500">
        Log Out
      </button>
    </div>
  );
}