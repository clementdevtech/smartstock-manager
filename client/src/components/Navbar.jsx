// Navbar.jsx
import React, { useState, useEffect, useContext } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Menu, X, LogOut } from "lucide-react";
import ToggleSwitch from "./ToggleSwitch";
import { AuthContext } from "../context/AuthContext";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const navigate = useNavigate();

  const { user, logoutUser } = useContext(AuthContext);

  // Load dark mode from localStorage on startup
  useEffect(() => {
    const storedMode = localStorage.getItem("darkMode");
    const initialMode = storedMode === "true";

    setDarkMode(initialMode);
    document.documentElement.classList.toggle("dark", initialMode);
  }, []);

  // Sync theme when darkMode changes
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);

  // Menu items
  const baseLinks = [
    { name: "Inventory", path: "/inventory" },
    { name: "Sales", path: "/sales" },
    { name: "Point of Sale", path: "/pos" },
  ];

  const adminOnlyLinks = [
    { name: "Reports", path: "/reports" },
    { name: "Backup", path: "/backup" },
    { name: "Settings", path: "/settings" },
  ];

  const navLinks = user?.role === "admin"
    ? [...baseLinks, ...adminOnlyLinks]
    : baseLinks;

  const handleLogout = () => {
    logoutUser();
    navigate("/login");
  };

  return (
    <nav className="sticky top-0 z-50 bg-white dark:bg-gray-900 shadow-md border-b border-gray-100 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
        
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 text-white w-10 h-10 flex items-center justify-center rounded-xl font-bold text-lg shadow-md">
            S
          </div>
          <h1 className="text-lg md:text-xl font-semibold text-gray-800 dark:text-gray-100">
            SmartStock <span className="text-blue-600">Manager Pro</span>
          </h1>
        </div>

        {/* Desktop Menu */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <NavLink
              key={link.name}
              to={link.path}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${
                  isActive
                    ? "text-blue-600 border-b-2 border-blue-600 pb-1"
                    : "text-gray-600 hover:text-blue-600 dark:text-gray-300"
                }`
              }
            >
              {link.name}
            </NavLink>
          ))}
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-3">

          {/* Dark Mode */}
          <div className="flex items-center gap-2">
            <ToggleSwitch checked={darkMode} onChange={setDarkMode} />
            <span
              className={`text-sm font-medium transition-all duration-300 ${
                darkMode ? "text-yellow-400" : "text-gray-700 dark:text-gray-300"
              }`}
            >
              {darkMode ? "Dark Mode" : "Light Mode"}
            </span>
          </div>

          {/* Logout */}
          {user && (
            <button
              onClick={handleLogout}
              className="hidden md:flex items-center gap-1 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg shadow-md transition"
            >
              <LogOut size={16} />
              Logout
            </button>
          )}

          {/* Mobile Menu */}
          <button
            className="md:hidden p-2 text-gray-700 dark:text-gray-200"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700">
          {navLinks.map((link) => (
            <NavLink
              key={link.name}
              to={link.path}
              onClick={() => setIsOpen(false)}
              className={({ isActive }) =>
                `block px-6 py-3 text-sm ${
                  isActive
                    ? "bg-blue-50 dark:bg-gray-800 text-blue-600 font-medium"
                    : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`
              }
            >
              {link.name}
            </NavLink>
          ))}

          {user && (
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-6 py-3 text-red-600 hover:bg-red-50 dark:hover:bg-gray-800 font-medium text-sm"
            >
              <LogOut size={16} /> Logout
            </button>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;