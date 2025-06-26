import React from 'react'
import { Outlet, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { FileText, Settings, LogOut, User, History, Zap, Users } from 'lucide-react'

export function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  // Check if current user is admin
  const isAdmin = user?.email === 'max.franklin.tech@gmail.com'

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="flex items-center space-x-2">
                <FileText className="h-8 w-8 text-blue-600" />
                <span className="text-xl font-bold text-gray-900">ResumeAI</span>
              </Link>
            </div>
            
            {user && (
              <div className="flex items-center space-x-4">
                <Link
                  to="/profile"
                  className="flex items-center space-x-1 text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  <User className="h-4 w-4" />
                  <span>Profile</span>
                </Link>
                <Link
                  to="/generate"
                  className="flex items-center space-x-1 text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  <Zap className="h-4 w-4" />
                  <span>Generate</span>
                </Link>
                <Link
                  to="/history"
                  className="flex items-center space-x-1 text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  <History className="h-4 w-4" />
                  <span>History</span>
                </Link>
                {isAdmin && (
                  <Link
                    to="/manage"
                    className="flex items-center space-x-1 text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                  >
                    <Users className="h-4 w-4" />
                    <span>Manage</span>
                  </Link>
                )}
                <Link
                  to="/settings"
                  className="flex items-center space-x-1 text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </Link>
                <button
                  onClick={handleSignOut}
                  className="flex items-center space-x-1 text-gray-700 hover:text-red-600 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
      
      <main>
        <Outlet />
      </main>
    </div>
  )
}