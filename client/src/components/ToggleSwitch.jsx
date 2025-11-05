import React from "react";
import { Sun, Moon } from "lucide-react";

const ToggleSwitch = ({ checked, onChange }) => {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300 hover:bg-gray-100 dark:hover:bg-gray-800"
      aria-label="Toggle Theme"
    >
      {checked ? (
        <Sun className="w-5 h-5 text-yellow-400 transition-transform duration-300 scale-110" />
      ) : (
        <Moon className="w-5 h-5 text-gray-600 dark:text-gray-300 transition-transform duration-300 scale-110" />
      )}
    </button>
  );
};

export default ToggleSwitch;
