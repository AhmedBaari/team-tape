import { Link, useLocation } from 'react-router-dom';
import { useContext } from 'react';
import { AuthContext } from '../App';

export default function Navbar() {
    const location = useLocation();
    const auth = useContext(AuthContext);

    const isActive = (path) => {
        return location.pathname === path
            ? 'bg-gray-700 text-white'
            : 'text-gray-300 hover:bg-gray-700 hover:text-white';
    };

    return (
        <nav className="bg-gray-800 shadow-lg">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                        <Link to="/" className="flex items-center">
                            <span className="text-2xl mr-2">🎙️</span>
                            <span className="text-white text-xl font-bold">TeamTape</span>
                        </Link>

                        <div className="ml-10 flex items-baseline space-x-4">
                            <Link
                                to="/"
                                className={`px-3 py-2 rounded-md text-sm font-medium ${isActive('/')}`}
                            >
                                Meetings
                            </Link>
                            <Link
                                to="/analytics"
                                className={`px-3 py-2 rounded-md text-sm font-medium ${isActive('/analytics')}`}
                            >
                                Analytics
                            </Link>
                        </div>
                    </div>

                    {/* Logout Button */}
                    <div className="flex items-center">
                        <button
                            onClick={() => auth?.handleLogout()}
                            className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
                            title="Logout"
                        >
                            🚪 Logout
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    );
}
