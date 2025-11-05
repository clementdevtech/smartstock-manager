import React from 'react';
import { Github, Linkedin, Mail, Heart } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 py-6 mt-8">
      <div className="max-w-7xl mx-auto px-6 text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-3">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 w-8 h-8 rounded-lg flex items-center justify-center text-white font-semibold shadow-md">
            S
          </div>
          <span className="text-gray-700 dark:text-gray-200 font-semibold text-sm">
            SmartStock Manager Pro © {new Date().getFullYear()}
          </span>
        </div>

        {/* Center Note */}
        <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
          Built with <Heart className="w-4 h-4 text-red-500" /> for smarter business management.
        </div>

        {/* Social Links */}
        <div className="flex items-center gap-4 text-gray-600 dark:text-gray-400">
          <a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-blue-600">
            <Github size={18} />
          </a>
          <a href="https://linkedin.com" target="_blank" rel="noreferrer" className="hover:text-blue-600">
            <Linkedin size={18} />
          </a>
          <a href="mailto:support@smartstock.com" className="hover:text-blue-600">
            <Mail size={18} />
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
